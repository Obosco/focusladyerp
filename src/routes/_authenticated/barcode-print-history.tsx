import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErpShell } from "@/components/ErpShell";
import { SheetTable } from "@/components/SheetTable";
import { getSheetRange } from "@/lib/sheets.functions";

export const Route = createFileRoute("/_authenticated/barcode-print-history")({
  head: () => ({ meta: [{ title: "Barcode Print History — Focus Lady Bra ERP" }] }),
  component: BarcodePrintHistoryPage,
});

function BarcodePrintHistoryPage() {
  const { data } = useQuery({
    queryKey: ["erp", "barcode-print-history"],
    queryFn: () => getSheetRange({ data: { range: "'Barcode Print History'!A1:Z2000" } }),
    staleTime: 30_000,
  });

  const values = data?.values ?? [];
  const headers = values[0] ?? [];
  const rows = values.slice(1);

  return (
    <ErpShell activeSlug="barcode-print-history" title="Barcode Print History" subtitle="Printed label logs and barcode output history">
      <SheetTable headers={headers} rows={rows} filename="barcode-print-history" title="Barcode Print History" />
    </ErpShell>
  );
}
