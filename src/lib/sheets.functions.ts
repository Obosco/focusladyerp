import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { assertAuthenticated } from "./auth.server";
import {
  readRange,
  readRanges,
  appendRows,
  saveInvoice,
  nextInvoiceNumber,
  readSettings,
  writeSettings,
  createProduct,
  createCustomer,
  saveReturn,
  getSpreadsheetId,
  recordStockMovement,
  type InvoiceInput,
  type ErpSettings,
  type ProductInput,
  type CustomerInput,
  type ReturnInput,
  type StockMovementInput,
} from "./sheets.server";

const requireAuth = createMiddleware().server(async ({ next }) => {
  assertAuthenticated();
  return next();
});

function requiredText(value: unknown, label: string, maxLength = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function boundedNumber(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a valid number between ${minimum} and ${maximum}.`);
  }
  return value;
}

export const getSheetRange = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { range: string }) => {
    requiredText(data?.range, "range", 120);
    return data;
  })
  .handler(async ({ data }) => ({ values: await readRange(data.range) }));

export const getSheetsBatch = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { ranges: string[] }) => {
    if (!data || !Array.isArray(data.ranges) || data.ranges.length === 0 || data.ranges.length > 50) {
      throw new Error("One to fifty ranges are required.");
    }
    data.ranges.forEach((range) => requiredText(range, "range", 120));
    return data;
  })
  .handler(async ({ data }) => ({ valueRanges: await readRanges(data.ranges) }));

export const getNextInvoiceNumber = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { date: string }) => data ?? { date: "" })
  .handler(async ({ data }) => ({ invoice: await nextInvoiceNumber(data.date) }));

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: InvoiceInput) => {
    if (!data) throw new Error("Invoice data is required");
    requiredText(data.invoice, "Invoice number", 80);
    requiredText(data.date, "Invoice date", 30);
    requiredText(data.customer, "Customer", 160);
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("At least one line item is required");
    }
    if (data.items.length > 500) throw new Error("Too many invoice line items.");
    data.items.forEach((item) => {
      requiredText(item.product, "Product", 160);
      boundedNumber(item.qty, "Quantity", 0.0001, 1_000_000);
      boundedNumber(item.rate, "Rate", 0, 1_000_000_000);
      if (item.gstPercent !== undefined) boundedNumber(item.gstPercent, "GST rate", 0, 100);
    });
    boundedNumber(data.gstPercent, "GST rate", 0, 100);
    boundedNumber(data.discount, "Discount");
    boundedNumber(data.paid, "Paid amount");
    return data;
  })
  .handler(async ({ data }) => saveInvoice(data));

export const getErpSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => readSettings());

export const getSheetsConnection = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => ({ spreadsheetId: getSpreadsheetId() }));

export const saveErpSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: ErpSettings) => {
    if (!data) throw new Error("Settings are required");
    return data;
  })
  .handler(async ({ data }) =>
    writeSettings({
      defaultGstPercent: Number(data.defaultGstPercent) || 0,
      reorderThreshold: Number(data.reorderThreshold) || 0,
      whatsappCountryCode: String(data.whatsappCountryCode ?? "91").replace(/\D/g, "") || "91",
      allowNegativeStock: data.allowNegativeStock === true,
    }),
  );

export const addProduct = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: ProductInput) => {
    requiredText(data?.name, "Product name", 160);
    if (data.cost !== undefined) boundedNumber(data.cost, "Cost");
    if (data.price !== undefined) boundedNumber(data.price, "Price");
    if (data.gstPercent !== undefined) boundedNumber(data.gstPercent, "GST rate", 0, 100);
    return data;
  })
  .handler(async ({ data }) => createProduct(data));

export const addCustomer = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: CustomerInput) => {
    requiredText(data?.name, "Customer name", 160);
    return data;
  })
  .handler(async ({ data }) => createCustomer(data));

export const createReturn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: ReturnInput) => {
    requiredText(data?.invoice, "Invoice", 80);
    requiredText(data?.customer, "Customer", 160);
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("At least one returned item is required");
    }
    data.items.forEach((item) => {
      requiredText(item.product, "Returned product", 160);
      boundedNumber(item.qty, "Returned quantity", 0.0001, 1_000_000);
      boundedNumber(item.rate, "Returned rate", 0, 1_000_000_000);
    });
    return data;
  })
  .handler(async ({ data }) => saveReturn(data));

export const updateStockLevel = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: StockMovementInput) => {
    if (data.barcode !== undefined && data.barcode !== null && data.barcode !== "") {
      requiredText(data.barcode, "Barcode", 120);
    }
    boundedNumber(data.quantity, "Quantity", 0.0001, 1_000_000);
    if (!data.movementType || !["Stock In", "Stock Out", "Adjustment"].includes(data.movementType)) {
      throw new Error("Movement type is required.");
    }
    if (!data.product) requiredText(data.product ?? "Unknown Product", "Product", 160);
    return data;
  })
  .handler(async ({ data }) => recordStockMovement(data));

export const logDownload = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (data: {
      type: string;
      reference: string;
      filename: string;
      format: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    await appendRows("'Download History'!A:F", [
      [
        new Date().toISOString(),
        data.type,
        data.reference,
        data.filename,
        data.format,
        data.note ?? "",
      ],
    ]);
    return { ok: true };
  });
