import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { FileText, Printer } from "lucide-react";
import { exportInvoicePdf } from "@/lib/pdf";
import { formatDateIndia } from "@/lib/erp-data";
import { COMPANY } from "@/lib/invoice";

const invoiceQuery = (invoice: string) =>
  queryOptions({
    queryKey: ["erp", "invoice", invoice],
    queryFn: () =>
      getSheetsBatch({ data: { ranges: ["Sales!A2:Q2000", "'Sale Items'!A2:M5000"] } }),
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

  const salesRows = get("Sales");
  const customerRows = get("Customers");
  const head = salesRows.find((r) => (r[0] ?? "") === invoice);
  const items = get("Sale Items")
    .filter((r) => (r[0] ?? "") === invoice)
    .map((r) => ({
      product: r[3] ?? "",
      qty: num(r[4]),
      rate: num(r[5]),
    }));

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

  const customerName = String(head[2] ?? "").trim() || "Customer";
  const customerRow = customerRows.find(
    (row) => String(row[1] ?? "").trim().toLowerCase() === customerName.toLowerCase(),
  );

  const subtotal = num(head[3]);
  const gst = num(head[4]);
  const total = num(head[5]);
  const paid = num(head[6]);
  const dueAmt = num(head[7]);
  const gstPercent = subtotal ? Math.round((gst / subtotal) * 100) : 0;
  const paymentStatus = String(head[8] ?? "Pending").trim() || "Pending";
  const paymentMethod = String(head[13] ?? "").trim() || "—";
  const dueDate = String(head[15] ?? "").trim();
  const customerPhone = String(customerRow?.[2] ?? "").trim() || "—";
  const customerAddress = String(head[14] ?? customerRow?.[3] ?? "").trim() || "Address unavailable";
  const invoiceDate = formatDateIndia(head[1]);

  const doc = {
    invoice,
    date: invoiceDate,
    customer: customerName,
    customerPhone,
    customerAddress,
    paymentStatus,
    paymentMethod,
    dueDate,
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
        <Button size="sm" onClick={() => void exportInvoicePdf(doc)}>
          <FileText className="mr-2 h-4 w-4" /> Download PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/invoices">All invoices</Link>
        </Button>
      </div>

      <article id="invoice-preview" className="invoice-paper">
        <header className="invoice-header">
          <div className="invoice-brand">
            <img src="/icon-512.png" alt={COMPANY.name} className="invoice-logo" />
            <div>
              <h1 className="invoice-company">{COMPANY.name}</h1>
              <p className="invoice-company-meta">
                {COMPANY.address}
                <br />
                {COMPANY.state} | {COMPANY.phone}
              </p>
            </div>
          </div>
          <div className="invoice-heading">
            <div className="invoice-kicker">Invoice</div>
            <div className="invoice-number">{invoice}</div>
            <div className="invoice-date-row">
              <div>{doc.date}</div>
              {dueDate ? <div>Due: {dueDate}</div> : null}
            </div>
          </div>
        </header>

        <section className="invoice-meta">
          <div className="invoice-meta-card">
            <p className="invoice-section-label">Bill To</p>
            <div className="invoice-party-name">{doc.customer}</div>
            <p className="invoice-detail-row">
              <strong>Phone:</strong> {customerPhone}
            </p>
            <p className="invoice-detail-row">
              <strong>Address:</strong> {customerAddress}
            </p>
          </div>

          <div className="invoice-meta-card">
            <p className="invoice-section-label">Invoice Information</p>
            <p className="invoice-detail-row">
              <strong>Invoice No:</strong> {invoice}
            </p>
            <p className="invoice-detail-row">
              <strong>Invoice Date:</strong> {doc.date}
            </p>
            <p className="invoice-detail-row">
              <strong>Payment Status:</strong> {paymentStatus}
            </p>
            <p className="invoice-detail-row">
              <strong>Payment Method:</strong> {paymentMethod}
            </p>
          </div>
        </section>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const lineTotal = item.qty * item.rate;
              const tax = lineTotal * (gstPercent / 100);
              return (
                <tr key={`${item.product}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{item.product}</td>
                  <td>—</td>
                  <td>{item.qty}</td>
                  <td className="number-cell">{money(item.rate)}</td>
                  <td className="number-cell">{money(0)}</td>
                  <td className="number-cell">{money(tax)}</td>
                  <td className="number-cell">{money(lineTotal + tax)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="invoice-summary">
          <div className="invoice-totals">
            <div className="invoice-totals-row">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="invoice-totals-row">
              <span>Discount</span>
              <span>{money(0)}</span>
            </div>
            <div className="invoice-totals-row">
              <span>Tax</span>
              <span>{money(gst)}</span>
            </div>
            <div className="invoice-totals-row grand">
              <span>Grand Total</span>
              <span>{money(total)}</span>
            </div>
          </div>
        </div>

        <div className="invoice-notes">
          <div className="invoice-note-box">
            <p className="invoice-section-label" style={{ margin: 0 }}>Payment / Notes</p>
            <p>
              <strong>Status:</strong> {paymentStatus}
            </p>
            <p>
              <strong>Method:</strong> {paymentMethod}
            </p>
            {doc.notes ? <p>{doc.notes}</p> : null}
          </div>
          <div className="invoice-note-box">
            <p className="invoice-section-label" style={{ margin: 0 }}>Terms & Conditions</p>
            <p>Goods once sold are not returnable unless otherwise agreed in writing.</p>
          </div>
        </div>

        <footer className="invoice-footer">
          <strong>{COMPANY.name}</strong>
          <span>Thank you for your business.</span>
        </footer>
      </article>
    </div>
  );
}
