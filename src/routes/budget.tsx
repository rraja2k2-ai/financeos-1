import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { financeQueryOptions } from "@/lib/finance-query";
import { fmtSGD, parseDate, monthKey, isExpense, budgetActiveInMonth } from "@/lib/finance-utils";
import { usePrivacy } from "@/lib/privacy";
import { PERIODS, usePeriod, monthsInRange } from "@/lib/period";

export const Route = createFileRoute("/budget")({
  head: () => ({ meta: [{ title: "Budget — FinanceOS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: BudgetPage,
});

function BudgetPage() {
  const { data } = useSuspenseQuery(financeQueryOptions);
  const { mask } = usePrivacy();
  const { period, setPeriod, range } = usePeriod();

  const monthsCovered = useMemo(() => monthsInRange(range), [range]);
  const monthKeysCovered = useMemo(
    () => new Set(monthsCovered.map(({ year, monthIndex }) => `${year}-${String(monthIndex + 1).padStart(2, "0")}`)),
    [monthsCovered],
  );

  // Spend by specific category across the active period (item-level SGD share).
  const spentBySpecific = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of data.headers) {
      if (!isExpense(h)) continue;
      if (!monthKeysCovered.has(monthKey(parseDate(h.Date)))) continue;
      const receipt = h["Receipt ID (Key)"];
      const sgdTotal = h["SGD Total Amount"] || 0;
      const items = data.itemsByReceipt[receipt];
      if (items && items.length > 0) {
        const itemSum = items.reduce((s, i) => s + (i["Item Total"] || 0), 0) || 1;
        for (const it of items) {
          const share = ((it["Item Total"] || 0) / itemSum) * sgdTotal;
          const k = it["Category (Specific)"] || "Other";
          map.set(k, (map.get(k) || 0) + share);
        }
      } else {
        const k = h["Category (Primary)"] || "Other";
        map.set(k, (map.get(k) || 0) + sgdTotal);
      }
    }
    return map;
  }, [data, monthKeysCovered]);

  // For each budget entry, sum its budgeted amount across every month in the
  // active period where the entry is active per frequency/pattern logic.
  // Entries that aren't active in ANY covered month are omitted.
  const grouped = useMemo(() => {
    const g = new Map<
      string,
      { specific: string; budget: number; spent: number; frequency?: string; pattern?: string }[]
    >();
    for (const [specific, entry] of Object.entries(data.budgetMap)) {
      let activeMonths = 0;
      for (const { monthIndex } of monthsCovered) {
        if (budgetActiveInMonth(entry, monthIndex)) activeMonths += 1;
      }
      if (activeMonths === 0) continue;
      const arr = g.get(entry.primary) || [];
      arr.push({
        specific,
        budget: (entry.budget || 0) * activeMonths,
        spent: spentBySpecific.get(specific) || 0,
        frequency: entry.frequency,
        pattern: entry.pattern,
      });
      g.set(entry.primary, arr);
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.budgetMap, spentBySpecific, monthsCovered]);

  const totalBudget = grouped.reduce((s, [, rows]) => s + rows.reduce((x, r) => x + r.budget, 0), 0);
  const totalSpent = grouped.reduce((s, [, rows]) => s + rows.reduce((x, r) => x + r.spent, 0), 0);
  const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <AppShell title="Budget" subtitle={`${range.label} · ${mask(fmtSGD(totalSpent))} of ${mask(fmtSGD(totalBudget))}`}>
      {/* Period selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-elevated)]">
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wider opacity-80">Total budget used</div>
          <div className="text-sm font-semibold">{pct.toFixed(0)}%</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="opacity-90">{mask(fmtSGD(totalSpent))} spent</span>
          <span className="opacity-90">{mask(fmtSGD(Math.max(totalBudget - totalSpent, 0)))} left</span>
        </div>
      </div>

      <div className="space-y-6 mt-6">
        {grouped.map(([primary, rows]) => {
          const subBudget = rows.reduce((s, r) => s + r.budget, 0);
          const subSpent = rows.reduce((s, r) => s + r.spent, 0);
          return (
            <section key={primary}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{primary}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {mask(fmtSGD(subSpent))} / {mask(fmtSGD(subBudget))}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-card divide-y divide-border shadow-[var(--shadow-card)]">
                {rows.map((r) => {
                  const p = r.budget > 0 ? (r.spent / r.budget) * 100 : 0;
                  const over = p > 100;
                  return (
                    <div key={r.specific} className="p-4">
                      <div className="flex items-center justify-between text-sm gap-2">
                        <span className="font-medium truncate flex items-center gap-2">
                          {r.specific}
                          {r.frequency && r.frequency.toLowerCase() !== "monthly" && (
                            <span className="text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/30">
                              {r.frequency}{r.pattern ? ` · ${r.pattern}` : ""}
                            </span>
                          )}
                        </span>
                        <span className={`tabular-nums shrink-0 ${over ? "text-destructive" : "text-foreground"}`}>
                          {mask(fmtSGD(r.spent))} / {mask(fmtSGD(r.budget))}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            over
                              ? "bg-destructive"
                              : p > 80
                                ? "bg-warning"
                                : "bg-[image:var(--gradient-accent)]"
                          }`}
                          style={{ width: `${Math.min(p, 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {p.toFixed(0)}% used · {mask(fmtSGD(Math.max(r.budget - r.spent, 0)))} left
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
