import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, TrendingUp, HandCoins, Wallet, AlertCircle } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { financeQueryOptions } from "@/lib/finance-query";
import { fmtSGD, parseDate } from "@/lib/finance-utils";
import { usePrivacy } from "@/lib/privacy";
import type { AccountRow, HeaderRow } from "@/lib/api/finance.functions";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Accounts — FinanceOS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: AccountsPage,
});

const TRACKED_CURRENCIES = ["SGD", "USD", "INR", "MYR", "THB", "IDR"] as const;
const ALLOCATION_GROUPS = ["Savings", "Investment", "LoanToOthers", "Debt"] as const;

const GROUP_COLORS: Record<string, string> = {
  Savings: "var(--primary)",
  Investment: "var(--accent)",
  LoanToOthers: "var(--success)",
  Debt: "var(--destructive)",
};
const CURRENCY_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--success)",
  "var(--warning)",
  "var(--destructive)",
  "var(--muted-foreground)",
];

// User-facing label for internal group/account-type enums. Keeps the
// backend enum (e.g. "LoanToOthers") untouched while presenting a
// friendlier name in the UI.
const GROUP_LABELS: Record<string, string> = {
  LoanToOthers: "Receivables",
};
const groupLabel = (g: string) => GROUP_LABELS[g] ?? g;

// Currency symbol for native-balance presentation. Falls back to the
// ISO code when no glyph is defined.
const CURRENCY_SYMBOLS: Record<string, string> = {
  SGD: "S$",
  USD: "US$",
  INR: "₹",
  MYR: "RM",
  THB: "฿",
  IDR: "Rp",
};
const fmtNativeBalance = (cur: string, n: number) => {
  const sym = CURRENCY_SYMBOLS[cur];
  const num = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 2 }).format(n || 0);
  return sym ? `${sym}${num}` : `${cur} ${num}`;
};

