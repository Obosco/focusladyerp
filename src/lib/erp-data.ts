// Client-safe parsing helpers shared by dashboard, invoices, stock and ledger views.

export const toNum = (v: unknown) => {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};

export const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Google Sheets sometimes returns serial numbers for dates. Normalise to YYYY-MM-DD. */
export function normalizeDate(v: string | undefined): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{2,6}$/.test(raw)) {
    const serial = parseInt(raw, 10);
    const ms = (serial - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export type DateRangeKey = "today" | "week" | "month" | "all";

export const RANGE_LABELS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

export function rangeBounds(key: DateRangeKey): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = iso(now);
  if (key === "today") return { from: to, to };
  if (key === "week") {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // Monday start
    d.setDate(d.getDate() - day);
    return { from: iso(d), to };
  }
  if (key === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(d), to };
  }
  return { from: "0000-01-01", to: "9999-12-31" };
}

export function inRange(dateCell: string | undefined, key: DateRangeKey) {
  if (key === "all") return true;
  const d = normalizeDate(dateCell);
  if (!d) return false;
  const { from, to } = rangeBounds(key);
  return d >= from && d <= to;
}

/* --------------------------------- products --------------------------------- */

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  cost: number;
  price: number;
  size: string;
  color: string;
  gstPercent: number;
};

export const variantKey = (product: string, size?: string, color?: string) =>
  [product.trim(), (size ?? "").trim(), (color ?? "").trim()].join("|").toLowerCase();

export const variantLabel = (product: string, size?: string, color?: string) => {
  const bits = [size, color].map((s) => (s ?? "").trim()).filter(Boolean);
  return bits.length ? `${product} (${bits.join(" - ")})` : product;
};

export function parseProducts(rows: string[][]): ProductRow[] {
  return rows
    .filter((r) => (r[1] ?? "").trim())
    .map((r) => ({
      id: r[0] ?? "",
      name: (r[1] ?? "").trim(),
      category: r[2] ?? "",
      cost: toNum(r[4]),
      price: toNum(r[5]),
      size: (r[6] ?? "").trim(),
      color: (r[7] ?? "").trim(),
      gstPercent: toNum(r[8]),
    }));
}

/* ---------------------------------- stock ----------------------------------- */

export type StockBalance = {
  key: string;
  product: string;
  size: string;
  color: string;
  inQty: number;
  outQty: number;
  balance: number;
  reorder: number;
};

/** Stock tab columns: Product | In | Out | Balance | Size | Color | Reorder Level */
export function stockBalances(rows: string[][], defaultReorder: number): StockBalance[] {
  const map = new Map<string, StockBalance>();
  for (const r of rows) {
    const product = (r[0] ?? "").trim();
    if (!product) continue;
    const size = (r[4] ?? "").trim();
    const color = (r[5] ?? "").trim();
    const key = variantKey(product, size, color);
    const cur =
      map.get(key) ??
      ({
        key,
        product,
        size,
        color,
        inQty: 0,
        outQty: 0,
        balance: 0,
        reorder: defaultReorder,
      } as StockBalance);
    cur.inQty += toNum(r[1]);
    cur.outQty += toNum(r[2]);
    const rl = toNum(r[6]);
    if (rl > 0) cur.reorder = rl;
    cur.balance = cur.inQty - cur.outQty;
    map.set(key, cur);
  }
  return [...map.values()];
}

/* --------------------------------- invoices --------------------------------- */

export type PaymentStatus = "Paid" | "Partial" | "Due";

export function paymentStatus(total: number, paid: number): PaymentStatus {
  if (paid >= total - 0.01 && total > 0) return "Paid";
  if (paid > 0) return "Partial";
  return "Due";
}

export const statusClasses: Record<PaymentStatus, string> = {
  Paid: "border-emerald-600/40 bg-emerald-600/10 text-emerald-600 dark:text-emerald-400",
  Partial: "border-amber-600/40 bg-amber-600/10 text-amber-600 dark:text-amber-400",
  Due: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Sales tab: Invoice | Date | Customer | Subtotal | GST | Total | Paid | Due | Status */
export function customerDue(sales: string[][], customer: string) {
  const name = customer.trim().toLowerCase();
  if (!name) return 0;
  return sales
    .filter((r) => (r[2] ?? "").trim().toLowerCase() === name)
    .reduce((a, r) => a + (toNum(r[5]) - toNum(r[6])), 0);
}

export function whatsappUrl(phone: string, text: string, countryCode = "91") {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const to = digits ? (digits.length > 10 ? digits : `${countryCode}${digits}`) : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
