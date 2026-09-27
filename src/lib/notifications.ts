export type NotificationPriority = "Critical" | "High" | "Normal" | "Info";
export type NotificationCategory =
  | "sales"
  | "payments"
  | "invoices"
  | "stock"
  | "customers"
  | "purchases"
  | "expenses"
  | "system";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: number;
  read: boolean;
  type: NotificationCategory;
  priority: NotificationPriority;
  actionLabel?: string;
  actionHref?: string;
  relatedRecord?: string;
};

const STORAGE_KEY = "focuslady-notifications";
const MAX_NOTIFICATIONS = 100;

const demoNotifications: NotificationItem[] = [
  {
    id: "invoice-ready-INV-1024",
    title: "Invoice ready",
    message: "Invoice #INV-1024 is ready to view and print.",
    time: Date.now() - 1000 * 60 * 5,
    read: false,
    type: "invoices",
    priority: "Normal",
    actionLabel: "View Invoice",
    actionHref: "/invoices",
    relatedRecord: "INV-1024",
  },
  {
    id: "low-stock-001",
    title: "Low stock",
    message: "Product ABC Bra has only 4 units remaining.",
    time: Date.now() - 1000 * 60 * 18,
    read: false,
    type: "stock",
    priority: "High",
    actionLabel: "View Product",
    actionHref: "/sheet/products",
    relatedRecord: "ABC Bra",
  },
  {
    id: "payment-received-5001",
    title: "Payment received",
    message: "₹5,000 received from Focus Traders.",
    time: Date.now() - 1000 * 60 * 40,
    read: true,
    type: "payments",
    priority: "Normal",
    actionLabel: "View Payment",
    actionHref: "/invoices",
    relatedRecord: "PAY-5001",
  },
];

function getStoredNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return demoNotifications;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return demoNotifications;
    const parsed = JSON.parse(raw) as NotificationItem[];
    return Array.isArray(parsed) && parsed.length ? parsed : demoNotifications;
  } catch {
    return demoNotifications;
  }
}

function saveNotifications(items: NotificationItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // Ignore storage quota issues gracefully.
  }
}

export function getNotifications(): NotificationItem[] {
  return getStoredNotifications().sort((a, b) => b.time - a.time);
}

export function addNotification(item: Omit<NotificationItem, "time" | "read"> & { time?: number }) {
  const notifications = getNotifications();
  const next = [
    {
      ...item,
      time: item.time ?? Date.now(),
      read: Boolean(item.read),
    },
    ...notifications,
  ].filter((entry, index, arr) => arr.findIndex((candidate) => candidate.id === entry.id) === index);

  const trimmed = next.slice(0, MAX_NOTIFICATIONS);
  saveNotifications(trimmed);
  return trimmed;
}

export function markNotificationRead(id: string) {
  const notifications = getNotifications().map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification,
  );
  saveNotifications(notifications);
  return notifications;
}

export function markAllNotificationsRead() {
  const notifications = getNotifications().map((notification) => ({ ...notification, read: true }));
  saveNotifications(notifications);
  return notifications;
}

export function getUnreadCount() {
  return getNotifications().filter((notification) => !notification.read).length;
}

export function removeNotification(id: string) {
  const notifications = getNotifications().filter((notification) => notification.id !== id);
  saveNotifications(notifications);
  return notifications;
}
