// Server-only Google Sheets helpers — direct Google API via service account.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSign } from "node:crypto";
import { SPREADSHEET_ID } from "./erp-modules";

const GATEWAY = "https://sheets.googleapis.com/v4";

type ServiceAccount = { client_email: string; private_key: string; token_uri: string };

let serviceAccount: ServiceAccount | undefined;

// Serverless hosts have no key file on disk, so the credential can also arrive inline as
// an env var — raw JSON or base64 of it. GOOGLE_SERVICE_ACCOUNT_FILE stays the local path.
function readServiceAccountSource(): string {
  const inline = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (inline) {
    const trimmed = inline.trim();
    return trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  }

  const file = process.env["GOOGLE_SERVICE_ACCOUNT_FILE"];
  if (file) return readFileSync(resolve(process.cwd(), file), "utf8");

  throw new Error(
    "Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON to the service account key (JSON or base64), or GOOGLE_SERVICE_ACCOUNT_FILE to its path on disk.",
  );
}

function loadServiceAccount(): ServiceAccount {
  if (!serviceAccount) {
    const parsed = JSON.parse(readServiceAccountSource()) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        "Google service account key is missing client_email or private_key. Check the credential value.",
      );
    }
    // Env vars round-trip newlines as the two characters \n; PEM parsing needs real ones.
    serviceAccount = {
      ...parsed,
      token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }
  return serviceAccount;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const sa = loadServiceAccount();
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google auth failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export type SheetValues = string[][];

async function call(url: string, init?: RequestInit) {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
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
      "",
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

