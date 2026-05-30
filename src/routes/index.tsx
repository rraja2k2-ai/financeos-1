import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrendingUp, HeartPulse, Receipt, PiggyBank, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { TransactionDrawer } from "@/components/TransactionDrawer";
import { financeQueryOptions } from "@/lib/finance-query";
import { fmtSGD, parseDate, monthKey, currentMonthKey, isExpense, isIncome, groupByMonth, budgetActiveInMonth } from "@/lib/finance-utils";
import { usePrivacy } from "@/lib/privacy";
import { PERIODS, usePeriod } from "@/lib/period";
import type { HeaderRow } from "@/lib/api/finance.functions";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Dashboard — FinanceOS" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(financeQueryOptions);
  const { mask } = usePrivacy();
  const { period, setPeriod, range } = usePeriod();
  const [selected, setSelected] = useState<HeaderRow | null>(null);


  const inRange = (h: { Date: string }) => {
    const d = parseDate(h.Date);
    return d >= range.start && d <= range.end;
  };

  const thisMonth = currentMonthKey();
  const allMonths = groupByMonth(data.headers);

  // Spend within selected period
  const periodSpend = useMemo(
    () =>
      data.headers
        .filter((h) => isExpense(h) && inRange(h))
        .reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.headers, period],
  );

  // Previous-period comparison (same length, immediately before range)
  const prevSpend = useMemo(() => {
    const len = range.end.getTime() - range.start.getTime();
    const prevEnd = new Date(range.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - len);
    return data.headers
      .filter((h) => {
        if (!isExpense(h)) return false;
        const d = parseDate(h.Date);
        return d >= prevStart && d <= prevEnd;
      })
      .reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.headers, period]);
  const delta = prevSpend > 0 ? ((periodSpend - prevSpend) / prevSpend) * 100 : 0;

  const currentMonthIdx = new Date().getMonth();
  const totalBudget = Object.values(data.budgetMap)
    .filter((b) => budgetActiveInMonth(b, currentMonthIdx))
    .reduce((s, b) => s + (b.budget || 0), 0);

  // Income for selected period
  const income = useMemo(
    () =>
      data.headers
        .filter((h) => isIncome(h) && inRange(h))
        .reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.headers, period],
  );
  const savingsRate = income > 0 ? ((income - periodSpend) / income) * 100 : 0;

  // Net Worth always uses current position
  const currentMonthSpend = allMonths.find(([k]) => k === thisMonth)?.[1] ?? 0;
  const debt = data.financialAccounts
    .filter((a) => a.group === "Debt")
    .reduce((s, a) => s + Math.abs(a.weightSGD || 0), 0);
  const cash = data.financialAccounts
    .filter((a) => a.group === "Savings")
    .reduce((s, a) => s + (a.weightSGD || 0), 0);
  const currentIncome = data.headers
    .filter((h) => isIncome(h) && monthKey(parseDate(h.Date)) === thisMonth)
    .reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0);

  // Financial Health Score
  const score = (() => {
    if (typeof data.meta.financialHealthScore === "number") {
      return Math.max(0, Math.min(100, Math.round(data.meta.financialHealthScore)));
    }
    const sr = Math.max(0, Math.min(100, savingsRate));
    const budgetUse = totalBudget > 0 ? Math.min(100, (currentMonthSpend / totalBudget) * 100) : 50;
    const budgetScore = 100 - Math.abs(80 - budgetUse);
    const assets = cash;
    const debtRatio = assets > 0 ? Math.min(1, debt / assets) : debt > 0 ? 1 : 0;
    const debtScore = (1 - debtRatio) * 100;
    return Math.max(0, Math.min(100, Math.round(0.5 * sr + 0.25 * budgetScore + 0.25 * debtScore)));
  })();
  const scoreBand = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 50 ? "Fair" : "Needs work";
  const scoreAccent: "success" | "primary" | "destructive" =
    score >= 80 ? "success" : score >= 50 ? "primary" : "destructive";

  // Recent 5 expenses in period
  const recent = useMemo(
    () =>
      [...data.headers]
        .filter((h) => isExpense(h) && inRange(h))
        .sort((a, b) => parseDate(b.Date).getTime() - parseDate(a.Date).getTime())
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.headers, period],
  );

  // Category breakdown for period
  const cats = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const h of data.headers) {
      if (!isExpense(h) || !inRange(h)) continue;
      const k = h["Category (Primary)"] || "Other";
      catMap.set(k, (catMap.get(k) || 0) + (h["SGD Total Amount"] || 0));
    }
    return Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.headers, period]);
  const catMax = cats[0]?.[1] || 1;

  // Spending trend: months that overlap the selected period (at least 2 buckets so chart looks like a trend)
  const trendData = useMemo(() => {
    const startKey = monthKey(range.start);
    const endKey = monthKey(range.end);
    const filtered = allMonths.filter(([k]) => k >= startKey && k <= endKey);
    return filtered.length >= 2 ? filtered : allMonths.slice(-6);
  }, [allMonths, range]);

  return (
    <AppShell title="Dashboard" subtitle={`Updated ${formatUpdated(data.lastUpdated)}`}>
      {/* Net worth hero */}
      <div className="rounded-2xl bg-[image:var(--gradient-primary)] p-5 md:p-7 text-primary-foreground shadow-[var(--shadow-elevated)]">
        <div className="text-xs uppercase tracking-wider opacity-80">Net Worth</div>
        <div className="mt-2 text-3xl md:text-5xl font-semibold tracking-tight">
          {mask(fmtSGD(data.meta.netWorthSGD))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="opacity-90">Cash <span className="font-semibold ml-1">{mask(fmtSGD(cash))}</span></div>
          <div className="opacity-90">Debt <span className="font-semibold ml-1">{mask(fmtSGD(debt))}</span></div>
          <div className="opacity-90">Income <span className="font-semibold ml-1">{mask(fmtSGD(currentIncome))}/mo</span></div>
        </div>
      </div>

      {/* Period selector */}
      <div className="mt-5 flex flex-wrap gap-2">
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-4">
        <StatCard
          label={`${range.label} Spend`}
          value={fmtSGD(periodSpend)}
          icon={<Receipt className="size-4 text-muted-foreground" />}
          hint={
            prevSpend > 0 ? (
              <span className={`inline-flex items-center gap-1 ${delta > 0 ? "text-destructive" : "text-success"}`}>
                {delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(delta).toFixed(1)}% vs prior
              </span>
            ) : null
          }
        />
        <StatCard
          label="Monthly Budget"
          value={fmtSGD(totalBudget)}
          icon={<PiggyBank className="size-4 text-muted-foreground" />}
          hint={totalBudget > 0 ? `${((currentMonthSpend / totalBudget) * 100).toFixed(0)}% used` : "—"}
        />
        <StatCard
          label="Savings Rate"
          value={`${savingsRate.toFixed(0)}%`}
          accent={savingsRate >= 20 ? "success" : "destructive"}
          icon={<TrendingUp className="size-4 text-muted-foreground" />}
          hint={income > 0 ? `Income ${fmtSGD(income)}` : "No income in period"}
        />
        <StatCard
          label="Financial Health"
          value={`${score} / 100`}
          accent={scoreAccent}
          icon={<HeartPulse className="size-4 text-muted-foreground" />}
          hint={scoreBand}
        />
      </div>

      {/* Spend trend + categories */}
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Spending trend</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{range.label}</span>
          </div>
          <SpendTrend data={trendData} />
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="font-semibold">Top categories · {range.label}</h3>
          <ul className="mt-3 space-y-3">
            {cats.length === 0 && <li className="text-sm text-muted-foreground">No expenses in this period.</li>}
            {cats.map(([name, amt]) => (
              <li key={name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{name}</span>
                  <span className="font-medium tabular-nums">{fmtSGD(amt)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-[image:var(--gradient-accent)]"
                    style={{ width: `${(amt / catMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] mt-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Recent transactions</h3>
          <a href="/expenses" className="text-xs text-accent hover:underline">View all</a>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {recent.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">No transactions in this period.</li>
          )}
          {recent.map((t) => (
            <li key={t["Receipt ID (Key)"]}>
              <button
                type="button"
                onClick={() => setSelected(t)}
                className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-accent/30 transition-colors cursor-pointer rounded-md -mx-2 px-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.Merchant || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.Date} · {t["Category (Primary)"]}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{fmtSGD(t["SGD Total Amount"])}</div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t.Currency}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <TransactionDrawer
        transaction={selected}
        itemsByReceipt={data.itemsByReceipt}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}


function niceCeil(v: number) {
  if (v <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pow;
}

function fmtAxisSGD(v: number) {
  return `S$${new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 }).format(v || 0)}`;
}

function SpendTrend({ data }: { data: [string, number][] }) {
  const chartData = data.map(([k, v]) => ({ month: k.slice(5), full: k, value: Math.round(v) }));
  if (chartData.length === 0) {
    return (
      <div className="mt-4 h-44 grid place-items-center text-sm text-muted-foreground">
        No spending data yet.
      </div>
    );
  }
  // Build nice y-axis ticks (5 evenly-spaced steps).
  const peak = Math.max(...chartData.map((d) => d.value), 0);
  const niceMax = niceCeil(peak) || 100;
  const step = niceMax / 4;
  const ticks = [0, step, step * 2, step * 3, niceMax].map((t) => Math.round(t));
  return (
    <div className="mt-4 h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={[0, niceMax]}
            ticks={ticks}
            tickFormatter={fmtAxisSGD}
            width={64}
          />

          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as { full: string }).full : "")}
            formatter={(v: number) => [fmtSGD(v), "Spend"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#spendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Stable, locale/timezone-independent formatter to avoid SSR hydration mismatches.
function formatUpdated(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
