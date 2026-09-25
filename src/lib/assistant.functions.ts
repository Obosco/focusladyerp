import { createServerFn } from "@tanstack/react-start";
import { assertAuthenticated } from "./auth.server";
import { readRanges } from "./sheets.server";

const ranges = [
  "Sales!A2:H2000",
  "Purchases!A2:F2000",
  "Expenses!A2:C2000",
  "Products!A2:F2000",
  "Stock!A2:G2000",
  "Customers!A2:D2000",
];

function amount(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rowsFor(valueRanges: { range: string; values?: string[][] }[], name: string) {
  const match = valueRanges.find((range) => range.range.includes(name));
  return match?.values ?? [];
}

function answerQuestion(question: string, valueRanges: { range: string; values?: string[][] }[]) {
  const text = question.toLowerCase();
  const sales = rowsFor(valueRanges, "Sales");
  const purchases = rowsFor(valueRanges, "Purchases");
  const expenses = rowsFor(valueRanges, "Expenses");
  const products = rowsFor(valueRanges, "Products");
  const stock = rowsFor(valueRanges, "Stock");
  const customers = rowsFor(valueRanges, "Customers");

  const salesTotal = sales.reduce((sum, row) => sum + amount(row[5]), 0);
  const paid = sales.reduce((sum, row) => sum + amount(row[6]), 0);
  const due = sales.reduce((sum, row) => sum + amount(row[7]), 0);
  const purchaseTotal = purchases.reduce((sum, row) => sum + amount(row[3]), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + amount(row[2]), 0);

  if (/(sales|revenue|turnover|sold)/.test(text)) {
    return `Sales total is ${formatAmount(salesTotal)} across ${sales.length} invoices. ${formatAmount(paid)} has been collected and ${formatAmount(due)} remains outstanding.`;
  }
  if (/(due|outstanding|receivable|collection)/.test(text)) {
    return `Outstanding invoices total ${formatAmount(due)}. Collections total ${formatAmount(paid)}, against sales of ${formatAmount(salesTotal)}.`;
  }
  if (/(purchase|buying|supplier)/.test(text)) {
    return `Purchases total ${formatAmount(purchaseTotal)} across ${purchases.length} records.`;
  }
  if (/(expense|cost|spend)/.test(text)) {
    return `Recorded expenses total ${formatAmount(expenseTotal)} across ${expenses.length} entries.`;
  }
  if (/(stock|inventory|product|low)/.test(text)) {
    const lowStock = stock.filter((row) => amount(row[3]) <= amount(row[6]) && String(row[0] ?? "").trim());
    return `There are ${products.length} products and ${stock.length} stock records. ${lowStock.length} stock lines are at or below their reorder level.`;
  }
  if (/(customer|client)/.test(text)) {
    return `The ERP currently has ${customers.length} customer records and ${sales.length} sales invoices.`;
  }

  return "I can help with sales, outstanding dues, purchases, expenses, stock levels, products, and customers. Try asking: ‘What are our outstanding dues?’";
}

export const askAssistant = createServerFn({ method: "POST" })
  .validator((data: { question: string }) => {
    if (!data?.question?.trim()) throw new Error("Ask a question first.");
    if (data.question.length > 500) throw new Error("Questions must be under 500 characters.");
    return data;
  })
  .handler(async ({ data }) => {
    assertAuthenticated();
    const valueRanges = await readRanges(ranges);
    return { answer: answerQuestion(data.question.trim(), valueRanges) };
  });
