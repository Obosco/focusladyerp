import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Password reset</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ask the administrator to reset the account password in the server settings. Member
          accounts are managed with ERP_MEMBER_ACCOUNTS.
        </p>
        <Button className="mt-6" asChild>
          <a href="/auth">Return to login</a>
        </Button>
      </div>
    </main>
  );
}
