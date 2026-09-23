import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErpShell } from "@/components/ErpShell";
import { SheetTable } from "@/components/SheetTable";
import { getSheetRange } from "@/lib/sheets.functions";
import { getModuleBySlug } from "@/lib/erp-modules";
import { getSheetsConnection } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCcw } from "lucide-react";

const q = (sheet: string) => (/[^A-Za-z0-9_]/.test(sheet) ? `'${sheet}'` : sheet);

const sheetQuery = (sheet: string) =>
  queryOptions({
    queryKey: ["erp", "sheet", sheet],
    queryFn: () => getSheetRange({ data: { range: `${q(sheet)}!A1:Z2000` } }),
    staleTime: 30_000,
  });


export const Route = createFileRoute("/_authenticated/sheet/$slug")({
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
  const { data: sheetsConnection } = useQuery({
    queryKey: ["erp", "sheets-connection"],
    queryFn: () => getSheetsConnection(),
    staleTime: 5 * 60_000,
  });

  return (
    <ErpShell
      activeSlug={mod.slug}
      title={mod.label}
      subtitle={`Google Sheet tab: ${mod.sheet}`}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            {sheetsConnection?.spreadsheetId ? (
              <a
                href={`https://docs.google.com/spreadsheets/d/${sheetsConnection.spreadsheetId}/edit#gid=0`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Edit in Sheets
              </a>
            ) : null}
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

