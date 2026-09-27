import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { Bell, CheckCheck, Inbox } from "lucide-react";

const FILTERS = ["All", "Unread", "Sales", "Payments", "Invoices", "Stock", "Customers", "Purchases", "Expenses", "System"] as const;
type Filter = (typeof FILTERS)[number];

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Focus Lady Bra ERP" },
      { name: "description", content: "Unread and recent ERP notifications." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const notifications = useMemo(() => getNotifications(), []);

  const visibleNotifications = notifications.filter((notification) => {
    if (filter === "All") return true;
    if (filter === "Unread") return !notification.read;
    return notification.type === filter.toLowerCase();
  });

  return (
    <ErpShell
      activeSlug="notifications"
      title="Notifications"
      subtitle="Recent system, payment, stock and invoice updates"
      actions={
        <Button variant="outline" size="sm" onClick={() => markAllNotificationsRead()}>
          <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item}
              type="button"
              variant={filter === item ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(item)}
            >
              {item}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleNotifications.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-muted-foreground">
                <Inbox className="mb-2 h-8 w-8" />
                <p>No notifications in this view.</p>
              </div>
            ) : (
              visibleNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={
                    "rounded-xl border p-3 " +
                    (notification.read ? "border-border bg-background" : "border-primary/40 bg-primary/5")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{notification.title}</span>
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {notification.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                    </div>
                    {!notification.read ? (
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{new Date(notification.time).toLocaleString()}</span>
                    <span>{notification.relatedRecord ?? notification.type}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {notification.actionHref ? (
                      <Button asChild variant="outline" size="sm">
                        <Link to={notification.actionHref as any}>{notification.actionLabel ?? "View"}</Link>
                      </Button>
                    ) : null}
                    {!notification.read ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </ErpShell>
  );
}
