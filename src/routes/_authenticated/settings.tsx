import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { supabase } from "@/integrations/supabase/client";
import { SPREADSHEET_ID } from "@/lib/erp-modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { signOutClean } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, History, RefreshCcw } from "lucide-react";
import InstallButton from "@/components/install-button";
import { isInstalled, isIos } from "@/lib/pwa";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Admin settings for Focus Lady Bra ERP: account security, Google Sheets sync and data management.",
      },
      { property: "og:title", content: "Settings — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "Manage your admin account and Google Sheets sync settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    setIos(isIos());
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const { data: admin } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      setIsAdmin(Boolean(admin));
    });
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    setPassword("");
    if (error) toast.error(error.message);
    else toast.success("Password updated");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutClean();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  return (
    <ErpShell activeSlug="settings" title="Settings" subtitle="Admin account, sync and data">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <div className="text-muted-foreground">Signed in as</div>
              <div className="font-medium">{email || "—"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Role: {isAdmin ? "Administrator (full access)" : "Staff"}
              </div>
            </div>
            <form onSubmit={changePassword} className="space-y-2">
              <Label htmlFor="np">Change password</Label>
              <Input
                id="np"
                type="password"
                minLength={8}
                required
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Install app</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {installed ? (
              <p className="text-muted-foreground">
                This app is installed and opens as its own window. Repeat launches use the
                cached shell so they start without waiting on the network.
              </p>
            ) : ios ? (
              <p className="text-muted-foreground">
                On iPhone or iPad, open the Share sheet and choose{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Install Focus Lady Bra ERP on this computer. After that it opens like a
                  native app — no browser chrome, and the interface loads from cache.
                </p>
                <InstallButton />
              </>
            )}
            {!installed && ios ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Download className="h-4 w-4" /> Safari → Share → Add to Home Screen
              </div>
            ) : null}
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Google Sheets sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                The ERP reads and writes the connected company spreadsheet on the server.
                Credentials are never exposed in the browser.
              </p>
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                Spreadsheet ID: <span className="font-mono">{SPREADSHEET_ID}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Open spreadsheet
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["erp"] });
                    toast.success("Re-synced from Google Sheets");
                  }}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" /> Sync now
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/downloads">
                    <History className="mr-2 h-4 w-4" /> Download history
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Restricted</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Company, Google Sheets and data management settings are available to
              administrators only.
            </CardContent>
          </Card>
        )}
      </div>
    </ErpShell>
  );
}
