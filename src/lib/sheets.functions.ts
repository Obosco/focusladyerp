import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  readRange,
  readRanges,
  appendRows,
  saveInvoice,
  nextInvoiceNumber,
  type InvoiceInput,
} from "./sheets.server";

export const getSheetRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { range: string }) => {
    if (!data || typeof data.range !== "string" || !data.range) {
      throw new Error("range is required");
    }
    return data;
  })
  .handler(async ({ data }) => ({ values: await readRange(data.range) }));

export const getSheetsBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ranges: string[] }) => {
    if (!data || !Array.isArray(data.ranges) || data.ranges.length === 0) {
      throw new Error("ranges is required");
    }
    return data;
  })
  .handler(async ({ data }) => ({ valueRanges: await readRanges(data.ranges) }));

export const getNextInvoiceNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { date: string }) => data ?? { date: "" })
  .handler(async ({ data }) => ({ invoice: await nextInvoiceNumber(data.date) }));

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: InvoiceInput) => {
    if (!data || !data.customer) throw new Error("Customer is required");
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("At least one line item is required");
    }
    return data;
  })
  .handler(async ({ data }) => saveInvoice(data));

export const logDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
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
