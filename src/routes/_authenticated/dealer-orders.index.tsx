import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDealerOrdersList } from "@/lib/sheets.functions";
import { CalendarDays, ChevronDown, Plus, Search, Store } from "lucide-react";

type DealerOrder = Awaited<ReturnType<typeof getDealerOrdersList>>[number];
const statuses = ["All Orders", "Pending", "Confirmed", "Packing", "Dispatched", "Delivered", "Cancelled"];
const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Route = createFileRoute("/_authenticated/dealer-orders/")({
  head: () => ({ meta: [{ title: "Dealer Orders — Focus Lady ERP" }] }),
  component: DealerOrdersPage,
});

function DealerOrdersPage() {
  const [status, setStatus] = useState("All Orders");
  const [search, setSearch] = useState("");
  const [dealer, setDealer] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(0);
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["erp", "dealer-orders"],
    queryFn: () => getDealerOrdersList(),
    staleTime: 15_000,
  });
  const dealers = useMemo(() => [...new Set(data.map((order) => order.dealerName).filter(Boolean))].sort(), [data]);
  const filtered = useMemo(() => data
    .filter((order) => status === "All Orders" || order.status === status)
    .filter((order) => dealer === "all" || order.dealerName === dealer)
    .filter((order) => !from || order.createdAt.slice(0, 10) >= from)
    .filter((order) => !to || order.createdAt.slice(0, 10) <= to)
    .filter((order) => `${order.orderId} ${order.dealerName} ${order.status}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (sortDesc ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))),
  [data, status, dealer, from, to, search, sortDesc]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <ErpShell activeSlug="dealer-orders" title="Dealer Orders" subtitle="Sales orders, fulfillment and dealer follow-up" actions={
      <div className="flex gap-2">
        <Button variant="outline" asChild><Link to="/dealer-orders/portal"><Store className="mr-2 h-4 w-4" />Dealer ordering</Link></Button>
        <Button asChild><Link to="/dealer-orders/new"><Plus className="mr-2 h-4 w-4" />New order</Link></Button>
      </div>
    }>
      <div className="space-y-4">
        <nav className="flex gap-1 overflow-x-auto border-b border-border pb-2" aria-label="Filter orders by status">
          {statuses.map((item) => (
            <button key={item} type="button" onClick={() => { setStatus(item); setPage(0); }}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm ${status === item ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {item}{item === "All Orders" ? <span className="ml-2 text-xs text-muted-foreground">{data.length}</span> : null}
            </button>
          ))}
        </nav>

        <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,220px)_150px_150px_auto]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Order ID or dealer" aria-label="Search orders" /></div>
          <select value={dealer} onChange={(event) => { setDealer(event.target.value); setPage(0); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Filter by dealer">
            <option value="all">All dealers</option>{dealers.map((name) => <option key={name}>{name}</option>)}
          </select>
          <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} aria-label="From date" />
          <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} aria-label="To date" />
          <Button variant="outline" onClick={() => setSortDesc((value) => !value)}><ChevronDown className={`mr-2 h-4 w-4 ${sortDesc ? "" : "rotate-180"}`} />Date</Button>
        </div>

        {isLoading ? <div className="space-y-2" aria-live="polite">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-md bg-muted" />)}</div> : null}
        {error ? <div role="alert" className="rounded-md border border-destructive/40 p-4 text-sm"><p>Dealer orders could not be loaded.</p><Button className="mt-3" variant="outline" onClick={() => void refetch()}>Retry</Button></div> : null}
        {!isLoading && !error && visible.length === 0 ? <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-border text-center"><div><CalendarDays className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><p className="font-medium">No matching orders</p><p className="mt-1 text-sm text-muted-foreground">Change the filters or create a dealer order.</p></div></div> : null}

        {!isLoading && !error && visible.length > 0 ? <>
          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr>{["Order", "Dealer", "Created", "Items", "Amount", "Status", ""].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
              <tbody>{visible.map((order) => <OrderRow key={order.orderId} order={order} />)}</tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">{visible.map((order) => <OrderCard key={order.orderId} order={order} />)}</div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{filtered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</Button></div>
          </div>
        </> : null}
      </div>
    </ErpShell>
  );
}

function StatusLabel({ status }: { status: string }) {
  const tones: Record<string, string> = { Pending: "bg-amber-100 text-amber-800", Confirmed: "bg-sky-100 text-sky-800", Packing: "bg-indigo-100 text-indigo-800", Dispatched: "bg-violet-100 text-violet-800", Delivered: "bg-emerald-100 text-emerald-800", Cancelled: "bg-red-100 text-red-800", Returned: "bg-orange-100 text-orange-800" };
  return <span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${tones[status] ?? "bg-muted text-muted-foreground"}`}>{status}</span>;
}

function OrderRow({ order }: { order: DealerOrder }) {
  return <tr className="border-t border-border hover:bg-muted/30"><td className="px-4 py-3 font-medium"><Link className="hover:underline" to="/dealer-orders/$orderId" params={{ orderId: order.orderId }}>{order.orderId}</Link></td><td className="px-4 py-3">{order.dealerName}</td><td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString("en-IN")}</td><td className="px-4 py-3">{order.totalQuantity}</td><td className="px-4 py-3">{money(order.grandTotal)}</td><td className="px-4 py-3"><StatusLabel status={order.status} /></td><td className="px-4 py-3 text-right"><Button asChild variant="ghost" size="sm"><Link to="/dealer-orders/$orderId" params={{ orderId: order.orderId }}>Details</Link></Button></td></tr>;
}

function OrderCard({ order }: { order: DealerOrder }) {
  return <Link to="/dealer-orders/$orderId" params={{ orderId: order.orderId }} className="rounded-md border border-border p-3 hover:bg-muted/30"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{order.orderId}</div><div className="text-sm text-muted-foreground">{order.dealerName}</div></div><StatusLabel status={order.status} /></div><div className="mt-3 flex justify-between text-sm"><span>{order.totalQuantity} units · {new Date(order.createdAt).toLocaleDateString("en-IN")}</span><strong>{money(order.grandTotal)}</strong></div></Link>;
}