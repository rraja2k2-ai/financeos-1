import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, ArrowLeftRight, CreditCard, HandCoins, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { financeQueryOptions } from "@/lib/finance-query";
import { fmtSGD, parseDate, monthKey, isExpense, buildCategoryTaxonomy, resolveCategory } from "@/lib/finance-utils";
import { PERIODS, usePeriod } from "@/lib/period";

import { TransactionDrawer } from "@/components/TransactionDrawer";
import type { HeaderRow } from "@/lib/api/finance.functions";


export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — FinanceOS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { data } = useSuspenseQuery(financeQueryOptions);
  const { period, setPeriod, range } = usePeriod();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [selected, setSelected] = useState<HeaderRow | null>(null);
  const [bucket, setBucket] = useState<"SGD" | "INR">("SGD");
  const [moveType, setMoveType] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);

  const bucketOf = (h: HeaderRow) => (h.Currency === "INR" ? "INR" : "SGD");
  const inRange = (h: { Date: string }) => {
    const d = parseDate(h.Date);
    return d >= range.start && d <= range.end;
  };

  // Per-currency stats for the tab cards (respect search + category filters
  // and the global analytics period).
  const baseFiltered = useMemo(() => {
    return data.headers
      .filter(isExpense)
      .filter(inRange)
      .filter((h) => (cat === "All" ? true : h["Category (Primary)"] === cat))
      .filter((h) => {
        if (!q) return true;
        const s = q.toLowerCase();
        return (
          (h.Merchant || "").toLowerCase().includes(s) ||
          (h["Category (Primary)"] || "").toLowerCase().includes(s) ||
          (h.Comments || "").toLowerCase().includes(s)
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.headers, q, cat, period]);


  const stats = useMemo(() => {
    const sgdList = baseFiltered.filter((h) => bucketOf(h) === "SGD");
    const inrList = baseFiltered.filter((h) => bucketOf(h) === "INR");
    return {
      SGD: {
        count: sgdList.length,
        total: sgdList.reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0),
      },
      INR: {
        count: inrList.length,
        total: inrList.reduce((s, h) => s + (h["Original Amount"] || 0), 0),
      },
    };
  }, [baseFiltered]);

  const fmtINR = (n: number) =>
    `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0)}`;

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(data.headers.filter(isExpense).map((h) => h["Category (Primary)"]).filter(Boolean)))],
    [data.headers],
  );

  const filtered = useMemo(() => {
    return baseFiltered
      .filter((h) => bucketOf(h) === bucket)
      .sort((a, b) => parseDate(b.Date).getTime() - parseDate(a.Date).getTime());
  }, [baseFiltered, bucket]);

  // Group by month
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const h of filtered) {
      const k = monthKey(parseDate(h.Date));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const isINR = bucket === "INR";
  const amountOf = (h: HeaderRow) =>
    isINR ? (h["Original Amount"] || 0) : (h["SGD Total Amount"] || 0);
  const fmtAmt = (n: number) => (isINR ? fmtINR(n) : fmtSGD(n));
  const totalFiltered = filtered.reduce((s, h) => s + amountOf(h), 0);

  // ---------- Other Movements (informational, never spending) ----------
  const MOVEMENT_TYPES = [
    { key: "Transfer", label: "Transfers", icon: ArrowLeftRight },
    { key: "Credit Card Payment", label: "Credit Card Payments", icon: CreditCard },
    { key: "Lending", label: "Lending", icon: HandCoins },
  ] as const;

  const movementsByType = useMemo(() => {
    const out: Record<string, HeaderRow[]> = {};
    for (const m of MOVEMENT_TYPES) out[m.key] = [];
    for (const h of data.headers) {
      if (bucketOf(h) !== bucket) continue;
      if (!inRange(h)) continue;
      const t = h["Transaction Type"];
      if (out[t]) out[t].push(h);
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => parseDate(b.Date).getTime() - parseDate(a.Date).getTime());
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.headers, bucket, period]);

  // ---------- Spending analytics (active period, current bucket) ----------

  // Master Expenses summary: active period, all currencies, SGD-converted.
  // Mirrors Dashboard → Period Spend, independent of the active bucket.
  const masterPeriod = useMemo(() => {
    const list = data.headers.filter((h) => isExpense(h) && inRange(h));
    return {
      count: list.length,
      totalSGD: list.reduce((s, h) => s + (h["SGD Total Amount"] || 0), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.headers, period]);
  const taxonomy = useMemo(() => buildCategoryTaxonomy(data.budgetMap), [data.budgetMap]);

  const analytics = useMemo(() => {
    const periodExpenses = data.headers.filter(
      (h) => isExpense(h) && bucketOf(h) === bucket && inRange(h),
    );
    const primary = new Map<string, { total: number; receipts: HeaderRow[] }>();
    for (const h of periodExpenses) {
      const { primary: resolved } = resolveCategory(h["Category (Primary)"], "", taxonomy);
      const entry = primary.get(resolved) || { total: 0, receipts: [] };
      entry.total += amountOf(h);
      entry.receipts.push(h);
      primary.set(resolved, entry);
    }
    const rows = Array.from(primary.entries())
      .map(([name, v]) => ({ name, total: v.total, receipts: v.receipts }))
      .sort((a, b) => b.total - a.total);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.headers, bucket, period, taxonomy]);


  const subBreakdown = (receipts: HeaderRow[]) => {
    const map = new Map<string, number>();
    const add = (primary: string, specific: string, amt: number) => {
      const { specific: resolved } = resolveCategory(primary, specific, taxonomy);
      map.set(resolved, (map.get(resolved) || 0) + amt);
    };
    for (const h of receipts) {
      const items = data.itemsByReceipt?.[h["Receipt ID (Key)"]] ?? [];
      const amt = amountOf(h);
      const primary = h["Category (Primary)"] || "";
      const sum = items.reduce((s, i) => s + (i["Item Total"] || 0), 0);
      if (items.length === 0 || sum <= 0) {
        // Fallback to receipt-level categorization when no items OR every item total is zero.
        const specificFromItem = items.length > 0 ? items[0]["Category (Specific)"] : "";
        add(primary, specificFromItem || "", amt);
        continue;
      }
      for (const it of items) {
        const share = ((it["Item Total"] || 0) / sum) * amt;
        add(primary, it["Category (Specific)"] || "", share);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  };

  return (
    <AppShell title="Expenses" subtitle={`${range.label} · ${masterPeriod.count} transactions · ${fmtSGD(masterPeriod.totalSGD)}`}>
      {/* Period selector */}
      <div className="mb-3 flex flex-wrap gap-2">
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
      {/* Currency tab cards */}
      <div className="grid grid-cols-2 gap-3 mb-3">

        {(["SGD", "INR"] as const).map((b) => {
          const active = bucket === b;
          const s = stats[b];
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`text-left rounded-xl border p-3 transition-colors cursor-pointer shadow-[var(--shadow-card)] ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-accent/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {b}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {s.count} txn
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {b === "SGD" ? fmtSGD(s.total) : fmtINR(s.total)}
              </div>
            </button>
          );
        })}
      </div>


      {/* ---------- Other Movements ---------- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Other Movements
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Informational
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MOVEMENT_TYPES.map(({ key, label, icon: Icon }) => {
            const list = movementsByType[key] || [];
            const total = list.reduce((s, h) => s + amountOf(h), 0);
            const open = moveType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMoveType(open ? null : key)}
                className={`text-left rounded-xl border p-3 transition-colors shadow-[var(--shadow-card)] cursor-pointer ${
                  open ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{list.length} transactions</div>
                <div className="text-lg font-semibold tabular-nums mt-0.5">{fmtAmt(total)}</div>
              </button>
            );
          })}
        </div>

        {moveType && (
          <ul className="mt-3 rounded-xl border border-border bg-card divide-y divide-border shadow-[var(--shadow-card)]">
            {(movementsByType[moveType] || []).length === 0 && (
              <li className="p-4 text-sm text-muted-foreground text-center">
                No {moveType.toLowerCase()} transactions in this currency.
              </li>
            )}
            {(movementsByType[moveType] || []).map((t) => (
              <li key={t["Receipt ID (Key)"]}>
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.Merchant || t["Target Account"] || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.Date} · {t["Payment Method(Source)"]}
                      {t["Target Account"] ? ` → ${t["Target Account"]}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{fmtAmt(amountOf(t))}</div>
                    {!isINR && t.Currency !== "SGD" && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t.Currency} {t["Original Amount"]}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Spending Analytics ---------- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Spending Analytics
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {range.label} · {bucket}
          </span>

        </div>
        {analytics.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No spending this month.
          </div>
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border shadow-[var(--shadow-card)]">
            {analytics.map((row) => {
              const open = openCat === row.name;
              const subs = open ? subBreakdown(row.receipts) : [];
              return (
                <li key={row.name}>
                  <button
                    type="button"
                    onClick={() => setOpenCat(open ? null : row.name)}
                    className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                      />
                      <span className="font-medium truncate">{row.name}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{fmtAmt(row.total)}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3">
                      {subs.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-2">No subcategory detail.</div>
                      ) : (
                        <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/20">
                          {subs.map(([name, total]) => (
                            <li key={name} className="flex items-center justify-between text-xs px-3 py-2">
                              <span className="text-muted-foreground">{name}</span>
                              <span className="tabular-nums font-medium">{fmtAmt(total)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Transactions ---------- */}
      <section className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Transactions
          </h2>
          <span className="text-sm font-medium tabular-nums">{fmtAmt(totalFiltered)}</span>
        </div>

        <div className="mb-3 flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search merchant, category…"
              className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring max-w-[45%]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>


        {groups.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No expenses match.
          </div>
        )}

        {groups.map(([k, list]) => {
          const sum = list.reduce((s, h) => s + amountOf(h), 0);
          return (
            <div key={k} className="mt-5">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k}</h3>
                <span className="text-sm font-medium tabular-nums">{fmtAmt(sum)}</span>
              </div>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border shadow-[var(--shadow-card)]">
                {list.map((t) => (
                  <li key={t["Receipt ID (Key)"]}>
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors cursor-pointer"
                    >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.Merchant || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.Date} · {t["Category (Primary)"]} · {t["Payment Method(Source)"]}
                      </div>
                      {t.Comments && (
                        <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{t.Comments}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold tabular-nums">
                        {isINR ? fmtINR(t["Original Amount"]) : fmtSGD(t["SGD Total Amount"])}
                      </div>
                      {!isINR && t.Currency !== "SGD" && (
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t.Currency} {t["Original Amount"]}
                        </div>
                      )}
                      {isINR && (
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          ≈ {fmtSGD(t["SGD Total Amount"])}
                        </div>
                      )}
                    </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>


      <TransactionDrawer
        transaction={selected}
        itemsByReceipt={data.itemsByReceipt}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}
