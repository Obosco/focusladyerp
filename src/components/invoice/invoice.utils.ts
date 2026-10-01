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

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
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
  let value = Math.max(0, Math.round(amount));
  if (!value) return "Rupees Zero Only";

  const parts: string[] = [];
  const groups: [number, string][] = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ];
  for (const [size, label] of groups) {
    if (value >= size) {
      const group = Math.floor(value / size);
      parts.push(`${underThousand(group)} ${label}`);
      value %= size;
    }
  }
  if (value) parts.push(underThousand(value));
  return `Rupees ${parts.join(" ")} Only`;
}

export function calculateInvoice(invoice: Invoice): CalculatedInvoice {
  const lines = invoice.items.map((item) => {
    const qty = Number.isFinite(item.qty) ? Math.max(0, item.qty) : 0;
    const rate = Number.isFinite(item.rate) ? Math.max(0, item.rate) : 0;
    return {
      description: item.description,
      hsn: item.hsn,
      qty,
      rate,
      gstPercent: Number.isFinite(item.gstPercent) ? Math.max(0, item.gstPercent) : 0,
      taxable: roundMoney(qty * rate),
      gst: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
    };
  });
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.taxable, 0));
  const discount = roundMoney(Math.min(subtotal, Math.max(0, Number(invoice.discount) || 0)));
  const netTaxable = roundMoney(subtotal - discount);
  const ratio = subtotal > 0 ? netTaxable / subtotal : 0;

  lines.forEach((line, index) => {
    line.taxable = roundMoney(line.taxable * ratio);
    if (index === lines.length - 1 && lines.length > 0) {
      const allocated = roundMoney(lines.reduce((sum, current) => sum + current.taxable, 0));
      line.taxable = roundMoney(line.taxable + netTaxable - allocated);
    }
    line.gst = roundMoney((line.taxable * line.gstPercent) / 100);
    if (invoice.invoice.supplyType === "INTRA") {
      line.cgst = roundMoney(line.gst / 2);
      line.sgst = roundMoney(line.gst - line.cgst);
    } else {
      line.igst = line.gst;
    }
    line.total = roundMoney(line.taxable + line.gst);
  });

  const cgst = roundMoney(lines.reduce((sum, line) => sum + line.cgst, 0));
  const sgst = roundMoney(lines.reduce((sum, line) => sum + line.sgst, 0));
  const igst = roundMoney(lines.reduce((sum, line) => sum + line.igst, 0));
  const totalGst = roundMoney(cgst + sgst + igst);
  const grand = roundMoney(netTaxable + totalGst);
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
    roundOff: roundMoney(finalTotal - grand),
    finalTotal,
  };
}
