import type { Invoice } from "./invoice.types";

export type CalculatedInvoiceLine = {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstPercent: number;
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export type CalculatedInvoice = {
  lines: CalculatedInvoiceLine[];
  subtotal: number;
  discount: number;
  netTaxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grand: number;
  roundOff: number;
  finalTotal: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asText = (value: unknown) => String(value ?? "").trim();

const asNumber = (value: unknown) => {
  const normalized = asText(value).replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

export function normalizeInvoice(value: unknown): Invoice | null {
  if (!value || typeof value !== "object") return null;
  const root = asRecord(value);
  const seller = asRecord(root.seller);
  const header = asRecord(root.invoice);
  const customer = asRecord(root.customer);
  const strings = (field: unknown) => (Array.isArray(field) ? field.map(asText) : []);

  return {
    seller: {
      name: asText(seller.name),
      logoUrl: asText(seller.logoUrl) || "/focus-lady-logo.png",
      addressLines: strings(seller.addressLines),
      phone: asText(seller.phone),
      email: asText(seller.email),
      gstin: asText(seller.gstin),
      stateCode: asText(seller.stateCode),
      stateName: asText(seller.stateName),
    },
    invoice: {
      type: asText(header.type),
      category: asText(header.category),
      copyLabel: asText(header.copyLabel),
      number: asText(header.number),
      date: asText(header.date),
      placeOfSupply: asText(header.placeOfSupply),
      paymentMode: asText(header.paymentMode),
      supplyType: header.supplyType === "INTER" ? "INTER" : "INTRA",
    },
    customer: {
      name: asText(customer.name) || "Walk-in Customer",
      address: asText(customer.address),
      phone: asText(customer.phone),
      gstin: asText(customer.gstin) || "N/A (Unregistered)",
    },
    items: Array.isArray(root.items)
      ? root.items.map((item) => {
          const row = asRecord(item);
          return {
            description: asText(row.description),
            hsn: asText(row.hsn),
            qty: asNumber(row.qty),
            rate: asNumber(row.rate),
            gstPercent: asNumber(row.gstPercent),
          };
        })
      : [],
    discount: Math.max(0, asNumber(root.discount)),
    terms: strings(root.terms),
    footerNote: asText(root.footerNote),
  };
}

export function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function dateFormat(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  const date = new Date(`${text.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}`;
}

const ones = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(value: number): string {
  if (value < 20) return ones[value] ?? "";
  if (value < 100) {
    return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  }
  return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${underThousand(value % 100)}` : ""}`;
}

export function amountInWords(amount: number) {
  const value = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  if (!value) return "Rupees Zero Only";

  const indianNumber = (number: number): string => {
    if (number < 1_000) return underThousand(number);
    const groups: [number, string][] = [
      [10_000_000, "Crore"],
      [100_000, "Lakh"],
      [1_000, "Thousand"],
    ];
    for (const [size, label] of groups) {
      if (number >= size) {
        const group = Math.floor(number / size);
        const remainder = number % size;
        return `${indianNumber(group)} ${label}${remainder ? ` ${indianNumber(remainder)}` : ""}`;
      }
    }
    return "";
  };

  return `Rupees ${indianNumber(value)} Only`;
}

export function calculateInvoice(invoice: Invoice): CalculatedInvoice {
  const safeInvoice = normalizeInvoice(invoice);
  const items = safeInvoice?.items ?? [];
  const lines = items.map((item) => {
    const qty = Math.max(0, item.qty);
    const rate = Math.max(0, item.rate);
    return {
      description: item.description,
      hsn: item.hsn,
      qty,
      rate,
      gstPercent: Math.max(0, item.gstPercent),
      taxable: qty * rate,
      gst: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.taxable, 0);
  const discount = Math.min(Math.max(0, safeInvoice?.discount ?? 0), subtotal);
  const netTaxable = Math.max(0, subtotal - discount);
  const ratio = subtotal > 0 ? netTaxable / subtotal : 0;

  lines.forEach((line) => {
    const taxableShare = line.taxable * ratio;
    line.gst = (taxableShare * line.gstPercent) / 100;
    if (safeInvoice?.invoice.supplyType === "INTRA") {
      line.cgst = line.gst / 2;
      line.sgst = line.gst / 2;
    } else {
      line.igst = line.gst;
    }
    line.total = taxableShare + line.gst;
  });

  const cgst = lines.reduce((sum, line) => sum + line.cgst, 0);
  const sgst = lines.reduce((sum, line) => sum + line.sgst, 0);
  const igst = lines.reduce((sum, line) => sum + line.igst, 0);
  const totalGst = lines.reduce((sum, line) => sum + line.gst, 0);
  const grand = netTaxable + totalGst;
  const finalTotal = Math.round(grand);

  return {
    lines,
    subtotal,
    discount,
    netTaxable,
    cgst,
    sgst,
    igst,
    totalGst,
    grand,
    roundOff: finalTotal - grand,
    finalTotal,
  };
}
