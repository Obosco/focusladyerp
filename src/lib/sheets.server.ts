// Server-only Google Sheets helpers backed by a service account.
import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ALLOWED_SHEET_TITLES } from "./erp-modules";
import { invoiceTotals } from "./invoice";

export type SheetValues = string[][];

const SHEET_READ_CACHE_TTL_MS = 30_000;
const sheetReadCache = new Map<string, { values: SheetValues; expiresAt: number }>();
const inFlightSheetReads = new Map<string, Promise<SheetValues>>();
let sheetCacheGeneration = 0;

function normalizeSheetValues(values: unknown[][] | undefined): SheetValues {
  return (values ?? []).map((row) => row.map((value) => String(value ?? "")));
}

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

const DEFAULT_SHEET_HEADERS: Record<string, string[]> = {
  Dashboard: ["Metric", "Value", "Updated At"],
  Company: ["Company Name", "Phone", "Email", "Address", "GSTIN", "Notes"],
  Products: ["ID", "Name", "Category", "Brand", "Description", "Unit", "Barcode", "Stock", "Cost", "Price", "Minimum Stock", "Status"],
  "Product Variants": ["Variant ID", "Product ID", "Variant Name", "SKU", "Barcode", "Barcode Type", "Size", "Color", "Design", "Purchase Price", "Selling Price", "Current Stock", "Minimum Stock", "Unit", "Status", "Created At", "Updated At"],
  Stock: ["Product", "Barcode", "Quantity", "Purchase", "Size", "Color"],
  "Stock Movements": ["Movement ID", "Date", "Product ID", "Variant ID", "Product", "SKU", "Size", "Color", "Type", "Quantity", "Before Stock", "After Stock", "Reference Type", "Reference ID", "Supplier", "Batch Number", "Location", "Unit Cost", "Notes", "User"],
  Customers: ["ID", "Name", "Phone", "Address", "City", "State", "GSTIN", "Type", "Open Balance", "Paid", "Due", "Notes", "Active", "Created At", "Date", "Last Paid", "Customer Count", "Sales Value", "Total Due"],
  Suppliers: ["ID", "Name", "Phone", "Address", "City", "State", "GSTIN", "Category", "Notes"],
  Sales: ["Invoice", "Date", "Customer", "Subtotal", "GST", "Total", "Paid", "Due", "Status", "Notes", "Vehicle No", "Salesman", "GSTIN", "Mode", "Address", "Valid Until", "Customer ID"],
  Purchases: ["Invoice", "Date", "Supplier", "Subtotal", "GST", "Total", "Paid", "Due", "Status", "Notes"],
  "Daily Collection": ["Date", "Customer", "Invoice", "Amount", "Mode"],
  Expenses: ["Date", "Category", "Description", "Amount", "Payment Mode", "Notes"],
  "Cash Book": ["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"],
  "Customer Ledger": ["Date", "Customer", "Debit", "Credit", "Narration"],
  "Supplier Ledger": ["Date", "Supplier", "Debit", "Credit", "Narration"],
  "Profit & Loss": ["Month", "Revenue", "Expenses", "Net Profit"],
  Settings: ["Key", "Value"],
  "Sale Items": ["Invoice", "Date", "Customer", "Product", "HSN", "Qty", "Rate", "Amount", "GST %", "GST Amount", "Total", "Size", "Color"],
  "Download History": ["Timestamp", "Type", "Reference", "Filename", "Format", "Note"],
  "Barcode Database": ["Barcode ID", "Barcode", "Barcode Type", "Product ID", "Product Name", "Variant ID", "Variant Name", "SKU", "Category", "Brand", "Size", "Color", "Design", "Price", "Status", "Created At", "Created By", "Updated At"],
  "Barcode Sequences": ["Sequence ID", "Barcode Type", "Prefix", "Last Number", "Next Number", "Updated At"],
  "Barcode Templates": ["Template ID", "Template Name", "Label Width", "Label Height", "Paper Size", "Printer Type", "Columns", "Margin Top", "Margin Bottom", "Margin Left", "Margin Right", "Horizontal Gap", "Vertical Gap", "Font Size", "Show Product Name", "Show Variant", "Show SKU", "Show Price", "Show Size", "Show Color", "Show Barcode Number", "Show Company", "Created At", "Updated At"],
  "Barcode Print History": ["Print ID", "Barcode", "Product ID", "Variant ID", "Product Name", "Quantity", "Template", "Printer Type", "Printed By", "Printed At"],
  "POS Held Bills": ["Hold ID", "Customer ID", "Customer Name", "Items JSON", "Subtotal", "Discount", "Tax", "Total", "Created By", "Created At", "Updated At", "Status"],
  "POS Payments": ["Payment ID", "Invoice ID", "Payment Method", "Amount", "Reference", "Payment Date", "Created By"],
  "Dealer Orders": ["Order ID", "Dealer ID", "Dealer Name", "Status", "Created At", "Created By", "Updated At", "Updated By", "Delivery Address", "City", "District", "PIN Code", "Required Delivery Date", "Delivery Method", "Payment Method", "Payment Reference", "Advance", "Subtotal", "Discount", "Tax", "Grand Total", "Total Quantity", "Notes", "Timeline"],
  "Dealer Order Items": ["Order ID", "Product ID", "Product", "SKU", "Barcode", "Size", "Cup Size", "Color", "Quantity", "Available Stock", "Unit Price", "Discount", "Line Total"],
  Returns: ["Return ID", "Date", "Invoice", "Customer", "Product", "Size", "Color", "Qty", "Amount", "Type", "Reason"],
  "Audit History": ["Audit ID", "Timestamp", "User ID", "User Name", "Action", "Module", "Record ID", "Product ID", "Variant ID", "Barcode", "Old Value", "New Value", "Description", "Device", "Status"],
  Users: ["User ID", "Full Name", "Email", "Mobile Number", "Role", "Status", "Department", "Employee ID", "Profile Image URL", "Created At", "Created By", "Activated At", "Last Login At", "Last Password Change At", "Session Revoked At", "Failed Login Attempts", "Locked Until", "Email Verified", "Updated At", "Password Hash"],
};