function AccountsPage() {
  const { data } = useSuspenseQuery(financeQueryOptions);
  const { mask } = usePrivacy();
  const accounts = data.financialAccounts;
  const groups = Array.from(new Set(accounts.map((a) => a.group)));
  const totals = groups.reduce<Record<string, number>>((acc, g) => {
    acc[g] = accounts.filter((a) => a.group === g).reduce((s, a) => s + (a.weightSGD || 0), 0);
    return acc;
  }, {});
  const net = data.meta.netWorthSGD;

  const [openAccount, setOpenAccount] = useState<string | null>(null);

  // Currency-bucket split (INR broken out; everything else under SGD).
  const SPLIT_CURRENCIES = ["SGD", "INR"] as const;
  type Bucket = (typeof SPLIT_CURRENCIES)[number];
  const bucketOf = (a: AccountRow): Bucket => (a.currency === "INR" ? "INR" : "SGD");

  const fmtNative = fmtNativeBalance;

  // ---- Portfolio aggregates ----
  const portfolio = useMemo(() => {
    const sumGroup = (g: string) =>
      accounts.filter((a) => a.group === g).reduce((s, a) => s + Math.abs(a.weightSGD || 0), 0);
    return {
      investments: sumGroup("Investment"),
      receivables: sumGroup("LoanToOthers"),
      debt: sumGroup("Debt"),
    };
  }, [accounts]);

  const currencyExposure = useMemo(() => {
    // Sum |weightSGD| per currency, only for assets (non-Debt) so it shows what you hold.
    const map = new Map<string, number>();
    for (const a of accounts) {
      if (a.group === "Debt") continue;
      const cur = TRACKED_CURRENCIES.includes(a.currency as never) ? a.currency : "Other";
      map.set(cur, (map.get(cur) || 0) + Math.abs(a.weightSGD || 0));
    }
    const total = Array.from(map.values()).reduce((s, n) => s + n, 0) || 1;
    return Array.from(map.entries())
      .map(([currency, sgd]) => ({ currency, sgd, pct: (sgd / total) * 100 }))
      .sort((a, b) => b.sgd - a.sgd);
  }, [accounts]);

  const allocation = useMemo(() => {
    return ALLOCATION_GROUPS.map((g) => ({
      name: g,
      value: accounts.filter((a) => a.group === g).reduce((s, a) => s + Math.abs(a.weightSGD || 0), 0),
    })).filter((d) => d.value > 0);
  }, [accounts]);

  // ---- Drilldown: latest 10 receipts touching this account ----
  function recentForAccount(name: string): HeaderRow[] {
    return [...data.headers]
      .filter(
        (h) =>
          h["Payment Method(Source)"] === name ||
          h["Target Account"] === name,
      )
      .sort((a, b) => parseDate(b.Date).getTime() - parseDate(a.Date).getTime())
      .slice(0, 10);
  }

  return (
    <AppShell title="Accounts" subtitle="Assets, savings and debt across currencies">
      <div className="rounded-2xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-elevated)]">
        <div className="text-xs uppercase tracking-wider opacity-80">Net Worth (SGD)</div>
        <div className="mt-1 text-3xl md:text-4xl font-semibold">{mask(fmtSGD(net))}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {groups.map((g) => (
            <div key={g} className="opacity-90">
              {groupLabel(g)}: <span className="font-semibold ml-1">{mask(fmtSGD(totals[g]))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Portfolio ---------- */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Portfolio
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            SGD equivalent
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PortfolioTile
            label="Total Investments"
            value={mask(fmtSGD(portfolio.investments))}
            icon={<TrendingUp className="size-4 text-primary" />}
          />
          <PortfolioTile
            label="Total Receivables"
            value={mask(fmtSGD(portfolio.receivables))}
            icon={<HandCoins className="size-4 text-success" />}
          />
          <PortfolioTile
            label="Total Debt"
            value={mask(fmtSGD(portfolio.debt))}
            icon={<AlertCircle className="size-4 text-destructive" />}
            tone="destructive"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Currency Exposure</h3>
              <Wallet className="size-4 text-muted-foreground" />
            </div>
            {currencyExposure.length === 0 ? (
              <div className="h-44 grid place-items-center text-xs text-muted-foreground">
                No exposure data.
              </div>
            ) : (
              <>
                <div className="h-44 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={currencyExposure}
                      margin={{ top: 5, right: 8, bottom: 0, left: 4 }}
                    >
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="currency"
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
                        width={64}
                        tickFormatter={(v: number) =>
                          `S$${new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 }).format(v || 0)}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [fmtSGD(v), "Exposure"]}
                      />
                      <Bar dataKey="sgd" radius={[6, 6, 0, 0]}>
                        {currencyExposure.map((_e, i) => (
                          <Cell key={i} fill={CURRENCY_COLORS[i % CURRENCY_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {currencyExposure.map((c, i) => (
                    <li key={c.currency} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-sm"
                        style={{ background: CURRENCY_COLORS[i % CURRENCY_COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{c.currency}</span>
                      <span className="ml-auto tabular-nums">{c.pct.toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Asset Allocation</h3>
            {allocation.length === 0 ? (
              <div className="h-44 grid place-items-center text-xs text-muted-foreground">
                No allocation data.
              </div>
            ) : (
              <>
                <div className="h-44 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocation}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="85%"
                        paddingAngle={2}
                      >
                        {allocation.map((d) => (
                          <Cell key={d.name} fill={GROUP_COLORS[d.name] || "var(--muted-foreground)"} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number, n) => [fmtSGD(v), n as string]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {allocation.map((d) => {
                    const sum = allocation.reduce((s, x) => s + x.value, 0) || 1;
                    return (
                      <li key={d.name} className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2 rounded-sm"
                          style={{ background: GROUP_COLORS[d.name] }}
                        />
                        <span className="text-muted-foreground truncate">{groupLabel(d.name)}</span>
                        <span className="ml-auto tabular-nums">{((d.value / sum) * 100).toFixed(0)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      {groups.map((g) => {
        const inGroup = accounts.filter((a) => a.group === g);
        return SPLIT_CURRENCIES.map((bucket) => {
          const list = inGroup
            .filter((a) => bucketOf(a) === bucket)
            .sort((a, b) => Math.abs(b.weightSGD) - Math.abs(a.weightSGD));
          if (list.length === 0) return null;

          const sgdTotal = list.reduce((s, a) => s + (a.weightSGD || 0), 0);
          const nativeTotal = list.every((a) => a.currency === bucket)
            ? list.reduce((s, a) => s + (a.balance || 0), 0)
            : null;

          return (
            <section key={`${g}-${bucket}`} className="mt-6">
              <div className="flex items-baseline justify-between mb-2 gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {groupLabel(g)} — {bucket}
                </h2>
                <div className="text-right shrink-0">
                  {nativeTotal !== null && bucket !== "SGD" ? (
                    <>
                      <div className="text-sm font-medium tabular-nums">
                        {mask(fmtNative(bucket, nativeTotal))}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        ≈ {mask(fmtSGD(sgdTotal))}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm font-medium tabular-nums">{mask(fmtSGD(sgdTotal))}</div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card divide-y divide-border shadow-[var(--shadow-card)]">
                {list.map((a) => {
                  const open = openAccount === a.name;
                  const recent = open ? recentForAccount(a.name) : [];
                  return (
                    <div key={a.name}>
                      <button
                        type="button"
                        onClick={() => setOpenAccount(open ? null : a.name)}
                        className="w-full text-left p-4 flex items-center justify-between gap-4 hover:bg-accent/30 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <ChevronDown
                            className={`size-4 text-muted-foreground transition-transform shrink-0 ${
                              open ? "rotate-0" : "-rotate-90"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{a.name}</div>
                            {a.currency !== "SGD" && a.rate ? (
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                                Exchange Rate: {a.rate}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold tabular-nums">
                            {mask(
                              a.currency === "SGD"
                                ? fmtSGD(a.weightSGD)
                                : fmtNative(a.currency, a.balance),
                            )}
                          </div>
                          {a.currency !== "SGD" && (
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              ≈ {mask(fmtSGD(a.weightSGD))}
                            </div>
                          )}
                        </div>
                      </button>
                      {open && (
                        <div className="px-4 pb-4">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                            Recent activity · latest {recent.length}
                          </div>
                          {recent.length === 0 ? (
                            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground text-center">
                              No transactions linked to this account.
                            </div>
                          ) : (
                            <ul className="rounded-lg border border-border/60 divide-y divide-border/60 bg-muted/10">
                              {recent.map((t) => (
                                <li
                                  key={t["Receipt ID (Key)"]}
                                  className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">
                                      {t.Merchant || t["Target Account"] || "—"}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {t.Date} · {t["Transaction Type"]}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-semibold tabular-nums">
                                      {mask(
                                        `${t.Currency} ${new Intl.NumberFormat("en-SG", {
                                          maximumFractionDigits: 2,
                                        }).format(t["Original Amount"] || 0)}`,
                                      )}
                                    </div>
                                    {t.Currency !== "SGD" && (
                                      <div className="text-[10px] text-muted-foreground">
                                        ≈ {mask(fmtSGD(t["SGD Total Amount"]))}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        });
      })}
    </AppShell>
  );
}

function PortfolioTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "destructive";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "destructive" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
