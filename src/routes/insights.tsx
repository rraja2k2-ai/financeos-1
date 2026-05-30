import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { financeQueryOptions } from "@/lib/finance-query";
import { fmtSGD, parseDate, monthKey, currentMonthKey, isExpense, groupByMonth } from "@/lib/finance-utils";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Insights — FinanceOS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: InsightsPage,
});

interface Insight {
  type: "positive" | "warning" | "info" | "goal";
  title: string;
  body: string;
}

function InsightsPage() {
  const { data } = useSuspenseQuery(financeQueryOptions);

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const month = currentMonthKey();
    const months = groupByMonth(data.headers);
    const thisIdx = months.findIndex(([k]) => k === month);
    const thisSpend = months[thisIdx]?.[1] ?? 0;
    const lastSpend = months[thisIdx - 1]?.[1] ?? 0;

    if (lastSpend > 0) {
      const delta = ((thisSpend - lastSpend) / lastSpend) * 100;
      if (Math.abs(delta) >= 5) {
        out.push({
          type: delta > 0 ? "warning" : "positive",
          title: delta > 0 ? `Spending up ${delta.toFixed(0)}%` : `Spending down ${Math.abs(delta).toFixed(0)}%`,
          body: `You've spent ${fmtSGD(thisSpend)} this month vs ${fmtSGD(lastSpend)} last month.`,
        });
      }
    }

    // Income vs spend
    const income = Object.values(data.meta.fixedIncomeMap || {}).reduce((s, n) => s + (n || 0), 0);
    if (income > 0) {
      const rate = ((income - thisSpend) / income) * 100;
      if (rate >= 30)
        out.push({
          type: "positive",
          title: `Strong savings rate — ${rate.toFixed(0)}%`,
          body: `You're saving ${fmtSGD(income - thisSpend)} this month out of ${fmtSGD(income)} income.`,
        });
      else if (rate < 10)
        out.push({
          type: "warning",
          title: `Low savings rate — ${rate.toFixed(0)}%`,
          body: `Spending is consuming most of your income. Target at least 20%.`,
        });
    }

    // Budget overruns
    const spentByCat = new Map<string, number>();
    for (const h of data.headers) {
      if (!isExpense(h)) continue;
      if (monthKey(parseDate(h.Date)) !== month) continue;
      const receipt = h["Receipt ID (Key)"];
      const items = data.itemsByReceipt[receipt];
      const sgd = h["SGD Total Amount"] || 0;
      if (items && items.length) {
        const sum = items.reduce((s, i) => s + (i["Item Total"] || 0), 0) || 1;
        for (const it of items) {
          const k = it["Category (Specific)"] || "Other";
          spentByCat.set(k, (spentByCat.get(k) || 0) + ((it["Item Total"] || 0) / sum) * sgd);
        }
      }
    }
    const overruns = Object.entries(data.budgetMap)
      .map(([k, v]) => ({ k, budget: v.budget, spent: spentByCat.get(k) || 0 }))
      .filter((r) => r.budget > 0 && r.spent > r.budget)
      .sort((a, b) => b.spent - b.budget - (a.spent - a.budget))
      .slice(0, 3);
    for (const o of overruns) {
      out.push({
        type: "warning",
        title: `${o.k} is over budget`,
        body: `Spent ${fmtSGD(o.spent)} of ${fmtSGD(o.budget)} budget (${(((o.spent - o.budget) / o.budget) * 100).toFixed(0)}% over).`,
      });
    }

    // Top merchant
    const merchants = new Map<string, number>();
    for (const h of data.headers) {
      if (!isExpense(h)) continue;
      if (monthKey(parseDate(h.Date)) !== month) continue;
      merchants.set(h.Merchant, (merchants.get(h.Merchant) || 0) + (h["SGD Total Amount"] || 0));
    }
    const top = Array.from(merchants.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      out.push({
        type: "info",
        title: `Top merchant: ${top[0]}`,
        body: `${fmtSGD(top[1])} this month.`,
      });
    }

    // Debt
    const debt = data.financialAccounts
      .filter((a) => a.group === "Debt")
      .reduce((s, a) => s + Math.abs(a.weightSGD || 0), 0);
    if (debt > 0)
      out.push({
        type: "goal",
        title: `${fmtSGD(debt)} outstanding debt`,
        body: `Paying down debt earns a guaranteed return equal to the interest rate.`,
      });

    return out;
  }, [data]);

  const ICONS = {
    positive: TrendingUp,
    warning: AlertTriangle,
    info: Sparkles,
    goal: Target,
  } as const;
  const ACCENTS = {
    positive: "text-success bg-success/10 border-success/30",
    warning: "text-destructive bg-destructive/10 border-destructive/30",
    info: "text-accent bg-accent/10 border-accent/30",
    goal: "text-primary bg-primary/10 border-primary/30",
  } as const;

  return (
    <AppShell title="Insights" subtitle="Smart observations from your finances">
      {insights.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Not enough data yet — add a few more transactions to unlock insights.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((i, idx) => {
            const Icon = ICONS[i.type];
            return (
              <div
                key={idx}
                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] flex gap-3"
              >
                <div className={`size-10 rounded-lg flex items-center justify-center border shrink-0 ${ACCENTS[i.type]}`}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">{i.title}</div>
                  <p className="text-sm text-muted-foreground mt-0.5">{i.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        Tip: rule 1 — all spend is shown in SGD via the <code>SGD Total Amount</code> column for accuracy across
        currencies.
      </div>
    </AppShell>
  );
}