function columnLabel(index: number) {
  let label = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export async function ensureSheet(title: string, header: string[] = []) {
  const normalized = title.trim();
  if (!normalized) return;
  if (!ALLOWED_SHEET_TITLES.includes(normalized)) {
    throw new Error(`That worksheet is not available to this ERP: ${normalized}`);
  }

  const resolvedHeader = header.length > 0 ? header : DEFAULT_SHEET_HEADERS[normalized] ?? [];

  try {
    await sheetsRequest<{ values?: SheetValues }>(`/values/${encodeURIComponent(`${normalized}!A1`)}`);
    if (resolvedHeader.length > 0) {
      const existing = await sheetsRequest<{ values?: SheetValues }>(`/values/${encodeURIComponent(`${normalized}!A1:${columnLabel(Math.max(resolvedHeader.length, 1))}1`)}`);
      if (!existing.values || existing.values.length === 0 || existing.values[0].length === 0) {
        await updateRange(`${normalized}!A1:${columnLabel(resolvedHeader.length)}1`, [resolvedHeader]);
      }
    }
    return;
  } catch (error) {
    if (!(error instanceof SheetsRequestError) || error.status !== 400) {
      if (!(error instanceof SheetsRequestError) || error.status !== 404) throw error;
    }
  }

  const result = await sheetsRequest<{ replies?: { addSheet?: { properties?: { title?: string } } }[] }>(
    `:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: normalized, gridProperties: { rowCount: 2000, columnCount: 30 } } } }],
      }),
    },
  );
  invalidateSheetCache();

  const created = result.replies?.[0]?.addSheet?.properties?.title;
  if (!created && resolvedHeader.length === 0) {
    throw new Error(`Failed to create the ${normalized} worksheet.`);
  }

  if (resolvedHeader.length > 0) {
    const lastColumn = columnLabel(resolvedHeader.length);
    await updateRange(`${normalized}!A1:${lastColumn}1`, [resolvedHeader]);
  }
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

export function isSheetsQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    (error instanceof SheetsRequestError && error.status === 429) ||
    /RESOURCE_EXHAUSTED|quota|rate[ -]?limit|too many requests|HTTP 429/i.test(message)
  );
}

export function getSheetsErrorMessage(error: unknown, fallback: string) {
  return isSheetsQuotaError(error)
    ? "Google Sheets is busy. Please wait a few seconds and retry."
    : fallback;
}

async function withQuotaRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSheetsQuotaError(error) || attempt >= 4) throw error;
      const baseDelay = 1_000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + Math.random() * 250));
    }
  }
}

function getCachedRange(range: string) {
  const cached = sheetReadCache.get(range);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    sheetReadCache.delete(range);
    return undefined;
  }
  return cached.values;
}

function trackSheetRead(range: string, request: Promise<SheetValues>) {
  const generation = sheetCacheGeneration;
  let tracked: Promise<SheetValues>;
  tracked = request
    .then((values) => {
      if (generation === sheetCacheGeneration) {
        sheetReadCache.set(range, { values, expiresAt: Date.now() + SHEET_READ_CACHE_TTL_MS });
      }
      return values;
    })
    .finally(() => {
      if (inFlightSheetReads.get(range) === tracked) inFlightSheetReads.delete(range);
    });
  inFlightSheetReads.set(range, tracked);
  return tracked;
}

export function invalidateSheetCache() {
  sheetCacheGeneration += 1;
  sheetReadCache.clear();
  inFlightSheetReads.clear();
}

async function readSheetValues(range: string): Promise<SheetValues> {
  assertAllowedRange(range);
  const title = sheetTitleFromRange(range);
  try {
    const data = await sheetsRequest<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
    );
    return normalizeSheetValues(data.values);
  } catch (error) {
    if (!(error instanceof SheetsRequestError) || (error.status !== 400 && error.status !== 404)) {
      throw error;
    }
    await ensureSheet(title, DEFAULT_SHEET_HEADERS[title] ?? []);
    const data = await sheetsRequest<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
    );
    return normalizeSheetValues(data.values);
  }
}

export async function readRange(range: string): Promise<SheetValues> {
  assertAllowedRange(range);
  const cached = getCachedRange(range);
  if (cached) return cached;
  const inFlight = inFlightSheetReads.get(range);
  if (inFlight) return inFlight;
  return trackSheetRead(range, withQuotaRetry(() => readSheetValues(range)));
}

export async function readRanges(ranges: string[]): Promise<SheetValues[]> {
  ranges.forEach(assertAllowedRange);

  const reads = new Map<string, Promise<SheetValues>>();
  const pendingRanges: string[] = [];
  const seenRanges = new Set<string>();

  for (const range of ranges) {
    if (seenRanges.has(range)) continue;
    seenRanges.add(range);
    const cached = getCachedRange(range);
    if (cached) {
      reads.set(range, Promise.resolve(cached));
      continue;
    }
    const inFlight = inFlightSheetReads.get(range);
    if (inFlight) {
      reads.set(range, inFlight);
      continue;
    }
    pendingRanges.push(range);
  }

  if (pendingRanges.length > 0) {
    const batchRequest = withQuotaRetry(async () => {
      const params = new URLSearchParams();
      pendingRanges.forEach((range) => params.append("ranges", range));
      const data = await sheetsRequest<{
        valueRanges?: { range?: string; values?: unknown[][] }[];
      }>(`/values:batchGet?${params.toString()}&valueRenderOption=FORMATTED_VALUE`);
      return pendingRanges.map((_, index) => normalizeSheetValues(data.valueRanges?.[index]?.values));
    }).catch(async (error: unknown) => {
      // Google rejects the entire batch when one optional worksheet is missing.
      if (!(error instanceof SheetsRequestError) || error.status !== 400) throw error;
      return Promise.all(
        pendingRanges.map(async (range) => {
          try {
            return await withQuotaRetry(() => readSheetValues(range));
          } catch (rangeError) {
            if (
              rangeError instanceof SheetsRequestError &&
              (rangeError.status === 400 || rangeError.status === 404)
            ) {
              console.warn("Google Sheets range unavailable", range);
              return [] as SheetValues;
            }
            throw rangeError;
          }
        }),
      );
    });

    pendingRanges.forEach((range, index) => {
      reads.set(
        range,
        trackSheetRead(range, batchRequest.then((values) => values[index] ?? [])),
      );
    });
  }

  return Promise.all(ranges.map((range) => reads.get(range)!));
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
  invalidateSheetCache();
}

export async function appendRowsBatch(entries: Array<{ sheet: string; values: SheetValues }>) {
  const activeEntries = entries.filter((entry) => entry.values.length > 0);
  if (activeEntries.length === 0) return;
  for (const entry of activeEntries) {
    if (!ALLOWED_SHEET_TITLES.includes(entry.sheet)) {
      throw new Error(`That worksheet is not available to this ERP: ${entry.sheet}`);
    }
    await ensureSheet(entry.sheet, DEFAULT_SHEET_HEADERS[entry.sheet] ?? []);
  }

  const metadata = await sheetsRequest<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>("?fields=sheets.properties(sheetId,title)");
  const sheetIds = new Map(
    (metadata.sheets ?? []).flatMap((sheet) =>
      sheet.properties?.title !== undefined && sheet.properties.sheetId !== undefined
        ? [[sheet.properties.title, sheet.properties.sheetId] as const]
        : [],
    ),
  );
  const requests = activeEntries.map((entry) => {
    const sheetId = sheetIds.get(entry.sheet);
    if (sheetId === undefined) throw new Error(`Could not find the ${entry.sheet} worksheet.`);
    const headers = DEFAULT_SHEET_HEADERS[entry.sheet] ?? [];
    return {
      appendCells: {
        sheetId,
        rows: entry.values.map((row) => ({
          values: row.map((value, index) => {
            const numericColumn =
              /(quantity|qty|stock|subtotal|gst|total|paid|due|price|cost|amount|rate|discount)/i.test(
                headers[index] ?? "",
              );
            const numericValue = Number(value);
            return {
              userEnteredValue:
                numericColumn && value.trim() !== "" && Number.isFinite(numericValue)
                  ? { numberValue: numericValue }
                  : { stringValue: value },
            };
          }),
        })),
        fields: "userEnteredValue",
      },
    };
  });

  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  invalidateSheetCache();
}

export async function updateRange(range: string, values: SheetValues) {
  assertAllowedRange(range);
  await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
  invalidateSheetCache();
}

async function clearRange(range: string) {
  assertAllowedRange(range);
  await sheetsRequest(`/values/${encodeURIComponent(range)}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  invalidateSheetCache();
}

/* ---------------------------------- settings --------------------------------- */

export type ErpSettings = {
  defaultGstPercent: number;
  reorderThreshold: number;
  whatsappCountryCode: string;
  allowNegativeStock: boolean;
};

const SETTINGS_DEFAULTS: ErpSettings = {
  defaultGstPercent: 0,
  reorderThreshold: 5,
  whatsappCountryCode: "91",
  allowNegativeStock: false,
};

function parseSettings(rows: SheetValues): ErpSettings {
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
    allowNegativeStock:
      (map.get("allow_negative_stock") ?? "false").toLowerCase() === "true",
  };
}

export async function readSettings(): Promise<ErpSettings> {
  return parseSettings(await readRange("Settings!A2:B50"));
}

export async function writeSettings(s: ErpSettings) {
  await ensureSheet("Settings", DEFAULT_SHEET_HEADERS.Settings);
  await updateRange("Settings!A2:B6", [
    ["default_gst_percent", String(s.defaultGstPercent)],
    ["reorder_threshold", String(s.reorderThreshold)],
    ["whatsapp_country_code", s.whatsappCountryCode],
    ["allow_negative_stock", String(Boolean(s.allowNegativeStock))],
  ]);
  return s;
}

/* ---------------------------------- masters ---------------------------------- */

export type ProductInput = {
  name: string;
  category?: string;
  brand?: string;
  description?: string;
  unit?: string;
  barcode?: string;
  barcodeType?: string;
  cost?: number;
  price?: number;
  size?: string;
  color?: string;
  minimumStock?: number;
  status?: string;
  gstPercent?: number;
  variants?: Array<{
    variantName?: string;
    sku?: string;
    barcode?: string;
    barcodeType?: string;
    size?: string;
    color?: string;
    design?: string;
    purchasePrice?: number;
    sellingPrice?: number;
    currentStock?: number;
    minimumStock?: number;
    unit?: string;
    status?: string;
  }>;
};

export type StockMovementType =
  | "OPENING"
  | "PURCHASE"
  | "SALE"
  | "SALES_RETURN"
  | "PURCHASE_RETURN"
  | "MANUAL_ADJUSTMENT"
  | "DAMAGE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export type InventorySnapshot = {
  products: SheetValues;
  variants: SheetValues;
  movements: SheetValues;
  suppliers: SheetValues;
};

