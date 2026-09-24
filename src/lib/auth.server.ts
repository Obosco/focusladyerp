import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "flb_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_ADMIN_EMAIL = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_SESSION_SECRET = "focuslady-erp-local-session-secret";
const MANAGED_MEMBERS_FILE = join(process.cwd(), ".data", "erp-members.json");

type MemberAccount = { email: string; password: string };

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function isAuthConfigured() {
  return Boolean(getSessionSecret());
}

export function getAdminEmail() {
  return (
    firstEnv("ERP_ADMIN_EMAIL", "ADMIN_EMAIL", "AUTH_EMAIL") || DEFAULT_ADMIN_EMAIL
  ).toLowerCase();
}

function getAdminPassword() {
  return (
    firstEnv("ERP_ADMIN_PASSWORD", "ADMIN_PASSWORD", "AUTH_PASSWORD") || DEFAULT_ADMIN_PASSWORD
  );
}

function getSessionSecret() {
  return firstEnv("SESSION_SECRET", "AUTH_SECRET") || DEFAULT_SESSION_SECRET;
}

function getMemberAccounts() {
  const configured = firstEnv("ERP_MEMBER_ACCOUNTS");
  const managedMembers = readManagedMembers();
  if (!configured) return managedMembers;

  try {
    const accounts = JSON.parse(configured) as unknown;
    if (!Array.isArray(accounts)) return managedMembers;
    const environmentMembers = accounts.filter(
      (account): account is { email: string; password: string } =>
        typeof account === "object" &&
        account !== null &&
        typeof (account as { email?: unknown }).email === "string" &&
        typeof (account as { password?: unknown }).password === "string",
    );
    const managedEmails = new Set(managedMembers.map((account) => account.email.toLowerCase()));
    return [
      ...managedMembers,
      ...environmentMembers.filter((account) => !managedEmails.has(account.email.toLowerCase())),
    ];
  } catch {
    return managedMembers;
  }
}

function readManagedMembers(): MemberAccount[] {
  try {
    const accounts = JSON.parse(readFileSync(MANAGED_MEMBERS_FILE, "utf8")) as unknown;
    if (!Array.isArray(accounts)) return [];
    return accounts.filter(
      (account): account is MemberAccount =>
        typeof account === "object" &&
        account !== null &&
        typeof (account as { email?: unknown }).email === "string" &&
        typeof (account as { password?: unknown }).password === "string",
    );
  } catch {
    return [];
  }
}

function writeManagedMembers(accounts: MemberAccount[]) {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  writeFileSync(MANAGED_MEMBERS_FILE, JSON.stringify(accounts, null, 2), "utf8");
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

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

type SessionPayload = { email: string; exp: number };

function parseSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(sign(payload), signature)) return null;
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

export function assertAuthenticated() {
  if (!isAuthConfigured()) {
    throw new Error("Authentication is not configured on the server.");
  }
  if (!readSessionEmail()) {
    throw new Error("Please sign in to continue.");
  }
}

export function verifyCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = [
    { email: getAdminEmail(), password: getAdminPassword() },
    ...getMemberAccounts().map((account) => ({
      email: account.email.trim().toLowerCase(),
      password: account.password,
    })),
  ];
  const account = accounts.find(
    (candidate) =>
      safeEqual(normalizedEmail, candidate.email) && safeEqual(password, candidate.password),
  );
  if (!account) {
    throw new Error("Invalid email or password.");
  }
  return account.email;
}

export function isAdminEmail(email: string) {
  return safeEqual(email.trim().toLowerCase(), getAdminEmail());
}

export function listMemberAccounts() {
  return getMemberAccounts().map((account) => ({ email: account.email }));
}

export function createMemberAccount(email: string, password: string) {
  const adminEmail = readSessionEmail();
  if (!adminEmail || !isAdminEmail(adminEmail)) {
    throw new Error("Only the administrator can create member accounts.");
  }
  return saveMemberAccount(email, password);
}

export function registerMemberAccount(email: string, password: string) {
  return saveMemberAccount(email, password);
}

function saveMemberAccount(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid member email.");
  }
  if (password.length < 8) {
    throw new Error("Member passwords must be at least 8 characters.");
  }
  if (
    isAdminEmail(normalizedEmail) ||
    getMemberAccounts().some((account) => account.email.toLowerCase() === normalizedEmail)
  ) {
    throw new Error("That account already exists.");
  }
  writeManagedMembers([...readManagedMembers(), { email: normalizedEmail, password }]);
  return { email: normalizedEmail };
}

export function resetMemberPassword(email: string, password: string) {
  const adminEmail = readSessionEmail();
  if (!adminEmail || !isAdminEmail(adminEmail)) {
    throw new Error("Only the administrator can reset member passwords.");
  }
  if (password.length < 8) {
    throw new Error("Passwords must be at least 8 characters.");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const members = readManagedMembers();
  const index = members.findIndex((account) => account.email.toLowerCase() === normalizedEmail);
  if (index < 0) throw new Error("Managed member account not found.");
  members[index] = { email: normalizedEmail, password };
  writeManagedMembers(members);
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
