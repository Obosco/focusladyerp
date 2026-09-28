import { useMemo, useState, type FormEvent } from "react";
import { BarcodeInput } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Trash2 } from "lucide-react";
import type { DealerOrderInput } from "@/lib/sheets.functions";

export type DealerOption = { id: string; name: string; phone: string; address: string; city: string; district: string; pinCode: string };
export type DealerCatalogItem = { productId: string; productName: string; sku: string; barcode: string; size: string; cupSize: string; color: string; unitPrice: number; availableStock: number };
type DealerCartLine = DealerCatalogItem & { qty: number; discount: number };

const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DealerOrderComposer({
  dealers,
  catalog,
  defaultDealerId = "",
  defaultDelivery,
  taxPercent = 0,
  canBackorder = false,
  showStock = true,
  onAddDealer,
  onSubmit,
  submitting = false,
  submitLabel = "Review order",
}: {
  dealers: DealerOption[];
  catalog: DealerCatalogItem[];
  defaultDealerId?: string;
  defaultDelivery?: Partial<DealerOption>;
  taxPercent?: number;
  canBackorder?: boolean;
  showStock?: boolean;
  onAddDealer?: (dealer: Pick<DealerOption, "name" | "phone" | "address" | "city" | "district">) => Promise<DealerOption>;
  onSubmit: (input: DealerOrderInput) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const [dealerId, setDealerId] = useState(defaultDealerId);
  const [lines, setLines] = useState<DealerCartLine[]>([]);
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState(defaultDelivery?.address ?? "");
  const [city, setCity] = useState(defaultDelivery?.city ?? "");
  const [district, setDistrict] = useState(defaultDelivery?.district ?? "");
  const [pinCode, setPinCode] = useState(defaultDelivery?.pinCode ?? "");
  const [requiredDate, setRequiredDate] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DealerOrderInput["deliveryMethod"]>("Normal");
  const [paymentMethod, setPaymentMethod] = useState<DealerOrderInput["paymentMethod"]>("Credit");
  const [paymentReference, setPaymentReference] = useState("");
  const [advance, setAdvance] = useState(0);
  const [notes, setNotes] = useState("");
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addDealerOpen, setAddDealerOpen] = useState(false);
  const [dealerDraft, setDealerDraft] = useState({ name: "", phone: "", address: "", city: "", district: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const selectedDealer = dealers.find((dealer) => dealer.id === dealerId);
  const subtotal = lines.reduce((total, line) => total + line.unitPrice * line.qty, 0);
  const discount = lines.reduce((total, line) => total + line.discount, 0);
  const tax = Math.max(subtotal - discount, 0) * taxPercent / 100;
  const grandTotal = Math.max(subtotal - discount + tax, 0);
  const totalQuantity = lines.reduce((total, line) => total + line.qty, 0);
  const shortageCount = lines.filter((line) => line.qty > line.availableStock).length;
  const filteredCatalog = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return catalog.slice(0, 10);
    return catalog.filter((item) => `${item.productName} ${item.sku} ${item.barcode} ${item.size} ${item.cupSize} ${item.color}`.toLowerCase().includes(needle)).slice(0, 20);
  }, [catalog, search]);

  function addItem(item: DealerCatalogItem) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === item.productId && line.sku === item.sku);
      return existing ? current.map((line) => line === existing ? { ...line, qty: line.qty + 1 } : line) : [...current, { ...item, qty: 1, discount: 0 }];
    });
    setSearch("");
    setBarcode("");
  }

  function findBarcode(value: string) {
    const normalized = value.trim().toLowerCase();
    const match = catalog.find((item) => item.barcode.toLowerCase() === normalized || item.sku.toLowerCase() === normalized);
    if (!match) { setErrorMessage("No existing product or variant matches that barcode/SKU."); return; }
    setErrorMessage("");
    addItem(match);
  }

  function updateLine(index: number, key: "qty" | "discount" | "cupSize", value: number | string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: key === "cupSize" ? String(value) : Math.max(0, Number(value) || 0) } : line));
  }

  async function createDealer() {
    if (!onAddDealer || !dealerDraft.name.trim()) return;
    try {
      const dealer = await onAddDealer(dealerDraft);
      setDealerId(dealer.id);
      setDeliveryAddress(dealer.address);
      setCity(dealer.city);
      setDistrict(dealer.district);
      setAddDealerOpen(false);
      setDealerDraft({ name: "", phone: "", address: "", city: "", district: "" });
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Dealer could not be created."); }
  }

  function requestConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!selectedDealer) return setErrorMessage("Select a dealer before continuing.");
    if (!lines.length) return setErrorMessage("Add at least one product.");
    if (!deliveryAddress.trim() || !city.trim() || !district.trim() || !/^\d{4,10}$/.test(pinCode.trim())) return setErrorMessage("Complete the delivery address, city, district, and valid PIN code.");
    if (!requiredDate) return setErrorMessage("Choose a required delivery date.");
    if (showStock && !canBackorder && shortageCount) return setErrorMessage("Reduce quantities to the available stock before submitting.");
    if (advance > grandTotal) return setErrorMessage("Advance payment cannot exceed the order total.");
    setConfirmOpen(true);
  }

  async function submitConfirmed() {
    if (!selectedDealer) return;
    try {
      await onSubmit({
        dealerId: selectedDealer.id,
        dealerName: selectedDealer.name,
        items: lines.map(({ productId, productName, sku, barcode, size, cupSize, color, qty, unitPrice, discount }) => ({ productId, productName, sku, barcode, size, cupSize, color, qty, unitPrice, discount })),
        address: deliveryAddress.trim(), city: city.trim(), district: district.trim(), pinCode: pinCode.trim(),
        requiredDeliveryDate: requiredDate, deliveryMethod, paymentMethod, paymentReference: paymentReference.trim(),
        advance, notes: notes.trim(), confirmed: true, allowBackorder: canBackorder && allowBackorder,
      });
      setConfirmOpen(false);
    } catch (error) {
      setConfirmOpen(false);
      setErrorMessage(error instanceof Error ? error.message : "Order could not be submitted.");
    }
  }

  return <>
    <form onSubmit={requestConfirmation} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-5">
        <section className="space-y-3 border-b border-border pb-5">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Dealer</h2>{onAddDealer ? <Button type="button" variant="outline" size="sm" onClick={() => setAddDealerOpen((value) => !value)}><Plus className="mr-2 h-4 w-4" />Add dealer</Button> : null}</div>
          <select value={dealerId} onChange={(event) => { const value = event.target.value; const dealer = dealers.find((entry) => entry.id === value); setDealerId(value); if (dealer) { setDeliveryAddress(dealer.address); setCity(dealer.city); setDistrict(dealer.district); setPinCode(dealer.pinCode); } }} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" required aria-label="Select dealer">
            <option value="">Select existing dealer</option>{dealers.map((dealer) => <option value={dealer.id} key={dealer.id}>{dealer.name}{dealer.phone ? ` · ${dealer.phone}` : ""}</option>)}
          </select>
          {addDealerOpen && onAddDealer ? <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"><Input placeholder="Dealer name *" value={dealerDraft.name} onChange={(event) => setDealerDraft({ ...dealerDraft, name: event.target.value })} /><Input placeholder="Phone" value={dealerDraft.phone} onChange={(event) => setDealerDraft({ ...dealerDraft, phone: event.target.value })} /><Input className="sm:col-span-2" placeholder="Address" value={dealerDraft.address} onChange={(event) => setDealerDraft({ ...dealerDraft, address: event.target.value })} /><Input placeholder="City" value={dealerDraft.city} onChange={(event) => setDealerDraft({ ...dealerDraft, city: event.target.value })} /><Input placeholder="District" value={dealerDraft.district} onChange={(event) => setDealerDraft({ ...dealerDraft, district: event.target.value })} /><Button type="button" onClick={() => void createDealer()} disabled={!dealerDraft.name.trim()}>Save wholesale dealer</Button></div> : null}
        </section>

        <section className="space-y-3 border-b border-border pb-5">
          <h2 className="font-semibold">Add products</h2>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, size or color" aria-label="Search dealer products" /></div>
            <BarcodeInput value={barcode} onChange={setBarcode} onScan={findBarcode} placeholder="Scan / enter barcode or SKU" label="Barcode scan" />
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {filteredCatalog.map((item, index) => <button type="button" key={`${item.productId}-${item.sku}-${index}`} onClick={() => addItem(item)} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border p-3 text-left hover:bg-muted/40"><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.productName}</span><span className="block truncate text-xs text-muted-foreground">{item.sku || "No SKU"} · {[item.size, item.cupSize, item.color].filter(Boolean).join(" / ") || "Standard"}</span></span><span className="shrink-0 text-right"><span className="block text-sm font-semibold">{money(item.unitPrice)}</span>{showStock ? <span className="block text-xs text-muted-foreground">Stock {item.availableStock}</span> : null}</span></button>)}
            {!filteredCatalog.length ? <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No matching products in the ERP catalog.</p> : null}
          </div>
        </section>

        <section className="space-y-3 border-b border-border pb-5">
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Order items</h2><span className="text-xs text-muted-foreground">{lines.length} products · {totalQuantity} units</span></div>
          {!lines.length ? <div className="rounded-md border border-dashed border-border p-7 text-center text-sm text-muted-foreground">Search or scan a product to start the order.</div> : <>
            <div className="hidden overflow-x-auto rounded-md border border-border md:block"><table className="w-full min-w-225 text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["Product", "SKU / Barcode", "Size", "Cup", "Color", "Qty", ...(showStock ? ["Stock / Short"] : []), "Unit Price", "Discount", "Total", ""].map((title) => <th className="px-2 py-2" key={title}>{title}</th>)}</tr></thead><tbody>{lines.map((line, index) => { const shortage = Math.max(0, line.qty - line.availableStock); return <tr key={`${line.productId}-${line.sku}-${index}`} className="border-t border-border"><td className="max-w-36 px-2 py-2 font-medium">{line.productName}</td><td className="px-2 py-2">{line.sku || line.barcode || "—"}</td><td className="px-2 py-2">{line.size || "—"}</td><td className="px-2 py-2"><Input value={line.cupSize} onChange={(event) => updateLine(index, "cupSize", event.target.value)} className="h-9 w-20" aria-label={`Cup size for ${line.productName}`} /></td><td className="px-2 py-2">{line.color || "—"}</td><td className="px-2 py-2"><Input type="number" min="1" value={line.qty} onChange={(event) => updateLine(index, "qty", Number(event.target.value))} className="h-9 w-20" aria-label={`Quantity for ${line.productName}`} /></td>{showStock ? <td className={`px-2 py-2 text-xs ${shortage ? "text-destructive" : "text-muted-foreground"}`}>{line.availableStock} available{shortage ? ` · short ${shortage}` : ""}</td> : null}<td className="px-2 py-2">{money(line.unitPrice)}</td><td className="px-2 py-2"><Input type="number" min="0" max={line.unitPrice * line.qty} value={line.discount} onChange={(event) => updateLine(index, "discount", Number(event.target.value))} className="h-9 w-24" aria-label={`Discount for ${line.productName}`} /></td><td className="px-2 py-2 font-medium">{money(Math.max(line.qty * line.unitPrice - line.discount, 0))}</td><td className="px-2 py-2"><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${line.productName}`} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button></td></tr>; })}</tbody></table></div>
            <div className="grid gap-2 md:hidden">{lines.map((line, index) => { const shortage = line.qty > line.availableStock; return <div key={`${line.productId}-${line.sku}-${index}`} className="rounded-md border border-border p-3"><div className="flex justify-between gap-2"><div><div className="font-medium">{line.productName}</div><div className="text-xs text-muted-foreground">{[line.sku, line.size, line.cupSize, line.color].filter(Boolean).join(" · ")}</div></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${line.productName}`} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">Qty<Input type="number" min="1" value={line.qty} onChange={(event) => updateLine(index, "qty", Number(event.target.value))} className="mt-1 h-9" /></label><label className="text-xs text-muted-foreground">Cup size<Input value={line.cupSize} onChange={(event) => updateLine(index, "cupSize", event.target.value)} className="mt-1 h-9" /></label><label className="text-xs text-muted-foreground">Price<Input type="number" value={line.unitPrice} readOnly className="mt-1 h-9" /></label><label className="text-xs text-muted-foreground">Discount<Input type="number" min="0" value={line.discount} onChange={(event) => updateLine(index, "discount", Number(event.target.value))} className="mt-1 h-9" /></label></div><div className="mt-2 flex justify-between text-xs"><span className={showStock && shortage ? "text-destructive" : "text-muted-foreground"}>{showStock ? `Available ${line.availableStock} · Requested ${line.qty}${shortage ? ` · Short ${line.qty - line.availableStock}` : ""}` : "Stock is checked when you submit"}</span><strong>{money(Math.max(line.qty * line.unitPrice - line.discount, 0))}</strong></div></div>; })}</div>
          </>}
          {showStock && shortageCount ? <p className="text-sm text-destructive">{shortageCount} product line(s) exceed available stock. Shortages are rechecked when submitted.</p> : null}
          {canBackorder ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowBackorder} onChange={(event) => setAllowBackorder(event.target.checked)} />Allow backorder for this order</label> : null}
        </section>

        <section className="space-y-3 border-b border-border pb-5">
          <h2 className="font-semibold">Delivery</h2>
          <div className="grid gap-2 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="dealer-address">Delivery address *</Label><Input id="dealer-address" required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} /></div><div><Label htmlFor="dealer-city">City *</Label><Input id="dealer-city" required value={city} onChange={(event) => setCity(event.target.value)} /></div><div><Label htmlFor="dealer-district">District *</Label><Input id="dealer-district" required value={district} onChange={(event) => setDistrict(event.target.value)} /></div><div><Label htmlFor="dealer-pin">PIN code *</Label><Input id="dealer-pin" required inputMode="numeric" value={pinCode} onChange={(event) => setPinCode(event.target.value)} /></div><div><Label htmlFor="dealer-date">Required date *</Label><Input id="dealer-date" required type="date" value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} /></div><div><Label htmlFor="dealer-delivery">Delivery method</Label><select id="dealer-delivery" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as DealerOrderInput["deliveryMethod"])} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>Normal</option><option>Urgent</option><option>Warehouse Pickup</option></select></div></div>
        </section>

        <section className="space-y-3"><h2 className="font-semibold">Payment & notes</h2><div className="grid gap-2 sm:grid-cols-2"><div><Label htmlFor="dealer-payment">Payment method</Label><select id="dealer-payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as DealerOrderInput["paymentMethod"])} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{["Cash", "UPI", "Bank Transfer", "Credit", "Advance"].map((method) => <option key={method}>{method}</option>)}</select></div><div><Label htmlFor="dealer-advance">Advance received</Label><Input id="dealer-advance" type="number" min="0" max={grandTotal} value={advance} onChange={(event) => setAdvance(Number(event.target.value) || 0)} /></div><div className="sm:col-span-2"><Label htmlFor="dealer-payment-ref">Payment reference</Label><Input id="dealer-payment-ref" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="UPI / bank reference" /></div><div className="sm:col-span-2"><Label htmlFor="dealer-notes">Notes</Label><Input id="dealer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional order instructions" /></div></div></section>
        {errorMessage ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</p> : null}
      </div>

      <aside className="sticky bottom-0 z-1 space-y-3 border-t border-border bg-background/95 p-3 shadow-[0_-8px_24px_-20px_rgba(0,0,0,.4)] backdrop-blur xl:top-24 xl:rounded-md xl:border xl:p-4 xl:shadow-none">
        <div className="flex items-center justify-between xl:block"><h2 className="font-semibold">Order summary</h2><span className="text-xs text-muted-foreground xl:hidden">{totalQuantity} units</span></div>
        <div className="hidden space-y-2 text-sm xl:block"><Summary label="Products" value={String(lines.length)} /><Summary label="Total quantity" value={String(totalQuantity)} /><Summary label="Subtotal" value={money(subtotal)} /><Summary label="Discount" value={`−${money(discount)}`} /><Summary label={`Tax (${taxPercent}%)`} value={money(tax)} /><div className="flex justify-between border-t border-border pt-3 text-base font-semibold"><span>Grand total</span><span>{money(grandTotal)}</span></div></div>
        <Button className="w-full" type="submit" disabled={submitting || !lines.length}>{submitting ? "Submitting…" : submitLabel}</Button>
        <p className="hidden text-xs text-muted-foreground xl:block">{showStock ? "Stock is checked again when the order is saved." : "Stock availability is private and checked when you submit."} Submitting requires a final confirmation.</p>
      </aside>
    </form>

    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent><DialogHeader><DialogTitle>Confirm dealer order</DialogTitle><DialogDescription>Submit this order for {selectedDealer?.name}? The details and quantities will be checked once more against the live ERP data.</DialogDescription></DialogHeader><div className="rounded-md bg-muted/50 p-4 text-sm"><Summary label="Products" value={String(lines.length)} /><Summary label="Total quantity" value={String(totalQuantity)} /><Summary label="Payment" value={paymentMethod} /><Summary label="Delivery" value={deliveryMethod} /><div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Grand total</span><span>{money(grandTotal)}</span></div></div>{shortageCount && canBackorder && allowBackorder ? <p className="text-sm text-amber-700">This order includes {shortageCount} backordered line(s).</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Review</Button><Button type="button" onClick={() => void submitConfirmed()} disabled={submitting}>{submitting ? "Saving…" : "Confirm & submit"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 text-muted-foreground"><span>{label}</span><span className="text-foreground">{value}</span></div>; }