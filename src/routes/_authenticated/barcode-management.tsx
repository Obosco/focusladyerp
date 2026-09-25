import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErpShell } from "@/components/ErpShell";
import { SheetTable } from "@/components/SheetTable";
import { getSheetRange } from "@/lib/sheets.functions";

export const Route = createFileRoute("/_authenticated/barcode-management")({
  head: () => ({ meta: [{ title: "Barcode Management — Focus Lady Bra ERP" }] }),
  component: BarcodeManagementPage,
});

function BarcodeManagementPage() {
  const { data } = useQuery({
    queryKey: ["erp", "barcode-management"],
    queryFn: () => getSheetRange({ data: { range: "'Barcode Database'!A1:Z2000" } }),
    staleTime: 30_000,
  });

  const values = data?.values ?? [];
  const headers = values[0] ?? [];
  const rows = values.slice(1);

  return (
    <ErpShell activeSlug="barcode-management" title="Barcode Management" subtitle="Live barcode registry and product mapping">
      <SheetTable headers={headers} rows={rows} filename="barcode-management" title="Barcode Management" />
    </ErpShell>
  );
}
