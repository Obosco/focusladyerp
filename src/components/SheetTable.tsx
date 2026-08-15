import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Download, FileText, Printer, Search, X } from "lucide-react";
import { exportTablePdf, recordDownload, safeName, stamp } from "@/lib/pdf";
import { PRESETS, presetRange, toNum, type PresetKey } from "@/lib/stats";

function findDateCol(headers: string[]) {
  const i = headers.findIndex((h) => /date|day/i.test(h ?? ""));
  return i;
}

function parseDate(v: string | undefined) {
  if (!v) return null;
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (dmy) {
    const d = dmy[1]!.padStart(2, "0");
    const m = dmy[2]!.padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

export function SheetTable({
  headers,
  rows,
  filename,
  title,
}: {
  headers: string[];
  rows: string[][];
  filename: string;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState<PresetKey>("all");
  const [colFilters, setColFilters] = useState<Record<number, string>>({});
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(null);
  const dateCol = useMemo(() => findDateCol(headers), [headers]);

  // Columns worth offering as dropdown filters (few distinct text values).
  const filterableCols = useMemo(() => {
    const out: { index: number; values: string[] }[] = [];
    headers.forEach((h, i) => {
      if (i === dateCol || !h) return;
      const set = new Set<string>();
      for (const r of rows) {
        const v = (r[i] ?? "").trim();
        if (v) set.add(v);
        if (set.size > 25) return;
      }
      if (set.size >= 2) out.push({ index: i, values: [...set].sort() });
    });
    return out.slice(0, 4);
  }, [headers, rows, dateCol]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    const r = presetRange(key);
    if (key === "custom") return;
    setFrom(r.from);
    setTo(r.to);
  };

  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((r) => r.some((c) => (c ?? "").toLowerCase().includes(needle)));
    }
    for (const [k, v] of Object.entries(colFilters)) {
      if (!v) continue;
      const i = Number(k);
      out = out.filter((r) => (r[i] ?? "").trim() === v);
    }
    if (dateCol >= 0 && (from || to)) {
      out = out.filter((r) => {
        const d = parseDate(r[dateCol]);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((a, b) => {
        const av = a[col] ?? "";
        const bv = b[col] ?? "";
        const an = toNum(av);
        const bn = toNum(bv);
        const numeric = /^[\s₹$-]*[\d.,]+\s*$/.test(av) && /^[\s₹$-]*[\d.,]+\s*$/.test(bv);
        const cmp = numeric ? an - bn : av.localeCompare(bv);
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, q, from, to, dateCol, colFilters, sort]);

  const activeFilters =
    (q ? 1 : 0) + (from || to ? 1 : 0) + Object.values(colFilters).filter(Boolean).length;

  const clearAll = () => {
    setQ("");
    setFrom("");
    setTo("");
    setPreset("all");
    setColFilters({});
    setSort(null);
  };

  const label = title ?? filename;

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
    const name = `${safeName(filename)}-${stamp()}.csv`;
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    recordDownload({
      type: "Report",
      reference: label,
      filename: name,
      format: "CSV",
      note: `${filtered.length} rows`,
    });
  };

  const downloadPdf = () =>
    exportTablePdf({
      title: label,
      subtitle:
        from || to
          ? `Period ${from || "start"} → ${to || "today"} · ${filtered.length} rows`
          : `${filtered.length} rows · ${new Date().toLocaleString()}`,
      headers,
      rows: filtered.map((r) => headers.map((_, i) => r[i] ?? "")),
      filename,
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="pl-8"
            />
          </div>
          {dateCol >= 0 ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[9.5rem]"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[9.5rem]"
                aria-label="To date"
              />
              {from || to ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  aria-label="Clear dates"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ) : null}
          {dateCol >= 0 ? (
            <div className="flex flex-wrap gap-1">
              {PRESETS.filter((p) => p.key !== "custom").map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={preset === p.key ? "secondary" : "ghost"}
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          ) : null}
          {filterableCols.map((f) => (
            <select
              key={f.index}
              value={colFilters[f.index] ?? ""}
              onChange={(e) =>
                setColFilters((prev) => ({ ...prev, [f.index]: e.target.value }))
              }
              aria-label={`Filter by ${headers[f.index]}`}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">All {headers[f.index]}</option>
              {f.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="mr-1 h-4 w-4" /> Clear ({activeFilters})
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <FileText className="mr-2 h-4 w-4" /> PDF
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
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() =>
                        setSort((prev) =>
                          prev && prev.col === i
                            ? prev.dir === "asc"
                              ? { col: i, dir: "desc" }
                              : null
                            : { col: i, dir: "asc" },
                        )
                      }
                    >
                      {h || `Col ${i + 1}`}
                      {sort?.col === i ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
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
                      <td key={ci} className="max-w-[22rem] truncate px-4 py-2.5 align-top">
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