const STOCK_MOVEMENT_TYPES: StockMovementType[] = [
  "OPENING",
  "PURCHASE",
  "SALE",
  "SALES_RETURN",
  "PURCHASE_RETURN",
  "MANUAL_ADJUSTMENT",
  "DAMAGE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
];

export async function getInventorySnapshot(): Promise<InventorySnapshot> {
  await ensureSheet("Stock Movements", DEFAULT_SHEET_HEADERS["Stock Movements"]);
  const [products, variants, movements, suppliers] = await readRanges([
    "Products!A2:L5000",
    "'Product Variants'!A2:Q10000",
    "'Stock Movements'!A2:T50000",
    "Suppliers!A2:I5000",
  ]);
  return { products, variants, movements, suppliers };
}

function inventoryBalance(
  productId: string,
  variantId: string,
  products: SheetValues,
  variants: SheetValues,
  movements: SheetValues,
) {
  const product = products.find((row) => String(row[0] ?? "").trim() === productId);
  const variant = variants.find((row) => String(row[0] ?? "").trim() === variantId);
  const opening = variant ? Number(variant[11] ?? 0) : Number(product?.[7] ?? 0);
  const movementTotal = movements
    .filter(
      (row) =>
        String(row[2] ?? "").trim() === productId &&
        String(row[3] ?? "").trim() === variantId,
    )
    .reduce((total, row) => total + Number(row[9] ?? 0), 0);
  return opening + movementTotal;
}

type StockMovementRecordInput = {
  productId: string;
  variantId?: string;
  type: StockMovementType;
  quantity: number;
  referenceType: string;
  referenceId: string;
  supplier?: string;
  batchNumber?: string;
  location?: string;
  unitCost?: number;
  notes?: string;
  date?: string;
  user?: string;
};

