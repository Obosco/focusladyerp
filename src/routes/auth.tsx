import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { setRememberMe } from "@/lib/session";

type Mode = "login" | "setup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Admin Login — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Secure admin login for Focus Lady Bra ERP — complete business management system for sales, stock, payments and accounts.",
      },
      { property: "og:title", content: "Focus Lady Bra ERP — Admin Login" },
      {
        property: "og:description",
        content: "Sign in to the Focus Lady Bra ERP admin console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function safePath(href: string | undefined) {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return "/";
  return href;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: safePath(search.redirect), replace: true });
    });
    supabase
      .rpc("admin_exists")
      .then(({ data, error }) => {
        if (error) return;
        setAdminExists(Boolean(data));
        if (data === false) setMode("setup");
      });
  }, [navigate, search.redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        setRememberMe(remember);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safePath(search.redirect), replace: true });
      } else if (mode === "setup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Admin account created. Check your email to confirm, then sign in.");
        setMode("login");
        setAdminExists(true);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent to your recovery email.");
        setMode("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            FOCUS LADY BRA ERP
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete Business Management System
          </p>
        </header>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-card-foreground">
            {mode === "login"
              ? "Admin Login"
              : mode === "setup"
                ? "Create Admin Account"
                : "Reset Password"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "login"
              ? "Sign in to access the ERP."
              : mode === "setup"
                ? "First-time setup — this account gets full admin access."
                : "We'll email a secure reset link to your recovery email."}
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {mode === "setup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "setup" ? "new-password" : "current-password"}
                  minLength={8}
                  required
                />
              </div>
            )}

            {mode === "login" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setMode("forgot")}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Login"
                  : mode === "setup"
                    ? "Create admin account"
                    : "Send reset link"}
            </Button>
          </form>

          {mode !== "login" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMode("login")}
            >
              Back to login
            </button>
          )}

          {mode === "login" && adminExists === false && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-primary hover:underline"
              onClick={() => setMode("setup")}
            >
              First install? Create the admin account
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
