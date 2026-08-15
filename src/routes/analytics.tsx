import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Printer } from "lucide-react";
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

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Statistics & Flow — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Sales, cash flow, collections and product performance analytics for Focus Lady Bra, filtered by any date range.",
      },
      { property: "og:title", content: "Statistics & Flow — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "Interactive charts for sales trend, cash flow, top products and receivables.",
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
      title="Statistics & Flow"
      subtitle="Trends, cash flow and performance across every module"
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <AnalyticsContent />
      </Suspense>
    </ErpShell>
  );
}

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type Table = { headers: string[]; rows: string[][] };

function AnalyticsContent() {
  const { data } = useSuspenseQuery(analyticsQuery);
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [from, setFrom] = useState(presetRange("30d").from);
  const [to, setTo] = useState(presetRange("30d").to);
  const [grouping, setGrouping] = useState<Grouping>("day");

  const tables = useMemo(() => {
    const byName = (needle: string): Table => {
      for (const v of data.valueRanges) {
        if (v.range.includes(needle)) {
          const all = (v.values ?? []) as string[][];
          return { headers: all[0] ?? [], rows: all.slice(1).filter((r) => r.some((c) => c)) };
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
      stock: byName("Stock"),
    };
  }, [data]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    if (key === "custom") return;
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
  };

  const stats = useMemo(() => {
    const filter = (t: Table) => {
      const dc = col(t.headers, /date|day/i, 0);
      return t.rows
        .map((r) => ({ r, d: parseDate(r[dc]) }))
        .filter((x) => inRange(x.d, from, to));
    };

    const sH = tables.sales.headers;
    const sTotal = col(sH, /^total$|grand|net amount/i, 5);
    const sPaid = col(sH, /paid|received/i, 6);
    const sDue = col(sH, /due|balance|outstanding/i, 7);
    const sMode = col(sH, /mode|payment/i);
    const sCustomer = col(sH, /customer|party|client/i, 1);

    const sales = filter(tables.sales);
    const purchases = filter(tables.purchases);
    const expenses = filter(tables.expenses);
    const collection = filter(tables.collection);

    const pAmt = col(tables.purchases.headers, /amount|total/i, 3);
    const eAmt = col(tables.expenses.headers, /amount|total/i, 2);
    const eCat = col(tables.expenses.headers, /category|head|type|particular/i, 1);
    const cAmt = col(tables.collection.headers, /amount|total|collected/i, 2);
    const cMode = col(tables.collection.headers, /mode|method/i);

    const totalSales = sales.reduce((a, x) => a + toNum(x.r[sTotal]), 0);
    const totalPaid = sales.reduce((a, x) => a + toNum(x.r[sPaid]), 0);
    const totalDue = sales.reduce((a, x) => a + toNum(x.r[sDue]), 0);
    const totalPurchases = purchases.reduce((a, x) => a + toNum(x.r[pAmt]), 0);
    const totalExpenses = expenses.reduce((a, x) => a + toNum(x.r[eAmt]), 0);
    const totalCollected = collection.reduce((a, x) => a + toNum(x.r[cAmt]), 0);
    const netProfit = totalSales - totalPurchases - totalExpenses;
    const invoices = sales.length;

    const trend = series(
      [
        ...sales.map((x) => ({ date: x.d!, values: { Sales: toNum(x.r[sTotal]) } })),
        ...purchases.map((x) => ({ date: x.d!, values: { Purchases: toNum(x.r[pAmt]) } })),
        ...expenses.map((x) => ({ date: x.d!, values: { Expenses: toNum(x.r[eAmt]) } })),
      ],
      grouping,
    ).map((b) => ({
      Sales: 0,
      Purchases: 0,
      Expenses: 0,
      ...b,
    }));

    const flow = series(
      [
        ...collection.map((x) => ({ date: x.d!, values: { In: toNum(x.r[cAmt]) } })),
        ...sales.map((x) => ({ date: x.d!, values: { In: 0 } })),
        ...purchases.map((x) => ({ date: x.d!, values: { Out: toNum(x.r[pAmt]) } })),
        ...expenses.map((x) => ({ date: x.d!, values: { Out: toNum(x.r[eAmt]) } })),
      ],
      grouping,
    ).map((b) => {
      const rec = b as unknown as Record<string, number>;
      const inn = rec["In"] ?? 0;
      const out = rec["Out"] ?? 0;
      return { period: b.period, In: inn, Out: out, Net: inn - out };
    });

    let running = 0;
    const cumulative = flow.map((f) => {
      running += f.Net;
      return { period: f.period, Balance: running };
    });

    // Top products from Sale Items within range (matched by invoice date)
    const siH = tables.saleItems.headers;
    const siInv = col(siH, /invoice|bill/i, 0);
    const siProd = col(siH, /product|item|description/i, 1);
    const siAmt = col(siH, /amount|total/i, 4);
    const siQty = col(siH, /qty|quantity/i, 2);
    const sInv = col(sH, /invoice|bill|no\.?$/i, 0);
    const invoiceDates = new Map<string, string>();
    for (const x of sales) invoiceDates.set(String(x.r[sInv] ?? "").trim(), x.d!);
    const items = tables.saleItems.rows.filter((r) =>
      invoiceDates.has(String(r[siInv] ?? "").trim()),
    );
    const topProducts = topN(
      items.map((r) => ({ name: String(r[siProd] ?? ""), value: toNum(r[siAmt]) })),
      6,
    );
    const topQty = topN(
      items.map((r) => ({ name: String(r[siProd] ?? ""), value: toNum(r[siQty]) })),
      6,
    );

    const topCustomers = topN(
      sales.map((x) => ({ name: String(x.r[sCustomer] ?? ""), value: toNum(x.r[sTotal]) })),
      6,
    );

    const modeSource =
      cMode >= 0 && collection.length
        ? collection.map((x) => ({ name: String(x.r[cMode] ?? "Other"), value: toNum(x.r[cAmt]) }))
        : sMode >= 0
          ? sales.map((x) => ({ name: String(x.r[sMode] ?? "Other"), value: toNum(x.r[sPaid]) }))
          : [];
    const paymentModes = topN(modeSource.filter((m) => m.value > 0), 5);

    const expenseHeads = topN(
      expenses.map((x) => ({ name: String(x.r[eCat] ?? "Other"), value: toNum(x.r[eAmt]) })),
      6,
    );

    const receivables = [
      { name: "Collected", value: Math.max(totalPaid, 0) },
      { name: "Outstanding", value: Math.max(totalDue, 0) },
    ].filter((r) => r.value > 0);

    return {
      totalSales,
      totalPaid,
      totalDue,
      totalPurchases,
      totalExpenses,
      totalCollected,
      netProfit,
      invoices,
      avgTicket: invoices ? totalSales / invoices : 0,
      margin: totalSales ? (netProfit / totalSales) * 100 : 0,
      trend,
      flow,
      cumulative,
      topProducts,
      topQty,
      topCustomers,
      paymentModes,
      expenseHeads,
      receivables,
    };
  }, [tables, from, to, grouping]);

  const periodLabel = from || to ? `${from || "start"} → ${to || "today"}` : "All time";

  const exportPdf = () =>
    exportTablePdf({
      title: "Statistics & Flow",
      subtitle: `Period ${periodLabel}`,
      headers: ["Metric", "Value"],
      rows: [
        ["Total Sales", fmt(stats.totalSales)],
        ["Amount Collected", fmt(stats.totalPaid)],
        ["Outstanding Dues", fmt(stats.totalDue)],
        ["Purchases", fmt(stats.totalPurchases)],
        ["Expenses", fmt(stats.totalExpenses)],
        ["Net Profit", fmt(stats.netProfit)],
        ["Invoices", String(stats.invoices)],
        ["Average Ticket", fmt(stats.avgTicket)],
        ["Profit Margin %", fmt(stats.margin)],
        ...stats.topProducts.map((p) => [`Top product · ${p.name}`, fmt(p.value)]),
      ],
      filename: "statistics-flow",
    });

  const kpis = [
    { label: "Total Sales", value: money(stats.totalSales), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Collected", value: money(stats.totalPaid), tone: "" },
    { label: "Outstanding", value: money(stats.totalDue), tone: "text-destructive" },
    { label: "Purchases", value: money(stats.totalPurchases), tone: "" },
    { label: "Expenses", value: money(stats.totalExpenses), tone: "text-amber-600 dark:text-amber-400" },
    {
      label: "Net Profit",
      value: money(stats.netProfit),
      tone: stats.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
    },
    { label: "Invoices", value: fmt(stats.invoices), tone: "" },
    { label: "Avg Ticket", value: money(stats.avgTicket), tone: "" },
    { label: "Margin", value: `${fmt(stats.margin)}%`, tone: "" },
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 print:hidden">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className="w-[9.5rem]"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className="w-[9.5rem]"
            aria-label="To date"
          />
        </div>
        <div className="flex gap-1">
          {(["day", "week", "month"] as Grouping[]).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={grouping === g ? "secondary" : "ghost"}
              onClick={() => setGrouping(g)}
            >
              {g[0]!.toUpperCase() + g.slice(1)}ly
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-semibold ${k.tone}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sales vs Purchases vs Expenses" empty={stats.trend.length === 0}>
          <AreaChart data={stats.trend}>
            <defs>
              {["Sales", "Purchases", "Expenses"].map((k, i) => (
                <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C[i]} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={C[i]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {["Sales", "Purchases", "Expenses"].map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={C[i]}
                fill={`url(#g-${k})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ChartCard>

        <ChartCard title="Cash flow — money in vs out" empty={stats.flow.length === 0}>
          <ComposedChart data={stats.flow}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="In" fill={C[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Out" fill={C[4]} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="Net" stroke={C[0]} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ChartCard>

        <ChartCard title="Running cash balance" empty={stats.cumulative.length === 0}>
          <AreaChart data={stats.cumulative}>
            <defs>
              <linearGradient id="g-balance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C[1]} stopOpacity={0.5} />
                <stop offset="95%" stopColor={C[1]} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="Balance"
              stroke={C[1]}
              fill="url(#g-balance)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Top products by value" empty={stats.topProducts.length === 0}>
          <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {stats.topProducts.map((_, i) => (
                <Cell key={i} fill={C[i % C.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Top customers" empty={stats.topCustomers.length === 0}>
          <BarChart data={stats.topCustomers}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {stats.topCustomers.map((_, i) => (
                <Cell key={i} fill={C[i % C.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Units sold by product" empty={stats.topQty.length === 0}>
          <BarChart data={stats.topQty}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={50} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill={C[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Receivables split" empty={stats.receivables.length === 0}>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Pie data={stats.receivables} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
              {stats.receivables.map((_, i) => (
                <Cell key={i} fill={C[i % C.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>

        <ChartCard title="Payment modes" empty={stats.paymentModes.length === 0}>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Pie data={stats.paymentModes} dataKey="value" nameKey="name" outerRadius={90}>
              {stats.paymentModes.map((_, i) => (
                <Cell key={i} fill={C[i % C.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>

        <ChartCard title="Expenses by head" empty={stats.expenseHeads.length === 0}>
          <BarChart data={stats.expenseHeads} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill={C[3]} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">Period: {periodLabel}</p>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

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
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No data in this period.
          </div>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
