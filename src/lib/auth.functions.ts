import { createServerFn } from "@tanstack/react-start";
import {
  clearSession,
  createSession,
  isAuthConfigured,
  createMemberAccount,
  isAdminEmail,
  listMemberAccounts,
  readSessionEmail,
  resetMemberPassword,
  verifyCredentials,
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
    const email = verifyCredentials(data.email, data.password);
    createSession(email, Boolean(data.remember));
    return { email };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  clearSession();
  return { ok: true };
});

export const getMemberAccounts = createServerFn({ method: "GET" }).handler(async () => {
  return { accounts: listMemberAccounts() };
});

export const addMemberAccount = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => createMemberAccount(data.email, data.password));

export const changeMemberPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => resetMemberPassword(data.email, data.password));