async function appendInventoryMovement(
  input: StockMovementRecordInput,
  snapshot?: InventorySnapshot,
  additionalEntries: Array<{ sheet: string; values: SheetValues }> = [],
) {
  if (!STOCK_MOVEMENT_TYPES.includes(input.type)) {
    throw new Error("Select a valid stock movement type.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new Error("Stock movement quantity must be a non-zero number.");
  }

  const inventory = snapshot ?? (await getInventorySnapshot());
  const product = inventory.products.find(
    (row) => String(row[0] ?? "").trim() === input.productId,
  );
  if (!product) throw new Error("The selected product no longer exists.");
  const variantId = String(input.variantId ?? "").trim();
  const variant = variantId
    ? inventory.variants.find(
        (row) =>
          String(row[0] ?? "").trim() === variantId &&
          String(row[1] ?? "").trim() === input.productId,
      )
    : undefined;
  if (variantId && !variant) {
    throw new Error("The selected variant does not belong to this product.");
  }
  if (
    !variantId &&
    inventory.variants.some((row) => String(row[1] ?? "").trim() === input.productId)
  ) {
    throw new Error("Choose a variant for this product before recording stock.");
  }

  const before = inventoryBalance(
    input.productId,
    variantId,
    inventory.products,
    inventory.variants,
    inventory.movements,
  );
  const after = before + input.quantity;
  const row = [
    randomUUID(),
    input.date ?? new Date().toISOString().slice(0, 10),
    input.productId,
    variantId,
    String(product[1] ?? ""),
    String(variant?.[3] ?? ""),
    String(variant?.[6] ?? ""),
    String(variant?.[7] ?? ""),
    input.type,
    String(input.quantity),
    String(before),
    String(after),
    input.referenceType,
    input.referenceId,
    input.supplier ?? "",
    input.batchNumber ?? "",
    input.location ?? "Main Store",
    String(input.unitCost ?? variant?.[9] ?? product[8] ?? 0),
    input.notes ?? "",
    input.user ?? "Authenticated user",
  ];
  await appendRowsBatch([
    { sheet: "Stock Movements", values: [row] },
    ...additionalEntries,
  ]);
  return { before, after, movementId: row[0] };
}

export type ManualStockInput = {
  productId: string;
  variantId?: string;
  quantity: number;
  purchasePrice?: number;
  supplier?: string;
  batchNumber?: string;
  location?: string;
  notes?: string;
  date?: string;
};

export async function addInventoryStock(input: ManualStockInput, user = "Authenticated user") {
  const snapshot = await getInventorySnapshot();
  return appendInventoryMovement(
    {
      ...input,
      type: "MANUAL_ADJUSTMENT",
      referenceType: "MANUAL_STOCK",
      referenceId: randomUUID(),
      quantity: Math.abs(input.quantity),
      unitCost: input.purchasePrice,
      user,
    },
    snapshot,
  );
}

export type StockAdjustmentInput = {
  productId: string;
  variantId?: string;
  physicalStock: number;
  reason: string;
  notes?: string;
  date?: string;
};

export async function adjustInventoryStock(input: StockAdjustmentInput, user = "Authenticated user") {
  if (!Number.isFinite(input.physicalStock) || input.physicalStock < 0) {
    throw new Error("Physical stock must be zero or greater.");
  }
  const snapshot = await getInventorySnapshot();
  const current = inventoryBalance(
    input.productId,
    String(input.variantId ?? "").trim(),
    snapshot.products,
    snapshot.variants,
    snapshot.movements,
  );
  const difference = input.physicalStock - current;
  if (difference === 0) throw new Error("Physical stock matches the system quantity.");
  return appendInventoryMovement(
    {
      ...input,
      type: "MANUAL_ADJUSTMENT",
      referenceType: "STOCK_ADJUSTMENT",
      referenceId: randomUUID(),
      quantity: difference,
      notes: [input.reason, input.notes].filter(Boolean).join(" - "),
      user,
    },
    snapshot,
  );
}

function normalizeBarcode(value: string | undefined) {
  return String(value ?? "").trim();
}

function isValidBarcode(value: string, type?: string) {
  const code = normalizeBarcode(value);
  if (!code) return true;
  const normalizedType = (type ?? "CODE128").toUpperCase();
  const digitsOnly = /^\d+$/;
  const alphaNumeric = /^[A-Za-z0-9]+$/;

  if (normalizedType === "EAN-13" || normalizedType === "UPC-A") return digitsOnly.test(code) && code.length === (normalizedType === "EAN-13" ? 13 : 12);
  if (normalizedType === "EAN-8") return digitsOnly.test(code) && code.length === 8;
  if (normalizedType === "ITF-14") return digitsOnly.test(code) && code.length === 14;
  if (normalizedType === "CODE39" || normalizedType === "CODE128" || normalizedType === "QR CODE") {
    return alphaNumeric.test(code) && code.length >= 3 && code.length <= 255;
  }
  return alphaNumeric.test(code) && code.length >= 3 && code.length <= 255;
}

async function checkDuplicateBarcode(barcode: string, skipId?: string) {
  const clean = normalizeBarcode(barcode);
  if (!clean) return false;
  const [productRows, variantRows] = await readRanges([
    "Products!A2:Q2000",
    "Product Variants!A2:Q2000",
  ]);

  const productMatches = productRows.some((row) => {
    const value = normalizeBarcode(String(row[6] ?? ""));
    return value && value === clean && !(skipId && String(row[0] ?? "") === skipId);
  });

  if (productMatches) return true;

  return variantRows.some((row) => {
    const value = normalizeBarcode(String(row[4] ?? ""));
    return value && value === clean && !(skipId && String(row[1] ?? "") === skipId);
  });
}

export async function createProduct(p: ProductInput, user = "Authenticated user") {
  await ensureSheet("Products", DEFAULT_SHEET_HEADERS.Products);
  await ensureSheet("Product Variants", DEFAULT_SHEET_HEADERS["Product Variants"]);
  await ensureSheet("Stock Movements", DEFAULT_SHEET_HEADERS["Stock Movements"]);
  await ensureSheet("Barcode Database", DEFAULT_SHEET_HEADERS["Barcode Database"]);

  const productBarcode = normalizeBarcode(p.barcode);
  if (productBarcode && !isValidBarcode(productBarcode, p.barcodeType)) {
    throw new Error("Barcode format is invalid for the selected barcode type.");
  }
  if (productBarcode && (await checkDuplicateBarcode(productBarcode))) {
    throw new Error("Barcode already exists for another product/variant.");
  }

  const rows = await readRange("Products!A2:A2000");
  const id = `P-${String(rows.filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
  await appendRows("Products!A:Q", [
    [
      id,
      p.name,
      p.category ?? "",
      p.brand ?? "",
      p.description ?? "",
      p.unit ?? "",
      productBarcode,
      "0",
      String(p.cost ?? 0),
      String(p.price ?? 0),
      String(p.minimumStock ?? 0),
      p.status ?? "Active",
    ],
  ]);

  const variants = (p.variants ?? []).filter((variant) => variant.variantName || variant.sku || variant.barcode || variant.size || variant.color);
  const openingMovements: SheetValues = [];
  for (const variant of variants) {
    const variantBarcode = normalizeBarcode(variant.barcode);
    if (variantBarcode && !isValidBarcode(variantBarcode, variant.barcodeType)) {
      throw new Error(`Variant barcode for ${variant.variantName || "variant"} is invalid.`);
    }
    if (variantBarcode && (await checkDuplicateBarcode(variantBarcode))) {
      throw new Error("Barcode already exists for another product/variant.");
    }

    const variantRows = await readRange("Product Variants!A2:A2000");
    const variantId = `V-${String(variantRows.filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
    const createdAt = new Date().toISOString();
    await appendRows("Product Variants!A:Q", [[
      variantId,
      id,
      variant.variantName ?? "",
      variant.sku ?? "",
      variantBarcode,
      variant.barcodeType ?? p.barcodeType ?? "CODE128",
      variant.size ?? p.size ?? "",
      variant.color ?? p.color ?? "",
      variant.design ?? "",
      String(variant.purchasePrice ?? p.cost ?? 0),
      String(variant.sellingPrice ?? p.price ?? 0),
      "0",
      String(variant.minimumStock ?? p.minimumStock ?? 0),
      variant.unit ?? p.unit ?? "",
      variant.status ?? "Active",
      createdAt,
      createdAt,
    ]]);
    const openingQuantity = Number(variant.currentStock ?? 0);
    if (openingQuantity > 0) {
      openingMovements.push([
        randomUUID(),
        createdAt.slice(0, 10),
        id,
        variantId,
        p.name,
        variant.sku ?? "",
        variant.size ?? p.size ?? "",
        variant.color ?? p.color ?? "",
        "OPENING",
        String(openingQuantity),
        "0",
        String(openingQuantity),
        "PRODUCT_CREATION",
        id,
        "",
        "",
        "Main Store",
        String(variant.purchasePrice ?? p.cost ?? 0),
        "Initial stock",
        user,
      ]);
    }

    if (variantBarcode) {
      await appendRows("Barcode Database!A:S", [[
        `B-${String((await readRange("Barcode Database!A2:A2000")).filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`,
        variantBarcode,
        variant.barcodeType ?? p.barcodeType ?? "CODE128",
        id,
        p.name,
        variantId,
        variant.variantName ?? "",
        variant.sku ?? "",
        p.category ?? "",
        p.brand ?? "",
        variant.size ?? p.size ?? "",
        variant.color ?? p.color ?? "",
        variant.design ?? "",
        String(variant.sellingPrice ?? p.price ?? 0),
        variant.status ?? "Active",
        createdAt,
        p.name,
        createdAt,
      ]]);
    }
  }

  if (openingMovements.length > 0) {
    await appendRows("'Stock Movements'!A:T", openingMovements);
  }

  if (productBarcode) {
    await appendRows("Barcode Database!A:S", [[
      `B-${String((await readRange("Barcode Database!A2:A2000")).filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`,
      productBarcode,
      p.barcodeType ?? "CODE128",
      id,
      p.name,
      "",
      "",
      "",
      p.category ?? "",
      p.brand ?? "",
      p.size ?? "",
      p.color ?? "",
      "",
      String(p.price ?? 0),
      p.status ?? "Active",
      new Date().toISOString(),
      p.name,
      new Date().toISOString(),
    ]]);
  }

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

async function resolveCustomer(input: InvoiceInput, customerType: CustomerInput["type"] = "Retail") {
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
    input.customerCity ?? "", input.customerState ?? "", input.gstin ?? "", customerType ?? "Retail", "0", "0", "", input.notes ?? "", "TRUE",
    new Date().toISOString(), input.date, paidDate(input.paid, input.date),
    `=COUNTIF(Sales!Q:Q,A${sheetRow})`, `=SUMIF(Sales!Q:Q,A${sheetRow},Sales!F:F)`,
    `=SUMIF(Sales!Q:Q,A${sheetRow},Sales!G:G)`, `=R${sheetRow}-S${sheetRow}`,
  ]]);
  return { id, name: input.customer, phone: input.customerPhone, address: input.customerAddress, city: input.customerCity, state: input.customerState, gstin: input.gstin, row: sheetRow, created: true };
}

