import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { MODULES } from "@/lib/erp-modules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Plus, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

const KPI_RANGES = [
  "Dashboard!A1:B20",
  "Sales!A2:H1000",
  "Purchases!A2:F1000",
  "Expenses!A2:C1000",
  "Products!A2:F1000",
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
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <DashboardContent />
      </Suspense>
    </ErpShell>
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
  const customers = getRows("Customers");
  const suppliers = getRows("Suppliers");

  const totalSales = sumCol(sales, 5); // Total column
  const totalPaid = sumCol(sales, 6);
  const totalDue = sumCol(sales, 7);
  const totalPurchases = sumCol(purchases, 3);
  const totalExpenses = sumCol(expenses, 2);
  const netProfit = totalSales - totalPurchases - totalExpenses;

  const kpis = [
    { label: "Total Sales", value: fmt(totalSales), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Total Purchases", value: fmt(totalPurchases), tone: "" },
    { label: "Expenses", value: fmt(totalExpenses), tone: "text-amber-600 dark:text-amber-400" },
    { label: "Net Profit", value: fmt(netProfit), tone: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive" },
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
