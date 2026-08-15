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

export type InvoiceItemInput = {
  product: string;
  qty: number;
  rate: number;
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
  signature: string; // data URL, may be empty
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
      (input.signature ?? "").slice(0, 45000),
    ],
  ]);

  await appendRows(
    "'Sale Items'!A:G",
    input.items.map((i) => [
      input.invoice,
      input.date,
      input.customer,
      i.product,
      String(i.qty),
      String(i.rate),
      String(+(i.qty * i.rate).toFixed(2)),
    ]),
  );

  await appendRows(
    "Stock!A:D",
    input.items.map((i) => [i.product, "", String(i.qty), ""]),
  );

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
  const n =
    rows.filter((r) => (r[0] ?? "").startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
