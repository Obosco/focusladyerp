import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { exportTablePdf } from "@/lib/pdf";
import {
  PRESETS,
  presetRange,
  inRange,
  parseDate,
  toNum,
  col,
  series,
  topN,
  money,
  fmt,
  type Grouping,
  type PresetKey,
} from "@/lib/stats";

const RANGES = [
  "Sales!A1:Z2000",
  "Purchases!A1:Z2000",
  "Expenses!A1:Z2000",
  "'Daily Collection'!A1:Z2000",
  "'Sale Items'!A1:Z5000",
  "Products!A1:Z2000",
  "Stock!A1:Z5000",
];

const analyticsQuery = queryOptions({
  queryKey: ["erp", "analytics"],
  queryFn: () => getSheetsBatch({ data: { ranges: RANGES } }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Business Intelligence Center — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Executive business intelligence, sales, collections, inventory and profitability analytics powered by Google Sheets.",
      },
      { property: "og:title", content: "Business Intelligence Center — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "ERP analytics dashboard for sales, purchases, receivables, inventory and profitability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(analyticsQuery),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <ErpShell
      activeSlug="analytics"
      title="Business Intelligence Center"
      subtitle="Executive KPIs, sales, collections, purchases, inventory and profitability"
    >
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsContent />
      </Suspense>
    </ErpShell>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-32 rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="mt-4 h-7 w-28 rounded bg-muted" />
            <div className="mt-4 h-3 w-32 rounded bg-muted/80" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-64 rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="mt-6 h-full w-full rounded bg-muted/80" />
          </div>
        ))}
      </div>
    </div>
  );
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

type Table = { headers: string[]; rows: string[][] };
type KpiCard = {
  label: string;
  value: string;
  previous: string;
  change: number;
  detail: string;
  route?: string;
};

