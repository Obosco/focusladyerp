import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { MODULES } from "@/lib/erp-modules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Plus, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizeDate } from "@/lib/erp-data";

const KPI_RANGES = [
  "Dashboard!A1:B20",
  "Sales!A2:H1000",
  "Purchases!A2:F1000",
  "Expenses!A2:C1000",
  "Products!A2:L5000",
  "'Product Variants'!A2:Q10000",
  "'Stock Movements'!A2:T50000",
  "'Sale Items'!A2:G5000",
  "Customers!A2:D1000",
  "Suppliers!A2:D1000",
];

const dashboardQuery = queryOptions({
  queryKey: ["erp", "dashboard"],
  queryFn: () => getSheetsBatch({ data: { ranges: KPI_RANGES } }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Focus Lady Bra ERP — Dashboard" },
      {
        name: "description",
        content:
          "Live sales, purchases, stock and finance dashboard for Focus Lady Bra, synced with Google Sheets.",
      },
      { property: "og:title", content: "Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "Cloud ERP for Focus Lady Bra — sales, stock, HR and accounts on Google Sheets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: DashboardPage,
});

function fmt(n: number) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function toNum(v: string | undefined) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}
const sumCol = (rows: string[][], col: number) =>
  rows.reduce((a, r) => a + toNum(r[col]), 0);

function DashboardPage() {
  return (
    <ErpShell
      activeSlug="dashboard"
      title="Dashboard"
      subtitle="Live from Focus_Lady_Bra_ERP_Phase1_2"
      actions={<RefreshButton />}
    >
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </ErpShell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="mb-3 h-3 w-20 rounded bg-muted" />
            <div className="h-8 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-56 rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="mt-6 h-full w-full rounded bg-muted/80" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RefreshButton() {
  return (
    <>
      <Button size="sm" asChild>
        <Link to="/invoices/new">
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to="/analytics">
          <BarChart3 className="mr-2 h-4 w-4" /> Statistics
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
      </Button>
    </>
  );
}


function DashboardContent() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const byRange = new Map(data.valueRanges.map((v) => [v.range, v.values]));
  const getRows = (needle: string) => {
    for (const [k, v] of byRange.entries()) if (k.includes(needle)) return v;
    return [] as string[][];
  };

  const sales = getRows("Sales");
  const purchases = getRows("Purchases");
  const expenses = getRows("Expenses");
  const products = getRows("Products");
  const saleItems = getRows("Sale Items");
  const customers = getRows("Customers");
  const suppliers = getRows("Suppliers");
  const variants = getRows("Product Variants");
  const stockMovements = getRows("Stock Movements");

  const totalSalesExclGst = sumCol(sales, 3);
  const totalSalesInclGst = sumCol(sales, 5);
  const totalPaid = sumCol(sales, 6);
  const totalDue = sumCol(sales, 7);
  const totalPurchases = sumCol(purchases, 3);
  const totalExpenses = sumCol(expenses, 2);
  const productCosts = new Map(products.map((row) => [(row[1] ?? "").trim().toLowerCase(), toNum(row[4])]));
  const costOfGoods = saleItems.reduce((sum, row) => sum + toNum(row[4]) * (productCosts.get((row[3] ?? "").trim().toLowerCase()) ?? 0), 0);
  const grossProfit = totalSalesExclGst - costOfGoods;
  const netProfit = grossProfit - totalExpenses;
  const today = new Date().toISOString().slice(0, 10);
  const todaySalesRows = sales.filter((row) => normalizeDate(row[1]) === today);
  const todaySales = sumCol(todaySalesRows, 5);
  const todayCollections = sumCol(todaySalesRows, 6);
  const variantsByProduct = new Map<string, string[][]>();
  for (const variant of variants) {
    const productVariants = variantsByProduct.get(variant[1] ?? "");
    if (productVariants) productVariants.push(variant);
    else variantsByProduct.set(variant[1] ?? "", [variant]);
  }
  const movementTotals = new Map<string, number>();
  for (const movement of stockMovements) {
    const key = `${movement[2] ?? ""}|${movement[3] ?? ""}`;
    movementTotals.set(key, (movementTotals.get(key) ?? 0) + toNum(movement[9]));
  }
  const currentStock = products.flatMap((product) => {
    const productVariants = variantsByProduct.get(product[0] ?? "") ?? [];
    const balances = productVariants.length ? productVariants : [undefined];
    return balances.map((variant) => {
      const variantId = variant?.[0] ?? "";
      const movementTotal = movementTotals.get(`${product[0] ?? ""}|${variantId}`) ?? 0;
      return {
        quantity: toNum(variant?.[11] ?? product[7]) + movementTotal,
        reorder: toNum(variant?.[12] ?? product[10]),
        cost: toNum(variant?.[9] ?? product[8]),
      };
    });
  });
  const stockValue = currentStock.reduce((sum, row) => sum + row.quantity * row.cost, 0);
  const lowStockCount = currentStock.filter((row) => row.quantity > 0 && row.quantity <= row.reorder).length;
  const outOfStockCount = currentStock.filter((row) => row.quantity <= 0).length;

  const kpis = [
    { label: "Today's Sales", value: fmt(todaySales), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Today's Collections", value: fmt(todayCollections), tone: "" },
    { label: "Stock Value", value: fmt(stockValue), tone: "" },
    { label: "Low Stock Items", value: fmt(lowStockCount), tone: "text-amber-600 dark:text-amber-400" },
    { label: "Out of Stock", value: fmt(outOfStockCount), tone: "text-destructive" },
    { label: "Sales (excl. GST)", value: fmt(totalSalesExclGst), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Sales (incl. GST)", value: fmt(totalSalesInclGst), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Total Purchases", value: fmt(totalPurchases), tone: "" },
    { label: "Expenses", value: fmt(totalExpenses), tone: "text-amber-600 dark:text-amber-400" },
    { label: "Gross Profit", value: fmt(grossProfit), tone: grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive" },
    { label: "Net Profit", value: fmt(netProfit), tone: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive" },
    { label: "Margin %", value: fmt(totalSalesExclGst ? (grossProfit / totalSalesExclGst) * 100 : 0), tone: "" },
    { label: "Amount Collected", value: fmt(totalPaid), tone: "" },
    { label: "Outstanding Dues", value: fmt(totalDue), tone: "text-destructive" },
  ];

  const counts = [
    { label: "Products", value: products.length, slug: "products" },
    { label: "Customers", value: customers.length, slug: "customers" },
    { label: "Suppliers", value: suppliers.length, slug: "suppliers" },
    { label: "Sale Invoices", value: sales.length, slug: "sales" },
    { label: "Purchase Bills", value: purchases.length, slug: "purchases" },
    { label: "Expense Entries", value: expenses.length, slug: "expenses" },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Quick actions" className="flex flex-wrap gap-2">
        <Button size="sm" asChild><Link to="/invoices/new">+ New Invoice</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/inventory/$view" params={{ view: "add" }}>+ Add Stock</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sheet/$slug" params={{ slug: "purchases" }}>Purchases</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sheet/$slug" params={{ slug: "customers" }}>Customers</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sheet/$slug" params={{ slug: "suppliers" }}>Suppliers</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/inventory/$view" params={{ view: "adjust" }}>+ Stock Adjustment</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sheet/$slug" params={{ slug: "collection" }}>Collections</Link></Button>
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${k.tone}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Records
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {counts.map((c) => (
            <a
              key={c.label}
              href={`/sheet/${c.slug}`}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-xl font-semibold">{c.value}</div>
            </a>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Modules
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODULES.filter((m) => m.slug !== "dashboard").map((m) => {
            const Icon = m.icon;
            return (
              <a
                key={m.slug}
                href={`/sheet/${m.slug}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
              >
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-medium">{m.label}</div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
