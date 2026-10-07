import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { normalizeDate, toNum } from "@/lib/erp-data";
import { InvoicePreviewPage } from "@/components/invoice/InvoicePreviewPage";
import { InvoicePreviewModal } from "@/components/invoice/InvoicePreviewModal";
import { SAMPLE_INVOICE } from "@/components/invoice/sample-invoice";
import type { Invoice } from "@/components/invoice/invoice.types";

const sheetText = (value: unknown) => String(value ?? "").trim();

const invoiceQuery = (invoice: string) =>
  queryOptions({
    queryKey: ["erp", "invoice", invoice],
    queryFn: () =>
      getSheetsBatch({
        data: {
          ranges: [
            "Sales!A2:Q2000",
            "'Sale Items'!A2:M5000",
            "'Daily Collection'!A2:E5000",
            "Customers!A2:S2000",
          ],
        },
      }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/invoices/$invoice")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search.preview === true || search.preview === "1" ? { preview: true } : {}),
  }),
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

function InvoicePage() {
  const { invoice } = Route.useParams();
  const { preview } = Route.useSearch();
  return (
    <ErpShell activeSlug="invoices" title={`Invoice ${invoice}`} subtitle="Tax invoice">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <InvoiceView invoice={invoice} initialPreview={preview ?? false} />
      </Suspense>
    </ErpShell>
  );
}

function InvoiceView({ invoice, initialPreview }: { invoice: string; initialPreview: boolean }) {
  const { data } = useSuspenseQuery(invoiceQuery(invoice));
  const [previewOpen, setPreviewOpen] = useState(initialPreview);
  useEffect(() => setPreviewOpen(initialPreview), [initialPreview]);
  const get = (needle: string) =>
    data.valueRanges.find((v) => v.range.includes(needle))?.values ?? [];

  const head = get("Sales").find((row) => sheetText(row[0]) === invoice);

  if (!head) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted-foreground">Invoice {invoice} was not found.</p>
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          Preview / Print
        </Button>
        <InvoicePreviewModal
          open={previewOpen}
          invoice={null}
          error={`Invoice ${invoice} was not found in the sales sheet.`}
          onClose={() => setPreviewOpen(false)}
        />
      </div>
    );
  }

  const customerName = sheetText(head[2]) || "Walk-in Customer";
  const customerRow = get("Customers").find(
    (row) => sheetText(row[1]).toLowerCase() === customerName.toLowerCase(),
  );
  const sheetItems = get("Sale Items").filter((row) => sheetText(row[0]) === invoice);
  const items = sheetItems.map((row) => {
    const size = sheetText(row[11]);
    const color = sheetText(row[12]);
    const options = [color, size].filter(Boolean).join(", ");
    return {
      description: `${sheetText(row[3])}${options ? ` - ${options}` : ""}`,
      hsn: sheetText(row[4]),
      qty: toNum(row[5]),
      rate: toNum(row[6]),
      gstPercent: toNum(row[8]),
    };
  });
  const grossSubtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const discount = Math.max(0, grossSubtotal - toNum(head[3]));
  const customerGstin = sheetText(head[12]) || sheetText(customerRow?.[6]);
  const customerState = sheetText(customerRow?.[5]) || "Kerala";
  const stateCode =
    customerGstin.slice(0, 2) || (customerState.toLowerCase() === "kerala" ? "32" : "");
  const collectionModes = [
    ...new Set(
      get("Daily Collection")
        .filter((row) => (row[2] ?? "") === invoice)
        .map((row) => sheetText(row[4]))
        .filter(Boolean),
    ),
  ];
  const storedMode = (sheetText(head[13]) || "gst").toLowerCase();
  const address =
    sheetText(head[14]) ||
    [customerRow?.[3], customerRow?.[4], customerRow?.[5]]
      .map(sheetText)
      .filter(Boolean)
      .join(", ");
  const invoiceData: Invoice = {
    ...SAMPLE_INVOICE,
    invoice: {
      ...SAMPLE_INVOICE.invoice,
      type: storedMode === "non-gst" ? "BILL" : "TAX INVOICE",
      number: invoice,
      date: normalizeDate(head[1]) || new Date().toISOString().slice(0, 10),
      placeOfSupply: `${customerState}${stateCode ? ` (${stateCode})` : ""}`,
      paymentMode: collectionModes.join(" / ") || "—",
      supplyType:
        customerState.toLowerCase() === SAMPLE_INVOICE.seller.stateName.toLowerCase()
          ? "INTRA"
          : "INTER",
    },
    customer: {
      name: customerName,
      address: address || "—",
      phone: sheetText(customerRow?.[2]),
      gstin: customerGstin,
    },
    items,
    discount,
  };

  return (
    <>
      <InvoicePreviewPage invoice={invoiceData} onPreview={() => setPreviewOpen(true)} />
      <InvoicePreviewModal
        open={previewOpen}
        invoice={invoiceData}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
