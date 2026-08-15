import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetRange } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus } from "lucide-react";
import { exportTablePdf } from "@/lib/pdf";

const salesQuery = queryOptions({
  queryKey: ["erp", "sales-history"],
  queryFn: () => getSheetRange({ data: { range: "Sales!A2:L2000" } }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoice History — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Search, filter by date, download and reprint every Focus Lady Bra sales invoice.",
      },
      { property: "og:title", content: "Invoice History — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "All sales invoices with PDF download, print and payment status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(salesQuery),
  component: InvoicesPage,
});

const money = (v: string) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";
};

function InvoicesPage() {
  return (
    <ErpShell
      activeSlug="invoices"
      title="Invoices"
      subtitle="Every invoice created from this ERP"
      actions={
        <Button size="sm" asChild>
          <Link to="/invoices/new">
            <Plus className="mr-2 h-4 w-4" /> New Invoice
          </Link>
        </Button>
      }
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <InvoiceList />
      </Suspense>
    </ErpShell>
  );
}

function InvoiceList() {
  const { data } = useSuspenseQuery(salesQuery);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(
    () => data.values.filter((r) => (r[0] ?? "").trim() !== ""),
    [data.values],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const hay = `${r[0]} ${r[2]} ${r[8]}`.toLowerCase();
        if (q.trim() && !hay.includes(q.toLowerCase())) return false;
        const d = (r[1] ?? "").slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [rows, q, from, to],
  );

  const totals = filtered.reduce(
    (a, r) => {
      const n = (v: string) => parseFloat(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
      a.total += n(r[5] ?? "");
      a.paid += n(r[6] ?? "");
      a.due += n(r[7] ?? "");
      return a;
    },
    { total: 0, paid: 0, due: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice or customer"
          className="max-w-xs"
        />
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-[9.5rem]"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[9.5rem]"
          aria-label="To date"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportTablePdf({
              title: "Invoice History",
              headers: ["Invoice", "Date", "Customer", "Total", "Paid", "Due", "Status"],
              rows: filtered.map((r) => [
                r[0] ?? "",
                r[1] ?? "",
                r[2] ?? "",
                r[5] ?? "",
                r[6] ?? "",
                r[7] ?? "",
                r[8] ?? "",
              ]),
              filename: "invoice-history",
            })
          }
        >
          <FileText className="mr-2 h-4 w-4" /> PDF
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Invoiced", v: totals.total },
          { l: "Collected", v: totals.paid },
          { l: "Outstanding", v: totals.due },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className="mt-1 text-xl font-semibold">{money(String(k.v))}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {["Invoice", "Date", "Customer", "Total", "Paid", "Due", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/invoices/$invoice"
                      params={{ invoice: r[0] ?? "" }}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {r[0]}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{r[1]}</td>
                  <td className="px-4 py-2.5">{r[2]}</td>
                  <td className="px-4 py-2.5">{money(r[5] ?? "")}</td>
                  <td className="px-4 py-2.5">{money(r[6] ?? "")}</td>
                  <td className="px-4 py-2.5">{money(r[7] ?? "")}</td>
                  <td className="px-4 py-2.5">{r[8]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
