import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ErpShell } from "@/components/ErpShell";
import { SheetTable } from "@/components/SheetTable";
import { getSheetRange, getSheetsConnection } from "@/lib/sheets.functions";
import { resolveSheetConfig } from "@/lib/erp-modules";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCcw } from "lucide-react";

const q = (sheet: string) => (/[^A-Za-z0-9_]/.test(sheet) ? `'${sheet}'` : sheet);

const sheetQuery = (sheet: string) =>
  queryOptions({
    queryKey: ["erp", "sheet", sheet],
    queryFn: async () => {
      const result = await getSheetRange({ data: { range: `${q(sheet)}!A1:Z2000` } });
      const values = Array.isArray(result?.values) ? result.values : Array.isArray(result?.data) ? result.data : [];
      if (!result?.success || !Array.isArray(values)) {
        throw new Error(result?.error ?? `Unable to load ${sheet}`);
      }
      return values;
    },
    staleTime: 30_000,
    retry: (failureCount, error) => {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (/Google Sheets is busy|RESOURCE_EXHAUSTED|quota|rate[ -]?limit|HTTP 429/i.test(message)) return false;
      if (message.includes("Unable to load") || message.includes("not available")) return false;
      return failureCount < 2;
    },
  });

export const Route = createFileRoute("/_authenticated/sheet/$slug")({
  head: ({ params }) => {
    const mod = resolveSheetConfig(params.slug);
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
    const mod = resolveSheetConfig(params.slug);
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
  const mod = resolveSheetConfig(slug);
  const { data: sheetsConnection } = useQuery({
    queryKey: ["erp", "sheets-connection"],
    queryFn: () => getSheetsConnection(),
    staleTime: 5 * 60_000,
  });

  if (!mod) {
    return (
      <ErpShell activeSlug="" title="Unable to load sheet">
        <div className="max-w-md space-y-3 rounded-md border border-border bg-card p-4">
          <p className="text-base font-medium">Unable to load this sheet.</p>
          <p className="text-sm text-muted-foreground">
            This page is not available in the current ERP configuration.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Link to="/" className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </ErpShell>
    );
  }

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
      {mod.slug === "products" ? (
        <Button variant="outline" size="sm" asChild className="mr-2">
          <Link to="/products/new">Add product</Link>
        </Button>
      ) : null}
      <SheetView sheet={mod.sheet} filename={mod.slug} title={mod.label} />
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
  const { data, isLoading, error, refetch } = useQuery(sheetQuery(sheet));

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const values = Array.isArray(data) ? data : Array.isArray((data as any)?.values) ? (data as any).values : [];

  if (error || !Array.isArray(values)) {
    const message = error instanceof Error ? error.message : `Unable to load ${title}`;
    return (
      <div className="max-w-md space-y-3 rounded-md border border-border bg-card p-4">
        <p className="text-base font-medium">Unable to load {title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
          <Link to="/" className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }
  const headers = Array.isArray(values[0]) ? values[0].map((cell) => String(cell ?? "")) : [];
  const rows = values.slice(1).filter(Array.isArray) as string[][];
  return <SheetTable headers={headers} rows={rows} filename={filename} title={title} />;
}

