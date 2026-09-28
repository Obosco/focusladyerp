import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MODULES, GROUPS, type ErpModule } from "@/lib/erp-modules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  ExternalLink,
  FilePlus2,
  LogOut,
  Receipt,
  RefreshCcw,
  Settings,
} from "lucide-react";
import { signOutClean } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import InstallButton from "@/components/install-button";
import { getSheetsConnection } from "@/lib/sheets.functions";
import { getLastSyncLabel, setLastSyncStamp } from "@/lib/erp-cache";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { toast } from "sonner";


function NavItem({ mod, active }: { mod: ErpModule; active: boolean }) {
  const Icon = mod.icon;
  const to = mod.path ?? (mod.slug === "dashboard" ? "/" : `/sheet/${mod.slug}`);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{mod.label}</span>
    </Link>
  );
}

export function ErpShell({
  children,
  activeSlug,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  activeSlug: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const lastSyncLabel = getLastSyncLabel();
  const notifications = useMemo(() => getNotifications().slice(0, 6), []);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );
  const { data: sheetsConnection } = useQuery({
    queryKey: ["erp", "sheets-connection"],
    queryFn: () => getSheetsConnection(),
    staleTime: 5 * 60_000,
  });

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      await queryClient.refetchQueries({ queryKey: ["erp"], type: "active" });
      setLastSyncStamp(Date.now());
      toast.success("Updated just now");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not refresh Focus Lady ERP data.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutClean();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="border-b border-sidebar-border px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Focus Lady Bra
            </div>
            <div className="text-base font-semibold text-sidebar-foreground">ERP</div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="mb-4">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invoicing
              </div>
              <div className="flex flex-col gap-0.5">
                {[
                  { to: "/invoices/new", label: "New Invoice", Icon: FilePlus2 },
                  { to: "/invoices", label: "Invoices", Icon: Receipt },
                  { to: "/analytics", label: "Statistics", Icon: BarChart3 },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      path === l.to
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <l.Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sales</div>
              <div className="flex flex-col gap-0.5">
                {[
                  { to: "/dealer-orders/", label: "All Dealer Orders", Icon: Receipt },
                  { to: "/dealer-orders/new", label: "New Dealer Order", Icon: FilePlus2 },
                  { to: "/dealer-orders/portal", label: "Dealer Ordering", Icon: Store },
                ].map((item) => (
                  <Link key={item.to} to={item.to} className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    path.startsWith(item.to === "/dealer-orders/" ? "/dealer-orders" : item.to)
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}>
                    <item.Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <Link
              to="/assistant"
              className={cn(
                "mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                path === "/assistant"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Bot className="h-4 w-4 shrink-0" />
              <span className="truncate">ERP Assistant</span>
            </Link>

            {GROUPS.map((g) => (
              <div key={g} className="mb-4">
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g}
                </div>
                <div className="flex flex-col gap-0.5">
                  {MODULES.filter((m) => m.group === g).map((m) => (
                    <NavItem
                      key={m.slug}
                      mod={m}
                      active={
                        activeSlug === m.slug ||
                        (m.slug === "dashboard" && path === "/")
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="space-y-1 border-t border-sidebar-border p-3">
            <Link
              to="/settings"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                path === "/settings"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </Link>
            {sheetsConnection?.spreadsheetId ? (
              <a
                href={`https://docs.google.com/spreadsheets/d/${sheetsConnection.spreadsheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Sheet
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </aside>


        <main className="flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-3">
                {path !== "/" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={() => window.history.back()}
                    className="shrink-0"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                )}
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                  {subtitle ? (
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground md:flex">
                  <span>Last sync</span>
                  <span className="font-medium text-foreground">{lastSyncLabel}</span>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Notifications"
                    onClick={() => setShowNotifications((value) => !value)}
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                        {unreadCount}
                      </span>
                    ) : null}
                  </button>
                  {showNotifications ? (
                    <div className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-border bg-popover p-3 shadow-lg">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold">Notifications</span>
                        <button
                          type="button"
                          onClick={() => markAllNotificationsRead()}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No notifications.</p>
                        ) : (
                          notifications.map((notification) => (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={() => {
                                markNotificationRead(notification.id);
                                setShowNotifications(false);
                              }}
                              className={cn(
                                "block w-full rounded-lg border p-2 text-left transition-colors",
                                notification.read ? "border-border bg-background" : "border-primary/30 bg-primary/5",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{notification.title}</span>
                                {!notification.read ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{notification.message}</p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCcw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
                  {isRefreshing ? "Refreshing..." : "↻ Refresh"}
                </Button>
                <InstallButton compact />
                {actions}
              </div>
            </div>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