function paidDate(paid: number, date: string) { return paid > 0 ? date : ""; }

export async function createCustomer(c: CustomerInput) {
  await ensureSheet("Customers", DEFAULT_SHEET_HEADERS.Customers);
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
  }, c.type);
}

export type SupplierInput = {
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  category?: string;
  notes?: string;
};

export async function createSupplier(input: SupplierInput) {
  await ensureSheet("Suppliers", DEFAULT_SHEET_HEADERS.Suppliers);
  const rows = await readRange("Suppliers!A2:I5000");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (
    rows.some(
      (row) => String(row[1] ?? "").trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error(`Supplier "${name}" already exists.`);
  }
  const id = `SUP-${String(rows.filter((row) => (row[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
  await appendRows("Suppliers!A:I", [[
    id,
    name,
    input.phone ?? "",
    input.address ?? "",
    input.city ?? "",
    input.state ?? "",
    input.gstin ?? "",
    input.category ?? "",
    input.notes ?? "",
  ]]);
  return { id, name };
}

export type DealerInput = CustomerInput;

export type DealerOrderInput = {
  dealerId: string;
  dealerName: string;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    barcode?: string;
    size?: string;
    cupSize?: string;
    color?: string;
    qty: number;
    unitPrice: number;
    discount: number;
  }>;
  address: string;
  city: string;
  district: string;
  pinCode: string;
  requiredDeliveryDate: string;
  deliveryMethod: "Normal" | "Urgent" | "Warehouse Pickup";
  paymentMethod: "Cash" | "UPI" | "Bank Transfer" | "Credit" | "Advance";
  paymentReference?: string;
  advance: number;
  notes?: string;
  confirmed: boolean;
  allowBackorder?: boolean;
};

export async function createDealer(input: DealerInput) {
  await ensureSheet("Customers", DEFAULT_SHEET_HEADERS.Customers);
  const dealerType = input.type === "Bulk" ? "Bulk" : "Wholesale";
  const customers = await readCustomers();
  const phone = normalizePhone(input.phone);
  const name = normalizeCustomerText(input.name);
  const existing = customers.find((customer) =>
    (name && normalizeCustomerText(customer.name) === name) ||
    (phone && normalizePhone(customer.phone) === phone),
  );
  if (existing) {
    if (existing.type !== "Wholesale" && existing.type !== "Bulk") {
      await updateRange(`Customers!H${existing.row}:H${existing.row}`, [[dealerType]]);
    }
    return { ...existing, type: dealerType, created: false };
  }
  const result = await createCustomer({ ...input, type: dealerType });
  return { ...result, id: result.id };
}

type DealerOrderActor = { email: string; role: string };
type DealerOrderRecord = {
  orderId: string;
  dealerId: string;
  dealerName: string;
  status: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deliveryAddress: string;
  city: string;
  district: string;
  pinCode: string;
  requiredDeliveryDate: string;
  deliveryMethod: string;
  paymentMethod: string;
  paymentReference: string;
  advance: number;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  totalQuantity: number;
  notes: string;
  timeline: Array<{ status: string; at: string; by: string; note?: string }>;
  items: Array<DealerOrderInput["items"][number] & { availableStock: number; lineTotal: number }>;
};

const dealerNumber = (value: unknown) => {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
};

async function appendDealerOrderAudit(actor: DealerOrderActor, action: string, orderId: string, description: string, oldValue = "", newValue = "") {
  await ensureSheet("Audit History", DEFAULT_SHEET_HEADERS["Audit History"]);
  const now = new Date().toISOString();
  await appendRows("'Audit History'!A:O", [[
    `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    now,
    actor.email,
    actor.email,
    action,
    "Dealer Orders",
    orderId,
    "",
    "",
    "",
    oldValue,
    newValue,
    description,
    "Web",
    "Success",
  ]]);
}

function parseDealerOrderRow(row: string[]): Omit<DealerOrderRecord, "items"> {
  let timeline: DealerOrderRecord["timeline"] = [];
  try { timeline = JSON.parse(String(row[23] ?? "[]")) as DealerOrderRecord["timeline"]; } catch { /* tolerate older or malformed history */ }
  return {
    orderId: String(row[0] ?? ""), dealerId: String(row[1] ?? ""), dealerName: String(row[2] ?? ""),
    status: String(row[3] ?? "Pending"), createdAt: String(row[4] ?? ""), createdBy: String(row[5] ?? ""),
    updatedAt: String(row[6] ?? ""), updatedBy: String(row[7] ?? ""), deliveryAddress: String(row[8] ?? ""),
    city: String(row[9] ?? ""), district: String(row[10] ?? ""), pinCode: String(row[11] ?? ""),
    requiredDeliveryDate: String(row[12] ?? ""), deliveryMethod: String(row[13] ?? ""),
    paymentMethod: String(row[14] ?? ""), paymentReference: String(row[15] ?? ""), advance: dealerNumber(row[16]),
    subtotal: dealerNumber(row[17]), discount: dealerNumber(row[18]), tax: dealerNumber(row[19]),
    grandTotal: dealerNumber(row[20]), totalQuantity: dealerNumber(row[21]), notes: String(row[22] ?? ""), timeline,
  };
}

function parseDealerOrderRecords(orders: SheetValues, items: SheetValues): DealerOrderRecord[] {
  const itemsByOrder = new Map<string, DealerOrderRecord["items"]>();
  for (const row of items) {
    const orderId = String(row[0] ?? "");
    if (!orderId) continue;
    const orderItems = itemsByOrder.get(orderId) ?? [];
    orderItems.push({
      productId: String(row[1] ?? ""), productName: String(row[2] ?? ""), sku: String(row[3] ?? ""),
      barcode: String(row[4] ?? ""), size: String(row[5] ?? ""), cupSize: String(row[6] ?? ""), color: String(row[7] ?? ""),
      qty: dealerNumber(row[8]), availableStock: dealerNumber(row[9]), unitPrice: dealerNumber(row[10]),
      discount: dealerNumber(row[11]), lineTotal: dealerNumber(row[12]),
    });
    itemsByOrder.set(orderId, orderItems);
  }
  return orders.filter((row) => row[0]).map((row) => {
    const order = parseDealerOrderRow(row);
    return { ...order, items: itemsByOrder.get(order.orderId) ?? [] };
  }).reverse();
}

async function readDealerOrderRecords(): Promise<DealerOrderRecord[]> {
  const [orders, items] = await readRanges([
    "'Dealer Orders'!A2:X5000",
    "'Dealer Order Items'!A2:M20000",
  ]);
  return parseDealerOrderRecords(orders, items);
}

export async function getDealerOrders() {
  return readDealerOrderRecords();
}

export async function getDealerOrderById(orderId: string) {
  return (await readDealerOrderRecords()).find((order) => order.orderId === orderId) ?? null;
}