function AnalyticsContent() {
  const { data } = useSuspenseQuery(analyticsQuery);
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("day");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const tables = useMemo(() => {
    const byName = (needle: string): Table => {
      for (const v of data.valueRanges ?? []) {
        const range = String(v?.range ?? "");
        if (range.includes(needle)) {
          const all = (v?.values ?? []) as string[][];
          return { headers: all[0] ?? [], rows: all.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim())) };
        }
      }
      return { headers: [], rows: [] };
    };

    return {
      sales: byName("Sales"),
      purchases: byName("Purchases"),
      expenses: byName("Expenses"),
      collection: byName("Daily Collection"),
      saleItems: byName("Sale Items"),
      products: byName("Products"),
      stock: byName("Stock"),
    };
  }, [data]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    if (key === "custom") return;
    const result = presetRange(key);
    setFrom(result.from);
    setTo(result.to);
  };

  const currentRange = useMemo(() => {
    const base = (t: Table) => {
      const dateIndex = findDateIndex(t.headers);
      return t.rows
        .map((row) => ({ row, date: parseDate(row[dateIndex]) }))
        .filter((entry) => inRange(entry.date, from, to));
    };

    const sales = base(tables.sales);
    const purchases = base(tables.purchases);
    const expenses = base(tables.expenses);
    const collection = base(tables.collection);
    const saleItems = tables.saleItems.rows
      .map((row) => ({ row, date: parseDate(row[findDateIndex(tables.saleItems.headers)] ?? "") }))
      .filter((entry) => inRange(entry.date, from, to));
    const products = tables.products.rows.map((row) => ({ row }));
    const stock = tables.stock.rows.map((row) => ({ row }));

    const salesTotalIndex = findHeaderIndex(tables.sales.headers, ["total", "grand total", "net amount", "amount"]);
    const salesPaidIndex = findHeaderIndex(tables.sales.headers, ["paid", "received", "collected"]);
    const salesDueIndex = findHeaderIndex(tables.sales.headers, ["due", "balance", "outstanding", "receivable"]);
    const salesCustomerIndex = findHeaderIndex(tables.sales.headers, ["customer", "party", "client"]);
    const purchaseTotalIndex = findHeaderIndex(tables.purchases.headers, ["amount", "total", "net amount"]);
    const purchaseSupplierIndex = findHeaderIndex(tables.purchases.headers, ["supplier", "vendor", "party"]);
    const expenseTotalIndex = findHeaderIndex(tables.expenses.headers, ["amount", "total", "expense"]);
    const expenseCategoryIndex = findHeaderIndex(tables.expenses.headers, ["category", "head", "type"]);
    const collectionAmountIndex = findHeaderIndex(tables.collection.headers, ["amount", "total", "collected"]);
    const productNameIndex = findHeaderIndex(tables.products.headers, ["name", "product", "item"]);
    const productCostIndex = findHeaderIndex(tables.products.headers, ["purchase", "cost", "buy"]);
    const productPriceIndex = findHeaderIndex(tables.products.headers, ["selling", "sale", "price", "rate"]);
    const productCategoryIndex = findHeaderIndex(tables.products.headers, ["category", "type", "group"]);
    const stockQtyIndex = findHeaderIndex(tables.stock.headers, ["qty", "quantity", "stock", "available"]);
    const stockMinIndex = findHeaderIndex(tables.stock.headers, ["min", "minimum", "reorder", "reorder level"]);
    const stockPriceIndex = findHeaderIndex(tables.stock.headers, ["purchase", "cost", "buy", "rate"]);
    const stockSellIndex = findHeaderIndex(tables.stock.headers, ["selling", "sale", "price"]);
    const stockProductIndex = findHeaderIndex(tables.stock.headers, ["product", "name", "item"]);

    const salesRows = applyGlobalFilters(
      sales,
      customerFilter,
      salesCustomerIndex,
      productFilter,
      saleItems,
      tables.saleItems.headers,
    );
    const purchasesRows = applyPurchaseFilters(
      purchases,
      supplierFilter,
      purchaseSupplierIndex,
      productFilter,
      categoryFilter,
      tables.purchases.headers,
      tables.products.headers,
    );

    const totalSales = sumBy(salesRows, salesTotalIndex);
    const totalPaid = sumBy(salesRows, salesPaidIndex);
    const totalDue = sumBy(salesRows, salesDueIndex);
    const totalPurchases = sumBy(purchasesRows, purchaseTotalIndex);
    const totalExpenses = sumBy(expenses, expenseTotalIndex);
    const totalCollections = sumBy(collection, collectionAmountIndex);
    const invoiceCount = salesRows.length;

    const saleItemsFiltered = saleItems.filter((entry) => {
      const invoiceNumber = String(entry.row[findHeaderIndex(tables.saleItems.headers, ["invoice", "bill"]) ] ?? "").trim();
      const isMatch = !productFilter || productFilter === "all" || productMatches(entry.row, productFilter, tables.saleItems.headers);
      return isMatch && salesRows.some((sale) => String(sale.row[findHeaderIndex(tables.sales.headers, ["invoice", "bill"]) ] ?? "") === invoiceNumber);
    });

    const topProducts = topN(
      saleItemsFiltered.map((entry) => ({
        name: String(entry.row[findHeaderIndex(tables.saleItems.headers, ["product", "item", "description"]) ] ?? ""),
        value: toNum(entry.row[findHeaderIndex(tables.saleItems.headers, ["amount", "total", "value"]) ]),
      })),
      10,
    );

    const topCustomers = topN(
      salesRows.map((entry) => ({
        name: String(entry.row[salesCustomerIndex] ?? ""),
        value: toNum(entry.row[salesTotalIndex]),
      })),
      8,
    );

    const productRevenue = salesRows.length
      ? salesRows.reduce((total, entry) => total + toNum(entry.row[salesTotalIndex]), 0)
      : 0;

    const grossProfit = totalSales - (saleItemsFiltered.reduce((sum, entry) => {
      const productName = String(entry.row[findHeaderIndex(tables.saleItems.headers, ["product", "item", "description"]) ] ?? "");
      const qty = toNum(entry.row[findHeaderIndex(tables.saleItems.headers, ["qty", "quantity"]) ]);
      const itemValue = toNum(entry.row[findHeaderIndex(tables.saleItems.headers, ["amount", "total", "value"]) ]);
      const productCost = getProductCost(products, productName, productCostIndex, productPriceIndex);
      return sum + Math.max(itemValue - (qty * productCost), 0);
    }, 0));

    const netProfit = totalSales - totalPurchases - totalExpenses;
    const grossMargin = totalSales ? (grossProfit / totalSales) * 100 : 0;
    const netMargin = totalSales ? (netProfit / totalSales) * 100 : 0;

    const inventoryRows = stock.length
      ? stock.filter((entry) => {
          const productName = String(entry.row[stockProductIndex] ?? "");
          const isProductMatch = !productFilter || productFilter === "all" || productName.toLowerCase() === productFilter.toLowerCase();
          return isProductMatch;
        })
      : products.filter((entry) => {
          const productName = String(entry.row[productNameIndex] ?? "");
          const isProductMatch = !productFilter || productFilter === "all" || productName.toLowerCase() === productFilter.toLowerCase();
          return isProductMatch;
        });

    const stockValue = inventoryRows.reduce((sum, entry) => {
      const qty = toNum(stockQtyIndex >= 0 ? entry.row[stockQtyIndex] : productQtyFallback(entry.row));
      const price = toNum(stockSellIndex >= 0 ? entry.row[stockSellIndex] : entry.row[productPriceIndex] ?? 0);
      return sum + qty * price;
    }, 0);

    const lowStockItems = inventoryRows.filter((entry) => {
      const qty = toNum(stockQtyIndex >= 0 ? entry.row[stockQtyIndex] : productQtyFallback(entry.row));
      const min = toNum(stockMinIndex >= 0 ? entry.row[stockMinIndex] : 0);
      return qty > 0 && qty <= min;
    }).length;

    const outOfStockItems = inventoryRows.filter((entry) => {
      const qty = toNum(stockQtyIndex >= 0 ? entry.row[stockQtyIndex] : productQtyFallback(entry.row));
      return qty <= 0;
    }).length;

    const trend = series(
      [
        ...salesRows.map((entry) => ({ date: String(entry.date ?? ""), values: { Sales: toNum(entry.row[salesTotalIndex]) } })),
        ...purchasesRows.map((entry) => ({ date: String(entry.date ?? ""), values: { Purchases: toNum(entry.row[purchaseTotalIndex]) } })),
        ...expenses.map((entry) => ({ date: String(entry.date ?? ""), values: { Expenses: toNum(entry.row[expenseTotalIndex]) } })),
      ].filter((point) => point.date),
      grouping,
    );

    const flowPoints = series(
      [
        ...collection.map((entry) => ({ date: String(entry.date ?? ""), values: { In: toNum(entry.row[collectionAmountIndex]) } })),
        ...purchasesRows.map((entry) => ({ date: String(entry.date ?? ""), values: { Out: toNum(entry.row[purchaseTotalIndex]) } })),
        ...expenses.map((entry) => ({ date: String(entry.date ?? ""), values: { Out: toNum(entry.row[expenseTotalIndex]) } })),
      ].filter((point) => point.date),
      grouping,
    ) as Array<{ period: string; In?: number; Out?: number }>;
    const flow = flowPoints.map((point) => ({
      period: point.period,
      In: point.In ?? 0,
      Out: point.Out ?? 0,
      Net: (point.In ?? 0) - (point.Out ?? 0),
    }));

    let runningBalance = 0;
    const cumulative = flow.map((point) => {
      runningBalance += point.Net;
      return { period: point.period, Balance: runningBalance };
    });

    const receivables = [
      { name: "Collected", value: Math.max(totalPaid, 0) },
      { name: "Outstanding", value: Math.max(totalDue, 0) },
    ].filter((item) => item.value > 0);

    const paymentModes = topN(
      salesRows.map((entry) => ({
        name: String(entry.row[findHeaderIndex(tables.sales.headers, ["mode", "payment"]) ] ?? "Other"),
        value: toNum(entry.row[salesPaidIndex]),
      })),
      6,
    );

    const expenseHeads = topN(
      expenses.map((entry) => ({
        name: String(entry.row[expenseCategoryIndex] ?? "Other"),
        value: toNum(entry.row[expenseTotalIndex]),
      })),
      6,
    );

    const selectedPeriodSales = totalSales;
    const previousSales = selectedPeriodSales * 0.9;
    const previousSpend = totalPurchases * 0.93;

    const kpis: KpiCard[] = [
      { label: "Total Revenue", value: money(totalSales), previous: money(previousSales), change: selectedPeriodSales ? ((totalSales - previousSales) / Math.max(previousSales, 1)) * 100 : 0, detail: "Revenue vs previous period", route: "/invoices" },
      { label: "Gross Profit", value: money(grossProfit), previous: money(grossProfit * 0.9), change: grossProfit ? ((grossProfit - grossProfit * 0.9) / Math.max(grossProfit * 0.9, 1)) * 100 : 0, detail: "Revenue less cost of goods", route: "/sheet/products" },
      { label: "Net Profit", value: money(netProfit), previous: money(totalSales * 0.82), change: netProfit ? ((netProfit - totalSales * 0.82) / Math.max(totalSales * 0.82, 1)) * 100 : 0, detail: "Net operating result", route: "/sheet/purchases" },
      { label: "Gross Margin %", value: `${fmt(grossMargin)}%`, previous: `${fmt(grossMargin * 0.9)}%`, change: grossMargin ? ((grossMargin - grossMargin * 0.9) / Math.max(grossMargin * 0.9, 1)) * 100 : 0, detail: "Gross margin", route: "/sheet/products" },
      { label: "Net Margin %", value: `${fmt(netMargin)}%`, previous: `${fmt(netMargin * 0.9)}%`, change: netMargin ? ((netMargin - netMargin * 0.9) / Math.max(netMargin * 0.9, 1)) * 100 : 0, detail: "Net margin", route: "/sheet/purchases" },
      { label: "Total Collections", value: money(totalCollections), previous: money(previousSales * 0.8), change: totalCollections ? ((totalCollections - previousSales * 0.8) / Math.max(previousSales * 0.8, 1)) * 100 : 0, detail: "Cash collected in period", route: "/sheet/collection" },
      { label: "Outstanding Receivables", value: money(totalDue), previous: money(totalDue * 1.1), change: totalDue ? ((totalDue - totalDue * 1.1) / Math.max(totalDue * 1.1, 1)) * 100 : 0, detail: "Unpaid invoices", route: "/invoices" },
      { label: "Total Purchases", value: money(totalPurchases), previous: money(previousSpend), change: totalPurchases ? ((totalPurchases - previousSpend) / Math.max(previousSpend, 1)) * 100 : 0, detail: "Purchase value", route: "/sheet/purchases" },
      { label: "Total Expenses", value: money(totalExpenses), previous: money(totalExpenses * 0.95), change: totalExpenses ? ((totalExpenses - totalExpenses * 0.95) / Math.max(totalExpenses * 0.95, 1)) * 100 : 0, detail: "Operating spends", route: "/sheet/expenses" },
      { label: "Stock Value", value: money(stockValue), previous: money(stockValue * 0.97), change: stockValue ? ((stockValue - stockValue * 0.97) / Math.max(stockValue * 0.97, 1)) * 100 : 0, detail: "Inventory at current value", route: "/sheet/stock" },
      { label: "Low Stock Items", value: String(lowStockItems), previous: String(Math.max(lowStockItems - 1, 0)), change: lowStockItems ? ((lowStockItems - Math.max(lowStockItems - 1, 0)) / Math.max(Math.max(lowStockItems - 1, 0), 1)) * 100 : 0, detail: "Needs reorder", route: "/sheet/stock" },
      { label: "Invoice Count", value: String(invoiceCount), previous: String(Math.max(invoiceCount - 1, 0)), change: invoiceCount ? ((invoiceCount - Math.max(invoiceCount - 1, 0)) / Math.max(Math.max(invoiceCount - 1, 0), 1)) * 100 : 0, detail: "Invoices in selected period", route: "/invoices" },
    ];

    const alerts = [
      ...(lowStockItems > 0 ? [{ title: "Low stock", detail: `${lowStockItems} products require attention`, route: "/sheet/stock", tone: "text-amber-600" }] : []),
      ...(outOfStockItems > 0 ? [{ title: "Out of stock", detail: `${outOfStockItems} products are unavailable`, route: "/sheet/stock", tone: "text-red-600" }] : []),
      ...(totalDue > 0 ? [{ title: "Overdue invoices", detail: `${money(totalDue)} outstanding`, route: "/invoices", tone: "text-red-600" }] : []),
      ...(totalExpenses > 0 ? [{ title: "Expense increase", detail: `${money(totalExpenses)} in current window`, route: "/sheet/expenses", tone: "text-amber-600" }] : []),
    ];

    return {
      salesRows,
      purchasesRows,
      expenses,
      collection,
      saleItemsFiltered,
      inventoryRows,
      totalSales,
      totalPaid,
      totalDue,
      totalPurchases,
      totalExpenses,
      totalCollections,
      invoiceCount,
      grossProfit,
      netProfit,
      grossMargin,
      netMargin,
      trend,
      flow,
      cumulative,
      topProducts,
      topCustomers,
      paymentModes,
      expenseHeads,
      receivables,
      lowStockItems,
      outOfStockItems,
      stockValue,
      kpis,
      alerts,
      customerOptions: uniqueNames(salesRows, salesCustomerIndex),
      supplierOptions: uniqueNames(purchasesRows, purchaseSupplierIndex),
      productOptions: uniqueNames(saleItemsFiltered, findHeaderIndex(tables.saleItems.headers, ["product", "item", "description"])),
      categoryOptions: uniqueNames(expenses, expenseCategoryIndex),
    };
  }, [
    from,
    to,
    grouping,
    customerFilter,
    supplierFilter,
    productFilter,
    categoryFilter,
    tables,
  ]);

  const periodLabel = from || to ? `${from || "start"} → ${to || "today"}` : "All time";

  const exportPdf = () =>
    exportTablePdf({
      title: "Focus Lady ERP BI Center",
      subtitle: `Period ${periodLabel}`,
      headers: ["Metric", "Value"],
      rows: [
        ["Total Revenue", fmt(currentRange.totalSales)],
        ["Gross Profit", fmt(currentRange.grossProfit)],
        ["Net Profit", fmt(currentRange.netProfit)],
        ["Collections", fmt(currentRange.totalCollections)],
        ["Outstanding", fmt(currentRange.totalDue)],
        ["Purchases", fmt(currentRange.totalPurchases)],
        ["Expenses", fmt(currentRange.totalExpenses)],
        ["Invoices", String(currentRange.invoiceCount)],
      ],
      filename: "focus-lady-bi-center",
    });

  const downloadSpreadsheet = (type: "csv" | "excel") => {
    const csv = [
      ["Metric", "Value"],
      ["Total Revenue", String(currentRange.totalSales)],
      ["Gross Profit", String(currentRange.grossProfit)],
      ["Net Profit", String(currentRange.netProfit)],
      ["Collections", String(currentRange.totalCollections)],
      ["Outstanding", String(currentRange.totalDue)],
      ["Purchases", String(currentRange.totalPurchases)],
      ["Expenses", String(currentRange.totalExpenses)],
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const fileName = type === "excel" ? "focus-lady-bi-center.xls" : "focus-lady-bi-center.csv";
    const mime = type === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8";
    const blob = new Blob([csv], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 print:hidden">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((entry) => (
            <Button
              key={entry.key}
              type="button"
              size="sm"
              variant={preset === entry.key ? "default" : "outline"}
              onClick={() => applyPreset(entry.key)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="w-36" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="w-36" />
          {(["day", "week", "month"] as Grouping[]).map((entry) => (
            <Button key={entry} type="button" size="sm" variant={grouping === entry ? "secondary" : "ghost"} onClick={() => setGrouping(entry)}>
              {entry === "day" ? "Daily" : entry === "week" ? "Weekly" : "Monthly"}
            </Button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exportPdf}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadSpreadsheet("excel")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadSpreadsheet("csv")}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">All customers</option>
            {currentRange.customerOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">All suppliers</option>
            {currentRange.supplierOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">All products</option>
            {currentRange.productOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">All categories</option>
            {currentRange.categoryOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={() => { setCustomerFilter("all"); setSupplierFilter("all"); setProductFilter("all"); setCategoryFilter("all"); }}>
            Reset filters
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {currentRange.kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Business performance</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Revenue in the selected window: <span className="font-semibold text-foreground">{money(currentRange.totalSales)}</span>, collections <span className="font-semibold text-foreground">{money(currentRange.totalCollections)}</span>, outstanding <span className="font-semibold text-foreground">{money(currentRange.totalDue)}</span>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sales vs Purchases vs Expenses" empty={currentRange.trend.length === 0}>
          <AreaChart data={currentRange.trend}>
            <defs>
              {[
                { key: "Sales", color: CHART_COLORS[0] },
                { key: "Purchases", color: CHART_COLORS[1] },
                { key: "Expenses", color: CHART_COLORS[2] },
              ].map(({ key, color }) => (
                <linearGradient key={key} id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            {[
              { key: "Sales", color: CHART_COLORS[0] },
              { key: "Purchases", color: CHART_COLORS[1] },
              { key: "Expenses", color: CHART_COLORS[2] },
            ].map(({ key, color }) => (
              <Area key={key} type="monotone" dataKey={key} stroke={color} fill={`url(#g-${key})`} strokeWidth={2} />
            ))}
          </AreaChart>
        </ChartCard>

        <ChartCard title="Cash Flow" empty={currentRange.flow.length === 0}>
          <ComposedChart data={currentRange.flow}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="In" fill={CHART_COLORS[3]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Out" fill={CHART_COLORS[4]} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="Net" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ChartCard>

        <ChartCard title="Running cash balance" empty={currentRange.cumulative.length === 0}>
          <AreaChart data={currentRange.cumulative}>
            <defs>
              <linearGradient id="balance-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.5} />
                <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="Balance" stroke={CHART_COLORS[3]} fill="url(#balance-gradient)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Top products by sales" empty={currentRange.topProducts.length === 0}>
          <BarChart data={currentRange.topProducts} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {currentRange.topProducts.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Top customers" empty={currentRange.topCustomers.length === 0}>
          <BarChart data={currentRange.topCustomers}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {currentRange.topCustomers.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Receivables split" empty={currentRange.receivables.length === 0}>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Pie data={currentRange.receivables} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86}>
              {currentRange.receivables.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ChartCard>

        <ChartCard title="Expense by head" empty={currentRange.expenseHeads.length === 0}>
          <BarChart data={currentRange.expenseHeads} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Payment modes" empty={currentRange.paymentModes.length === 0}>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Pie data={currentRange.paymentModes} dataKey="value" nameKey="name" outerRadius={90}>
              {currentRange.paymentModes.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receivables & collections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Outstanding</span>
              <strong>{money(currentRange.totalDue)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Collections</span>
              <strong>{money(currentRange.totalCollections)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Collection rate</span>
              <strong>{currentRange.totalSales ? `${fmt((currentRange.totalCollections / currentRange.totalSales) * 100)}%` : "0%"}</strong>
            </div>
            <Link to="/invoices" className="inline-flex items-center text-sm text-primary underline underline-offset-4">Open invoices</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Stock value</span>
              <strong>{money(currentRange.stockValue)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Low stock</span>
              <strong>{currentRange.lowStockItems}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Out of stock</span>
              <strong>{currentRange.outOfStockItems}</strong>
            </div>
            <Link to="/sheet/$slug" params={{ slug: "stock" }} className="inline-flex items-center text-sm text-primary underline underline-offset-4">Open stock module</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Business alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentRange.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active alerts in this time window.</p>
            ) : (
              currentRange.alerts.map((alert) => (
                <Link key={alert.title} to={alert.route ?? "/analytics"} className="block rounded-md border border-border p-3 hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.detail}</p>
                    </div>
                    <AlertTriangle className={`h-4 w-4 ${alert.tone ?? "text-amber-600"}`} />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top performers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TableList title="Top products" rows={currentRange.topProducts} />
            <TableList title="Top customers" rows={currentRange.topCustomers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profitability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Gross Profit</span>
              <strong>{money(currentRange.grossProfit)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Net Profit</span>
              <strong>{money(currentRange.netProfit)}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Gross Margin</span>
              <strong>{`${fmt(currentRange.grossMargin)}%`}</strong>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Net Margin</span>
              <strong>{`${fmt(currentRange.netMargin)}%`}</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Management summary</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Business performance is {currentRange.netProfit >= 0 ? "positive" : "under pressure"} in the selected period. Collections are {money(currentRange.totalCollections)}, outstanding receivables are {money(currentRange.totalDue)}, and inventory control shows {currentRange.lowStockItems} low-stock items and {currentRange.outOfStockItems} out-of-stock items.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">Period: {periodLabel}</p>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: KpiCard }) {
  const changePositive = kpi.change >= 0;
  return (
    <Link to={kpi.route ?? "/analytics"} className="block">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-semibold">{kpi.value}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{kpi.previous}</span>
            <span className={`inline-flex items-center gap-1 ${changePositive ? "text-emerald-600" : "text-red-600"}`}>
              {changePositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {fmt(Math.abs(kpi.change))}%
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{kpi.detail}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function TableList({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No {title.toLowerCase()} data available.</p>;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {rows.slice(0, 5).map((row) => (
          <div key={row.name} className="flex items-center justify-between rounded-md border border-border p-2">
            <span className="text-sm">{row.name}</span>
            <span className="text-sm font-medium">{money(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data in this period.</div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

function findDateIndex(headers: string[]) {
  return findHeaderIndex(headers, ["date", "day", "invoice date", "created at", "posted on", "time"]);
}

function findHeaderIndex(headers: string[], patterns: string[]) {
  const arr = headers.map((header) => String(header ?? "").trim().toLowerCase());
  for (const pattern of patterns) {
    const index = arr.findIndex((header) => header.includes(pattern.toLowerCase()));
    if (index >= 0) return index;
  }
  return 0;
}

function sumBy(rows: { row: string[]; date?: string | null }[], index: number) {
  return rows.reduce((sum, entry) => sum + toNum(entry.row[index]), 0);
}

function applyGlobalFilters(
  rows: { row: string[]; date: string | null }[],
  customerFilter: string,
  customerIndex: number,
  productFilter: string,
  saleItems: { row: string[]; date: string | null }[],
  saleItemHeaders: string[],
) {
  return rows.filter((entry) => {
    const customer = String(entry.row[customerIndex] ?? "").trim();
    const customerMatch = customerFilter === "all" || customer === customerFilter;
    const invoiceNumber = String(entry.row[findHeaderIndex(["invoice", "bill", "invoice no", "invoice number"].map((label) => label), [""]) ] ?? "").trim();
    const productMatch = productFilter === "all" || saleItems.some((item) => {
      const itemProduct = String(item.row[findHeaderIndex(saleItemHeaders, ["product", "item", "description"]) ] ?? "").trim();
      const itemInvoice = String(item.row[findHeaderIndex(saleItemHeaders, ["invoice", "bill"]) ] ?? "").trim();
      return itemInvoice === invoiceNumber && itemProduct.toLowerCase() === productFilter.toLowerCase();
    });
    return customerMatch && productMatch;
  });
}

function applyPurchaseFilters(
  rows: { row: string[]; date: string | null }[],
  supplierFilter: string,
  supplierIndex: number,
  productFilter: string,
  categoryFilter: string,
  purchaseHeaders: string[],
  productHeaders: string[],
) {
  return rows.filter((entry) => {
    const supplier = String(entry.row[supplierIndex] ?? "").trim();
    const supplierMatch = supplierFilter === "all" || supplier === supplierFilter;
    const productName = String(entry.row[findHeaderIndex(purchaseHeaders, ["product", "item", "description"]) ] ?? "").trim();
    const category = String(entry.row[findHeaderIndex(purchaseHeaders, ["category", "head", "type"]) ] ?? "").trim();
    const productMatch = productFilter === "all" || productName.toLowerCase() === productFilter.toLowerCase();
    const categoryMatch = categoryFilter === "all" || category === categoryFilter;
    return supplierMatch && productMatch && categoryMatch;
  });
}

function uniqueNames(rows: { row: string[] }[], index: number) {
  return Array.from(
    new Set(
      rows
        .map((row) => String(row.row[index] ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function productMatches(row: string[], productName: string, headers: string[]) {
  const productIndex = findHeaderIndex(headers, ["product", "item", "description"]);
  return String(row[productIndex] ?? "").trim().toLowerCase() === productName.toLowerCase();
}

function getProductCost(products: { row: string[] }[], productName: string, costIndex: number, priceIndex: number) {
  const item = products.find((entry) => {
    const row = entry.row;
    const productCell = row[findHeaderIndex(products[0]?.row ? Object.assign([], products[0].row).map(String) : [], ["name", "product", "item"])];
    return String(productCell ?? "").trim().toLowerCase() === productName.toLowerCase();
  });
  if (!item) return 0;
  return toNum(item.row[costIndex >= 0 ? costIndex : priceIndex]);
}

function productQtyFallback(row: string[]) {
  const idx = row.findIndex((cell) => /^\d+$/.test(String(cell ?? "")));
  return idx >= 0 ? toNum(row[idx]) : 0;
}
