import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductQuickCreateDialog, type CreatedProduct } from "@/components/ProductQuickCreateDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addStock, addSupplier, adjustStock, getInventoryData } from "@/lib/sheets.functions";
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
            categories={data.categories.map((row) => row[1]).filter(Boolean)}
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
  categories,
  rows,
}: {
  products: string[][];
  variants: string[][];
  suppliers: string[][];
  categories: string[];
  rows: StockRow[];
}) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [newProducts, setNewProducts] = useState<string[][]>([]);
  const [newVariants, setNewVariants] = useState<string[][]>([]);
  const [quantity, setQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [supplier, setSupplier] = useState("");
  const [localSuppliers, setLocalSuppliers] = useState(suppliers);
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
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
  const saveSupplier = useServerFn(addSupplier);
  const allProducts = [...products, ...newProducts];
  const allVariants = [...variants, ...newVariants];
  const productVariants = allVariants.filter((row) => row[1] === productId);
  const selected = rows.find((row) => row.productId === productId && row.variantId === variantId);
  const selectedProduct = allProducts.find((row) => row[0] === productId);
  const searchTerm = productSearch.trim().toLowerCase();
  const searchResults: Array<{ product: string[]; variant?: string[] }> = allProducts.flatMap(
    (product): Array<{ product: string[]; variant?: string[] }> => {
      const productMatches = [product[1], product[2], product[3], product[6], product[12]].some(
        (value) => String(value ?? "").toLowerCase().includes(searchTerm),
      );
      if (productMatches) return [{ product }];

      return allVariants
        .filter(
          (variant) =>
            variant[1] === product[0] &&
            [variant[2], variant[3], variant[4], variant[6], variant[7]].some((value) =>
              String(value ?? "").toLowerCase().includes(searchTerm),
            ),
        )
        .map((variant) => ({ product, variant }));
    },
  ).slice(0, 8);
  const currentStock =
    selected?.quantity ?? (selectedProduct ? Number(selectedProduct[7] ?? 0) : 0);
  const addingQuantity = Number(quantity) || 0;

  const selectProduct = (id: string, selectedVariantId = "") => {
    const product = allProducts.find((row) => row[0] === id);
    const variant = allVariants.find((row) => row[0] === selectedVariantId);
    setProductId(id);
    setVariantId(selectedVariantId);
    setProductSearch(product?.[1] ?? "");
    setProductPickerOpen(false);
    if (variant) setPurchasePrice(variant[9] ?? "0");
    else if (product) setPurchasePrice(product[8] ?? "0");
  };

  const onCreated = (created: CreatedProduct) => {
    const productRow = [
      created.productId, created.name, "", "", "", "pcs", "", "0",
      String(created.purchasePrice), "0", "0", "Active", created.sku,
    ];
    setNewProducts((current) => [...current, productRow]);
    if (created.variantId) {
      const [size = "", color = ""] = created.variantLabel.split(" / ");
      setNewVariants((current) => [...current, [
        created.variantId, created.productId, created.variantLabel, created.sku, "",
        "CODE128", size, color, "", String(created.purchasePrice), "0", "0", "0",
        "pcs", "Active",
      ]]);
    }
    setProductId(created.productId);
    setVariantId(created.variantId);
    setProductSearch(created.name);
    setProductPickerOpen(false);
    setPurchasePrice(String(created.purchasePrice));
  };

  const submitSupplier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("stock-supplier-name") ?? ""),
      phone: String(form.get("stock-supplier-phone") ?? ""),
      whatsapp: String(form.get("stock-supplier-whatsapp") ?? ""),
      email: String(form.get("stock-supplier-email") ?? ""),
      address: String(form.get("stock-supplier-address") ?? ""),
      gstin: String(form.get("stock-supplier-gstin") ?? ""),
    };
    try {
      const result = await saveSupplier({ data: payload });
      setLocalSuppliers((current) => [
        ...current,
        [result.id, result.name, payload.phone, payload.address, "", "", payload.gstin, "", "", payload.whatsapp, payload.email],
      ]);
      setSupplier(result.name);
      setCreateSupplierOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      toast.success("Supplier created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create supplier.");
    }
  };

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
    <>
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
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="stock-product-search">Product</Label>
            <div className="flex gap-2">
              <Input
                id="stock-product-search"
                role="combobox"
                aria-expanded={productPickerOpen}
                aria-controls="stock-product-options"
                aria-autocomplete="list"
                placeholder="Search product, SKU or barcode..."
                required={!productId}
                value={productSearch}
                onFocus={() => setProductPickerOpen(true)}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductId("");
                  setVariantId("");
                  setProductPickerOpen(true);
                }}
              />
              <Button type="button" onClick={() => setCreateProductOpen(true)}>
                + Add New Product
              </Button>
            </div>
            {productPickerOpen && (
              <div id="stock-product-options" role="listbox" className="max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-sm">
                {searchResults.length ? searchResults.map(({ product, variant }) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={product[0] === productId && (!variant || variant[0] === variantId)}
                    key={`${product[0]}-${variant?.[0] ?? "product"}`}
                    onClick={() => selectProduct(product[0] ?? "", variant?.[0] ?? "")}
                    className="flex w-full flex-col rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">
                      {product[1]}{variant ? ` · ${[variant[6], variant[7], variant[2]].filter(Boolean).join(" / ")}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        (variant?.[3] ?? product[12]) && `SKU ${variant?.[3] ?? product[12]}`,
                        (variant?.[4] ?? product[6]) && `Barcode ${variant?.[4] ?? product[6]}`,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                )) : (
                  <div className="flex items-center justify-between gap-2 px-3 py-3 text-sm">
                    <span>No product found</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCreateProductOpen(true)}>
                      + Add New Product
                    </Button>
                  </div>
                )}
              </div>
            )}
            {productId && selectedProduct && <p className="text-xs text-muted-foreground">Selected: {selectedProduct[1]}</p>}
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
              {currentStock}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-supplier">Supplier</Label>
            <div className="flex gap-2">
              <select
                id="stock-supplier"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select supplier</option>
                {localSuppliers.map((row) => <option key={row[0]} value={row[1]}>{row[1]}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={() => setCreateSupplierOpen(true)}>+ Add Supplier</Button>
            </div>
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
          <div className="rounded-md border bg-muted/20 p-3 text-sm md:col-span-2">
            Previous Stock: <strong>{currentStock}</strong>
            <span className="mx-2 text-muted-foreground">·</span>
            Adding: <strong>+{addingQuantity}</strong>
            <span className="mx-2 text-muted-foreground">·</span>
            New Stock: <strong>{currentStock + addingQuantity}</strong>
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
    <ProductQuickCreateDialog
      open={createProductOpen}
      onOpenChange={setCreateProductOpen}
      suppliers={localSuppliers}
      categories={categories}
      onCreated={onCreated}
    />
    <Dialog open={createSupplierOpen} onOpenChange={setCreateSupplierOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>ADD SUPPLIER</DialogTitle></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitSupplier}>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="stock-supplier-name">Supplier Name *</Label><Input id="stock-supplier-name" name="stock-supplier-name" required /></div>
          <div className="space-y-2"><Label htmlFor="stock-supplier-phone">Phone</Label><Input id="stock-supplier-phone" name="stock-supplier-phone" /></div>
          <div className="space-y-2"><Label htmlFor="stock-supplier-whatsapp">WhatsApp</Label><Input id="stock-supplier-whatsapp" name="stock-supplier-whatsapp" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="stock-supplier-email">Email</Label><Input id="stock-supplier-email" name="stock-supplier-email" type="email" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="stock-supplier-address">Address</Label><Input id="stock-supplier-address" name="stock-supplier-address" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="stock-supplier-gstin">GSTIN</Label><Input id="stock-supplier-gstin" name="stock-supplier-gstin" /></div>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => setCreateSupplierOpen(false)}>Cancel</Button><Button type="submit">+ Create Supplier</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
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
