import { createServerFn } from "@tanstack/react-start";
import {
  clearSession,
  createSession,
  isAuthConfigured,
  readSessionEmail,
  verifyCredentials,
} from "./auth.server";

export const getAuthSession = createServerFn({ method: "GET" }).handler(async () => {
  const required = true;
  const email = readSessionEmail();
  return {
    required,
    email: email || null,
    signedIn: Boolean(email) && isAuthConfigured(),
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
