import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { SheetTable } from "@/components/SheetTable";
import { getSheetRange } from "@/lib/sheets.functions";
import { getModuleBySlug, SPREADSHEET_ID } from "@/lib/erp-modules";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCcw } from "lucide-react";

const q = (sheet: string) => (/[^A-Za-z0-9_]/.test(sheet) ? `'${sheet}'` : sheet);

const sheetQuery = (sheet: string) =>
  queryOptions({
    queryKey: ["erp", "sheet", sheet],
    queryFn: () => getSheetRange({ data: { range: `${q(sheet)}!A1:Z2000` } }),
    staleTime: 30_000,
  });


export const Route = createFileRoute("/sheet/$slug")({
  head: ({ params }) => {
    const mod = getModuleBySlug(params.slug);
    const title = mod ? `${mod.label} — Focus Lady Bra ERP` : "Focus Lady Bra ERP";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: mod
            ? `${mod.label} for Focus Lady Bra, synced live with Google Sheets.`
            : "Focus Lady Bra ERP",
        },
        { property: "og:title", content: title },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  loader: ({ params, context }) => {
    const mod = getModuleBySlug(params.slug);
    if (!mod) throw notFound();
    return context.queryClient.ensureQueryData(sheetQuery(mod.sheet));
  },
  component: SheetPage,
  notFoundComponent: () => (
    <ErpShell activeSlug="" title="Not found">
      <p className="text-sm text-muted-foreground">
        This module doesn't exist.{" "}
        <Link to="/" className="text-primary underline">
          Back to dashboard
        </Link>
      </p>
    </ErpShell>
  ),
});

function SheetPage() {
  const { slug } = Route.useParams();
  const mod = getModuleBySlug(slug)!;

  return (
    <ErpShell
      activeSlug={mod.slug}
      title={mod.label}
      subtitle={`Google Sheet tab: ${mod.sheet}`}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Edit in Sheets
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </>
      }
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <SheetView sheet={mod.sheet} filename={mod.slug} title={mod.label} />
      </Suspense>
    </ErpShell>
  );
}

function SheetView({
  sheet,
  filename,
  title,
}: {
  sheet: string;
  filename: string;
  title: string;
}) {
  const { data } = useSuspenseQuery(sheetQuery(sheet));
  const values = data.values;
  const headers = values[0] ?? [];
  const rows = values.slice(1);
  return <SheetTable headers={headers} rows={rows} filename={filename} title={title} />;
}