export async function createDealerOrder(input: DealerOrderInput, actor: DealerOrderActor) {
  if (!input.confirmed) throw new Error("Confirm the order details before submitting.");
  if (!input.dealerId?.trim() || !input.dealerName?.trim()) throw new Error("Select a valid dealer.");
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 500) throw new Error("Add between one and 500 product lines.");
  if (!["Normal", "Urgent", "Warehouse Pickup"].includes(input.deliveryMethod)) throw new Error("Select a valid delivery method.");
  if (!["Cash", "UPI", "Bank Transfer", "Credit", "Advance"].includes(input.paymentMethod)) throw new Error("Select a valid payment method.");
  if (![input.address, input.city, input.district, input.pinCode, input.requiredDeliveryDate].every((value) => typeof value === "string" && value.trim())) throw new Error("Complete all required delivery details.");
  if (!/^\d{4,10}$/.test(input.pinCode.trim())) throw new Error("Enter a valid PIN code.");
  if (!Number.isFinite(input.advance) || input.advance < 0) throw new Error("Advance must be a valid non-negative amount.");
  const distinctLines = new Set<string>();
  for (const item of input.items) {
    if (!item.productId?.trim() || !item.productName?.trim()) throw new Error("Each line must reference an existing product.");
    if (!Number.isFinite(item.qty) || item.qty < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error("Order quantities and prices must be valid non-negative numbers.");
    if (!Number.isFinite(item.discount) || item.discount < 0 || item.discount > item.qty * item.unitPrice) throw new Error(`Discount is invalid for ${item.productName}.`);
    const lineKey = `${item.productId}|${item.sku}`;
    if (distinctLines.has(lineKey)) throw new Error("Remove duplicate product lines before submitting.");
    distinctLines.add(lineKey);
  }
  const role = actor.role.toLowerCase();
  const canBackorder = role === "admin" || role === "manager";
  const [customers, products, variants, settingsRows, orderRows, orderItemRows] =
    await readRanges([
      "Customers!A2:T5000",
      "Products!A2:Q2000",
      "'Product Variants'!A2:Q2000",
      "Settings!A2:B50",
      "'Dealer Orders'!A2:X5000",
      "'Dealer Order Items'!A2:M20000",
    ]);
  const settings = parseSettings(settingsRows);
  const existingOrders = parseDealerOrderRecords(orderRows, orderItemRows);
  const dealer = customers.find((row) => String(row[0] ?? "") === input.dealerId && String(row[1] ?? "").trim());
  if (!dealer || !["wholesale", "bulk"].includes(String(dealer[7] ?? "Retail").toLowerCase())) {
    throw new Error("Select an existing wholesale or bulk dealer.");
  }
  const normalizedItems = input.items.map((item) => {
    const product = products.find((row) => String(row[0] ?? "") === item.productId);
    const variant = variants.find((row) => String(row[1] ?? "") === item.productId && (String(row[3] ?? "") === item.sku || (item.barcode && String(row[4] ?? "") === item.barcode)));
    if (!product) throw new Error(`${item.productName} is no longer in the product catalog.`);
    const isBaseProduct = item.sku === item.productId || (item.barcode && item.barcode === String(product[6] ?? ""));
    if (!variant && !isBaseProduct) throw new Error(`${item.productName} SKU/barcode is no longer in the product catalog.`);
    const available = variant ? dealerNumber(variant[11]) : dealerNumber(product[7]);
    if (item.qty > available && (!canBackorder || !input.allowBackorder)) {
      throw new Error(`Insufficient stock for ${item.productName}. Available: ${available}; requested: ${item.qty}.`);
    }
    const unitPrice = variant ? dealerNumber(variant[10]) || dealerNumber(product[9]) : dealerNumber(product[9]);
    if (item.discount > item.qty * unitPrice) throw new Error(`Discount exceeds line value for ${item.productName}.`);
    return { ...item, unitPrice, availableStock: available, lineTotal: Math.max(item.qty * unitPrice - item.discount, 0) };
  });
  const fingerprint = `${input.dealerId}|${normalizedItems.map((item) => `${item.productId}:${item.sku}:${item.qty}`).sort().join(",")}|${normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)}`;
  const justNow = Date.now() - 120_000;
  if (existingOrders.some((order) => order.dealerId === input.dealerId && Date.parse(order.createdAt) >= justNow && `${order.dealerId}|${order.items.map((item) => `${item.productId}:${item.sku}:${item.qty}`).sort().join(",")}|${order.items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)}` === fingerprint)) {
    throw new Error("A matching order was submitted recently. Check the order list before retrying.");
  }
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const discount = normalizedItems.reduce((sum, item) => sum + item.discount, 0);
  const tax = Math.max(subtotal - discount, 0) * settings.defaultGstPercent / 100;
  const grandTotal = Math.max(subtotal - discount + tax, 0);
  if (input.advance > grandTotal) throw new Error("Advance payment cannot exceed the order total.");
  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.qty, 0);
  const orderId = `SO-${String(existingOrders.reduce((max, order) => Math.max(max, Number(order.orderId.slice(3)) || 0), 0) + 1).padStart(6, "0")}`;
  const now = new Date().toISOString();
  const timeline = [{ status: "Pending", at: now, by: actor.email }];
  await appendRows("'Dealer Orders'!A:X", [[
    orderId, dealer[0], dealer[1], "Pending", now, actor.email, now, actor.email, input.address, input.city,
    input.district, input.pinCode, input.requiredDeliveryDate, input.deliveryMethod, input.paymentMethod,
    input.paymentReference ?? "", String(input.advance), String(subtotal), String(discount), String(tax),
    String(grandTotal), String(totalQuantity), input.notes ?? "", JSON.stringify(timeline),
  ]]);
  await appendRows("'Dealer Order Items'!A:M", normalizedItems.map((item) => [
    orderId, item.productId, item.productName, item.sku, item.barcode ?? "", item.size ?? "", item.cupSize ?? "",
    item.color ?? "", String(item.qty), String(item.availableStock), String(item.unitPrice), String(item.discount), String(item.lineTotal),
  ]));
  await appendDealerOrderAudit(actor, "CREATE", orderId, `Created dealer order for ${dealer[1]}.`, "", "Pending");
  return { orderId, dealerName: String(dealer[1]), status: "Pending", subtotal, discount, tax, grandTotal, totalQuantity, items: normalizedItems };
}

export async function updateDealerOrderStatus(orderId: string, status: string, note: string | undefined, actor: DealerOrderActor) {
  const order = await getDealerOrderById(orderId);
  if (!order) throw new Error("Dealer order not found.");
  const allowed = ["Pending", "Confirmed", "Packing", "Dispatched", "Delivered", "Cancelled", "Returned"];
  if (!allowed.includes(status)) throw new Error("Invalid dealer order status.");
  const role = actor.role.toLowerCase();
  if ((status === "Confirmed" || status === "Cancelled" || status === "Returned") && role !== "admin" && role !== "manager") {
    throw new Error("Only an Admin or Manager can approve, cancel, or mark an order returned.");
  }
  const nextStatus: Record<string, string> = { Pending: "Confirmed", Confirmed: "Packing", Packing: "Dispatched", Dispatched: "Delivered", Delivered: "Returned" };
  if (status !== "Cancelled" && status !== nextStatus[order.status]) {
    throw new Error(`An order in ${order.status} status cannot move to ${status}.`);
  }
  if (status === "Cancelled" && ["Dispatched", "Delivered"].includes(order.status)) {
    throw new Error("Dispatched or delivered orders cannot be cancelled.");
  }
  if (order.status === "Delivered" || order.status === "Cancelled" || order.status === "Returned") {
    throw new Error(`Orders in ${order.status} status cannot be changed.`);
  }
  const rows = await readRange("'Dealer Orders'!A2:X5000");
  const rowNumber = rows.findIndex((row) => String(row[0] ?? "") === orderId) + 2;
  if (rowNumber < 2) throw new Error("Dealer order not found.");
  const now = new Date().toISOString();
  const timeline = [...order.timeline, { status, at: now, by: actor.email, note }];
  await updateRange(`'Dealer Orders'!D${rowNumber}:H${rowNumber}`, [[status, order.createdAt, order.createdBy, now, actor.email]]);
  await updateRange(`'Dealer Orders'!X${rowNumber}:X${rowNumber}`, [[JSON.stringify(timeline)]]);
  await appendDealerOrderAudit(actor, "STATUS_UPDATE", orderId, note || `Status changed to ${status}.`, order.status, status);
  return { orderId, status, timeline };
}

