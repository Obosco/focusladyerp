import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

export function InvoiceBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value.trim()) return;
    JsBarcode(svgRef.current, value, {
      format: "CODE128",
      displayValue: true,
      fontSize: 11,
      height: 42,
      margin: 4,
      width: 1.5,
    });
  }, [value]);

  const download = () => {
    if (!svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${value.replace(/[^a-z0-9_-]/gi, "-")}-barcode.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <svg ref={svgRef} role="img" aria-label={`Barcode for ${value}`} />
      <button type="button" className="text-[11px] underline print:hidden" onClick={download}>
        Download barcode
      </button>
    </div>
  );
}