import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch, createInvoice } from "@/lib/sheets.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

const mastersQuery = queryOptions({
  queryKey: ["erp", "invoice-masters"],
  queryFn: () =>
    getSheetsBatch({
      data: { ranges: ["Customers!A2:D1000", "Products!A2:F1000", "Sales!A2:A2000"] },
    }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_authenticated/invoices/new")({
  head: () => ({
    meta: [
      { title: "New Invoice — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Create a GST sales invoice with line items, discount, payment and instant PDF.",
      },
      { property: "og:title", content: "New Invoice — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "Create invoices that save straight into your Google Sheet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mastersQuery),
  component: NewInvoicePage,
});

type Line = { product: string; qty: number; rate: number };

function NewInvoicePage() {
  return (
    <ErpShell
      activeSlug="invoices"
      title="New Invoice"
      subtitle="Saved directly into the Sales and Sale Items tabs"
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <InvoiceForm />
      </Suspense>
    </ErpShell>
  );
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InvoiceForm() {
  const { data } = useSuspenseQuery(mastersQuery);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(createInvoice);

  const rangeRows = (needle: string) =>
    data.valueRanges.find((v) => v.range.includes(needle))?.values ?? [];
  const customers = rangeRows("Customers").filter((r) => (r[1] ?? "").trim());
  const products = rangeRows("Products").filter((r) => (r[1] ?? "").trim());
  const existing = rangeRows("Sales").map((r) => r[0] ?? "");

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const invoiceNo = useMemo(() => {
    const prefix = `FLB-${date.replace(/-/g, "")}-`;
    const n = existing.filter((s) => s.startsWith(prefix)).length + 1;
    return `${prefix}${String(n).padStart(3, "0")}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing.length]);

  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product: "", qty: 1, rate: 0 }]);
  const [gstPercent, setGstPercent] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [mode, setMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const gross = lines.reduce((a, l) => a + (l.qty || 0) * (l.rate || 0), 0);
  const subtotal = Math.max(0, gross - discount);
  const gst = +(subtotal * (gstPercent / 100)).toFixed(2);
  const total = +(subtotal + gst).toFixed(2);
  const due = +(total - Math.min(paid, total)).toFixed(2);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const pickProduct = (i: number, name: string) => {
    const p = products.find((r) => r[1] === name);
    setLine(i, { product: name, rate: p ? parseFloat(p[5] ?? "0") || 0 : 0 });
  };

  const submit = async () => {
    if (!customer.trim()) return toast.error("Select or type a customer");
    const items = lines.filter((l) => l.product.trim() && l.qty > 0);
    if (items.length === 0) return toast.error("Add at least one product line");
    setBusy(true);
    try {
      await save({
        data: {
          invoice: invoiceNo,
          date,
          customer,
          items,
          gstPercent,
          discount,
          paid,
          mode,
          notes,
        },
      });
      await qc.invalidateQueries({ queryKey: ["erp"] });
      toast.success(`Invoice ${invoiceNo} saved`);
      navigate({ to: "/invoices/$invoice", params: { invoice: invoiceNo } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save invoice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Invoice details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Invoice No.</Label>
              <Input value={invoiceNo} readOnly className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer">Customer</Label>
              <Input
                id="customer"
                list="customer-list"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Customer name"
              />
              <datalist id="customer-list">
                {customers.map((c, i) => (
                  <option key={i} value={c[1]} />
                ))}
              </datalist>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">Line items</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((l) => [...l, { product: "", qty: 1, rate: 0 }])}
            >
              <Plus className="mr-2 h-4 w-4" /> Add line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 space-y-1.5 sm:col-span-6">
                  <Label className="text-xs">Product</Label>
                  <Input
                    list="product-list"
                    value={l.product}
                    onChange={(e) => pickProduct(i, e.target.value)}
                    placeholder="Product"
                  />
                </div>
                <div className="col-span-4 space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={0}
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-4 space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Rate</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.rate}
                    onChange={(e) => setLine(i, { rate: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-3 pb-2 text-right text-sm sm:col-span-1">
                  {money((l.qty || 0) * (l.rate || 0))}
                </div>
                <div className="col-span-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <datalist id="product-list">
              {products.map((p, i) => (
                <option key={i} value={p[1]} />
              ))}
            </datalist>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Notes & payment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note printed on the invoice"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paid">Paid</Label>
                <Input
                  id="paid"
                  type="number"
                  value={paid}
                  onChange={(e) => setPaid(Number(e.target.value))}
                />
              </div>
            </div>
            <div />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="lg:sticky lg:top-24">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="disc">Discount</Label>
                <Input
                  id="disc"
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gst">GST %</Label>
                <Input
                  id="gst"
                  type="number"
                  min={0}
                  value={gstPercent}
                  onChange={(e) => setGstPercent(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paid">Paid</Label>
                <Input
                  id="paid"
                  type="number"
                  min={0}
                  value={paid}
                  onChange={(e) => setPaid(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mode">Mode</Label>
                <Input
                  id="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  list="mode-list"
                />
                <datalist id="mode-list">
                  <option value="Cash" />
                  <option value="UPI" />
                  <option value="Bank" />
                  <option value="Card" />
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border pt-3 text-sm">
              {[
                ["Gross", gross],
                ["Discount", discount],
                ["Subtotal", subtotal],
                [`GST (${gstPercent}%)`, gst],
              ].map(([l, v]) => (
                <div key={String(l)} className="flex justify-between text-muted-foreground">
                  <span>{l}</span>
                  <span>{money(Number(v))}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid</span>
                <span>{money(Math.min(paid, total))}</span>
              </div>
              <div className="flex justify-between font-semibold text-destructive">
                <span>Due</span>
                <span>{money(due)}</span>
              </div>
            </div>

            <Button className="w-full" onClick={submit} disabled={busy}>
              <Save className="mr-2 h-4 w-4" />
              {busy ? "Saving…" : "Save invoice"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
