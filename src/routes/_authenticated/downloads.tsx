import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { SheetTable } from "@/components/SheetTable";
import { getSheetRange } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";

const historyQuery = queryOptions({
  queryKey: ["erp", "download-history"],
  queryFn: () => getSheetRange({ data: { range: "'Download History'!A1:F2000" } }),
  staleTime: 10_000,
});

export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "Download History — Focus Lady Bra ERP" },
      {
        name: "description",
        content:
          "Audit trail of every invoice PDF, CSV export and report downloaded from Focus Lady Bra ERP.",
      },
      { property: "og:title", content: "Download History — Focus Lady Bra ERP" },
      {
        property: "og:description",
        content: "Track who downloaded which report or invoice and when.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(historyQuery),
  component: DownloadsPage,
});

function DownloadsPage() {
  return (
    <ErpShell
      activeSlug="downloads"
      title="Download History"
      subtitle="Every PDF and CSV generated from this ERP"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      }
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <HistoryView />
      </Suspense>
    </ErpShell>
  );
}

function HistoryView() {
  const { data } = useSuspenseQuery(historyQuery);
  const headers = data.values[0] ?? [
    "Timestamp",
    "Type",
    "Reference",
    "Filename",
    "Format",
    "Note",
  ];
  const rows = data.values.slice(1).reverse();
  return (
    <SheetTable
      headers={headers}
      rows={rows}
      filename="download-history"
      title="Download History"
    />
  );
}
