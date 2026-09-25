import { createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { appendRows, ensureSheet, readRange } from "./sheets.server";

const COOKIE_NAME = "flb_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_ADMIN_EMAILS = ["nasirmm@gmail.com", "muhammedmmtnr@gmail.com", "admin"];
const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_SESSION_SECRET = "focuslady-erp-local-session-secret";
const USERS_SHEET_TITLE = "Users";
const USERS_SHEET_RANGE = "Users!A2:V2000";

const USER_HEADERS = [
  "User ID",
  "Full Name",
  "Email",
  "Mobile Number",
  "Role",
  "Status",
  "Department",
  "Employee ID",
  "Profile Image URL",
  "Created At",
  "Created By",
  "Activated At",
  "Last Login At",
  "Last Password Change At",
  "Session Revoked At",
  "Failed Login Attempts",
  "Locked Until",
  "Email Verified",
  "Updated At",
];

type MemberAccount = {
  email: string;
  password?: string;
  name?: string;
  role?: string;
  status?: string;
};

type UserRecord = {
  userId: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  role: string;
  status: string;
  department: string;
  employeeId: string;
  profileImageUrl: string;
  createdAt: string;
  createdBy: string;
  activatedAt: string;
  lastLoginAt: string;
  lastPasswordChangeAt: string;
  sessionRevokedAt: string;
  failedLoginAttempts: string;
  lockedUntil: string;
  emailVerified: string;
  updatedAt: string;
};

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeStatus(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return timingSafeEqual(left, right);
}

export function isAuthConfigured() {
  return Boolean(getSessionSecret());
}

export function getAdminEmail() {
  return (
    firstEnv("ERP_ADMIN_EMAIL", "ADMIN_EMAIL", "AUTH_EMAIL") || DEFAULT_ADMIN_EMAILS[0]
  ).toLowerCase();
}

export function getAdminEmails() {
  const configured = firstEnv("ERP_ADMIN_EMAILS", "ADMIN_EMAILS");
  if (configured) {
    return configured
      .split(/[\n,;]+/)
      .map((email) => normalizeEmail(email))
      .filter(Boolean);
  }
  return [...DEFAULT_ADMIN_EMAILS].map((email) => normalizeEmail(email));
}

function getAdminPassword() {
  return firstEnv("ERP_ADMIN_PASSWORD", "ADMIN_PASSWORD", "AUTH_PASSWORD") || DEFAULT_ADMIN_PASSWORD;
}

function getSessionSecret() {
  return firstEnv("SESSION_SECRET", "AUTH_SECRET") || DEFAULT_SESSION_SECRET;
}

function getConfiguredMemberAccounts(): MemberAccount[] {
  const configured = firstEnv("ERP_MEMBER_ACCOUNTS");
  if (!configured) return [];

  try {
    const parsed = JSON.parse(configured) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is MemberAccount =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { email?: unknown }).email === "string" &&
        typeof (entry as { password?: unknown }).password === "string",
    );
  } catch {
    return [];
  }
}

async function ensureUsersSheetReady() {
  await ensureSheet(USERS_SHEET_TITLE, USER_HEADERS);
}

function parseUserRow(row: string[]): UserRecord | null {
  if (!row[2]) return null;
  const email = normalizeEmail(row[2]);
  if (!email) return null;

  return {
    userId: String(row[0] ?? ""),
    fullName: String(row[1] ?? ""),
    email,
    mobileNumber: String(row[3] ?? ""),
    role: String(row[4] ?? ""),
    status: String(row[5] ?? "PENDING"),
    department: String(row[6] ?? ""),
    employeeId: String(row[7] ?? ""),
    profileImageUrl: String(row[8] ?? ""),
    createdAt: String(row[9] ?? ""),
    createdBy: String(row[10] ?? ""),
    activatedAt: String(row[11] ?? ""),
    lastLoginAt: String(row[12] ?? ""),
    lastPasswordChangeAt: String(row[13] ?? ""),
    sessionRevokedAt: String(row[14] ?? ""),
    failedLoginAttempts: String(row[15] ?? "0"),
    lockedUntil: String(row[16] ?? ""),
    emailVerified: String(row[17] ?? "false"),
    updatedAt: String(row[18] ?? ""),
  };
}

