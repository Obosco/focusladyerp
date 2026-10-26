import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addStock, adjustStock, getInventoryData } from "@/lib/sheets.functions";
import { toast } from "sonner";

const inventoryQuery = queryOptions({
  queryKey: ["erp", "inventory"],
  queryFn: () => getInventoryData(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/inventory/$view")({
  head: ({ params }) => ({
    meta: [{ title: `${params.view.replaceAll("-", " ")} — Focus Lady Bra ERP` }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(inventoryQuery),
  component: InventoryPage,
});

type StockRow = {
  productId: string;
  variantId: string;
  product: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  cost: number;
  price: number;
  reorder: number;
  supplier: string;
  category: string;
  brand: string;
  location: string;
};

const views = [
  { key: "stock", label: "Current Stock" },
  { key: "movements", label: "Stock Movements" },
  { key: "low-stock", label: "Low Stock" },
  { key: "add", label: "Add Stock" },
  { key: "adjust", label: "Stock Adjustment" },
] as const;

const currency = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function InventoryPage() {
  const { view } = Route.useParams();
  const { data } = useSuspenseQuery(inventoryQuery);
  const [search, setSearch] = useState("");
  const products = data.products.filter((row) => (row[0] ?? "").trim());
  const variants = data.variants.filter((row) => (row[0] ?? "").trim());
  const movementRows = data.movements.filter((row) => (row[0] ?? "").trim());
  const stockRows = useMemo(() => {
    const result: StockRow[] = [];
    const movementsByItem = new Map<string, string[][]>();
    for (const movement of movementRows) {
      const key = `${movement[2] ?? ""}|${movement[3] ?? ""}`;
      const itemMovements = movementsByItem.get(key);
      if (itemMovements) itemMovements.push(movement);
      else movementsByItem.set(key, [movement]);
    }
    for (const product of products) {
      const productId = product[0] ?? "";
      const productVariants = variants.filter((row) => row[1] === productId);
      const entries = productVariants.length ? productVariants : [undefined];
      for (const variant of entries) {
        const variantId = variant?.[0] ?? "";
        const itemMovements = movementsByItem.get(`${productId}|${variantId}`) ?? [];
        let quantity = Number(variant?.[11] ?? product[7] ?? 0);
        let cost = Number(variant?.[9] ?? product[8] ?? 0);
        for (const movement of itemMovements) {
          const delta = Number(movement[9] ?? 0);
          if (delta > 0 && quantity >= 0 && quantity + delta > 0) {
            cost = (quantity * cost + delta * Number(movement[17] ?? cost)) / (quantity + delta);
          }
          quantity += delta;
        }
        result.push({
          productId,
          variantId,
          product: product[1] ?? "",
          sku: variant?.[3] ?? "",
          size: variant?.[6] ?? "",
          color: variant?.[7] ?? "",
          quantity,
          cost,
          price: Number(variant?.[10] ?? product[9] ?? 0),
          reorder: Number(variant?.[12] ?? product[10] ?? 0),
          supplier: [...itemMovements].reverse().find((row) => row[14])?.[14] ?? "",
          category: product[2] ?? "",
          brand: product[3] ?? "",
          location: [...itemMovements].reverse().find((row) => row[16])?.[16] ?? "Main Store",
        });
      }
    }
    return result;
  }, [movementRows, products, variants]);

  const filteredRows = stockRows.filter((row) =>
    [row.product, row.sku, row.size, row.color, row.supplier]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const title = views.find((item) => item.key === view)?.label ?? "Current Stock";
  const currentView = views.some((item) => item.key === view) ? view : "stock";

  return (
    <ErpShell
      activeSlug="stock"
      title={title}
      subtitle="Variant-level stock with an append-only movement history"
    >
      <div className="space-y-5">
        <nav className="flex flex-wrap gap-2">
          {views.map((item) => (
            <Button
              key={item.key}
              variant={currentView === item.key ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link to="/inventory/$view" params={{ view: item.key }}>
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
        {currentView === "add" && (
          <StockForm
            products={products}
            variants={variants}
            suppliers={data.suppliers}
            rows={stockRows}
          />
        )}
        {currentView === "adjust" && (
          <AdjustmentForm products={products} variants={variants} rows={stockRows} />
        )}
        {currentView === "movements" && (
          <MovementTable rows={movementRows} search={search} setSearch={setSearch} />
        )}
        {(currentView === "stock" || currentView === "low-stock") && (
          <StockTable
            rows={filteredRows.filter(
              (row) => currentView !== "low-stock" || row.quantity <= row.reorder,
            )}
            search={search}
            setSearch={setSearch}
            lowStockOnly={currentView === "low-stock"}
          />
        )}
      </div>
    </ErpShell>
  );
}

function StockTable({
  rows,
  search,
  setSearch,
  lowStockOnly,
}: {
  rows: StockRow[];
  search: string;
  setSearch: (value: string) => void;
  lowStockOnly: boolean;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filterFields = [
    { key: "category", label: "Category" },
    { key: "brand", label: "Brand" },
    { key: "size", label: "Size" },
    { key: "color", label: "Color" },
    { key: "supplier", label: "Supplier" },
    { key: "location", label: "Location" },
  ] as const;
  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      !filters.status ||
      (filters.status === "In Stock" && row.quantity > row.reorder) ||
      (filters.status === "Low Stock" && row.quantity > 0 && row.quantity <= row.reorder) ||
      (filters.status === "Out of Stock" && row.quantity <= 0);
    return (
      matchesStatus && filterFields.every(({ key }) => !filters[key] || row[key] === filters[key])
    );
  });
  const optionsFor = (key: (typeof filterFields)[number]["key"]) =>
    [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">
          {lowStockOnly ? "Reorder required" : "Variant stock balances"}
        </CardTitle>
        <div className="flex gap-2">
          <Input
            aria-label="Search inventory"
            placeholder="Search product, SKU, size..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64"
          />
          <Button asChild size="sm">
            <Link to="/inventory/$view" params={{ view: "add" }}>
              + Add Stock
            </Link>
          </Button>
        </div>
      </CardHeader>
      <div className="flex flex-wrap gap-2 px-6 pb-3">
        <select
          aria-label="Filter by stock status"
          value={filters.status ?? ""}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All stock statuses</option>
          {["In Stock", "Low Stock", "Out of Stock"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        {filterFields.map(({ key, label }) => (
          <select
            key={key}
            aria-label={`Filter by ${label}`}
            value={filters[key] ?? ""}
            onChange={(event) =>
              setFilters((current) => ({ ...current, [key]: event.target.value }))
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All {label}</option>
            {optionsFor(key).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        ))}
      </div>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {[
                "Product",
                "SKU",
                "Category",
                "Brand",
                "Variant",
                "Current Stock",
                "Purchase Cost",
                "Stock Value",
                "Selling Price",
                "Potential Sales",
                "Reorder Level",
                "Supplier",
                "Location",
                "Status",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="px-3 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const status =
                row.quantity <= 0
                  ? "Out of stock"
                  : row.quantity <= row.reorder
                    ? "Low stock"
                    : "In stock";
              return (
                <tr key={`${row.productId}:${row.variantId}`} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{row.product}</td>
                  <td className="px-3 py-3">{row.sku || "—"}</td>
                  <td className="px-3 py-3">{row.category || "—"}</td>
                  <td className="px-3 py-3">{row.brand || "—"}</td>
                  <td className="px-3 py-3">
                    {[row.size, row.color].filter(Boolean).join(" / ") || "Standard"}
                  </td>
                  <td className="px-3 py-3">{row.quantity}</td>
                  <td className="px-3 py-3">{currency(row.cost)}</td>
                  <td className="px-3 py-3">{currency(row.cost * row.quantity)}</td>
                  <td className="px-3 py-3">{currency(row.price)}</td>
                  <td className="px-3 py-3">{currency(row.price * row.quantity)}</td>
                  <td className="px-3 py-3">{row.reorder}</td>
                  <td className="px-3 py-3">{row.supplier || "—"}</td>
                  <td className="px-3 py-3">{row.location}</td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.quantity <= 0
                          ? "text-destructive"
                          : row.quantity <= row.reorder
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Button variant="link" size="sm" asChild>
                      <Link to="/inventory/$view" params={{ view: "adjust" }}>
                        Adjust
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-10 text-center text-muted-foreground">
                  No inventory records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MovementTable({
  rows,
  search,
  setSearch,
}: {
  rows: string[][];
  search: string;
  setSearch: (value: string) => void;
}) {
  const filtered = [...rows]
    .reverse()
    .filter((row) => row.join(" ").toLowerCase().includes(search.toLowerCase()));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">Immutable stock movement history</CardTitle>
        <Input
          aria-label="Search stock movements"
          placeholder="Search movement history..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-64"
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {[
                "Date",
                "Product",
                "Variant",
                "Type",
                "Quantity",
                "Before",
                "After",
                "Reference",
                "User",
                "Notes",
              ].map((heading) => (
                <th key={heading} className="px-3 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row[0]} className="border-b last:border-0">
                <td className="px-3 py-3">{row[1]}</td>
                <td className="px-3 py-3">{row[4]}</td>
                <td className="px-3 py-3">
                  {[row[6], row[7]].filter(Boolean).join(" / ") || "Standard"}
                </td>
                <td className="px-3 py-3">{row[8]}</td>
                <td className="px-3 py-3">{Number(row[9]) > 0 ? `+${row[9]}` : row[9]}</td>
                <td className="px-3 py-3">{row[10]}</td>
                <td className="px-3 py-3">{row[11]}</td>
                <td className="px-3 py-3">{row[13] || row[12] || "—"}</td>
                <td className="px-3 py-3">{row[19] || "—"}</td>
                <td className="px-3 py-3">{row[18]}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                  No stock movements recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function StockForm({
  products,
  variants,
  suppliers,
  rows,
}: {
  products: string[][];
  variants: string[][];
  suppliers: string[][];
  rows: StockRow[];
}) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [supplier, setSupplier] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [location, setLocation] = useState("Main Store");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    before: number;
    added: number;
    after: number;
  } | null>(null);
  const queryClient = useQueryClient();
  const save = useServerFn(addStock);
  const productVariants = variants.filter((row) => row[1] === productId);
  const selected = rows.find((row) => row.productId === productId && row.variantId === variantId);
  const selectedProduct = products.find((row) => row[0] === productId);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await save({
        data: {
          productId,
          variantId,
          quantity: Number(quantity),
          purchasePrice: Number(purchasePrice),
          supplier,
          batchNumber,
          location,
          date,
          notes,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["erp", "inventory"] });
      setConfirmation({ before: result.before, added: Number(quantity), after: result.after });
      toast.success(`${quantity} units added successfully.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add stock.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-sm">Add Stock</CardTitle>
      </CardHeader>
      <CardContent>
        {confirmation && (
          <div
            role="status"
            className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700"
          >
            ✓ {confirmation.added} units added successfully. Previous: {confirmation.before} ·
            Added: {confirmation.added} · New stock: {confirmation.after}
          </div>
        )}
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="stock-product">Product</Label>
            <select
              id="stock-product"
              required
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setVariantId("");
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select product</option>
              {products.map((row) => (
                <option key={row[0]} value={row[0]}>
                  {row[1]}
                </option>
              ))}
            </select>
          </div>
          {productVariants.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="stock-variant">Variant</Label>
              <select
                id="stock-variant"
                required
                value={variantId}
                onChange={(event) => {
                  setVariantId(event.target.value);
                  const variant = productVariants.find((row) => row[0] === event.target.value);
                  if (variant) setPurchasePrice(variant[9] ?? "0");
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select size / color</option>
                {productVariants.map((row) => (
                  <option key={row[0]} value={row[0]}>
                    {[row[6], row[7], row[2]].filter(Boolean).join(" / ")}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">Quantity</Label>
            <Input
              id="stock-quantity"
              type="number"
              min="0.0001"
              step="any"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-cost">Purchase price</Label>
            <Input
              id="stock-cost"
              type="number"
              min="0"
              step="0.01"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Current stock</Label>
            <div className="rounded-md border px-3 py-2 text-sm">
              {selected?.quantity ?? (selectedProduct ? Number(selectedProduct[7] ?? 0) : 0)}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-supplier">Supplier</Label>
            <select
              id="stock-supplier"
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select supplier</option>
              {suppliers.map((row) => (
                <option key={row[0]} value={row[1]}>
                  {row[1]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-batch">Batch number</Label>
            <Input
              id="stock-batch"
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-location">Stock location</Label>
            <Input
              id="stock-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-date">Date</Label>
            <Input
              id="stock-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="stock-notes">Notes</Label>
            <Input
              id="stock-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/inventory/$view" params={{ view: "stock" }}>
                Cancel
              </Link>
            </Button>
            <Button type="submit" disabled={busy || !productId}>
              {busy ? "Saving..." : "+ Add Stock"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AdjustmentForm({
  products,
  variants,
  rows,
}: {
  products: string[][];
  variants: string[][];
  rows: StockRow[];
}) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [physicalStock, setPhysicalStock] = useState("");
  const [reason, setReason] = useState("Counting Error");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const save = useServerFn(adjustStock);
  const productVariants = variants.filter((row) => row[1] === productId);
  const current =
    rows.find((row) => row.productId === productId && row.variantId === variantId)?.quantity ?? 0;
  const difference = Number(physicalStock || 0) - current;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await save({
        data: { productId, variantId, physicalStock: Number(physicalStock), reason, notes },
      });
      await queryClient.invalidateQueries({ queryKey: ["erp", "inventory"] });
      toast.success(`Stock adjusted: ${result.before} → ${result.after}`);
      setPhysicalStock("");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not adjust stock.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-sm">Stock Adjustment</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="adjust-product">Product</Label>
            <select
              id="adjust-product"
              required
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setVariantId("");
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select product</option>
              {products.map((row) => (
                <option key={row[0]} value={row[0]}>
                  {row[1]}
                </option>
              ))}
            </select>
          </div>
          {productVariants.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="adjust-variant">Variant</Label>
              <select
                id="adjust-variant"
                required
                value={variantId}
                onChange={(event) => setVariantId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select size / color</option>
                {productVariants.map((row) => (
                  <option key={row[0]} value={row[0]}>
                    {[row[6], row[7], row[2]].filter(Boolean).join(" / ")}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label>System stock</Label>
            <div className="rounded-md border px-3 py-2 text-sm">{current}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="physical-stock">Physical stock</Label>
            <Input
              id="physical-stock"
              type="number"
              min="0"
              step="any"
              required
              value={physicalStock}
              onChange={(event) => setPhysicalStock(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Difference</Label>
            <div
              className={
                difference < 0
                  ? "rounded-md border px-3 py-2 text-sm text-destructive"
                  : "rounded-md border px-3 py-2 text-sm"
              }
            >
              {physicalStock ? `${difference > 0 ? "+" : ""}${difference}` : "—"}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <select
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {["Damaged", "Missing", "Counting Error", "Other"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="adjust-notes">Notes</Label>
            <Input
              id="adjust-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/inventory/$view" params={{ view: "stock" }}>
                Cancel
              </Link>
            </Button>
            <Button type="submit" disabled={busy || !productId || !physicalStock}>
              {busy ? "Saving..." : "Confirm Adjustment"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
