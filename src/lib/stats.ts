// Client-safe analytics helpers shared by the dashboard, analytics page and tables.

export function toNum(v: unknown) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

export function fmt(n: number) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function money(n: number) {
  return `₹${fmt(n)}`;
}

/** Normalise many date shapes to YYYY-MM-DD. */
export function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (dmy) {
    const d = dmy[1]!.padStart(2, "0");
    const m = dmy[2]!.padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function shiftDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export type PresetKey =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "month"
  | "year"
  | "all"
  | "custom";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

export function presetRange(key: PresetKey): { from: string; to: string } {
  const to = todayIso();
  switch (key) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: shiftDays(6), to };
    case "30d":
      return { from: shiftDays(29), to };
    case "90d":
      return { from: shiftDays(89), to };
    case "month":
      return { from: `${to.slice(0, 7)}-01`, to };
    case "year":
      return { from: `${to.slice(0, 4)}-01-01`, to };
    default:
      return { from: "", to: "" };
  }
}

export function inRange(date: string | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** Find a column index by matching the header against a regex. */
export function col(headers: string[], re: RegExp, fallback = -1) {
  const i = headers.findIndex((h) => re.test((h ?? "").trim()));
  return i >= 0 ? i : fallback;
}

export type Grouping = "day" | "week" | "month";

export function bucketOf(dateIso: string, grouping: Grouping) {
  if (grouping === "month") return dateIso.slice(0, 7);
  if (grouping === "week") {
    const d = new Date(dateIso + "T00:00:00Z");
    const day = (d.getUTCDay() + 6) % 7; // Monday start
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  return dateIso;
}

/** Sum values into ordered buckets keyed by period. */
export function series(
  points: { date: string; values: Record<string, number> }[],
  grouping: Grouping,
) {
  const map = new Map<string, Record<string, number>>();
  for (const p of points) {
    const key = bucketOf(p.date, grouping);
    const bucket = map.get(key) ?? {};
    for (const [k, v] of Object.entries(p.values)) {
      bucket[k] = (bucket[k] ?? 0) + v;
    }
    map.set(key, bucket);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([period, values]) => ({ period, ...values }));
}

export function topN(
  rows: { name: string; value: number }[],
  n = 6,
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.name) continue;
    map.set(r.name, (map.get(r.name) ?? 0) + r.value);
  }
  const sorted = [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((a, r) => a + r.value, 0);
  return rest > 0 ? [...head, { name: "Others", value: rest }] : head;
}
