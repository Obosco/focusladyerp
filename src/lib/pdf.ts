import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { logDownload } from "./sheets.functions";

export function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
}

export function recordDownload(entry: {
  type: string;
  reference: string;
  filename: string;
  format: string;
  note?: string;
}) {
  // Fire and forget — never block the download.
  void logDownload({ data: entry }).catch(() => undefined);
}

export function exportTablePdf(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  filename: string;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(opts.title, 40, 40);
  doc.setFontSize(9);
  doc.text(opts.subtitle ?? `Focus Lady Bra ERP — ${new Date().toLocaleString()}`, 40, 56);
  autoTable(doc, {
    head: [opts.headers.map((h, i) => h || `Col ${i + 1}`)],
    body: opts.rows,
    startY: 70,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 30, 40] },
  });
  const filename = `${safeName(opts.filename)}-${stamp()}.pdf`;
  doc.save(filename);
  recordDownload({
    type: "Report",
    reference: opts.title,
    filename,
    format: "PDF",
    note: `${opts.rows.length} rows`,
  });
  return filename;
}

export type InvoiceDoc = {
  invoice: string;
  date: string;
  customer: string;
  items: { product: string; qty: number; rate: number }[];
  subtotal: number;
  gst: number;
  gstPercent: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  notes?: string;
  signer?: string;
  signature?: string;
};

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function exportInvoicePdf(inv: InvoiceDoc) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(18);
  doc.text("FOCUS LADY BRA", 40, 50);
  doc.setFontSize(10);
  doc.text("Tax Invoice", 40, 68);

  doc.setFontSize(11);
  doc.text(`Invoice: ${inv.invoice}`, 400, 50);
  doc.setFontSize(10);
  doc.text(`Date: ${inv.date}`, 400, 66);
  doc.text(`Customer: ${inv.customer}`, 400, 82);

  autoTable(doc, {
    head: [["#", "Product", "Qty", "Rate", "Amount"]],
    body: inv.items.map((i, idx) => [
      String(idx + 1),
      i.product,
      String(i.qty),
      money(i.rate),
      money(i.qty * i.rate),
    ]),
    startY: 110,
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [30, 30, 40] },
    columnStyles: {
      0: { cellWidth: 30 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 200) + 24;
  const line = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 360, y);
    doc.text(value, 555, y, { align: "right" });
    y += 18;
  };
  line("Discount", money(inv.discount));
  line("Subtotal", money(inv.subtotal));
  line(`GST (${inv.gstPercent}%)`, money(inv.gst));
  line("Total", money(inv.total), true);
  line("Paid", money(inv.paid));
  line("Due", money(inv.due), true);
  doc.setFont("helvetica", "normal");

  if (inv.notes) {
    doc.setFontSize(9);
    doc.text(`Notes: ${inv.notes}`, 40, y + 4, { maxWidth: 280 });
  }

  if (inv.signature?.startsWith("data:image")) {
    try {
      doc.addImage(inv.signature, "PNG", 40, y + 30, 160, 60);
    } catch {
      /* ignore bad signature data */
    }
  }
  doc.setFontSize(9);
  doc.line(40, y + 96, 200, y + 96);
  doc.text(inv.signer ? `Authorised: ${inv.signer}` : "Authorised signature", 40, y + 110);

  const filename = `${safeName(inv.invoice)}-${safeName(inv.customer)}.pdf`;
  doc.save(filename);
  recordDownload({
    type: "Invoice",
    reference: inv.invoice,
    filename,
    format: "PDF",
    note: inv.customer,
  });
  return filename;
}
