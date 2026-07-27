import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Printer, Search } from "lucide-react";

export function SheetTable({
  headers,
  rows,
  filename,
}: {
  headers: string[];
  rows: string[][];
  filename: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => r.some((c) => (c ?? "").toLowerCase().includes(needle)));
  }, [rows, q]);

  const downloadCsv = () => {
    const escape = (v: string) => {
      const s = v ?? "";
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...filtered]
      .map((r) => r.map((c) => escape(String(c ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${filename}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">
                    {h || `Col ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(headers.length, 1)}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No records yet.
                  </td>
                </tr>
              ) : (
                filtered.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-t border-border transition-colors hover:bg-muted/30"
                  >
                    {headers.map((_, ci) => (
                      <td key={ci} className="px-4 py-2.5 align-top">
                        {row[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-xs text-muted-foreground print:hidden">
        Showing {filtered.length} of {rows.length} rows
      </div>
    </div>
  );
}
