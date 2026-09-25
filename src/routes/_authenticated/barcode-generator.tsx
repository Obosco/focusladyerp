import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSheetRange } from "@/lib/sheets.functions";

type BarcodeKind = "CODE128" | "EAN-13" | "EAN-8" | "UPC-A" | "CODE39" | "ITF-14";

type BarcodeRow = {
  barcode: string;
  productName: string;
  variantName: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  category: string;
  brand: string;
};

export const Route = createFileRoute("/_authenticated/barcode-generator")({
  head: () => ({
    meta: [{ title: "Barcode Generator — Focus Lady Bra ERP" }],
  }),
  component: BarcodeGeneratorPage,
});

function parseBarcodeRows(rows: string[][]): BarcodeRow[] {
  return rows
    .filter((row) => String(row[1] ?? "").trim())
    .map((row) => ({
      barcode: String(row[1] ?? "").trim(),
      productName: String(row[4] ?? "").trim(),
      variantName: String(row[6] ?? "").trim(),
      sku: String(row[7] ?? "").trim(),
      size: String(row[10] ?? "").trim(),
      color: String(row[11] ?? "").trim(),
      price: String(row[13] ?? "").trim(),
      category: String(row[8] ?? "").trim(),
      brand: String(row[9] ?? "").trim(),
    }))
    .filter((row) => row.barcode || row.productName || row.variantName);
}

function BarcodeGeneratorPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data } = useQuery({
    queryKey: ["erp", "barcode-database"],
    queryFn: () => getSheetRange({ data: { range: "'Barcode Database'!A2:Q2000" } }),
    staleTime: 30_000,
  });

  const barcodeRows = parseBarcodeRows(data?.values ?? []);
  const [productName, setProductName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [sku, setSku] = useState("");
  const [barcodeText, setBarcodeText] = useState("");
  const [type, setType] = useState<BarcodeKind>("CODE128");
  const [showProduct, setShowProduct] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSize, setShowSize] = useState(true);
  const [showColor, setShowColor] = useState(true);
  const [showCompany, setShowCompany] = useState(true);

  useEffect(() => {
    if (!barcodeRows.length) return;
    const first = barcodeRows[0];
    setProductName((current) => current || first.productName || "Product");
    setVariantName((current) => current || (first.variantName || `${first.size || ""}${first.size && first.color ? " / " : ""}${first.color}`.trim()));
    setSku((current) => current || first.sku || "");
    setBarcodeText((current) => current || first.barcode || "");
  }, [barcodeRows]);

  useEffect(() => {
    if (!svgRef.current || !barcodeText.trim()) return;
    JsBarcode(svgRef.current, barcodeText.trim(), {
      format: type,
      displayValue: true,
      fontSize: 12,
      height: 58,
      width: 1.5,
      margin: 8,
      background: "#ffffff",
    });
  }, [barcodeText, type]);

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(productName || "barcode").replace(/\s+/g, "-").toLowerCase()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ErpShell activeSlug="barcode-generator" title="Barcode Generator" subtitle="Generate and preview printable labels">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Barcode settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-select">Product quick pick</Label>
              <select
                id="product-select"
                value={barcodeText}
                onChange={(e) => {
                  const item = barcodeRows.find((row) => row.barcode === e.target.value);
                  if (!item) return;
                  setProductName(item.productName || "Product");
                  setVariantName(item.variantName || `${item.size || ""}${item.size && item.color ? " / " : ""}${item.color}`.trim());
                  setSku(item.sku || "");
                  setBarcodeText(item.barcode || "");
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a product barcode</option>
                {barcodeRows.map((item) => (
                  <option key={`${item.barcode}-${item.productName}-${item.variantName}`} value={item.barcode}>
                    {item.productName || "Product"} {item.variantName ? `• ${item.variantName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-name">Product</Label>
                <Input id="product-name" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-name">Variant</Label>
                <Input id="variant-name" value={variantName} onChange={(e) => setVariantName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Barcode</Label>
                <Input id="code" value={barcodeText} onChange={(e) => setBarcodeText(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode-type">Barcode type</Label>
              <select
                id="barcode-type"
                value={type}
                onChange={(e) => setType(e.target.value as BarcodeKind)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {(["CODE128", "EAN-13", "EAN-8", "UPC-A", "CODE39", "ITF-14"] as BarcodeKind[]).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showProduct} onChange={(e) => setShowProduct(e.target.checked)} /> Product name</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} /> SKU</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Price</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSize} onChange={(e) => setShowSize(e.target.checked)} /> Size</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showColor} onChange={(e) => setShowColor(e.target.checked)} /> Color</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCompany} onChange={(e) => setShowCompany(e.target.checked)} /> Company name</label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" onClick={() => {
                const item = barcodeRows[0];
                if (!item) return;
                setProductName(item.productName || "Product");
                setVariantName(item.variantName || `${item.size || ""}${item.size && item.color ? " / " : ""}${item.color}`.trim());
                setSku(item.sku || "");
                setBarcodeText(item.barcode || "");
              }}>Use live barcode</Button>
              <Button type="button" variant="outline" onClick={downloadSvg}>Download SVG</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Actual size preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="mx-auto w-[260px] rounded-md border border-border bg-white p-3 text-center text-[10px] text-black shadow-sm">
              {showCompany ? <div className="mb-1 font-semibold uppercase">Focus Lady Bra</div> : null}
              {showProduct ? <div className="font-semibold">{productName || "Product"}</div> : null}
              {showSku || showSize || showColor ? (
                <div className="text-[9px]">
                  {showSku ? sku : ""}
                  {showSku && (showSize || showColor) ? " / " : ""}
                  {showSize ? variantName.split("/")[1]?.trim() || "" : ""}
                  {showColor && showSize ? " / " : ""}
                  {showColor ? variantName.split("/")[0]?.trim() || "" : ""}
                </div>
              ) : null}
              <div className="mt-2 flex justify-center overflow-hidden">
                <svg ref={svgRef} role="img" aria-label={`Barcode preview for ${barcodeText}`} className="max-w-full" />
              </div>
              {showPrice ? <div className="mt-2 text-xs font-semibold">{barcodeRows.find((row) => row.barcode === barcodeText)?.price || "₹0"}</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpShell>
  );
}