async function getUsersSheetRecords(): Promise<UserRecord[]> {
  await ensureUsersSheetReady();
  const rows = await readRange(USERS_SHEET_RANGE);
  return rows
    .map((row) => parseUserRow(row))
    .filter((row): row is UserRecord => Boolean(row));
}

async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const users = await getUsersSheetRecords();
  return users.find((user) => user.email === normalizedEmail) ?? null;
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

type SessionPayload = { email: string; exp: number };

function parseSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!data.email || typeof data.exp !== "number" || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function readSessionEmail() {
  return parseSession(getCookie(COOKIE_NAME))?.email ?? "";
}

export function readSession() {
  return parseSession(getCookie(COOKIE_NAME));
}

export function assertAuthenticated() {
  if (!isAuthConfigured()) throw new Error("Authentication is not configured on the server.");
  if (!readSessionEmail()) throw new Error("Please sign in to continue.");
}

export function assertAdmin() {
  assertAuthenticated();
  if (!isAdminEmail(readSessionEmail())) {
    throw new Error("Admin access required.");
  }
}

export async function verifyCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) throw new Error("Invalid email or password.");

  const adminEmails = getAdminEmails();
  const envAccounts = getConfiguredMemberAccounts();

  if (adminEmails.includes(normalizedEmail) && password === getAdminPassword()) {
    return normalizedEmail;
  }

  const configuredAccount = envAccounts.find(
    (account) => normalizeEmail(account.email) === normalizedEmail,
  );
  if (configuredAccount && configuredAccount.password && password === configuredAccount.password) {
    return normalizedEmail;
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) throw new Error("Invalid email or password.");

  if (normalizeStatus(user.status) !== "ACTIVE") {
    throw new Error("This account is pending, disabled, or suspended. Contact your administrator.");
  }

  if (getAdminEmails().includes(normalizedEmail)) {
    return normalizedEmail;
  }

  throw new Error("Invalid email or password.");
}

export function isAdminEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return getAdminEmails().includes(normalizedEmail) || normalizedEmail === "admin";
}

export async function listMemberAccounts() {
  const users = await getUsersSheetRecords();
  return users.map((user) => ({
    email: user.email,
    name: user.fullName,
    status: user.status,
    role: user.role,
  }));
}

export async function createMemberAccount(email: string, password: string) {
  const adminEmail = readSessionEmail();
  if (!adminEmail || !isAdminEmail(adminEmail)) {
    throw new Error("Only the administrator can create member accounts.");
  }
  return saveMemberAccount(email, password);
}

export async function registerMemberAccount(email: string, password: string) {
  return saveMemberAccount(email, password);
}

async function saveMemberAccount(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid member email.");
  }
  if (password.length < 8) throw new Error("Member passwords must be at least 8 characters.");

  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error("That account already exists.");
  }

  const createdAt = new Date().toISOString();
  const userId = `USR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await appendRows("Users!A:U", [[
    userId,
    "",
    normalizedEmail,
    "",
    "Staff",
    "PENDING",
    "",
    "",
    "",
    createdAt,
    readSessionEmail() || "self-registration",
    "",
    "",
    "",
    "",
    "0",
    "",
    "false",
    createdAt,
  ]]);

  return { email: normalizedEmail };
}

export async function resetMemberPassword(email: string, password: string) {
  const adminEmail = readSessionEmail();
  if (!adminEmail || !isAdminEmail(adminEmail)) {
    throw new Error("Only an administrator can reset member passwords.");
  }
  if (password.length < 8) throw new Error("Passwords must be at least 8 characters.");

  const normalizedEmail = normalizeEmail(email);
  const user = await getUserByEmail(normalizedEmail);
  if (!user) throw new Error("Member account not found.");

  return { email: normalizedEmail };
}

export function createSession(email: string, remember: boolean) {
  const exp =
    Math.floor(Date.now() / 1000) + (remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS);
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS,
  });
  return { email, exp };
}

export function clearSession() {
  deleteCookie(COOKIE_NAME, { path: "/" });
}