export type DealerOrderDetailsUpdate = Pick<DealerOrderInput, "address" | "city" | "district" | "pinCode" | "requiredDeliveryDate" | "deliveryMethod" | "paymentMethod" | "paymentReference" | "advance" | "notes">;

export async function updateDealerOrderDetails(orderId: string, input: DealerOrderDetailsUpdate, actor: DealerOrderActor) {
  const role = actor.role.toLowerCase();
  if (role !== "admin" && role !== "manager") throw new Error("Only an Admin or Manager can edit order details.");
  const order = await getDealerOrderById(orderId);
  if (!order) throw new Error("Dealer order not found.");
  if (["Delivered", "Cancelled", "Returned"].includes(order.status)) throw new Error(`Orders in ${order.status} status cannot be edited.`);
  if (![input.address, input.city, input.district, input.pinCode, input.requiredDeliveryDate].every((value) => typeof value === "string" && value.trim())) throw new Error("Complete all required delivery details.");
  if (!/^\d{4,10}$/.test(input.pinCode.trim())) throw new Error("Enter a valid PIN code.");
  if (!["Normal", "Urgent", "Warehouse Pickup"].includes(input.deliveryMethod)) throw new Error("Select a valid delivery method.");
  if (!["Cash", "UPI", "Bank Transfer", "Credit", "Advance"].includes(input.paymentMethod)) throw new Error("Select a valid payment method.");
  if (!Number.isFinite(input.advance) || input.advance < 0 || input.advance > order.grandTotal) throw new Error("Advance must be between zero and the order total.");
  const rows = await readRange("'Dealer Orders'!A2:X5000");
  const rowNumber = rows.findIndex((row) => String(row[0] ?? "") === orderId) + 2;
  if (rowNumber < 2) throw new Error("Dealer order not found.");
  const now = new Date().toISOString();
  await updateRange(`'Dealer Orders'!I${rowNumber}:Q${rowNumber}`, [[
    input.address.trim(), input.city.trim(), input.district.trim(), input.pinCode.trim(), input.requiredDeliveryDate,
    input.deliveryMethod, input.paymentMethod, input.paymentReference ?? "", String(input.advance),
  ]]);
  await updateRange(`'Dealer Orders'!W${rowNumber}:W${rowNumber}`, [[input.notes ?? ""]]);
  await updateRange(`'Dealer Orders'!G${rowNumber}:H${rowNumber}`, [[now, actor.email]]);
  await appendDealerOrderAudit(actor, "UPDATE", orderId, "Updated dealer order delivery/payment details.", "", "Order details updated");
  return { orderId, updatedAt: now, updatedBy: actor.email };
}

/* ---------------------------------- invoices --------------------------------- */

