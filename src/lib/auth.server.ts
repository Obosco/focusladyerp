import { createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "flb_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_ADMIN_EMAIL = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_SESSION_SECRET = "focuslady-erp-local-session-secret";

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
  if (!configured) return [];

  try {
    const accounts = JSON.parse(configured) as unknown;
    if (!Array.isArray(accounts)) return [];
    return accounts.filter(
      (account): account is { email: string; password: string } =>
        typeof account === "object" &&
        account !== null &&
        typeof (account as { email?: unknown }).email === "string" &&
        typeof (account as { password?: unknown }).password === "string",
    );
  } catch {
    return [];
  }
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
