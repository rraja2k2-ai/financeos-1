import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, FolderKanban } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { financeQueryOptions } from "@/lib/finance-query";
import { fmtSGD, isExpense, projectOf, GENERIC_PROJECT, parseDate } from "@/lib/finance-utils";
import { TransactionDrawer } from "@/components/TransactionDrawer";
import type { HeaderRow } from "@/lib/api/finance.functions";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects — FinanceOS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data } = useSuspenseQuery(financeQueryOptions);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [selected, setSelected] = useState<HeaderRow | null>(null);

  const projects = useMemo(() => {
    const map = new Map<string, HeaderRow[]>();
    for (const h of data.headers) {
      if (!isExpense(h)) continue;
      const p = projectOf(h);
      if (p === GENERIC_PROJECT) continue;
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(h);
    }
    return Array.from(map.entries())
      .map(([name, list]) => ({
        name,
        list: list.sort((a, b) => parseDate(b.Date).getTime() - parseDate(a.Date).getTime()),
        total: list.reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0),
        count: list.length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [data.headers]);

  const grandTotal = projects.reduce((s, p) => s + p.total, 0);

  return (
    <AppShell
      title="Projects"
      subtitle={`${projects.length} active · ${fmtSGD(grandTotal)} total`}
    >
      {projects.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FolderKanban className="mx-auto size-8 text-muted-foreground mb-2" />
          <div className="text-sm font-medium">No projects yet</div>
          <p className="text-xs text-muted-foreground mt-1">
            Tag transactions with a Project (e.g. "Thailand Trip 2026") to track
            initiatives, events or goals here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => {
            const open = openProject === p.name;
            const catMap = new Map<string, number>();
            for (const h of p.list) {
              const c = h["Category (Primary)"] || "Uncategorised";
              catMap.set(c, (catMap.get(c) || 0) + (h["SGD Total Amount"] || 0));
            }
            const cats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);

            return (
              <li
                key={p.name}
                className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenProject(open ? null : p.name)}
                  className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.count} transactions
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{fmtSGD(p.total)}</div>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border px-4 py-3 space-y-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        Category Breakdown
                      </div>
                      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/20">
                        {cats.map(([name, total]) => (
                          <li
                            key={name}
                            className="flex items-center justify-between text-xs px-3 py-2"
                          >
                            <span className="text-muted-foreground">{name}</span>
                            <span className="tabular-nums font-medium">
                              {fmtSGD(total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        Transactions
                      </div>
                      <ul className="rounded-lg border border-border/60 divide-y divide-border/60">
                        {p.list.map((t) => (
                          <li key={t["Receipt ID (Key)"]}>
                            <button
                              type="button"
                              onClick={() => setSelected(t)}
                              className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {t.Merchant || "—"}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {t.Date} · {t["Category (Primary)"]}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-semibold tabular-nums">
                                  {fmtSGD(t["SGD Total Amount"] || 0)}
                                </div>
                                {t.Currency !== "SGD" && (
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {t.Currency} {t["Original Amount"]}
                                  </div>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <TransactionDrawer
        transaction={selected}
        itemsByReceipt={data.itemsByReceipt}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}
