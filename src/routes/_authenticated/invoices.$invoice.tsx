import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch } from "@/lib/sheets.functions";
import { normalizeDate, toNum } from "@/lib/erp-data";
import { InvoicePreviewPage } from "@/components/invoice/InvoicePreviewPage";
import { SAMPLE_INVOICE } from "@/components/invoice/sample-invoice";
import type { Invoice } from "@/components/invoice/invoice.types";

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

  const head = get("Sales").find((row) => (row[0] ?? "") === invoice);

  if (!head) {
    return (
      <>
        <p className="mb-3 text-sm text-muted-foreground">
          Invoice {invoice} was not found. Showing the sample invoice preview.
        </p>
        <InvoicePreviewPage
          invoice={SAMPLE_INVOICE}
          sampleNotice="Demo sample; this is not a saved invoice."
        />
      </>
    );
  }

  const customerName = String(head[2] ?? "").trim() || "Customer";
  const customerRow = get("Customers").find(
    (row) =>
      String(row[1] ?? "")
        .trim()
        .toLowerCase() === customerName.toLowerCase(),
  );
  const sheetItems = get("Sale Items").filter((row) => (row[0] ?? "") === invoice);
  const items = sheetItems.map((row) => {
    const size = String(row[11] ?? "").trim();
    const color = String(row[12] ?? "").trim();
    const options = [color, size].filter(Boolean).join(", ");
    return {
      description: `${String(row[3] ?? "")}${options ? ` - ${options}` : ""}`,
      hsn: String(row[4] ?? ""),
      qty: toNum(row[5]),
      rate: toNum(row[6]),
      gstPercent: toNum(row[8]),
    };
  });
  const grossSubtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const discount = Math.max(0, grossSubtotal - toNum(head[3]));
  const customerGstin = String(head[12] ?? customerRow?.[6] ?? "").trim();
  const customerState = String(customerRow?.[5] ?? "Kerala").trim() || "Kerala";
  const stateCode =
    customerGstin.slice(0, 2) || (customerState.toLowerCase() === "kerala" ? "32" : "");
  const collectionModes = [
    ...new Set(
      get("Daily Collection")
        .filter((row) => (row[2] ?? "") === invoice)
        .map((row) => String(row[4] ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const storedMode = String(head[13] ?? "gst")
    .trim()
    .toLowerCase();
  const address =
    String(head[14] ?? "").trim() ||
    [customerRow?.[3], customerRow?.[4], customerRow?.[5]]
      .map((part) => String(part ?? "").trim())
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
      phone: String(customerRow?.[2] ?? "").trim() || "—",
      gstin: customerGstin,
    },
    items,
    discount,
  };

  return <InvoicePreviewPage invoice={invoiceData} />;
}
