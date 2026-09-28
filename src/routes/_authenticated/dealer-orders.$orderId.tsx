import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCurrentUserRole } from "@/lib/auth.functions";
import { exportTablePdf } from "@/lib/pdf";
import { editDealerSalesOrder, getDealerOrderDetail, updateDealerSalesOrderStatus } from "@/lib/sheets.functions";
import { ArrowLeft, Check, Download, MessageCircle, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Route = createFileRoute("/_authenticated/dealer-orders/$orderId")({
  head: ({ params }) => ({ meta: [{ title: `${params.orderId} — Dealer Order` }] }),
  component: DealerOrderDetailPage,
});

function DealerOrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({ address: "", city: "", district: "", pinCode: "", requiredDeliveryDate: "", deliveryMethod: "Normal" as "Normal" | "Urgent" | "Warehouse Pickup", paymentMethod: "Credit" as "Cash" | "UPI" | "Bank Transfer" | "Credit" | "Advance", paymentReference: "", advance: 0, notes: "" });
  const { data: order, isLoading, error, refetch } = useQuery({ queryKey: ["erp", "dealer-order", orderId], queryFn: () => getDealerOrderDetail({ data: { orderId } }) });
  const { data: roleData } = useQuery({ queryKey: ["erp", "current-user-role"], queryFn: () => getCurrentUserRole(), staleTime: 60_000 });
  const updateStatus = useServerFn(updateDealerSalesOrderStatus);
  const editDetails = useServerFn(editDealerSalesOrder);
  const role = String(roleData?.role ?? "Sales").toLowerCase();
  const isManager = role === "admin" || role === "manager";
  const nextStatus: Record<string, string> = { Pending: "Confirmed", Confirmed: "Packing", Packing: "Dispatched", Dispatched: "Delivered" };

  async function changeStatus(status: string) {
    if (!order) return;
    setBusy(true);
    try {
      await updateStatus({ data: { orderId, status, note } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["erp", "dealer-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["erp", "dealer-orders"] }),
      ]);
      setNote("");
      toast.success(`Order ${status.toLowerCase()}`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Order update failed.");
    } finally { setBusy(false); }
  }

  async function shareOrder() {
    if (!order) return;
    const text = `${order.orderId} · ${order.dealerName} · ${money(order.grandTotal)} · ${order.status}`;
    try {
      if (navigator.share) await navigator.share({ title: `Dealer order ${order.orderId}`, text });
      else { await navigator.clipboard.writeText(text); toast.success("Order summary copied"); }
    } catch (failure) { if (!(failure instanceof Error && failure.name === "AbortError")) toast.error("Could not share this order."); }
  }

  function openEdit() {
    if (!order) return;
    setEditDraft({ address: order.deliveryAddress, city: order.city, district: order.district, pinCode: order.pinCode, requiredDeliveryDate: order.requiredDeliveryDate, deliveryMethod: order.deliveryMethod as typeof editDraft.deliveryMethod, paymentMethod: order.paymentMethod as typeof editDraft.paymentMethod, paymentReference: order.paymentReference, advance: order.advance, notes: order.notes });
    setEditOpen(true);
  }

  async function saveDetails() {
    if (!order) return;
    setBusy(true);
    try {
      await editDetails({ data: { orderId, details: editDraft } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["erp", "dealer-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["erp", "dealer-orders"] }),
      ]);
      setEditOpen(false);
      toast.success("Order details updated");
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Order details could not be updated."); }
    finally { setBusy(false); }
  }

  function downloadPdf() {
    if (!order) return;
    exportTablePdf({
      title: `Dealer Order ${order.orderId}`,
      subtitle: `${order.dealerName} · ${order.status} · ${new Date(order.createdAt).toLocaleString("en-IN")}`,
      details: [
        ["Delivery", `${order.deliveryAddress}, ${order.city}, ${order.district} ${order.pinCode}`],
        ["Required date / method", `${order.requiredDeliveryDate} · ${order.deliveryMethod}`],
        ["Payment", `${order.paymentMethod}${order.paymentReference ? ` · Ref ${order.paymentReference}` : ""} · Advance ${money(order.advance)}`],
        ["Subtotal / discount / tax", `${money(order.subtotal)} / ${money(order.discount)} / ${money(order.tax)}`],
        ["Grand total / quantity", `${money(order.grandTotal)} / ${order.totalQuantity} units`],
        ...(order.notes ? [["Notes", order.notes] as [string, string]] : []),
      ],
      headers: ["Product", "SKU / Barcode", "Size", "Cup", "Color", "Qty", "Unit Price", "Discount", "Total"],
      rows: order.items.map((item) => [item.productName, `${item.sku} ${item.barcode ?? ""}`.trim(), item.size ?? "", item.cupSize ?? "", item.color ?? "", String(item.qty), money(item.unitPrice), money(item.discount), money(item.lineTotal)]),
      filename: order.orderId,
    });
  }

  if (isLoading) return <ErpShell activeSlug="dealer-orders" title={orderId}><div className="h-48 animate-pulse rounded-md bg-muted" /></ErpShell>;
  if (error || !order) return <ErpShell activeSlug="dealer-orders" title="Order unavailable"><div role="alert" className="max-w-lg space-y-3 rounded-md border border-border p-4"><p>Dealer order could not be loaded.</p><div className="flex gap-2"><Button variant="outline" onClick={() => void refetch()}>Retry</Button><Button asChild variant="outline"><Link to="/dealer-orders">All orders</Link></Button></div></div></ErpShell>;

  const progress = ["Pending", "Confirmed", "Packing", "Dispatched", "Delivered"];
  const whatsappText = encodeURIComponent(`Dealer Order ${order.orderId}\nDealer: ${order.dealerName}\nStatus: ${order.status}\nTotal: ${money(order.grandTotal)}`);

  return <ErpShell activeSlug="dealer-orders" title={order.orderId} subtitle={`${order.dealerName} · created ${new Date(order.createdAt).toLocaleString("en-IN")}`} actions={<Button variant="outline" asChild><Link to="/dealer-orders"><ArrowLeft className="mr-2 h-4 w-4" />All orders</Link></Button>}>
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div><span className="text-xs uppercase text-muted-foreground">Current status</span><div className="mt-1 text-xl font-semibold">{order.status}</div></div>
        {isManager && !["Delivered", "Cancelled", "Returned"].includes(order.status) ? <Button variant="outline" onClick={openEdit}>Edit details</Button> : null}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button><Button variant="outline" onClick={downloadPdf}><Download className="mr-2 h-4 w-4" />Download PDF</Button><Button variant="outline" onClick={() => void shareOrder()}><Share2 className="mr-2 h-4 w-4" />Share</Button><Button variant="outline" asChild><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${whatsappText}`}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</a></Button></div>
      </section>

      <section className="overflow-x-auto border-b border-border py-4"><ol className="flex min-w-150 items-start">{progress.map((step, index) => { const current = progress.indexOf(order.status); const done = current >= index; return <li key={step} className="relative flex-1 text-center"><span className={`mx-auto grid h-8 w-8 place-items-center rounded-full border ${done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>{done ? <Check className="h-4 w-4" /> : index + 1}</span><span className={`mt-2 block text-xs ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}>{step}</span>{index < progress.length - 1 ? <span className={`absolute left-[calc(50%+16px)] top-4 h-px w-[calc(100%-32px)] ${current > index ? "bg-primary" : "bg-border"}`} /> : null}</li>; })}</ol></section>

      <section className="grid gap-5 md:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div><h2 className="mb-2 text-sm font-semibold">Products · {order.totalQuantity} units</h2><div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-155 text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["Product", "SKU", "Size / Cup", "Color", "Qty", "Available", "Price", "Discount", "Total"].map((head) => <th key={head} className="px-3 py-2">{head}</th>)}</tr></thead><tbody>{order.items.map((item, index) => <tr key={`${item.sku}-${index}`} className="border-t border-border"><td className="px-3 py-3 font-medium">{item.productName}</td><td className="px-3 py-3">{item.sku}</td><td className="px-3 py-3">{[item.size, item.cupSize].filter(Boolean).join(" / ") || "—"}</td><td className="px-3 py-3">{item.color || "—"}</td><td className="px-3 py-3">{item.qty}</td><td className="px-3 py-3">{item.availableStock}{item.qty > item.availableStock ? ` · short ${item.qty - item.availableStock}` : ""}</td><td className="px-3 py-3">{money(item.unitPrice)}</td><td className="px-3 py-3">{money(item.discount)}</td><td className="px-3 py-3">{money(item.lineTotal)}</td></tr>)}</tbody></table></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><Info title="Delivery" lines={[order.deliveryAddress, `${order.city}, ${order.district} ${order.pinCode}`, `Required by ${order.requiredDeliveryDate}`, order.deliveryMethod]} /><Info title="Payment" lines={[order.paymentMethod, order.paymentReference ? `Reference: ${order.paymentReference}` : "No payment reference", `Advance: ${money(order.advance)}`]} /></div>
          {order.notes ? <Info title="Notes" lines={[order.notes]} /> : null}
        </div>
        <aside className="h-fit rounded-md border border-border p-4"><h2 className="font-semibold">Order summary</h2><div className="mt-4 space-y-2 text-sm"><SummaryLine label="Subtotal" value={money(order.subtotal)} /><SummaryLine label="Discount" value={`−${money(order.discount)}`} /><SummaryLine label="Tax" value={money(order.tax)} /><SummaryLine label="Total quantity" value={String(order.totalQuantity)} /><div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold"><span>Grand total</span><span>{money(order.grandTotal)}</span></div></div><p className="mt-4 text-xs text-muted-foreground">Created by {order.createdBy}<br />Last updated by {order.updatedBy} · {new Date(order.updatedAt).toLocaleString("en-IN")}</p></aside>
      </section>

      <section className="border-t border-border pt-4"><h2 className="mb-3 font-semibold">Order activity</h2><ol className="space-y-3">{order.timeline.map((entry, index) => <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><div className="font-medium">{entry.status}</div><div className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString("en-IN")} · {entry.by}{entry.note ? ` · ${entry.note}` : ""}</div></div></li>)}</ol></section>

      {order.status !== "Delivered" && order.status !== "Cancelled" && order.status !== "Returned" ? <section className="flex flex-wrap items-end gap-3 border-t border-border pt-4"><div className="min-w-56 flex-1"><label htmlFor="status-note" className="mb-1 block text-xs text-muted-foreground">Update note (optional)</label><Input id="status-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an activity note" /></div>{nextStatus[order.status] && (order.status !== "Pending" || isManager) ? <Button disabled={busy} onClick={() => void changeStatus(nextStatus[order.status])}>{busy ? "Updating…" : `Mark ${nextStatus[order.status]}`}</Button> : null}{isManager ? <Button variant="outline" disabled={busy} onClick={() => void changeStatus("Cancelled")}>Cancel order</Button> : null}</section> : null}
      {order.status === "Delivered" && isManager ? <section className="border-t border-border pt-4"><Button variant="outline" disabled={busy} onClick={() => void changeStatus("Returned")}>Mark returned</Button></section> : null}
      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Edit order details</DialogTitle><DialogDescription>Update delivery, payment, or notes. Product prices and quantities remain tied to the ERP product master.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><label className="sm:col-span-2 text-sm">Delivery address<Input className="mt-1" value={editDraft.address} onChange={(event) => setEditDraft({ ...editDraft, address: event.target.value })} /></label><label className="text-sm">City<Input className="mt-1" value={editDraft.city} onChange={(event) => setEditDraft({ ...editDraft, city: event.target.value })} /></label><label className="text-sm">District<Input className="mt-1" value={editDraft.district} onChange={(event) => setEditDraft({ ...editDraft, district: event.target.value })} /></label><label className="text-sm">PIN code<Input className="mt-1" value={editDraft.pinCode} onChange={(event) => setEditDraft({ ...editDraft, pinCode: event.target.value })} /></label><label className="text-sm">Required date<Input type="date" className="mt-1" value={editDraft.requiredDeliveryDate} onChange={(event) => setEditDraft({ ...editDraft, requiredDeliveryDate: event.target.value })} /></label><label className="text-sm">Delivery method<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={editDraft.deliveryMethod} onChange={(event) => setEditDraft({ ...editDraft, deliveryMethod: event.target.value as typeof editDraft.deliveryMethod })}>{["Normal", "Urgent", "Warehouse Pickup"].map((method) => <option key={method}>{method}</option>)}</select></label><label className="text-sm">Payment method<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={editDraft.paymentMethod} onChange={(event) => setEditDraft({ ...editDraft, paymentMethod: event.target.value as typeof editDraft.paymentMethod })}>{["Cash", "UPI", "Bank Transfer", "Credit", "Advance"].map((method) => <option key={method}>{method}</option>)}</select></label><label className="text-sm">Payment reference<Input className="mt-1" value={editDraft.paymentReference} onChange={(event) => setEditDraft({ ...editDraft, paymentReference: event.target.value })} /></label><label className="text-sm">Advance<Input type="number" min="0" max={order.grandTotal} className="mt-1" value={editDraft.advance} onChange={(event) => setEditDraft({ ...editDraft, advance: Number(event.target.value) || 0 })} /></label><label className="sm:col-span-2 text-sm">Notes<Input className="mt-1" value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} /></label></div><DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => void saveDetails()}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>
      <div className="hidden print:block pt-4 text-xs text-muted-foreground">Focus Lady ERP · {order.orderId} · {new Date().toLocaleString("en-IN")}</div>
    </div>
  </ErpShell>;
}

function Info({ title, lines }: { title: string; lines: string[] }) { return <div className="rounded-md border border-border p-4"><h3 className="mb-2 text-sm font-semibold">{title}</h3>{lines.map((line, index) => <p key={`${line}-${index}`} className="text-sm leading-6 text-muted-foreground">{line}</p>)}</div>; }
function SummaryLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 text-muted-foreground"><span>{label}</span><span className="text-foreground">{value}</span></div>; }