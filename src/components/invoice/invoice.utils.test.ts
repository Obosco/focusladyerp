import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_INVOICE } from "./sample-invoice.ts";
import {
  amountInWords,
  calculateInvoice,
  dateFormat,
  formatINR,
  normalizeInvoice,
} from "./invoice.utils.ts";

test("calculates the B2C sample invoice and reconciles rounded total", () => {
  const result = calculateInvoice(SAMPLE_INVOICE);

  assert.equal(formatINR(result.subtotal), "1,894.00");
  assert.equal(formatINR(result.discount), "50.00");
  assert.equal(formatINR(result.netTaxable), "1,844.00");
  assert.equal(formatINR(result.cgst), "46.10");
  assert.equal(formatINR(result.sgst), "46.10");
  assert.equal(formatINR(result.roundOff), "-0.20");
  assert.equal(formatINR(result.finalTotal), "1,936.00");
  assert.ok(
    Math.abs(
      result.lines.reduce((sum, line) => sum + line.total, 0) + result.roundOff - result.finalTotal,
    ) < 1e-9,
  );
});

test("formats Indian amount words and invoice dates", () => {
  assert.equal(amountInWords(1936), "Rupees One Thousand Nine Hundred Thirty Six Only");
  assert.equal(dateFormat("2026-10-01"), "01-Oct-2026");
});

test("normalizes missing and non-string customer values safely", () => {
  const normalized = normalizeInvoice({
    customer: { name: undefined, gstin: 12345, address: null, phone: false },
    items: [{ description: 42, hsn: undefined, qty: "2", rate: 10, gstPercent: "5" }],
  });

  assert.equal(normalized?.customer.name, "Walk-in Customer");
  assert.equal(normalized?.customer.gstin, "12345");
  assert.equal(normalized?.customer.phone, "false");
  assert.equal(normalized?.items[0]?.description, "42");
  assert.ok(normalized);
  assert.equal(calculateInvoice(normalized).lines.length, 1);
});

test("clamps invalid discounts so tax remains non-negative", () => {
  const result = calculateInvoice({
    ...SAMPLE_INVOICE,
    discount: 99999,
    items: [{ description: "Bra", hsn: "6212", qty: 2, rate: 200, gstPercent: 5 }],
  });

  assert.equal(result.discount, 400);
  assert.equal(result.netTaxable, 0);
  assert.equal(result.grand, 0);
  assert.equal(result.finalTotal, 0);
});
