// Server-only Google Sheets helpers backed by a service account.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { ALLOWED_SHEET_TITLES } from "./erp-modules";
import { invoiceTotals } from "./invoice";

export type SheetValues = string[][];

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function getSpreadsheetId() {
  const spreadsheetId =
    firstEnv("GOOGLE_SHEET_ID", "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error(
      "Google Sheets spreadsheet ID is missing. Set GOOGLE_SHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID.",
    );
  }
  return spreadsheetId;
}

function normalizePrivateKey(raw: string) {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  if (!key.includes("BEGIN")) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  }
  return key;
}

function parseServiceAccountJson(raw: string) {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : Buffer.from(trimmed, "base64").toString("utf8");
  const parsed = JSON.parse(jsonText) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Google service account JSON is missing client_email or private_key.");
  }
  return { email: parsed.client_email, privateKey: normalizePrivateKey(parsed.private_key) };
}

function getServiceAccountCredentials() {
  const json = firstEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SERVICE_ACCOUNT");
  if (json) return parseServiceAccountJson(json);

  const file = firstEnv("GOOGLE_SERVICE_ACCOUNT_FILE", "GOOGLE_APPLICATION_CREDENTIALS");
  if (file) return parseServiceAccountJson(readFileSync(file, "utf8"));

  const email = firstEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_CLIENT_EMAIL");
  const privateKey = firstEnv("GOOGLE_PRIVATE_KEY");
  if (!email || !privateKey) {
    throw new Error(
      "Google Sheets credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY on the server.",
    );
  }
  return { email, privateKey: normalizePrivateKey(privateKey) };
}

function sheetTitleFromRange(range: string) {
  const trimmed = range.trim();
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'!");
    if (end > 1) return trimmed.slice(1, end);
  }
  const bang = trimmed.indexOf("!");
  return bang > 0 ? trimmed.slice(0, bang) : trimmed;
}

function assertAllowedRange(range: string) {
  const title = sheetTitleFromRange(range);
  if (!ALLOWED_SHEET_TITLES.includes(title)) {
    throw new Error("That worksheet is not available to this ERP.");
  }
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

let cachedAccessToken: { token: string; exp: number } | undefined;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp - 60 > now) {
    return cachedAccessToken.token;
  }
  const { email, privateKey } = getServiceAccountCredentials();
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
  cachedAccessToken = { token: data.access_token, exp: now + 3300 };
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
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
    console.error("Google Sheets request failed", response.status, detail);
    throw new SheetsRequestError(response.status, detail);
  }
  return (await response.json()) as T;
}

class SheetsRequestError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Google Sheets request failed (HTTP ${status})${detail ? `: ${detail}` : "."}`);
    this.name = "SheetsRequestError";
  }
}

async function readSheetValues(range: string): Promise<SheetValues> {
  assertAllowedRange(range);
  const data = await sheetsRequest<{ values?: SheetValues }>(
    `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );
  return data.values ?? [];
}

export async function readRange(range: string): Promise<SheetValues> {
  return readSheetValues(range);
}

