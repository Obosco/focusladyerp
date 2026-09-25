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
  customerPhone?: string;
  customerAddress?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  dueDate?: string;
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

export async function exportInvoicePdf(inv: InvoiceDoc) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const logoDataUrl = await fetch("/icon-512.png")
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Unable to load invoice logo."));
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => "");

  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logoDataUrl) {
    const logoSize = 42;
    doc.addImage(logoDataUrl, "PNG", margin, 34, logoSize, logoSize);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("OBOSCO CLOTHING INDUSTRIES", margin + 60, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const companyLines = [
    "Near by Police Station Tanur, First Floor 22/242",
    "Kerala | +91 8089457918",
  ];
  doc.text(companyLines, margin + 60, 70);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("INVOICE", pageWidth - margin - 60, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Invoice No: ${inv.invoice}`, pageWidth - margin - 10, 62, { align: "right" });
  doc.text(`Invoice Date: ${inv.date}`, pageWidth - margin - 10, 78, { align: "right" });
  if (inv.dueDate) {
    doc.text(`Due Date: ${inv.dueDate}`, pageWidth - margin - 10, 94, { align: "right" });
  }

  const billingStart = 120;
  const leftX = margin;
  const rightX = pageWidth / 2 + 12;

  const metaBox = (x: number, y: number, w: number, title: string, lines: string[]) => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, w, 68, 4, 4, "F");
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, y, w, 68, 4, 4, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, x + 10, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    lines.forEach((line, idx) => {
      doc.text(line, x + 10, y + 30 + idx * 12, { maxWidth: w - 20 });
    });
  };

  metaBox(leftX, billingStart, 240, "Bill To", [
    inv.customer || "Customer",
    inv.customerPhone || "Phone unavailable",
    inv.customerAddress || "Address unavailable",
  ]);

  metaBox(
    rightX,
    billingStart,
    240,
    "Invoice Information",
    [
      `Invoice No: ${inv.invoice}`,
      `Invoice Date: ${inv.date}`,
      `Payment Status: ${inv.paymentStatus ?? "Pending"}`,
      `Payment Method: ${inv.paymentMethod ?? "—"}`,
    ],
  );

  autoTable(doc, {
    startY: 206,
    margin: { left: margin, right: margin },
    head: [["#", "Product", "SKU", "Qty", "Rate", "Discount", "Tax", "Amount"]],
    body: inv.items.map((i, idx) => [
      String(idx + 1),
      i.product,
      "-",
      String(i.qty),
      money(i.rate),
      money(0),
      money((i.qty || 0) * (i.rate || 0) * (inv.gstPercent / 100 || 0)),
      money(i.qty * i.rate),
    ]),
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 120 },
      2: { cellWidth: 42 },
      3: { cellWidth: 38, halign: "right" },
      4: { cellWidth: 54, halign: "right" },
      5: { cellWidth: 54, halign: "right" },
      6: { cellWidth: 42, halign: "right" },
      7: { cellWidth: 56, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
    didDrawPage: (data) => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${pageNumber}`, pageWidth / 2, 822, { align: "center" });
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 620;
  const totalsPosY = finalY + 16;
  const totals = [
    ["Subtotal", money(inv.subtotal)],
    ["Discount", money(inv.discount)],
    [`Tax (${inv.gstPercent}%)`, money(inv.gst)],
    ["Grand Total", money(inv.total)],
  ];

  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(pageWidth - 240, totalsPosY, 200, totals.length * 22 + 10, 4, 4, "S");
  totals.forEach(([label, value], idx) => {
    const y = totalsPosY + 10 + idx * 22;
    doc.setFont("helvetica", idx === totals.length - 1 ? "bold" : "normal");
    doc.setFontSize(9);
    doc.text(label, pageWidth - 220, y + 10);
    doc.text(value, pageWidth - 52, y + 10, { align: "right" });
  });

  const notesY = totalsPosY + totals.length * 22 + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Notes:", margin, notesY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const notesText = inv.notes ? inv.notes : "Thank you for your business.";
  doc.text(notesText, margin, notesY + 14, { maxWidth: 280 });

  const sigX = pageWidth - 170;
  const sigY = notesY + 32;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(sigX, sigY, sigX + 120, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Authorised Signatory", sigX + 60, sigY + 16, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FocusLady ERP", margin, 822);
  doc.setFont("helvetica", "normal");
  doc.text("Thank you for your business.", margin + 110, 822);

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
