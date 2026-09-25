import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addProduct } from "@/lib/sheets.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: "Add Product — Focus Lady Bra ERP" }] }),
  component: ProductNewPage,
});

function ProductNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [minimumStock, setMinimumStock] = useState(0);
  const [barcode, setBarcode] = useState("");
  const [barcodeType, setBarcodeType] = useState("CODE128");
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState([
    { variantName: "", sku: "", barcode: "", barcodeType: "CODE128", size: "", color: "", design: "", purchasePrice: 0, sellingPrice: 0, currentStock: 0, minimumStock: 0, unit: "pcs", status: "Active" },
  ]);

  const updateVariant = (index: number, key: string, value: string | number) => {
    setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const addVariant = () => {
    setVariants((current) => [...current, { variantName: "", sku: "", barcode: "", barcodeType: "CODE128", size: "", color: "", design: "", purchasePrice: 0, sellingPrice: 0, currentStock: 0, minimumStock: 0, unit: "pcs", status: "Active" }]);
  };

  const handleSubmit = async () => {
    try {
      setBusy(true);
      const productBarcode = autoGenerate ? (barcode || `FLB-${Date.now().toString().slice(-8)}`) : barcode;
      await addProduct({
        data: {
          name,
          category,
          brand,
          description,
          unit,
          cost,
          price,
          minimumStock,
          barcode: productBarcode,
          barcodeType,
          variants: variants.filter((variant) => variant.variantName || variant.sku || variant.barcode || variant.size || variant.color),
        },
      });
      toast.success("Product saved with barcode validation");
      navigate({ to: "/sheet/$slug", params: { slug: "products" } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ErpShell activeSlug="products" title="Add Product" subtitle="Create a product with optional variants and barcode validation">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Product details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-name">Product name</Label>
                <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Purchase price</Label>
                <Input id="cost" type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Selling price</Label>
                <Input id="price" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-stock">Minimum stock</Label>
                <Input id="min-stock" type="number" value={minimumStock} onChange={(e) => setMinimumStock(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode-type">Barcode type</Label>
                <select id="barcode-type" value={barcodeType} onChange={(e) => setBarcodeType(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {['CODE128','EAN-13','EAN-8','UPC-A','CODE39','ITF-14'].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Optional" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} /> Generate barcode automatically when saving
            </label>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setBarcode("")}>Clear</Button>
              <Button type="button" variant="outline" onClick={() => setBarcode(`FLB-${Date.now().toString().slice(-8)}`)}>Generate</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Variants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {variants.map((variant, index) => (
              <div key={index} className="space-y-3 rounded-md border border-border p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Variant name</Label>
                    <Input value={variant.variantName} onChange={(e) => updateVariant(index, "variantName", e.target.value)} />
                  </div>
                  <div>
                    <Label>SKU</Label>
                    <Input value={variant.sku} onChange={(e) => updateVariant(index, "sku", e.target.value)} />
                  </div>
                  <div>
                    <Label>Barcode</Label>
                    <Input value={variant.barcode} onChange={(e) => updateVariant(index, "barcode", e.target.value)} />
                  </div>
                  <div>
                    <Label>Barcode type</Label>
                    <select value={variant.barcodeType} onChange={(e) => updateVariant(index, "barcodeType", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {['CODE128','EAN-13','EAN-8','UPC-A','CODE39','ITF-14'].map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Size</Label>
                    <Input value={variant.size} onChange={(e) => updateVariant(index, "size", e.target.value)} />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input value={variant.color} onChange={(e) => updateVariant(index, "color", e.target.value)} />
                  </div>
                  <div>
                    <Label>Design</Label>
                    <Input value={variant.design} onChange={(e) => updateVariant(index, "design", e.target.value)} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Input value={variant.status} onChange={(e) => updateVariant(index, "status", e.target.value)} />
                  </div>
                  <div>
                    <Label>Purchase</Label>
                    <Input type="number" value={variant.purchasePrice} onChange={(e) => updateVariant(index, "purchasePrice", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Selling</Label>
                    <Input type="number" value={variant.sellingPrice} onChange={(e) => updateVariant(index, "sellingPrice", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Current stock</Label>
                    <Input type="number" value={variant.currentStock} onChange={(e) => updateVariant(index, "currentStock", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Min stock</Label>
                    <Input type="number" value={variant.minimumStock} onChange={(e) => updateVariant(index, "minimumStock", Number(e.target.value))} />
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>Add variant</Button>
            <Button type="button" className="w-full" onClick={handleSubmit} disabled={busy}>{busy ? "Saving..." : "Save product"}</Button>
          </CardContent>
        </Card>
      </div>
    </ErpShell>
  );
}
