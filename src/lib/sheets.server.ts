// Server-only Google Sheets gateway helpers.
import { SPREADSHEET_ID } from "./erp-modules";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export function authHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !connKey) {
    throw new Error(
      "Google Sheets connector is not configured. Ensure LOVABLE_API_KEY and GOOGLE_SHEETS_API_KEY are set.",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export type SheetValues = string[][];

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: authHeaders() });
  const body = await res.text();
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : {};
}

export async function readRange(range: string): Promise<SheetValues> {
  const data = (await call(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
  )) as { values?: SheetValues };
  return data.values ?? [];
}

export async function readRanges(ranges: string[]) {
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const data = (await call(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${qs}`,
  )) as { valueRanges?: Array<{ range: string; values?: SheetValues }> };
  return (data.valueRanges ?? []).map((v) => ({
    range: v.range,
    values: v.values ?? [],
  }));
}

export async function appendRows(range: string, values: SheetValues) {
  if (values.length === 0) return;
  await call(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

export async function updateRange(range: string, values: SheetValues) {
  await call(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );
}

/* ---------------------------------- settings --------------------------------- */

export type ErpSettings = {
  defaultGstPercent: number;
  reorderThreshold: number;
  whatsappCountryCode: string;
};

const SETTINGS_DEFAULTS: ErpSettings = {
  defaultGstPercent: 0,
  reorderThreshold: 5,
  whatsappCountryCode: "91",
};

export async function readSettings(): Promise<ErpSettings> {
  const rows = await readRange("Settings!A2:B50");
  const map = new Map(rows.map((r) => [(r[0] ?? "").trim(), (r[1] ?? "").trim()]));
  const num = (k: string, d: number) => {
    const n = parseFloat(map.get(k) ?? "");
    return isFinite(n) ? n : d;
  };
  return {
    defaultGstPercent: num("default_gst_percent", SETTINGS_DEFAULTS.defaultGstPercent),
    reorderThreshold: num("reorder_threshold", SETTINGS_DEFAULTS.reorderThreshold),
    whatsappCountryCode:
      map.get("whatsapp_country_code") || SETTINGS_DEFAULTS.whatsappCountryCode,
  };
}

export async function writeSettings(s: ErpSettings) {
  await updateRange("Settings!A2:B4", [
    ["default_gst_percent", String(s.defaultGstPercent)],
    ["reorder_threshold", String(s.reorderThreshold)],
    ["whatsapp_country_code", s.whatsappCountryCode],
  ]);
  return s;
}

/* ---------------------------------- masters ---------------------------------- */

export type ProductInput = {
  name: string;
  category?: string;
  cost?: number;
  price?: number;
  size?: string;
  color?: string;
  gstPercent?: number;
};

export async function createProduct(p: ProductInput) {
  const rows = await readRange("Products!A2:A2000");
  const id = `P-${String(rows.filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
  await appendRows("Products!A:I", [
    [
      id,
      p.name,
      p.category ?? "",
      "0",
      String(p.cost ?? 0),
      String(p.price ?? 0),
      p.size ?? "",
      p.color ?? "",
      String(p.gstPercent ?? 0),
    ],
  ]);
  return { id, ...p };
}

export type CustomerInput = { name: string; phone?: string };

export async function createCustomer(c: CustomerInput) {
  const rows = await readRange("Customers!A2:A2000");
  const id = `C-${String(rows.filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
  await appendRows("Customers!A:D", [[id, c.name, c.phone ?? "", "0"]]);
  return { id, ...c };
}

/* ---------------------------------- invoices --------------------------------- */

export type InvoiceItemInput = {
  product: string;
  qty: number;
  rate: number;
  size?: string;
  color?: string;
};

export type InvoiceInput = {
  invoice: string;
  date: string;
  customer: string;
  items: InvoiceItemInput[];
  gstPercent: number;
  discount: number;
  paid: number;
  mode: string;
  notes: string;
  signer: string;
};

export function computeInvoice(input: InvoiceInput) {
  const gross = input.items.reduce((a, i) => a + i.qty * i.rate, 0);
  const subtotal = Math.max(0, gross - (input.discount || 0));
  const gst = +(subtotal * ((input.gstPercent || 0) / 100)).toFixed(2);
  const total = +(subtotal + gst).toFixed(2);
  const paid = Math.min(input.paid || 0, total);
  const due = +(total - paid).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), gst, total, paid, due };
}

export async function saveInvoice(input: InvoiceInput) {
  const { subtotal, gst, total, paid, due } = computeInvoice(input);
  const status = due <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

  await appendRows("Sales!A:L", [
    [
      input.invoice,
      input.date,
      input.customer,
      String(subtotal),
      String(gst),
      String(total),
      String(paid),
      String(due),
      status,
      input.notes ?? "",
      input.signer ?? "",
      "",
    ],
  ]);

  await appendRows(
    "'Sale Items'!A:I",
    input.items.map((i) => [
      input.invoice,
      input.date,
      input.customer,
      i.product,
      String(i.qty),
      String(i.rate),
      String(+(i.qty * i.rate).toFixed(2)),
      i.size ?? "",
      i.color ?? "",
    ]),
  );

  // Stock out — one row per variant sold.
  await appendRows(
    "Stock!A:F",
    input.items.map((i) => [i.product, "", String(i.qty), "", i.size ?? "", i.color ?? ""]),
  );

  // Customer ledger: invoice debits the customer, payment credits it.
  await appendRows("'Customer Ledger'!A:E", [
    [input.date, input.customer, String(total), String(paid), String(due)],
  ]);

  if (paid > 0) {
    await appendRows("'Daily Collection'!A:E", [
      [input.date, input.customer, input.invoice, String(paid), input.mode || "Cash"],
    ]);
  }

  return { invoice: input.invoice, subtotal, gst, total, paid, due, status };
}

export async function nextInvoiceNumber(date: string) {
  const rows = await readRange("Sales!A2:A2000");
  const ymd = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const prefix = `FLB-${ymd}-`;
  const n = rows.filter((r) => (r[0] ?? "").startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

/* ---------------------------------- returns ---------------------------------- */

export type ReturnInput = {
  date: string;
  invoice: string;
  customer: string;
  type: "Return" | "Exchange";
  reason?: string;
  items: { product: string; qty: number; rate: number; size?: string; color?: string }[];
};

export async function saveReturn(input: ReturnInput) {
  const existing = await readRange("Returns!A2:A2000");
  const id = `RET-${String(existing.filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
  const amount = input.items.reduce((a, i) => a + i.qty * i.rate, 0);

  await appendRows(
    "Returns!A:K",
    input.items.map((i) => [
      id,
      input.date,
      input.invoice,
      input.customer,
      i.product,
      i.size ?? "",
      i.color ?? "",
      String(i.qty),
      String(+(i.qty * i.rate).toFixed(2)),
      input.type,
      input.reason ?? "",
    ]),
  );

  // Returned goods go back into stock (exchanges are re-issued on a new invoice).
  if (input.type === "Return") {
    await appendRows(
      "Stock!A:F",
      input.items.map((i) => [
        i.product,
        String(i.qty),
        "",
        "",
        i.size ?? "",
        i.color ?? "",
      ]),
    );
    // Credit the customer's ledger by the returned amount.
    await appendRows("'Customer Ledger'!A:E", [
      [input.date, input.customer, "0", String(+amount.toFixed(2)), `Return ${id}`],
    ]);
  }

  return { id, amount: +amount.toFixed(2) };
}

