import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErpShell } from "@/components/ErpShell";
import { BarcodeLookup, BarcodeScanner } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSheetRange, updateStockLevel } from "@/lib/sheets.functions";
import { toast } from "sonner";

type BarcodeMatch = {
  product: string;
  variant: string;
  sku: string;
  barcode: string;
  price: string;
  stock: string;
  minimumStock: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  design: string;
  warehouse: string;
  sellingPrice: string;
  costPrice: string;
  unit: string;
};

export const Route = createFileRoute("/_authenticated/barcode-scanner")({
  head: () => ({ meta: [{ title: "Barcode Scanner — Focus Lady Bra ERP" }] }),
  component: BarcodeScannerPage,
});

function parseBarcodeMatches(
  barcodeRows: string[][],
  productRows: string[][],
  variantRows: string[][],
): BarcodeMatch[] {
  const productById = new Map<string, string[]>();
  for (const row of productRows) {
    if (!row[0]) continue;
    productById.set(String(row[0]).trim(), row);
  }

  const variantByBarcode = new Map<string, string[]>();
  for (const row of variantRows) {
    const barcode = String(row[4] ?? "").trim();
    if (!barcode) continue;
    variantByBarcode.set(barcode, row);
  }

  const matches: BarcodeMatch[] = [];

  for (const row of barcodeRows) {
    const barcode = String(row[1] ?? "").trim();
    if (!barcode) continue;

    const productId = String(row[3] ?? "").trim();
    const productInfo = productById.get(productId) ?? [];
    const variantInfo = variantByBarcode.get(barcode) ?? [];
    const productName = String(row[4] ?? productInfo[1] ?? "").trim();
    const variantName = String(row[6] ?? variantInfo[2] ?? "").trim() || `${String(variantInfo[6] ?? row[10] ?? "").trim()} / ${String(variantInfo[7] ?? row[11] ?? "").trim()}`.trim();
    const sku = String(row[7] ?? variantInfo[3] ?? "").trim();
    const brand = String(row[9] ?? productInfo[3] ?? "").trim();
    const category = String(row[8] ?? productInfo[2] ?? "").trim();
    const size = String(row[10] ?? variantInfo[6] ?? "").trim();
    const color = String(row[11] ?? variantInfo[7] ?? "").trim();
    const design = String(row[12] ?? variantInfo[8] ?? "").trim();
    const sellingPrice = String(row[13] ?? variantInfo[10] ?? productInfo[9] ?? "0").trim();
    const costPrice = String(productInfo[8] ?? variantInfo[9] ?? "0").trim();
    const currentStock = String(variantInfo[11] ?? productInfo[7] ?? "0").trim();
    const minimumStock = String(variantInfo[12] ?? productInfo[10] ?? "0").trim();
    const unit = String(variantInfo[13] ?? productInfo[5] ?? "pcs").trim() || "pcs";

    matches.push({
      product: productName,
      variant: variantName,
      sku,
      barcode,
      price: String(row[13] ?? sellingPrice ?? "0").trim() || "0",
      stock: currentStock,
      minimumStock,
      category,
      brand,
      size,
      color,
      design,
      warehouse: "Main Store",
      sellingPrice: sellingPrice || "0",
      costPrice: costPrice || "0",
      unit,
    });
  }

  return matches;
}

function BarcodeScannerPage() {
  const { data: barcodeData, isLoading: loadingBarcode } = useQuery({
    queryKey: ["erp", "barcode-database"],
    queryFn: () => getSheetRange({ data: { range: "'Barcode Database'!A2:Q2000" } }),
    staleTime: 30_000,
  });
  const { data: productsData } = useQuery({
    queryKey: ["erp", "products-sheet"],
    queryFn: () => getSheetRange({ data: { range: "Products!A2:Q2000" } }),
    staleTime: 30_000,
  });
  const { data: variantsData } = useQuery({
    queryKey: ["erp", "variants-sheet"],
    queryFn: () => getSheetRange({ data: { range: "'Product Variants'!A2:Q2000" } }),
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => parseBarcodeMatches(barcodeData?.values ?? [], productsData?.values ?? [], variantsData?.values ?? []),
    [barcodeData, productsData, variantsData],
  );
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState("Point camera at a barcode or type the code manually.");
  const [match, setMatch] = useState<BarcodeMatch | null>(null);
  const [movementType, setMovementType] = useState<"Stock In" | "Stock Out" | "Adjustment">("Stock In");
  const [warehouse, setWarehouse] = useState("Main Store");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("Purchase");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const lastScanRef = useRef("");

  const searchBarcode = (nextBarcode: string) => {
    const clean = nextBarcode.trim();
    if (!clean) {
      setMatch(null);
      setMessage("Enter a barcode to search.");
      return;
    }

    if (lastScanRef.current === clean) {
      setMessage("Duplicate scan ignored. This barcode was already checked.");
      return;
    }

    const product = rows.find((row) => row.barcode === clean);
    if (!product) {
      setMatch(null);
      setMessage("Unknown barcode. Please verify the product or scan again.");
      return;
    }

    setMatch(product);
    setBarcode(clean);
    lastScanRef.current = clean;
    setMessage(`Scanned: ${product.product} — ${product.variant}`);
  };

  const handleUpdate = async () => {
    if (!match) {
      setMessage("Scan a valid product before updating stock.");
      return;
    }

    try {
      setBusy(true);
      await updateStockLevel({
        barcode: match.barcode,
        product: match.product,
        variant: match.variant,
        sku: match.sku,
        warehouse,
        movementType,
        quantity,
        reason,
        notes,
      });
      toast.success(`Stock ${movementType.toLowerCase()} updated for ${match.product}`);
      setMessage(`${movementType} recorded for ${match.product}.`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Stock update failed.";
      toast.error(messageText);
      setMessage(messageText);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ErpShell activeSlug="barcode-scanner" title="Barcode Scanner" subtitle="Camera, USB scanner, or manual lookup">
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scan or search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarcodeScanner
              value={barcode}
              onChange={setBarcode}
              onScan={searchBarcode}
              loading={loadingBarcode}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setBarcode("");
                setMatch(null);
                setMessage("Enter a barcode to search.");
                lastScanRef.current = "";
              }}>
                Clear
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stock update</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarcodeLookup match={match ? {
              product: match.product,
              variant: match.variant,
              sku: match.sku,
              barcode: match.barcode,
              category: match.category,
              brand: match.brand,
              stock: match.stock,
              minimumStock: match.minimumStock,
              warehouse: match.warehouse,
              sellingPrice: match.sellingPrice,
              costPrice: match.costPrice,
              unit: match.unit,
            } : null} />

            {match ? (
              <div className="space-y-4 rounded-md border border-border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="warehouse">Warehouse</Label>
                    <select id="warehouse" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {['Main Store', 'Showroom', 'Warehouse A', 'Warehouse B'].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="movement-type">Movement Type</Label>
                    <select id="movement-type" value={movementType} onChange={(e) => setMovementType(e.target.value as "Stock In" | "Stock Out" | "Adjustment")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {['Stock In', 'Stock Out', 'Adjustment'].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {['Purchase', 'Return', 'Adjustment', 'Sale', 'Damage', 'Transfer'].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add movement notes" />
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setNotes("");
                    setQuantity(1);
                    setReason("Purchase");
                  }}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleUpdate} disabled={busy}>
                    {busy ? "Updating..." : "Update Stock"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ErpShell>
  );
}
