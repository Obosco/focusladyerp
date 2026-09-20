import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Fragment, Suspense, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ErpShell } from "@/components/ErpShell";
import { getSheetsBatch, createInvoice } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { amountInWords, COMPANY, emptyItem, invoiceTotals, itemValues, modeLabel, type InvoiceDraft, type InvoiceItem, type InvoiceMode } from "@/lib/invoice";

const mastersQuery = queryOptions({
  queryKey: ["erp", "invoice-masters"],
  queryFn: () => getSheetsBatch({ data: { ranges: ["Customers!A2:T5000", "Products!A2:I1000", "Sales!A2:A2000"] } }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_authenticated/invoices/new")({
  head: () => ({ meta: [{ title: "New Invoice - OBOSCO CLOTHING INDUSTRIES" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mastersQuery),
  component: NewInvoicePage,
});

const money = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClass = "h-8 rounded-none border-black/40 bg-white text-xs";

type CustomerRow = string[];

function Field({ label, value, setValue, type = "text", className = "", readOnly = false, list }: { label: string; value: string; setValue?: (value: string) => void; type?: string; className?: string; readOnly?: boolean; list?: string }) {
  return <div className={className}><Label className="text-[10px]">{label}</Label><Input className={inputClass} type={type} value={value} readOnly={readOnly} list={list} onChange={(event) => setValue?.(event.target.value)} /></div>;
}

function NewInvoicePage() {
  return <ErpShell activeSlug="invoices" title="Invoice Editor" subtitle="A5 landscape, print-ready invoice"><Suspense fallback={<div>Loading invoice editor...</div>}><InvoiceEditor /></Suspense></ErpShell>;
}

function InvoiceEditor() {
  const { data } = useSuspenseQuery(mastersQuery);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useServerFn(createInvoice);
  const rows = (name: string) => data.valueRanges.find((range) => range.range.includes(name))?.values ?? [];
  const customers = rows("Customers").filter((row) => (row[1] ?? "").trim()) as CustomerRow[];
  const products = rows("Products").filter((row) => (row[1] ?? "").trim());
  const existing = rows("Sales").map((row) => row[0] ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<InvoiceMode>("gst");
  const [date, setDate] = useState(today);
  const [validUntil, setValidUntil] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [gstin, setGstin] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const invoice = useMemo(() => {
    if (mode === "quotation") return `QT-${date.replace(/-/g, "")}-${String(existing.length + 1).padStart(3, "0")}`;
    const prefix = `FLB-${date.replace(/-/g, "")}-`;
    return `${prefix}${String(existing.filter((value) => value.startsWith(prefix)).length + 1).padStart(3, "0")}`;
  }, [date, existing, mode]);
  const selectCustomer = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const digits = value.replace(/\D/g, "");
    const match = customers.find((row) => (row[1] ?? "").trim().toLowerCase() === normalized || ((row[2] ?? "").replace(/\D/g, "") && (row[2] ?? "").replace(/\D/g, "") === digits));
    setCustomer(value);
    if (!match) { setCustomerId(""); return; }
    setCustomerId(match[0] ?? ""); setCustomerPhone(match[2] ?? ""); setCustomerAddress(match[3] ?? ""); setCustomerCity(match[4] ?? ""); setCustomerState(match[5] ?? ""); setGstin(match[6] ?? "");
  };
  const draft: InvoiceDraft = { mode, invoice, customerId, date, validUntil, customer, customerPhone, customerAddress, customerCity, customerState, gstin, items, discount, paid, paymentMode, notes };
  const totals = invoiceTotals(draft);
  const setItem = (index: number, patch: Partial<InvoiceItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const chooseProduct = (index: number, name: string) => { const product = products.find((row) => row[1] === name); setItem(index, { product: name, hsn: product?.[0] ?? "", rate: Number(product?.[5] ?? 0), gstPercent: Number(product?.[8] ?? 0) }); };
  const submit = async () => {
    const validItems = items.filter((item) => item.product.trim() && item.qty > 0);
    if (!customer.trim()) return toast.error("Customer name is required");
    if (!validItems.length) return toast.error("Add at least one product");
    setBusy(true);
    try {
      await save({ data: { ...draft, items: validItems, gstPercent: mode === "gst" ? Math.max(...validItems.map((item) => item.gstPercent), 0) : 0 } });
      await queryClient.invalidateQueries({ queryKey: ["erp"] });
      toast.success("Invoice saved");
      navigate({ to: "/invoices/$invoice", params: { invoice } });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save invoice"); } finally { setBusy(false); }
  };
  return <div className="grid gap-6 xl:grid-cols-[36rem_1fr]">
    <div className="space-y-4 print:hidden">
      <Card><CardHeader><CardTitle className="text-sm">Invoice Type</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-2">{([["gst", "GST TAX INVOICE"], ["non-gst", "NON-GST BILL"], ["quotation", "QUOTATION"]] as [InvoiceMode, string][]).map(([value, label]) => <Button key={value} variant={mode === value ? "default" : "outline"} className="h-10 rounded-none px-1 text-[10px]" onClick={() => setMode(value)}>{label}</Button>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Invoice Details</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Field label={mode === "quotation" ? "Quotation No." : "Invoice No."} value={invoice} readOnly /><Field label="Invoice Date" value={date} setValue={setDate} type="date" /><Field label="M/S / Phone" value={customer} setValue={selectCustomer} list="customers" className="col-span-2" /><Field label="Phone" value={customerPhone} setValue={setCustomerPhone} /><Field label="Address" value={customerAddress} setValue={setCustomerAddress} className="col-span-2" />{mode === "quotation" && <Field label="Valid Until" value={validUntil} setValue={setValidUntil} type="date" />}{mode === "gst" && <><Field label="GSTIN" value={gstin} setValue={setGstin} /><Field label="City" value={customerCity} setValue={setCustomerCity} /><Field label="State" value={customerState} setValue={setCustomerState} /></>}</CardContent></Card>
      <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Product Rows</CardTitle><Button variant="outline" size="sm" className="rounded-none" onClick={() => setItems((current) => [...current, emptyItem()])}><Plus className="mr-1 h-4 w-4" />Add row</Button></CardHeader><CardContent className="space-y-2">{items.map((item, index) => <div key={index} className="grid grid-cols-12 gap-2 border-b border-black/10 pb-2"><Field label="Description" value={item.product} setValue={(value) => chooseProduct(index, value)} list="products" className="col-span-5" />{mode === "gst" && <Field label="HSN" value={item.hsn} setValue={(value) => setItem(index, { hsn: value })} className="col-span-2" />}<Field label="Qty" value={String(item.qty)} setValue={(value) => setItem(index, { qty: Number(value) })} type="number" className="col-span-2" /><Field label="Rate" value={String(item.rate)} setValue={(value) => setItem(index, { rate: Number(value) })} type="number" className="col-span-2" /><Button variant="ghost" size="icon" className="mt-4 h-8 w-8" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>{mode === "gst" && <Field label="GST %" value={String(item.gstPercent)} setValue={(value) => setItem(index, { gstPercent: Number(value) })} type="number" className="col-span-2" />}<div className="col-span-5 self-end text-right text-xs">Taxable {money(itemValues(item, mode).taxable)} | Total {money(itemValues(item, mode).total)}</div></div>)}<datalist id="products">{products.map((row, index) => <option key={index} value={row[1]} />)}</datalist><datalist id="customers">{customers.map((row, index) => (<Fragment key={index}><option value={row[1]} /><option value={row[2]} /></Fragment>))}</datalist></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Payment</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Field label="Discount" value={String(discount)} setValue={(value) => setDiscount(Number(value))} type="number" /><Field label="Paid" value={String(paid)} setValue={(value) => setPaid(Number(value))} type="number" /><Field label="Payment Mode" value={paymentMode} setValue={setPaymentMode} /><Field label="Notes" value={notes} setValue={setNotes} className="col-span-2" /><div className="col-span-2 flex justify-between border-t border-black pt-2 font-semibold">Total <span>{money(totals.total)}</span></div><Button className="col-span-2 rounded-none bg-black text-white hover:bg-black/80" onClick={submit} disabled={busy}><Save className="mr-2 h-4 w-4" />{busy ? "Saving..." : "Save Invoice"}</Button></CardContent></Card>
    </div>
    <div><div className="mb-3 flex gap-2 print:hidden"><Button variant="outline" size="sm" className="rounded-none" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / PDF</Button></div><InvoicePreview draft={draft} /></div>
  </div>;
}

export function InvoicePreview({ draft }: { draft: InvoiceDraft }) {
  const totals = invoiceTotals(draft);
  return <article id="invoice-preview" className="invoice-paper"><header className="invoice-header"><img src="/focus-lady-logo.svg" alt="Focus Lady Bra" className="invoice-logo" /><div><h1>{COMPANY.name}</h1><p>{COMPANY.address}</p><p>{COMPANY.state} | {COMPANY.phone}</p></div><b className="invoice-original">{draft.mode !== "quotation" && "ORIGINAL FOR RECIPIENT"}</b></header><div className="invoice-title">{modeLabel(draft.mode)}</div><section className="invoice-meta"><div><b>M/S :</b> {draft.customer}<br /><b>Address :</b> {draft.customerAddress}</div><div><b>{draft.mode === "quotation" ? "Quotation No" : "Invoice No"} :</b> {draft.invoice}<br /><b>Date :</b> {draft.date}<br />{draft.mode === "quotation" ? (<><b>Valid Until :</b> {draft.validUntil}</>) : draft.mode === "gst" ? (<><b>GSTIN :</b> {draft.gstin}</>) : null}</div></section><table className="invoice-table"><thead><tr><th>No</th><th>Description of Goods</th>{draft.mode === "gst" && <th>HSN</th>}<th>Qty</th><th>Rate</th><th>Taxable Value</th>{draft.mode === "gst" && <><th>%</th><th>GST Value</th></>}<th>Total</th></tr></thead><tbody>{draft.items.map((item, index) => { const values = itemValues(item, draft.mode); return <tr key={index}><td>{index + 1}</td><td>{item.product}</td>{draft.mode === "gst" && <td>{item.hsn}</td>}<td>{item.qty || ""}</td><td className="number">{money(item.rate)}</td><td className="number">{money(values.taxable)}</td>{draft.mode === "gst" && <><td>{item.gstPercent}</td><td className="number">{money(values.gst)}</td></>}<td className="number">{money(values.total)}</td></tr>; })}</tbody></table><section className="invoice-bottom"><div><b>Amount in words</b><p>{amountInWords(totals.total)}</p><b>Terms & Conditions</b><p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p></div><div className="invoice-totals"><p>Subtotal / Taxable Value <span>{money(totals.taxable)}</span></p>{draft.mode === "gst" && <p>GST <span>{money(totals.gst)}</span></p>}<p>Less / Discount Amt <span>{money(draft.discount)}</span></p><p className="invoice-grand-total">Total <span>{money(totals.total)}</span></p></div></section><footer className="invoice-signature"><div>{draft.notes && <p>Notes: {draft.notes}</p>}</div><div className="signature-box"><div className="signature-space" /><b>For {COMPANY.name}</b><span>Authorised Signatory</span></div></footer></article>;
}
