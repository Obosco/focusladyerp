import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { DealerOrderComposer, type DealerCatalogItem, type DealerOption } from "@/components/DealerOrderComposer";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { addDealer, createDealerSalesOrder } from "@/lib/sheets.functions";
import { getCurrentUserRole } from "@/lib/auth.functions";
import { getSheetsBatch, getErpSettings } from "@/lib/sheets.functions";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const masterQuery = {
  queryKey: ["erp", "dealer-order-masters"],
  queryFn: () => getSheetsBatch({ data: { ranges: ["Customers!A2:T5000", "Products!A2:Q2000", "'Product Variants'!A2:Q2000"] } }),
  staleTime: 30_000,
};
const num = (value: unknown) => { const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; };

export const Route = createFileRoute("/_authenticated/dealer-orders/new")({
  head: () => ({ meta: [{ title: "New Dealer Order — Focus Lady ERP" }] }),
  component: NewDealerOrderPage,
});

function NewDealerOrderPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery(masterQuery);
  const { data: settings } = useQuery({ queryKey: ["erp", "settings"], queryFn: () => getErpSettings(), staleTime: 30_000 });
  const { data: roleData } = useQuery({ queryKey: ["erp", "current-user-role"], queryFn: () => getCurrentUserRole(), staleTime: 60_000 });
  const save = useServerFn(createDealerSalesOrder);
  const saveDealer = useServerFn(addDealer);
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

  async function createNewDealer(input: Pick<DealerOption, "name" | "phone" | "address" | "city" | "district">) {
    const created = await saveDealer({ data: { name: input.name, phone: input.phone, address: input.address, city: input.city, state: input.district, type: "Wholesale" } });
    await client.invalidateQueries({ queryKey: masterQuery.queryKey });
    return { id: created.id, ...input, pinCode: "" };
  }

  if (isLoading) return <ErpShell activeSlug="dealer-orders" title="New Dealer Order"><div className="h-48 animate-pulse rounded-md bg-muted" /></ErpShell>;
  if (error) return <ErpShell activeSlug="dealer-orders" title="New Dealer Order"><div role="alert" className="max-w-md rounded-md border border-border p-4"><p>Dealer and product masters could not be loaded.</p><Button className="mt-3" variant="outline" onClick={() => void refetch()}>Retry</Button></div></ErpShell>;

  return <ErpShell activeSlug="dealer-orders" title="New Dealer Order" subtitle="Fast entry · live product, price and stock data" actions={<Button variant="outline" onClick={() => void navigate({ to: "/dealer-orders" })}><ArrowLeft className="mr-2 h-4 w-4" />Orders</Button>}>
    {!dealers.length ? <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">No wholesale or bulk dealers found. Add a dealer below to continue.</div> : null}
    <DealerOrderComposer dealers={dealers} catalog={catalog} defaultDelivery={undefined} taxPercent={Number(settings?.defaultGstPercent ?? 0)} canBackorder={canBackorder} onAddDealer={createNewDealer} onSubmit={createOrder} submitting={busy} />
  </ErpShell>;
}