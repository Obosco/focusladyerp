import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await createAccount({ data: { email, password } });
        setMode("login");
        toast.success("Account created. Ask an administrator to activate it before signing in.");
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
          <img src="/icon-512.png" alt="FocusLady ERP" className="w-56 object-contain" />
          <p className="text-xs uppercase tracking-[0.2em]">OBOSCO CLOTHING INDUSTRIES</p>
        </section>
        <section className="w-full max-w-md justify-self-center p-6 sm:p-10">
          <img src="/icon-512.png" alt="FocusLady ERP" className="mb-6 w-44 object-contain lg:hidden" />
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
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-black/60 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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
