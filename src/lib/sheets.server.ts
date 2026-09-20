// Server-only Google Sheets helpers backed by a service account.
import { createSign } from "node:crypto";

export type SheetValues = string[][];

function getSpreadsheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("Google Sheets spreadsheet ID is missing. Set GOOGLE_SHEETS_SPREADSHEET_ID.");
  }
  return spreadsheetId;
}

function getServiceAccountCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error(
      "Google Sheets credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY on the server.",
    );
  }

  return {
    email,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function getAccessToken() {
  const { email, privateKey } = getServiceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeBase64Url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const assertion = `${unsignedToken}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Google authentication failed.");
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google authentication returned no access token.");
  return data.access_token;
}

async function sheetsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${getSpreadsheetId()}${path}`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${await getAccessToken()}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    },
  );
  if (!response.ok) {
    console.error("Google Sheets request failed", response.status);
    throw new Error("Google Sheets request failed.");
  }
  return (await response.json()) as T;
}

async function readSheetValues(range: string): Promise<SheetValues> {
  const data = await sheetsRequest<{ values?: SheetValues }>(
    `/values/${encodeURIComponent(range)}`,
  );
  return data.values ?? [];
}

export async function readRange(range: string): Promise<SheetValues> {
  return readSheetValues(range);
}

export async function readRanges(ranges: string[]) {
  const params = new URLSearchParams();
  ranges.forEach((range) => params.append("ranges", range));
  const data = await sheetsRequest<{ valueRanges?: { range?: string; values?: SheetValues }[] }>(
    `/values:batchGet?${params.toString()}`,
  );

  return (data.valueRanges ?? []).map((valueRange) => ({
    range: valueRange.range ?? "",
    values: valueRange.values ?? [],
  }));
}

export async function appendRows(range: string, values: SheetValues) {
  if (values.length === 0) return;
  await sheetsRequest(
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
}

export async function updateRange(range: string, values: SheetValues) {
  await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
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
  hsn?: string;
  qty: number;
  rate: number;
  gstPercent?: number;
  size?: string;
  color?: string;
};

export type InvoiceInput = {
  mode?: "gst" | "non-gst" | "quotation";
  invoice: string;
  date: string;
  validUntil?: string;
  customer: string;
  customerAddress?: string;
  vehicleNo?: string;
  salesman?: string;
  gstin?: string;
  items: InvoiceItemInput[];
  gstPercent: number;
  discount: number;
  paid: number;
  paymentMode?: string;
  notes: string;
};

export function computeInvoice(input: InvoiceInput) {
  const gross = input.items.reduce((a, i) => a + i.qty * i.rate, 0);
  const subtotal = Math.max(0, gross - (input.discount || 0));
  const gst = input.mode === "non-gst" || input.mode === "quotation" ? 0 : +(subtotal * ((input.gstPercent || 0) / 100)).toFixed(2);
  const total = +(subtotal + gst).toFixed(2);
  const paid = Math.min(input.paid || 0, total);
  const due = +(total - paid).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), gst, total, paid, due };
}

export async function saveInvoice(input: InvoiceInput) {
  const { subtotal, gst, total, paid, due } = computeInvoice(input);
  const status = due <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

  await appendRows("Sales!A:P", [
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
      input.vehicleNo ?? "",
      input.salesman ?? "",
      input.gstin ?? "",
      input.mode ?? "gst",
      input.customerAddress ?? "",
      input.validUntil ?? "",
    ],
  ]);

  await appendRows(
    "'Sale Items'!A:M",
    input.items.map((i) => [
      input.invoice,
      input.date,
      input.customer,
      i.product,
      i.hsn ?? "",
      String(i.qty),
      String(i.rate),
      String(+(i.qty * i.rate).toFixed(2)),
      String(i.gstPercent ?? input.gstPercent ?? 0),
      String(+(i.qty * i.rate * ((i.gstPercent ?? input.gstPercent ?? 0) / 100)).toFixed(2)),
      String(+(i.qty * i.rate * (1 + ((i.gstPercent ?? input.gstPercent ?? 0) / 100))).toFixed(2)),
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
      [input.date, input.customer, input.invoice, String(paid), input.paymentMode || "Cash"],
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

