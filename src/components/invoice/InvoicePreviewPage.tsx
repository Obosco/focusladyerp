import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceTemplate } from "./InvoiceTemplate";
import type { Invoice } from "./invoice.types";

export function InvoicePreviewPage({
  invoice,
  backHref = "/invoices",
  sampleNotice,
  onPreview,
}: {
  invoice: Invoice;
  backHref?: "/invoices";
  sampleNotice?: string;
  onPreview?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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
          {onPreview ? (
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="mr-2 h-4 w-4" /> Preview / Print
            </Button>
          ) : null}
        </div>
      </div>
      {sampleNotice ? <p className="gst-invoice-sample-note no-print">{sampleNotice}</p> : null}
      <div className="gst-invoice-viewport" ref={viewportRef}>
        <div
          className="gst-invoice-scale-frame"
          style={{
            width: `calc(210mm * ${scale})`,
            height: `calc(${297 * Math.max(1, Math.ceil(invoice.items.length / 10))}mm * ${scale})`,
          }}
        >
          <div
            className="gst-invoice-scale-content invoice-print-area"
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
