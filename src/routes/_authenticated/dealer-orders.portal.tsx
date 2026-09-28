import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { DealerOrderComposer, type DealerCatalogItem, type DealerOption } from "@/components/DealerOrderComposer";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { getCurrentUserRole } from "@/lib/auth.functions";
import { createDealerSalesOrder, getDealerOrdersList, getErpSettings, getSheetsBatch } from "@/lib/sheets.functions";
import { ArrowLeft, Store } from "lucide-react";
import { toast } from "sonner";

const masterQuery = {
  queryKey: ["erp", "dealer-order-masters"],
  queryFn: () => getSheetsBatch({ data: { ranges: ["Customers!A2:T5000", "Products!A2:Q2000", "'Product Variants'!A2:Q2000"] } }),
  staleTime: 30_000,
};
const num = (value: unknown) => { const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; };
const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type DealerOrder = Awaited<ReturnType<typeof getDealerOrdersList>>[number];

export const Route = createFileRoute("/_authenticated/dealer-orders/portal")({
  head: () => ({ meta: [{ title: "Dealer Ordering — Focus Lady ERP" }] }),
  component: DealerOrderingPage,
});

function DealerOrderingPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [dealerId, setDealerId] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery(masterQuery);
  const { data: settings } = useQuery({ queryKey: ["erp", "settings"], queryFn: () => getErpSettings(), staleTime: 30_000 });
  const { data: roleData } = useQuery({ queryKey: ["erp", "current-user-role"], queryFn: () => getCurrentUserRole(), staleTime: 60_000 });
  const { data: allOrders = [] } = useQuery({ queryKey: ["erp", "dealer-orders"], queryFn: () => getDealerOrdersList(), staleTime: 15_000 });
  const save = useServerFn(createDealerSalesOrder);
  const customerRows = data?.valueRanges?.[0]?.values ?? [];
  const productRows = data?.valueRanges?.[1]?.values ?? [];
  const variantRows = data?.valueRanges?.[2]?.values ?? [];
  const dealers: DealerOption[] = useMemo(() => customerRows.filter((row) => row[1] && ["wholesale", "bulk"].includes(String(row[7] ?? "").toLowerCase())).map((row) => ({ id: String(row[0] ?? ""), name: String(row[1] ?? ""), phone: String(row[2] ?? ""), address: String(row[3] ?? ""), city: String(row[4] ?? ""), district: String(row[5] ?? ""), pinCode: "" })), [customerRows]);
  const catalog: DealerCatalogItem[] = useMemo(() => {
    const products = productRows.filter((row) => row[1]);
    const entries: DealerCatalogItem[] = products.map((row) => ({ productId: String(row[0] ?? ""), productName: String(row[1] ?? ""), sku: String(row[0] ?? ""), barcode: String(row[6] ?? ""), size: String(row[5] ?? ""), cupSize: "", color: "", unitPrice: num(row[9]), availableStock: num(row[7]) }));
    for (const row of variantRows) {
      if (!row[1] || !(row[2] || row[3] || row[4])) continue;
      const product = products.find((entry) => String(entry[0] ?? "") === String(row[1]));
      entries.push({ productId: String(row[1]), productName: String(product?.[1] ?? row[2] ?? ""), sku: String(row[3] ?? ""), barcode: String(row[4] ?? ""), size: String(row[6] ?? ""), cupSize: "", color: String(row[7] ?? ""), unitPrice: num(row[10]) || num(product?.[9]), availableStock: num(row[11]) || num(product?.[7]) });
    }
    return entries;
  }, [productRows, variantRows]);
  const selectedDealer = dealers.find((dealer) => dealer.id === dealerId);
  const recentOrders: DealerOrder[] = allOrders.filter((order) => order.dealerId === dealerId).slice(0, 10);
  const role = String(roleData?.role ?? "Sales").toLowerCase();
  const canBackorder = role === "admin" || role === "manager";

  async function createOrder(input: Parameters<Parameters<typeof DealerOrderComposer>[0]["onSubmit"]>[0]) {
    setBusy(true);
    try {
      const result = await save({ data: input });
      await client.invalidateQueries({ queryKey: ["erp", "dealer-orders"] });
      toast.success(`Dealer order ${result.orderId} created`);
      await navigate({ to: "/dealer-orders/$orderId", params: { orderId: result.orderId } });
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Order could not be saved."); }
    finally { setBusy(false); }
  }

  if (isLoading) return <ErpShell activeSlug="dealer-orders" title="Dealer Ordering"><div className="h-48 animate-pulse rounded-md bg-muted" /></ErpShell>;
  if (error) return <ErpShell activeSlug="dealer-orders" title="Dealer Ordering"><div role="alert" className="max-w-md rounded-md border border-border p-4"><p>Dealer and product masters could not be loaded.</p><Button className="mt-3" variant="outline" onClick={() => void refetch()}>Retry</Button></div></ErpShell>;

  return <ErpShell activeSlug="dealer-orders" title="Dealer Ordering" subtitle="Create orders inside Focus Lady ERP using live catalog and stock data" actions={<Button variant="outline" asChild><Link to="/dealer-orders/"><ArrowLeft className="mr-2 h-4 w-4" />All orders</Link></Button>}>
    <div className="space-y-6">
      <section className="max-w-2xl space-y-3 border-b border-border pb-5">
        <div className="flex items-start gap-3"><Store className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /><div><h2 className="font-semibold">Choose a dealer</h2><p className="mt-1 text-sm text-muted-foreground">Orders are created and managed directly in the ERP.</p></div></div>
        <label htmlFor="portal-dealer" className="text-sm font-medium">Wholesale or bulk dealer</label>
        <select id="portal-dealer" value={dealerId} onChange={(event) => setDealerId(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose a dealer</option>{dealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.name}{dealer.phone ? ` · ${dealer.phone}` : ""}</option>)}</select>
        {!dealers.length ? <p className="text-sm text-muted-foreground">No wholesale or bulk dealers found. Add one from New Dealer Order.</p> : null}
      </section>

      {selectedDealer ? <>
        <DealerOrderComposer key={selectedDealer.id} dealers={[selectedDealer]} defaultDealerId={selectedDealer.id} defaultDelivery={selectedDealer} catalog={catalog} taxPercent={Number(settings?.defaultGstPercent ?? 0)} canBackorder={canBackorder} onSubmit={createOrder} submitting={busy} />
        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex items-baseline justify-between gap-3"><h2 className="font-semibold">Recent orders · {selectedDealer.name}</h2><span className="text-xs text-muted-foreground">Latest 10</span></div>
          {recentOrders.length ? <div className="divide-y divide-border border-y border-border">{recentOrders.map((order) => <Link key={order.orderId} to="/dealer-orders/$orderId" params={{ orderId: order.orderId }} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-muted/30"><span><span className="font-medium">{order.orderId}</span><span className="ml-2 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("en-IN")}</span></span><span className="text-sm">{order.totalQuantity} units · {money(order.grandTotal)} · {order.status}</span></Link>)}</div> : <p className="border-y border-dashed border-border py-5 text-sm text-muted-foreground">No orders for this dealer yet.</p>}
        </section>
      </> : null}
    </div>
  </ErpShell>;
}