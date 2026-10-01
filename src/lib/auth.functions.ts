import { createServerFn } from "@tanstack/react-start";
import {
  assertAdmin,
  assertAuthenticated,
  clearSession,
  createMemberAccount,
  createSession,
  isAuthConfigured,
  isAdminEmail,
  listMemberAccounts,
  readSessionEmail,
  registerMemberAccount,
  resetMemberPassword,
  verifyCredentials,
  getUserRoleForEmail,
} from "./auth.server";

export const getAuthSession = createServerFn({ method: "GET" }).handler(async () => {
  const required = true;
  const email = readSessionEmail();
  return {
    required,
    email: email || null,
    signedIn: Boolean(email) && isAuthConfigured(),
    isAdmin: Boolean(email) && isAdminEmail(email),
  };
});

export const signIn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string; remember?: boolean }) => {
    if (!data?.email || !data?.password) throw new Error("Email and password are required");
    return data;
  })
  .handler(async ({ data }) => {
    const email = await verifyCredentials(data.email, data.password);
    createSession(email, Boolean(data.remember));
    return { email };
  });

export const createAccount = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => registerMemberAccount(data.email, data.password));

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  clearSession();
  return { ok: true };
});

export const getMemberAccounts = createServerFn({ method: "GET" }).handler(async () => {
  assertAdmin();
  return { accounts: await listMemberAccounts() };
});

export const getCurrentUserRole = createServerFn({ method: "GET" }).handler(async () => {
  assertAuthenticated();
  const email = readSessionEmail();
  if (!email) return { role: "Sales" };
  return { role: await getUserRoleForEmail(email) };
});

export const addMemberAccount = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => createMemberAccount(data.email, data.password));

export const changeMemberPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => resetMemberPassword(data.email, data.password));
