import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ErpShell } from "@/components/ErpShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCustomer,
  createInvoice,
  getErpSettings,
  getNextInvoiceNumber,
  getSheetsBatch,
  updateStockLevel,
} from "@/lib/sheets.functions";
import { toast } from "sonner";

type CatalogItem = {
  product: string;
  variant: string;
  sku: string;
  barcode: string;
  price: number;
  stock: number;
  warehouse: string;
  productId: string;
  category: string;
  brand: string;
};

type CartItem = CatalogItem & {
  qty: number;
  itemDiscount: number;
  gstPercent: number;
  note?: string;
};

const money = (value: number) =>
  value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toNum = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const productQuery = {
  queryKey: ["erp", "pos-masters"],
  queryFn: () =>
    getSheetsBatch({
      data: {
        ranges: [
          "Products!A2:Q2000",
          "Product Variants!A2:Q2000",
          "Customers!A2:T5000",
          "Sales!A2:A2000",
          "Settings!A2:B50",
        ],
      },
    }),
  staleTime: 15_000,
};

function parseCatalog(productRows: string[][], variantRows: string[][]): CatalogItem[] {
  const productMap = new Map<string, { name: string; category: string; brand: string; price: number; barcode: string; stock: number }>();

  for (const row of productRows) {
    const productName = String(row[1] ?? "").trim();
    if (!productName) continue;
    productMap.set(String(row[0] ?? "").trim() || productName, {
      name: productName,
      category: String(row[2] ?? "").trim(),
      brand: String(row[3] ?? "").trim(),
      price: toNum(row[9]),
      barcode: String(row[6] ?? "").trim(),
      stock: toNum(row[7]),
    });
  }

  const entries: CatalogItem[] = [];

  for (const row of productRows) {
    const productName = String(row[1] ?? "").trim();
    if (!productName) continue;
    const productId = String(row[0] ?? "").trim() || productName;
    const productInfo = productMap.get(productId) ?? {
      name: productName,
      category: String(row[2] ?? "").trim(),
      brand: String(row[3] ?? "").trim(),
      price: toNum(row[9]),
      barcode: String(row[6] ?? "").trim(),
      stock: toNum(row[7]),
    };
    entries.push({
      product: productInfo.name,
      variant: "Default",
      sku: productId,
      barcode: productInfo.barcode,
      price: productInfo.price,
      stock: productInfo.stock,
      warehouse: "Main Store",
      productId,
      category: productInfo.category,
      brand: productInfo.brand,
    });
  }

  for (const row of variantRows) {
    const variantName = String(row[2] ?? "").trim();
    const variantSku = String(row[3] ?? "").trim();
    const variantBarcode = String(row[4] ?? "").trim();
    if (!variantName && !variantSku && !variantBarcode) continue;

    const productId = String(row[1] ?? "").trim();
    const source = productMap.get(productId) ?? {
      name: String(row[2] ?? "").trim() || "Variant Product",
      category: "",
      brand: "",
      price: toNum(row[10]),
      barcode: "",
      stock: toNum(row[11]),
    };

    entries.push({
      product: source.name,
      variant: variantName || "Variant",
      sku: variantSku || `${source.name}-${variantName}`,
      barcode: variantBarcode || source.barcode,
      price: toNum(row[10]) || source.price,
      stock: toNum(row[11]) || source.stock,
      warehouse: "Main Store",
      productId,
      category: source.category,
      brand: source.brand,
    });
  }

  return entries;
}

function findCatalogMatch(catalog: CatalogItem[], value: string): CatalogItem | null {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    catalog.find((item) => {
      const targets = [
        item.product,
        item.variant,
        item.sku,
        item.barcode,
        item.product.toLowerCase(),
        item.variant.toLowerCase(),
        item.sku.toLowerCase(),
        item.barcode.toLowerCase(),
      ];
      return targets.some((target) => target.includes(needle));
    }) ?? null
  );
}