export async function readRanges(ranges: string[]) {
  ranges.forEach(assertAllowedRange);
  const params = new URLSearchParams();
  ranges.forEach((range) => params.append("ranges", range));
  try {
    const data = await sheetsRequest<{ valueRanges?: { range?: string; values?: SheetValues }[] }>(
      `/values:batchGet?${params.toString()}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    );

    return (data.valueRanges ?? []).map((valueRange) => ({
      range: valueRange.range ?? "",
      values: valueRange.values ?? [],
    }));
  } catch (error) {
    // Google rejects the entire batch when one optional worksheet is missing.
    // Retry ranges independently so dashboard/report pages can still render.
    if (!(error instanceof SheetsRequestError) || error.status !== 400) throw error;
    const results = await Promise.all(
      ranges.map(async (range) => {
        try {
          return { range, values: await readSheetValues(range) };
        } catch (rangeError) {
          if (rangeError instanceof SheetsRequestError && rangeError.status === 400) {
            console.warn("Google Sheets range unavailable", range);
            return { range, values: [] as SheetValues };
          }
          throw rangeError;
        }
      }),
    );
    return results;
  }
}

export async function appendRows(range: string, values: SheetValues) {
  if (values.length === 0) return;
  assertAllowedRange(range);
  await sheetsRequest(
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
}

export async function updateRange(range: string, values: SheetValues) {
  assertAllowedRange(range);
  await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

async function clearRange(range: string) {
  assertAllowedRange(range);
  await sheetsRequest(`/values/${encodeURIComponent(range)}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
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

export type CustomerInput = {
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  type?: "Retail" | "Wholesale" | "Bulk";
};

const normalizeCustomerText = (value: string | undefined) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizePhone = (value: string | undefined) => String(value ?? "").replace(/\D/g, "").replace(/^91/, "");

type CustomerRecord = CustomerInput & { id: string; row: number };

async function readCustomers(): Promise<CustomerRecord[]> {
  const rows = await readRange("Customers!A2:T5000");
  return rows.flatMap((row, index) => {
    const name = String(row[1] ?? "").trim();
    if (!name) return [];
    return [{
      id: String(row[0] ?? "").trim(),
      name,
      phone: String(row[2] ?? "").trim(),
      address: String(row[3] ?? "").trim(),
      city: String(row[4] ?? "").trim(),
      state: String(row[5] ?? "").trim(),
      gstin: String(row[6] ?? "").trim(),
      type: (row[7] === "Wholesale" || row[7] === "Bulk" ? row[7] : "Retail") as CustomerInput["type"],
      row: index + 2,
    }];
  });
}

async function resolveCustomer(input: InvoiceInput) {
  const customers = await readCustomers();
  const name = normalizeCustomerText(input.customer);
  const phone = normalizePhone(input.customerPhone);
  const gstin = normalizeCustomerText(input.gstin);
  const match = customers.find((customer) =>
    (name && normalizeCustomerText(customer.name) === name) ||
    (phone && normalizePhone(customer.phone) === phone) ||
    (gstin && normalizeCustomerText(customer.gstin) === gstin),
  );
  if (match) return { ...match, created: false };
  const next = customers.length + 1;
  const id = `C-${String(next).padStart(4, "0")}`;
  const sheetRow = next + 1;
  await appendRows("Customers!A:T", [[
    id, input.customer.trim().replace(/\s+/g, " "), input.customerPhone ?? "", input.customerAddress ?? "",
    input.customerCity ?? "", input.customerState ?? "", input.gstin ?? "", "Retail", "0", "0", "", input.notes ?? "", "TRUE",
    new Date().toISOString(), input.date, paidDate(input.paid, input.date),
    `=COUNTIF(Sales!Q:Q,A${sheetRow})`, `=SUMIF(Sales!Q:Q,A${sheetRow},Sales!F:F)`,
    `=SUMIF(Sales!Q:Q,A${sheetRow},Sales!G:G)`, `=R${sheetRow}-S${sheetRow}`,
  ]]);
  return { id, name: input.customer, phone: input.customerPhone, address: input.customerAddress, city: input.customerCity, state: input.customerState, gstin: input.gstin, row: sheetRow, created: true };
}

function paidDate(paid: number, date: string) { return paid > 0 ? date : ""; }

export async function createCustomer(c: CustomerInput) {
  return resolveCustomer({
    invoice: "",
    date: new Date().toISOString().slice(0, 10),
    customer: c.name,
    customerPhone: c.phone,
    customerAddress: c.address,
    customerCity: c.city,
    customerState: c.state,
    gstin: c.gstin,
    items: [{ product: "-", qty: 0, rate: 0 }],
    gstPercent: 0,
    discount: 0,
    paid: 0,
    notes: "",
  });
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
  customerId?: string;
  customerPhone?: string;
  customerCity?: string;
  customerState?: string;
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
  const totals = invoiceTotals({
    mode: input.mode ?? "gst",
    items: input.items.map((item) => ({
      product: item.product,
      hsn: item.hsn ?? "",
      qty: item.qty,
      rate: item.rate,
      gstPercent: item.gstPercent ?? input.gstPercent ?? 0,
    })),
    discount: input.discount,
    paid: input.paid,
  });
  return {
    subtotal: totals.subtotal,
    gst: totals.gst,
    total: totals.total,
    paid: totals.paid,
    due: totals.due,
  };
}

export async function saveInvoice(input: InvoiceInput) {
  const existingInvoices = await readRange("Sales!A2:A5000");
  if (existingInvoices.some((row) => String(row[0] ?? "").trim() === input.invoice.trim())) {
    throw new Error(`Invoice ${input.invoice} already exists.`);
  }
  const customer = await resolveCustomer(input);
  const { subtotal, gst, total, paid, due } = computeInvoice(input);
  const status = due <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

  try {
    await appendRows("Sales!A:Q", [
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
      customer.id,
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
  } catch (error) {
    if (customer.created) await clearRange(`Customers!A${customer.row}:T${customer.row}`).catch(() => undefined);
    throw error;
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

