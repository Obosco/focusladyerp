import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCategory, addProduct, addSupplier } from "@/lib/sheets.functions";
import { toast } from "sonner";

type Supplier = string[];

export type CreatedProduct = {
  productId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  sku: string;
  purchasePrice: number;
};

function generatedSku(name: string, size: string, color: string) {
  const tokens = [name, size, color]
    .map((value) =>
      value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean);
  return tokens.join("-");
}

export function ProductQuickCreateDialog({
  open,
  onOpenChange,
  suppliers,
  categories,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  categories: string[];
  onCreated: (product: CreatedProduct) => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [gstPercent, setGstPercent] = useState("0");
  const [minimumStock, setMinimumStock] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [localCategories, setLocalCategories] = useState(categories);
  const [localSuppliers, setLocalSuppliers] = useState(suppliers);
  const queryClient = useQueryClient();
  const create = useServerFn(addProduct);
  const createNewCategory = useServerFn(addCategory);
  const createNewSupplier = useServerFn(addSupplier);

  const reset = () => {
    setName("");
    setBrand("");
    setCategory("");
    setSubcategory("");
    setSku("");
    setBarcode("");
    setSize("");
    setColor("");
    setPurchasePrice("");
    setSellingPrice("");
    setMrp("");
    setGstPercent("0");
    setMinimumStock("0");
    setReorderLevel("0");
    setSupplier("");
    setDescription("");
    setLocalCategories(categories);
    setLocalSuppliers(suppliers);
  };

  const close = () => {
    if (saving) return;
    reset();
    onOpenChange(false);
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await createNewCategory({ data: { name: categoryName } });
      setLocalCategories((current) => [...current, result.name]);
      setCategory(result.name);
      setCategoryName("");
      setCategoryDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      toast.success("Category created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create category.");
    }
  };

  const saveSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supplierInput = {
      name: String(form.get("supplier-name") ?? ""),
      phone: String(form.get("supplier-phone") ?? ""),
      whatsapp: String(form.get("supplier-whatsapp") ?? ""),
      email: String(form.get("supplier-email") ?? ""),
      address: String(form.get("supplier-address") ?? ""),
      gstin: String(form.get("supplier-gstin") ?? ""),
    };
    try {
      const result = await createNewSupplier({ data: supplierInput });
      setLocalSuppliers((current) => [
        ...current,
        [
          result.id,
          result.name,
          supplierInput.phone,
          supplierInput.address,
          "",
          "",
          supplierInput.gstin,
          "",
          "",
          supplierInput.whatsapp,
          supplierInput.email,
        ],
      ]);
      setSupplier(result.name);
      setSupplierDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      toast.success("Supplier created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create supplier.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const resolvedSku = sku.trim() || generatedSku(name, size, color);
    const hasVariant = Boolean(size.trim() || color.trim());
    setSaving(true);
    try {
      const result = await create({
        data: {
          name: name.trim(),
          brand,
          category,
          subcategory,
          sku: hasVariant ? "" : resolvedSku,
          barcode: hasVariant ? "" : barcode,
          cost: Number(purchasePrice),
          price: Number(sellingPrice),
          mrp: Number(mrp || sellingPrice),
          gstPercent: Number(gstPercent),
          minimumStock: Number(minimumStock),
          supplier,
          description,
          variants: hasVariant
            ? [
                {
                  variantName: [size.trim(), color.trim()].filter(Boolean).join(" / "),
                  sku: resolvedSku,
                  barcode,
                  size: size.trim(),
                  color: color.trim(),
                  purchasePrice: Number(purchasePrice),
                  sellingPrice: Number(sellingPrice),
                  minimumStock: Number(reorderLevel || minimumStock),
                  unit: "pcs",
                  status: "Active",
                },
              ]
            : [],
        },
      });
      const variantId = result.variantIds[0] ?? "";
      const variantLabel = [size.trim(), color.trim()].filter(Boolean).join(" / ") || "Standard";
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      onCreated({
        productId: result.id,
        variantId,
        name: result.name,
        variantLabel,
        sku: resolvedSku,
        purchasePrice: Number(purchasePrice),
      });
      toast.success("Product created successfully.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ADD NEW PRODUCT</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-product-name">Product Name *</Label>
              <Input
                id="quick-product-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-brand">Brand</Label>
              <Input
                id="quick-product-brand"
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-category">Category</Label>
              <div className="flex gap-2">
                <select
                  id="quick-product-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select Category</option>
                  {localCategories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Add category"
                  onClick={() => setCategoryDialogOpen(true)}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-subcategory">Subcategory</Label>
              <Input
                id="quick-product-subcategory"
                value={subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-sku">
                SKU {size || color ? "(auto-generated if blank)" : ""}
              </Label>
              <Input
                id="quick-product-sku"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-barcode">Barcode</Label>
              <Input
                id="quick-product-barcode"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-size">Size</Label>
              <Input
                id="quick-product-size"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                placeholder="32 / 34 / 36 / 38"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-color">Color</Label>
              <Input
                id="quick-product-color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                placeholder="Black"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-purchase">Purchase Price *</Label>
              <Input
                id="quick-product-purchase"
                type="number"
                min="0"
                step="0.01"
                required
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-selling">Selling Price *</Label>
              <Input
                id="quick-product-selling"
                type="number"
                min="0"
                step="0.01"
                required
                value={sellingPrice}
                onChange={(event) => setSellingPrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-mrp">MRP</Label>
              <Input
                id="quick-product-mrp"
                type="number"
                min="0"
                step="0.01"
                value={mrp}
                onChange={(event) => setMrp(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-gst">GST %</Label>
              <Input
                id="quick-product-gst"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={gstPercent}
                onChange={(event) => setGstPercent(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-minimum">Minimum Stock</Label>
              <Input
                id="quick-product-minimum"
                type="number"
                min="0"
                value={minimumStock}
                onChange={(event) => setMinimumStock(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-product-reorder">Reorder Level</Label>
              <Input
                id="quick-product-reorder"
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(event) => setReorderLevel(event.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-product-supplier">Supplier</Label>
              <div className="flex gap-2">
                <select
                  id="quick-product-supplier"
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select Supplier</option>
                  {localSuppliers.map((row) => (
                    <option key={row[0]} value={row[1]}>
                      {row[1]}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(true)}>
                  + Add Supplier
                </Button>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-product-description">Description</Label>
              <Input
                id="quick-product-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {size || color ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Variant SKU: {sku.trim() || generatedSku(name, size, color)} ·{" "}
                {[size, color].filter(Boolean).join(" / ")}
              </p>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "+ Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ADD CATEGORY</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveCategory}>
            <div className="space-y-2">
              <Label htmlFor="quick-category-name">Category Name *</Label>
              <Input
                id="quick-category-name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Category</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ADD SUPPLIER</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveSupplier}>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier-name">Supplier Name *</Label>
              <Input id="supplier-name" name="supplier-name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input id="supplier-phone" name="supplier-phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-whatsapp">WhatsApp</Label>
              <Input id="supplier-whatsapp" name="supplier-whatsapp" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input id="supplier-email" name="supplier-email" type="email" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier-address">Address</Label>
              <Input id="supplier-address" name="supplier-address" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier-gstin">GSTIN</Label>
              <Input id="supplier-gstin" name="supplier-gstin" />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">+ Create Supplier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
