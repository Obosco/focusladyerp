import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { FileText, Printer } from "lucide-react";
import { exportInvoicePdf } from "@/lib/pdf";

const invoiceQuery = (invoice: string) =>
  queryOptions({
    queryKey: ["erp", "invoice", invoice],
    queryFn: () =>
      getSheetsBatch({ data: { ranges: ["Sales!A2:L2000", "'Sale Items'!A2:G5000"] } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_authenticated/invoices/$invoice")({
  head: ({ params }) => ({
    meta: [
      { title: `Invoice ${params.invoice} — Focus Lady Bra ERP` },
      {
        name: "description",
          content: `Printable tax invoice ${params.invoice} with line items, GST, payment status.`,
      },
      { property: "og:title", content: `Invoice ${params.invoice} — Focus Lady Bra ERP` },
      {
        property: "og:description",
        content: "View, print or download this sales invoice as PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(invoiceQuery(params.invoice)),
  component: InvoicePage,
});

const num = (v: string | undefined) =>
  parseFloat(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InvoicePage() {
  const { invoice } = Route.useParams();
  return (
    <ErpShell activeSlug="invoices" title={`Invoice ${invoice}`} subtitle="Tax invoice">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <InvoiceView invoice={invoice} />
      </Suspense>
    </ErpShell>
  );
}

function InvoiceView({ invoice }: { invoice: string }) {
  const { data } = useSuspenseQuery(invoiceQuery(invoice));
  const get = (needle: string) =>
    data.valueRanges.find((v) => v.range.includes(needle))?.values ?? [];

  const head = get("Sales").find((r) => (r[0] ?? "") === invoice);
  const items = get("Sale Items")
    .filter((r) => (r[0] ?? "") === invoice)
    .map((r) => ({ product: r[3] ?? "", qty: num(r[4]), rate: num(r[5]) }));

  if (!head) {
    return (
      <p className="text-sm text-muted-foreground">
        Invoice not found.{" "}
        <Link to="/invoices" className="text-primary underline">
          Back to invoices
        </Link>
      </p>
    );
  }

  const subtotal = num(head[3]);
  const gst = num(head[4]);
  const total = num(head[5]);
  const paid = num(head[6]);
  const dueAmt = num(head[7]);
  const gstPercent = subtotal ? Math.round((gst / subtotal) * 100) : 0;

  const doc = {
    invoice,
    date: head[1] ?? "",
    customer: head[2] ?? "",
    items,
    subtotal,
    gst,
    gstPercent,
    discount: 0,
    total,
    paid,
    due: dueAmt,
    notes: head[9] ?? "",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <Button size="sm" onClick={() => exportInvoicePdf(doc)}>
          <FileText className="mr-2 h-4 w-4" /> Download PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/invoices">All invoices</Link>
        </Button>
      </div>

      <div className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight">FOCUS LADY BRA</div>
            <div className="text-xs text-muted-foreground">Tax Invoice</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-mono font-medium">{invoice}</div>
            <div className="text-muted-foreground">{doc.date}</div>
          </div>
        </div>

        <div className="mt-6 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Billed to
          </div>
          <div className="font-medium">{doc.customer}</div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2">Product</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx} className="border-b border-border/60">
                <td className="py-2">{i.product}</td>
                <td className="py-2 text-right">{i.qty}</td>
                <td className="py-2 text-right">{money(i.rate)}</td>
                <td className="py-2 text-right">{money(i.qty * i.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <Row l="Subtotal" v={subtotal} />
          <Row l={`GST (${gstPercent}%)`} v={gst} />
          <Row l="Total" v={total} bold />
          <Row l="Paid" v={paid} />
          <Row l="Due" v={dueAmt} bold />
        </div>

        {doc.notes ? (
          <p className="mt-6 text-xs text-muted-foreground">Notes: {doc.notes}</p>
        ) : null}

        <div className="mt-10 flex justify-end">
          <div className="w-44 text-right">
            {/* Blank physical signature area for printing. No digital signature is displayed or stored. */}
            <div className="h-20 border border-dashed bg-white" />
            <div className="mt-2 text-xs font-medium">For OBOSCO CLOTHING INDUSTRIES</div>
            <div className="text-xs">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}>
      <span>{l}</span>
      <span>{money(v)}</span>
    </div>
  );
}
