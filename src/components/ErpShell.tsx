import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MODULES, GROUPS, type ErpModule } from "@/lib/erp-modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Boxes,
  Bot,
  ExternalLink,
  FilePlus2,
  LogOut,
  Plus,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Receipt,
  RefreshCcw,
  Settings,
  Store,
  History,
  TriangleAlert,
  SlidersHorizontal,
} from "lucide-react";
import { signOutClean } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import InstallButton from "@/components/install-button";
import { getSheetsConnection } from "@/lib/sheets.functions";
import { getLastSyncLabel, setLastSyncStamp } from "@/lib/erp-cache";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { toast } from "sonner";
import { addCustomer, addSupplier } from "@/lib/sheets.functions";
import { useServerFn } from "@tanstack/react-start";


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
  const [quickCreateType, setQuickCreateType] = useState<"customer" | "supplier" | null>(null);
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

            <div className="mb-4">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inventory</div>
              <div className="flex flex-col gap-0.5">
                {[
                  { view: "stock", label: "Current Stock", Icon: Boxes },
                  { view: "add", label: "Add Stock", Icon: FilePlus2 },
                  { view: "movements", label: "Stock Movements", Icon: History },
                  { view: "low-stock", label: "Low Stock", Icon: TriangleAlert },
                  { view: "adjust", label: "Stock Adjustment", Icon: SlidersHorizontal },
                ].map((item) => (
                  <Link
                    key={item.view}
                    to="/inventory/$view"
                    params={{ view: item.view }}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      path === `/inventory/${item.view}`
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" aria-label="Add a new record">
                      <Plus className="mr-1 h-4 w-4" />
                      <span className="hidden sm:inline">Add New</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Quick add</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/invoices/new"><FilePlus2 />New Invoice</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/products/new"><Package />New Product</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/inventory/$view" params={{ view: "add" }}><Boxes />Add Stock</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/inventory/$view" params={{ view: "adjust" }}><SlidersHorizontal />Stock Adjustment</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/pos"><ShoppingCart />New Sale</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/dealer-orders/new"><Store />Dealer Order</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setQuickCreateType("customer")}>
                      <Users />New Customer
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setQuickCreateType("supplier")}>
                      <Truck />New Supplier
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
          <QuickCreateDialog
            type={quickCreateType}
            onClose={() => setQuickCreateType(null)}
          />
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function QuickCreateDialog({
  type,
  onClose,
}: {
  type: "customer" | "supplier" | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [gstin, setGstin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const saveCustomer = useServerFn(addCustomer);
  const saveSupplier = useServerFn(addSupplier);

  const close = (force = false) => {
    if (isSaving && !force) return;
    setName("");
    setPhone("");
    setAddress("");
    setCity("");
    setState("");
    setGstin("");
    onClose();
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;
    setIsSaving(true);
    try {
      const payload = { name, phone, address, city, state, gstin };
      if (type === "customer") await saveCustomer({ data: payload });
      else await saveSupplier({ data: payload });
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      toast.success(`${type === "customer" ? "Customer" : "Supplier"} added.`);
      close(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not add ${type}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={type !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type === "customer" ? "Add Customer" : "Add Supplier"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-create-name">Name *</Label>
              <Input id="quick-create-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-create-phone">Phone</Label>
              <Input id="quick-create-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-create-gstin">GSTIN</Label>
              <Input id="quick-create-gstin" value={gstin} onChange={(event) => setGstin(event.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-create-address">Address</Label>
              <Input id="quick-create-address" value={address} onChange={(event) => setAddress(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-create-city">City</Label>
              <Input id="quick-create-city" value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-create-state">State</Label>
              <Input id="quick-create-state" value={state} onChange={(event) => setState(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close()} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "+ Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
