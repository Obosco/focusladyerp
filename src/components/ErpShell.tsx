import { Link, useRouterState } from "@tanstack/react-router";
import { MODULES, GROUPS, SPREADSHEET_ID, type ErpModule } from "@/lib/erp-modules";
import { cn } from "@/lib/utils";
import { ExternalLink, FilePlus2, History, Receipt } from "lucide-react";
import type { ReactNode } from "react";

function NavItem({ mod, active }: { mod: ErpModule; active: boolean }) {
  const Icon = mod.icon;
  const to = mod.slug === "dashboard" ? "/" : `/sheet/${mod.slug}`;
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{mod.label}</span>
    </Link>
  );
}

export function ErpShell({
  children,
  activeSlug,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  activeSlug: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="border-b border-sidebar-border px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Focus Lady Bra
            </div>
            <div className="text-base font-semibold text-sidebar-foreground">ERP</div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="mb-4">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invoicing
              </div>
              <div className="flex flex-col gap-0.5">
                {[
                  { to: "/invoices/new", label: "New Invoice", Icon: FilePlus2, slug: "invoices" },
                  { to: "/invoices", label: "Invoices", Icon: Receipt, slug: "invoices" },
                  { to: "/downloads", label: "Downloads", Icon: History, slug: "downloads" },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      path === l.to
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <l.Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {GROUPS.map((g) => (
              <div key={g} className="mb-4">
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g}
                </div>
                <div className="flex flex-col gap-0.5">
                  {MODULES.filter((m) => m.group === g).map((m) => (
                    <NavItem
                      key={m.slug}
                      mod={m}
                      active={
                        activeSlug === m.slug ||
                        (m.slug === "dashboard" && path === "/")
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <a
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Sheet
            </a>
          </div>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                {subtitle ? (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">{actions}</div>
            </div>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
