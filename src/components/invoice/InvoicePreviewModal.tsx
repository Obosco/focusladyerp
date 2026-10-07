import { useEffect, useRef, useState } from "react";
import { Download, Printer, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceTemplate } from "./InvoiceTemplate";
import { calculateInvoice, formatINR, normalizeInvoice } from "./invoice.utils";
import type { Invoice } from "./invoice.types";

export function InvoicePreviewModal({
  open,
  invoice,
  loading = false,
  error,
  onClose,
}: {
  open: boolean;
  invoice?: Invoice | null;
  loading?: boolean;
  error?: string;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const previousScaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  const [exportError, setExportError] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const safeInvoice = normalizeInvoice(invoice);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("invoice-modal-open");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("invoice-modal-open");
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateScale = () => {
      const paperWidth = 793.7;
      const availableWidth = Math.max(280, viewport.clientWidth - 32);
      const nextScale = Math.min(1, availableWidth / paperWidth);
      scaleRef.current = nextScale;
      setScale(nextScale);
    };
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    updateScale();
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const beforePrint = () => {
      if (scaleRef.current !== 1) previousScaleRef.current = scaleRef.current;
      scaleRef.current = 1;
      setScale(1);
    };
    const afterPrint = () => {
      scaleRef.current = previousScaleRef.current;
      setScale(previousScaleRef.current);
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [open]);

  if (!open) return null;

  const totals = safeInvoice ? calculateInvoice(safeInvoice) : null;
  const pageCount = Math.max(1, Math.ceil((safeInvoice?.items.length ?? 0) / 10));

  async function printInvoice() {
    const images = sheetRef.current?.querySelectorAll("img") ?? [];
    setExportError("");
    try {
      await Promise.all(Array.from(images, (image) => image.decode()));
    } catch {
      setExportError("The invoice logo could not be loaded, so printing was stopped.");
      return;
    }
    previousScaleRef.current = scaleRef.current;
    scaleRef.current = 1;
    setScale(1);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    window.print();
  }

  async function downloadPdf() {
    const printArea = sheetRef.current;
    if (!printArea || !safeInvoice) return;
    setExportError("");
    const previousScale = scaleRef.current;
    scaleRef.current = 1;
    setScale(1);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const filename = `Invoice_${safeInvoice.invoice.number || "invoice"}`.replace(
        /[\\/:*?"<>|]+/g,
        "-",
      );
      printArea.classList.add("invoice-exporting");
      await html2pdf()
        .set({
          margin: 0,
          filename: `${filename}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(printArea)
        .save();
    } catch {
      setExportError("PDF could not be generated. Please use Print and choose Save as PDF.");
    } finally {
      printArea.classList.remove("invoice-exporting");
      scaleRef.current = previousScale;
      setScale(previousScale);
    }
  }

  function shareInvoice() {
    if (!safeInvoice || !totals) return;
    const message = `Invoice ${safeInvoice.invoice.number} - Grand Total ${formatINR(totals.finalTotal)}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div
      className="invoice-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Invoice preview"
      >
        <div className="invoice-modal-toolbar no-print">
          <strong>
            {safeInvoice ? `Invoice ${safeInvoice.invoice.number}` : "Invoice preview"}
          </strong>
          <div className="invoice-modal-actions">
            <Button size="sm" onClick={printInvoice} disabled={!safeInvoice || loading}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadPdf}
              disabled={!safeInvoice || loading}
            >
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={shareInvoice}
              disabled={!safeInvoice || loading}
            >
              <Share2 className="mr-2 h-4 w-4" /> Share on WhatsApp
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {exportError ? <p className="invoice-modal-error no-print">{exportError}</p> : null}
        <div className="invoice-modal-viewport" ref={viewportRef}>
          {loading ? (
            <p className="invoice-modal-message">Loading invoice...</p>
          ) : !safeInvoice ? (
            <p className="invoice-modal-message invoice-modal-message-error">
              {error || "Invoice data is unavailable. Return to the invoice list and try again."}
            </p>
          ) : (
            <div
              className="invoice-modal-scale-frame"
              style={{
                width: `calc(210mm * ${scale})`,
                height: `calc(${297 * pageCount}mm * ${scale})`,
              }}
            >
              <div
                className="invoice-print-area"
                ref={sheetRef}
                style={{ transform: `scale(${scale})` }}
              >
                <InvoiceTemplate invoice={safeInvoice} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