export type InvoiceItemInput = {
  product: string;
  variantId?: string;
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

export async function saveInvoice(input: InvoiceInput, user = "Authenticated user") {
  await ensureSheet("Sales", DEFAULT_SHEET_HEADERS.Sales);
  await ensureSheet("Stock", DEFAULT_SHEET_HEADERS.Stock);
  await ensureSheet("Customers", DEFAULT_SHEET_HEADERS.Customers);
  await ensureSheet("Customer Ledger", DEFAULT_SHEET_HEADERS["Customer Ledger"]);
  await ensureSheet("Daily Collection", DEFAULT_SHEET_HEADERS["Daily Collection"]);
  await ensureSheet("Sale Items", DEFAULT_SHEET_HEADERS["Sale Items"]);
  await ensureSheet("Stock Movements", DEFAULT_SHEET_HEADERS["Stock Movements"]);

  const existingInvoices = await readRange("Sales!A2:A5000");
  if (existingInvoices.some((row) => String(row[0] ?? "").trim() === input.invoice.trim())) {
    throw new Error(`Invoice ${input.invoice} already exists.`);
  }
  const inventory = await getInventorySnapshot();
  const movementRows: SheetValues = [];
  const stagedBalances = new Map<string, number>();
  if (input.mode !== "quotation") {
    for (const item of input.items) {
      const product = inventory.products.find(
        (row) =>
          String(row[1] ?? "").trim().toLowerCase() === item.product.trim().toLowerCase(),
      );
      if (!product) {
        throw new Error(`Product "${item.product}" is not in the product catalogue.`);
      }
      const productId = String(product[0] ?? "").trim();
      const productVariants = inventory.variants.filter(
        (row) => String(row[1] ?? "").trim() === productId,
      );
      const variantId = String(item.variantId ?? "").trim();
      if (productVariants.length > 0 && !variantId) {
        throw new Error(`Choose a variant for "${item.product}" before saving the invoice.`);
      }
      const variant = variantId
        ? productVariants.find((row) => String(row[0] ?? "").trim() === variantId)
        : undefined;
      if (variantId && !variant) {
        throw new Error(`The selected variant does not belong to "${item.product}".`);
      }
      const key = `${productId}|${variantId}`;
      const before =
        stagedBalances.get(key) ??
        inventoryBalance(
          productId,
          variantId,
          inventory.products,
          inventory.variants,
          inventory.movements,
        );
      const after = before - item.qty;
      stagedBalances.set(key, after);
      movementRows.push([
        randomUUID(),
        input.date,
        productId,
        variantId,
        String(product[1] ?? ""),
        String(variant?.[3] ?? ""),
        item.size ?? String(variant?.[6] ?? ""),
        item.color ?? String(variant?.[7] ?? ""),
        "SALE",
        String(-item.qty),
        String(before),
        String(after),
        "SALE",
        input.invoice,
        "",
        "",
        "Main Store",
        String(variant?.[9] ?? product[8] ?? 0),
        input.notes ?? "",
        user,
      ]);
    }
  }
  const customer = await resolveCustomer(input);
  const { subtotal, gst, total, paid, due } = computeInvoice(input);
  const status = due <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

  try {
    const transactionEntries: Array<{ sheet: string; values: SheetValues }> = [
      {
        sheet: "Sales",
        values: [[
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
        ]],
      },
      {
        sheet: "Sale Items",
        values: input.items.map((item) => [
          input.invoice,
          input.date,
          input.customer,
          item.product,
          item.hsn ?? "",
          String(item.qty),
          String(item.rate),
          String(+(item.qty * item.rate).toFixed(2)),
          String(item.gstPercent ?? input.gstPercent ?? 0),
          String(+(item.qty * item.rate * ((item.gstPercent ?? input.gstPercent ?? 0) / 100)).toFixed(2)),
          String(+(item.qty * item.rate * (1 + ((item.gstPercent ?? input.gstPercent ?? 0) / 100))).toFixed(2)),
          item.size ?? "",
          item.color ?? "",
        ]),
      },
      {
        sheet: "Customer Ledger",
        values: [[input.date, input.customer, String(total), String(paid), String(due)]],
      },
    ];
    if (input.mode !== "quotation") {
      transactionEntries.push(
        {
          sheet: "Stock",
          values: input.items.map((item) => [
            item.product,
            "",
            String(item.qty),
            "",
            item.size ?? "",
            item.color ?? "",
          ]),
        },
        { sheet: "Stock Movements", values: movementRows },
      );
    }
    if (paid > 0) {
      transactionEntries.push({
        sheet: "Daily Collection",
        values: [[input.date, input.customer, input.invoice, String(paid), input.paymentMode || "Cash"]],
      });
    }
    await appendRowsBatch(transactionEntries);
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

export type StockMovementInput = {
  barcode?: string;
  product?: string;
  variant?: string;
  sku?: string;
  warehouse?: string;
  movementType: "Stock In" | "Stock Out" | "Adjustment";
  quantity: number;
  reason?: string;
  notes?: string;
};

export async function recordStockMovement(input: StockMovementInput, user = "Authenticated user") {
  await ensureSheet("Stock", DEFAULT_SHEET_HEADERS.Stock);
  const qty = Number(input.quantity ?? 0);
  const barcode = String(input.barcode ?? "").trim();
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be greater than zero.");

  const inventory = await getInventorySnapshot();
  const product = inventory.products.find(
    (row) =>
      String(row[0] ?? "").trim() === String(input.product ?? "").trim() ||
      String(row[1] ?? "").trim().toLowerCase() === String(input.product ?? "").trim().toLowerCase(),
  );
  if (!product) throw new Error(`Product "${input.product ?? ""}" is not in the product catalogue.`);
  const productId = String(product[0] ?? "").trim();
  const variants = inventory.variants.filter((row) => String(row[1] ?? "").trim() === productId);
  const variantValue = String(input.variant ?? "").trim().toLowerCase();
  const variant = variants.find(
    (row) =>
      (barcode && String(row[4] ?? "").trim() === barcode) ||
      [row[0], row[2], row[3], row[6], row[7], [row[6], row[7]].filter(Boolean).join(" / ")]
        .some((value) => String(value ?? "").trim().toLowerCase() === variantValue),
  );
  if (variants.length > 0 && !variant) {
    throw new Error(`Choose a valid variant for "${input.product ?? ""}".`);
  }
  const quantity = input.movementType === "Stock Out" ? -qty : qty;
  const reason = String(input.reason ?? "").trim();
  const movementType: StockMovementType =
    input.movementType === "Stock Out"
      ? /damage/i.test(reason)
        ? "DAMAGE"
        : /sale/i.test(reason)
          ? "SALE"
          : "MANUAL_ADJUSTMENT"
      : "MANUAL_ADJUSTMENT";
  await appendInventoryMovement(
    {
      productId,
      variantId: variant?.[0] ?? "",
      type: movementType,
      quantity,
      referenceType: "STOCK_SCANNER",
      referenceId: randomUUID(),
      location: input.warehouse ?? "Main Store",
      unitCost: Number(variant?.[9] ?? product[8] ?? 0),
      notes: [reason, input.notes].filter(Boolean).join(" - "),
      user,
    },
    inventory,
    [{
      sheet: "Stock",
      values: [[
        input.product ?? "Unknown Product",
        barcode,
        String(qty),
        input.movementType,
        input.variant ?? "",
        input.warehouse ?? "Main Store",
      ]],
    }],
  );

  return {
    ok: true,
    barcode,
    movementType: input.movementType,
    quantity: qty,
    warehouse: input.warehouse ?? "Main Store",
  };
}

export async function saveReturn(input: ReturnInput, user = "Authenticated user") {
  await ensureSheet("Returns", DEFAULT_SHEET_HEADERS.Returns);
  await ensureSheet("Stock", DEFAULT_SHEET_HEADERS.Stock);
  await ensureSheet("Customer Ledger", DEFAULT_SHEET_HEADERS["Customer Ledger"]);
  await ensureSheet("Stock Movements", DEFAULT_SHEET_HEADERS["Stock Movements"]);

  const existing = await readRange("Returns!A2:A2000");
  const id = `RET-${String(existing.filter((r) => (r[0] ?? "").trim()).length + 1).padStart(4, "0")}`;
  const amount = input.items.reduce((a, i) => a + i.qty * i.rate, 0);

  const transactionEntries: Array<{ sheet: string; values: SheetValues }> = [
    {
      sheet: "Returns",
      values: input.items.map((item) => [
        id,
        input.date,
        input.invoice,
        input.customer,
        item.product,
        item.size ?? "",
        item.color ?? "",
        String(item.qty),
        String(+(item.qty * item.rate).toFixed(2)),
        input.type,
        input.reason ?? "",
      ]),
    },
  ];
  if (input.type === "Return") {
    const inventory = await getInventorySnapshot();
    const movementRows: SheetValues = [];
    const stagedBalances = new Map<string, number>();
    for (const item of input.items) {
      const product = inventory.products.find(
        (row) =>
          String(row[1] ?? "").trim().toLowerCase() === item.product.trim().toLowerCase(),
      );
      if (!product) {
        throw new Error(`Product "${item.product}" is not in the product catalogue.`);
      }
      const productId = String(product[0] ?? "").trim();
      const productVariants = inventory.variants.filter(
        (row) => String(row[1] ?? "").trim() === productId,
      );
      const variant = productVariants.find(
        (row) =>
          String(row[6] ?? "").trim().toLowerCase() === String(item.size ?? "").trim().toLowerCase() &&
          String(row[7] ?? "").trim().toLowerCase() === String(item.color ?? "").trim().toLowerCase(),
      );
      if (productVariants.length > 0 && !variant) {
        throw new Error(`Choose the matching variant for returned product "${item.product}".`);
      }
      const variantId = String(variant?.[0] ?? "");
      const key = `${productId}|${variantId}`;
      const before =
        stagedBalances.get(key) ??
        inventoryBalance(
          productId,
          variantId,
          inventory.products,
          inventory.variants,
          inventory.movements,
        );
      const after = before + item.qty;
      stagedBalances.set(key, after);
      movementRows.push([
        randomUUID(), input.date, productId, variantId, String(product[1] ?? ""),
        String(variant?.[3] ?? ""), item.size ?? String(variant?.[6] ?? ""),
        item.color ?? String(variant?.[7] ?? ""), "SALES_RETURN", String(item.qty),
        String(before), String(after), "SALES_RETURN", id, "", "", "Main Store",
        String(variant?.[9] ?? product[8] ?? 0), input.reason ?? "", user,
      ]);
    }
    transactionEntries.push(
      { sheet: "Stock Movements", values: movementRows },
      {
        sheet: "Stock",
        values: input.items.map((item) => [
          item.product,
          String(item.qty),
          "",
          "",
          item.size ?? "",
          item.color ?? "",
        ]),
      },
      {
        sheet: "Customer Ledger",
        values: [[input.date, input.customer, "0", String(+amount.toFixed(2)), `Return ${id}`]],
      },
    );
  }
  await appendRowsBatch(transactionEntries);

  return { id, amount: +amount.toFixed(2) };
}
