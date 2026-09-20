import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Focus Lady Bra ERP</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This ERP no longer requires a login. All data is served through the
          Google Sheets backend on Vercel.
        </p>
        <Button className="mt-6" asChild>
          <a href="/">Open the dashboard</a>
        </Button>
      </div>
    </main>
  );
}
