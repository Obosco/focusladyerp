import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMemberAccount,
  changeMemberPassword,
  getAuthSession,
  getMemberAccounts,
} from "@/lib/auth.functions";
import { getSheetsConnection } from "@/lib/sheets.functions";
import { Download, ExternalLink, History, RefreshCcw } from "lucide-react";
import InstallButton from "@/components/install-button";
import { isInstalled, isIos } from "@/lib/pwa";
import { notifyUpdate } from "@/lib/notify";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Focus Lady Bra ERP" },
      {
        name: "description",
        content: "Google Sheets sync and PWA settings for Focus Lady Bra ERP.",
      },
      { property: "og:title", content: "Settings — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "Manage the ERP's Google Sheets connection and install settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: sheetsConnection } = useQuery({
    queryKey: ["erp", "sheets-connection"],
    queryFn: () => getSheetsConnection(),
    staleTime: 5 * 60_000,
  });
  const { data: authSession } = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => getAuthSession(),
  });
  const { data: members } = useQuery({
    queryKey: ["auth", "members"],
    queryFn: () => getMemberAccounts(),
    enabled: Boolean(authSession?.isAdmin),
  });
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    setIos(isIos());
  }, []);

  return (
    <ErpShell activeSlug="settings" title="Settings" subtitle="Sync and install status">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Install app</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {installed ? (
              <p className="text-muted-foreground">
                This app is installed and opens as its own window without a browser frame.
              </p>
            ) : ios ? (
              <p className="text-muted-foreground">
                On iPhone or iPad, open the Share sheet and choose{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Install Focus Lady Bra ERP as a standalone desktop or mobile app.
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Google Sheets sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              The ERP reads and writes the connected company spreadsheet on the server. Service
              account credentials stay in Vercel environment variables.
            </p>
            <div className="flex flex-wrap gap-2">
              {sheetsConnection?.spreadsheetId ? (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetsConnection.spreadsheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Open spreadsheet
                  </a>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["erp"] });
                  notifyUpdate("Re-synced from Google Sheets");
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

        {authSession?.isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Member accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <form
                className="space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setAccountBusy(true);
                  try {
                    await addMemberAccount({
                      data: { email: memberEmail, password: memberPassword },
                    });
                    setMemberEmail("");
                    setMemberPassword("");
                    await queryClient.invalidateQueries({ queryKey: ["auth", "members"] });
                    notifyUpdate("Member account created");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not create member account",
                    );
                  } finally {
                    setAccountBusy(false);
                  }
                }}
              >
                <p className="font-medium">Create account</p>
                <div>
                  <Label htmlFor="member-email">Member email</Label>
                  <Input
                    id="member-email"
                    type="email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="member-password">Temporary password</Label>
                  <Input
                    id="member-password"
                    type="password"
                    minLength={8}
                    value={memberPassword}
                    onChange={(event) => setMemberPassword(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" size="sm" disabled={accountBusy}>
                  {accountBusy ? "Creating..." : "Create member"}
                </Button>
              </form>

              <div className="border-t border-border pt-4">
                <p className="font-medium">Reset member password</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <Label htmlFor="reset-member-email">Member email</Label>
                    <Input
                      id="reset-member-email"
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reset-member-password">New password</Label>
                    <Input
                      id="reset-member-password"
                      type="password"
                      minLength={8}
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={accountBusy || !resetEmail || !resetPassword}
                    onClick={async () => {
                      setAccountBusy(true);
                      try {
                        await changeMemberPassword({
                          data: { email: resetEmail, password: resetPassword },
                        });
                        setResetEmail("");
                        setResetPassword("");
                        notifyUpdate("Member password updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Could not reset password",
                        );
                      } finally {
                        setAccountBusy(false);
                      }
                    }}
                  >
                    Reset password
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="font-medium">Configured members</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {members?.accounts.length ? (
                    members.accounts.map((member) => <li key={member.email}>{member.email}</li>)
                  ) : (
                    <li>No managed members yet.</li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ErpShell>
  );
}