function PosPage() {
  const queryClient = useQueryClient();
  const { data: payload } = useQuery(productQuery);
  const { data: settings } = useQuery({
    queryKey: ["erp", "settings"],
    queryFn: () => getErpSettings(),
    staleTime: 30_000,
  });

  const saveInvoice = useServerFn(createInvoice);
  const nextInvoice = useServerFn(getNextInvoiceNumber);
  const saveCustomer = useServerFn(addCustomer);
  const stockUpdate = useServerFn(updateStockLevel);

  const productRows = (payload?.valueRanges?.[0]?.values ?? []) as string[][];
  const variantRows = (payload?.valueRanges?.[1]?.values ?? []) as string[][];
  const customerRows = (payload?.valueRanges?.[2]?.values ?? []) as string[][];
  const salesRows = (payload?.valueRanges?.[3]?.values ?? []) as string[][];

  const catalog = useMemo(
    () => parseCatalog(productRows, variantRows),
    [productRows, variantRows],
  );

  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paidAmount, setPaidAmount] = useState(0);
  const [discountMode, setDiscountMode] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const allowNegativeStock = Boolean(settings?.allowNegativeStock ?? false);
  const taxPercent = Number(settings?.defaultGstPercent ?? 0);

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartDiscount =
    discountMode === "percentage"
      ? (cartSubtotal * discountValue) / 100
      : Math.min(discountValue, cartSubtotal);
  const cartTax = ((cartSubtotal - cartDiscount) * taxPercent) / 100;
  const total = Math.max(cartSubtotal - cartDiscount + cartTax, 0);

  const addToCart = (item: CatalogItem, qty = 1) => {
    const cleanQty = Number(qty) || 1;
    if (!item || cleanQty <= 0) return;

    setCart((current) => {
      const match = current.find(
        (entry) =>
          entry.product === item.product &&
          entry.variant === item.variant &&
          entry.barcode === item.barcode,
      );

      if (match) {
        return current.map((entry) =>
          entry.product === item.product &&
          entry.variant === item.variant &&
          entry.barcode === item.barcode
            ? { ...entry, qty: entry.qty + cleanQty }
            : entry,
        );
      }

      return [
        ...current,
        {
          ...item,
          qty: cleanQty,
          itemDiscount: 0,
          gstPercent: taxPercent,
        },
      ];
    });
  };

  const handleBarcodeScan = (value: string) => {
    const match = findCatalogMatch(catalog, value);
    if (!match) {
      toast.error("Product not found.");
      return;
    }
    addToCart(match, 1);
    setBarcodeInput(value);
    setSearchText("");
    toast.success(`${match.product} added to cart.`);
  };

  const updateItemQty = (index: number, delta: number) => {
    setCart((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, qty: Math.max(0, item.qty + delta) }
          : item,
      ).filter((item) => item.qty > 0),
    );
  };

  const updateItemDiscount = (index: number, value: number) => {
    setCart((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, itemDiscount: Math.max(0, value) } : item,
      ),
    );
  };

  const filteredCatalog = catalog.filter((item) => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return true;
    return [item.product, item.variant, item.sku, item.barcode]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const validateStock = () => {
    if (!cart.length) throw new Error("Add at least one product to the cart.");

    for (const item of cart) {
      const available = item.stock;
      if (!allowNegativeStock && item.qty > available) {
        throw new Error(
          `Insufficient stock for ${item.product}${item.variant !== "Default" ? ` (${item.variant})` : ""}. Available: ${available}. Requested: ${item.qty}.`,
        );
      }
    }
  };

  const handleSubmitSale = async () => {
    try {
      setBusy(true);
      validateStock();

      const finalCustomer = customerName.trim() || "Walk-in Customer";
      const invoiceDate = new Date().toISOString().slice(0, 10);
      const invoiceNumber = await nextInvoice({ data: { date: invoiceDate } });

      const customerRecord = customerRows.find(
        (row) =>
          String(row[1] ?? "").trim().toLowerCase() === finalCustomer.trim().toLowerCase() ||
          String(row[2] ?? "").replace(/\D/g, "") === customerPhone.replace(/\D/g, ""),
      );

      if (finalCustomer !== "Walk-in Customer" && !customerRecord) {
        await saveCustomer({
          data: {
            name: finalCustomer,
            phone: customerPhone,
            address: customerAddress,
            city: customerCity,
            state: customerState,
          },
        });
      }

      const orderDiscount = Math.min(
        discountMode === "percentage"
          ? (cartSubtotal * discountValue) / 100
          : discountValue,
        cartSubtotal,
      );

      const invoicePayload = {
        invoice: invoiceNumber.invoice,
        date: invoiceDate,
        customer: finalCustomer,
        customerPhone,
        customerAddress,
        customerCity,
        customerState,
        items: cart.map((item) => ({
          product: item.product,
          qty: item.qty,
          rate: item.price,
          gstPercent: item.gstPercent,
          size: item.variant !== "Default" ? item.variant : "",
          color: "",
        })),
        gstPercent: taxPercent,
        discount: orderDiscount,
        paid: paidAmount,
        paymentMode,
        notes,
      };

      await saveInvoice({ data: invoicePayload });

      for (const item of cart) {
        await stockUpdate({
          data: {
            barcode: item.barcode,
            product: item.product,
            variant: item.variant !== "Default" ? item.variant : "",
            sku: item.sku,
            warehouse: item.warehouse,
            movementType: "Stock Out",
            quantity: item.qty,
            reason: "Sale",
            notes: `POS invoice ${invoicePayload.invoice}`,
          },
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      setCart([]);
      setBarcodeInput("");
      setSearchText("");
      setPaidAmount(0);
      setDiscountValue(0);
      setNotes("");
      toast.success(`Sale completed: ${invoicePayload.invoice}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sale could not be completed.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ErpShell activeSlug="pos" title="POS" subtitle="Quick sale counter for barcode and SKU sales">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quick sale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarcodeScanner
              value={barcodeInput}
              onChange={setBarcodeInput}
              onScan={handleBarcodeScan}
              loading={busy}
            />

            <div className="space-y-2">
              <Label htmlFor="search-products">Product or SKU search</Label>
              <Input
                id="search-products"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by product, variant, barcode or SKU"
              />
            </div>

            <div className="grid gap-2 max-h-[260px] overflow-auto pr-1">
              {filteredCatalog.slice(0, 12).map((item) => (
                <div key={`${item.product}-${item.variant}-${item.barcode}`} className="flex items-center justify-between rounded-md border border-border p-2">
                  <div>
                    <div className="font-medium">{item.product}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.variant !== "Default" ? `${item.variant} • ` : ""}
                      {item.sku} • {item.barcode || "No barcode"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs">
                      <div>₹{money(item.price)}</div>
                      <div className="text-muted-foreground">Stock: {item.stock}</div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => addToCart(item, 1)}>
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cart & payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone" />
                <Input value={customerCity} onChange={(event) => setCustomerCity(event.target.value)} placeholder="City" />
                <Input value={customerState} onChange={(event) => setCustomerState(event.target.value)} placeholder="State" className="sm:col-span-2" />
                <Input value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} placeholder="Address" className="sm:col-span-2" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={paymentMode}
                  onChange={(event) => setPaymentMode(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit', 'Other'].map((mode) => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
                <Input value={String(paidAmount)} onChange={(event) => setPaidAmount(Number(event.target.value) || 0)} type="number" placeholder="Paid" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Discount</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={discountMode}
                  onChange={(event) => setDiscountMode(event.target.value as "percentage" | "fixed")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
                <Input value={String(discountValue)} onChange={(event) => setDiscountValue(Number(event.target.value) || 0)} type="number" placeholder="Discount value" />
              </div>
            </div>

            <div className="space-y-3">
              {cart.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Cart is empty.
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={`${item.product}-${item.variant}-${item.barcode}-${index}`} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{item.product}</div>
                        <div className="text-xs text-muted-foreground">{item.variant !== "Default" ? item.variant : "Regular"}</div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCart((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        Remove
                      </Button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <div>₹{money(item.price)}</div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => updateItemQty(index, -1)}>-</Button>
                        <span>{item.qty}</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => updateItemQty(index, 1)}>+</Button>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        value={String(item.itemDiscount)}
                        type="number"
                        onChange={(event) => updateItemDiscount(index, Number(event.target.value) || 0)}
                        placeholder="Item discount"
                      />
                      <div className="flex items-center justify-end text-xs text-muted-foreground">
                        Line total: ₹{money((item.price * item.qty) - item.itemDiscount)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{money(cartSubtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-₹{money(cartDiscount)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>₹{money(cartTax)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>₹{money(total)}</span></div>
              <div className="flex justify-between"><span>Balance</span><span>₹{money(Math.max(total - paidAmount, 0))}</span></div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Sale notes" />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCart([])}>
                Clear cart
              </Button>
              <Button type="button" className="flex-1" onClick={handleSubmitSale} disabled={busy || cart.length === 0}>
                {busy ? "Processing..." : "Complete Sale"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpShell>
  );
}

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS — Focus Lady Bra ERP" }] }),
  component: PosPage,
});
