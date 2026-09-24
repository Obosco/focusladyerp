import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createAccount, signIn } from "@/lib/auth.functions";
import { setRememberMe } from "@/lib/session";

type AuthSearch = { redirect?: string };
type AuthMode = "login" | "signup";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await createAccount({ data: { email, password } });
        setMode("login");
        toast.success("Account created. Sign in to continue.");
        return;
      }
      await signIn({ data: { email, password, remember } });
      setRememberMe(remember);
      toast.success("Signed in");
      const next =
        redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
      window.location.replace(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-black">
      <div className="grid w-full max-w-4xl border border-black bg-white lg:grid-cols-2">
        <section className="hidden border-r border-black p-10 lg:flex lg:flex-col lg:justify-between">
          <img src="/focus-lady-logo.svg" alt="Focus Lady Bra" className="w-56" />
          <p className="text-xs uppercase tracking-[0.2em]">OBOSCO CLOTHING INDUSTRIES</p>
        </section>
        <section className="w-full max-w-md justify-self-center p-6 sm:p-10">
          <img src="/focus-lady-logo.svg" alt="Focus Lady Bra" className="mb-6 w-44 lg:hidden" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">Focus Lady Bra ERP</p>
          <h1 className="mt-2 text-2xl font-semibold">
            {mode === "login" ? "ERP Login" : "Create account"}
          </h1>
          <p className="mt-2 text-sm text-black/60">
            {mode === "login"
              ? "Use the admin or member account provided by your administrator."
              : "Create a member account with your email and password."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
            <Button
              className="h-11 w-full rounded-none bg-black text-white hover:bg-black/80"
              disabled={busy}
            >
              {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-black/60">
            {mode === "login" ? (
              <>
                <button type="button" className="underline underline-offset-4" onClick={() => setMode("signup")}>
                  Create account
                </button>
                <span className="mx-2">·</span>
                <Link to="/reset-password" className="underline underline-offset-4">
                  Forgot password?
                </Link>
              </>
            ) : (
              <button type="button" className="underline underline-offset-4" onClick={() => setMode("login")}>
                Back to login
              </button>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
