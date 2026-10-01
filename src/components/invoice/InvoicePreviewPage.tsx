import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceTemplate } from "./InvoiceTemplate";
import { calculateInvoice, formatINR } from "./invoice.utils";
import type { Invoice } from "./invoice.types";

export function InvoicePreviewPage({
  invoice,
  backHref = "/invoices",
  sampleNotice,
}: {
  invoice: Invoice;
  backHref?: "/invoices";
  sampleNotice?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const totals = calculateInvoice(invoice);
  const canPrint = invoice.items.length > 0 && totals.finalTotal > 0;

  useEffect(() => {
    const viewport = viewportRef.current;
    const paper = paperRef.current;
    if (!viewport || !paper) return;

    const updateScale = () => {
      const paperWidth = paper.offsetWidth || 794;
      setScale(Math.min(1, viewport.clientWidth / paperWidth));
    };
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    updateScale();
    return () => observer.disconnect();
  }, []);

  function printInvoice() {
    if (canPrint) window.print();
  }

  function shareInvoice() {
    const message = `Invoice ${invoice.invoice.number} total ${formatINR(totals.finalTotal)}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="gst-invoice-preview-page">
      <div className="gst-invoice-toolbar no-print">
        <Button variant="outline" size="sm" asChild>
          <Link to={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="gst-invoice-toolbar-actions">
          <Button variant="outline" size="sm" onClick={shareInvoice}>
            <Share2 className="mr-2 h-4 w-4" />
            Share on WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={printInvoice} disabled={!canPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button size="sm" onClick={printInvoice} disabled={!canPrint}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>
      {sampleNotice ? <p className="gst-invoice-sample-note no-print">{sampleNotice}</p> : null}
      <div className="gst-invoice-viewport" ref={viewportRef}>
        <div
          className="gst-invoice-scale-frame"
          style={{ width: `calc(210mm * ${scale})`, height: `calc(297mm * ${scale})` }}
        >
          <div
            className="gst-invoice-scale-content"
            ref={paperRef}
            style={{ transform: `scale(${scale})` }}
          >
            <InvoiceTemplate invoice={invoice} />
          </div>
        </div>
      </div>
    </div>
  );
}
