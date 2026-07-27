import { createServerFn } from "@tanstack/react-start";
import { SPREADSHEET_ID } from "./erp-modules";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error(
      "Google Sheets connector is not configured. Ensure LOVABLE_API_KEY and GOOGLE_SHEETS_API_KEY are set.",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    Accept: "application/json",
  };
}

export type SheetValues = string[][];

export const getSheetRange = createServerFn({ method: "GET" })
  .inputValidator((data: { range: string }) => {
    if (!data || typeof data.range !== "string" || !data.range) {
      throw new Error("range is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${data.range}`;
    const res = await fetch(url, { headers: authHeaders() });
    const body = await res.text();
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${body.slice(0, 300)}`);
    const parsed = JSON.parse(body) as { values?: SheetValues };
    return { values: parsed.values ?? [] };
  });

export const getSheetsBatch = createServerFn({ method: "GET" })
  .inputValidator((data: { ranges: string[] }) => {
    if (!data || !Array.isArray(data.ranges) || data.ranges.length === 0) {
      throw new Error("ranges is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const qs = data.ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${qs}`;
    const res = await fetch(url, { headers: authHeaders() });
    const body = await res.text();
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${body.slice(0, 300)}`);
    const parsed = JSON.parse(body) as {
      valueRanges?: Array<{ range: string; values?: SheetValues }>;
    };
    return {
      valueRanges: (parsed.valueRanges ?? []).map((v) => ({
        range: v.range,
        values: v.values ?? [],
      })),
    };
  });
