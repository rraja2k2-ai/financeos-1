import type { BudgetEntry, HeaderRow } from "./api/finance.functions";

export const MISC_CATEGORY = "Miscellaneous";

/**
 * Build the set of valid primary and specific categories from the budget map.
 * The budget sheet is the source of truth for the category taxonomy.
 */
export function buildCategoryTaxonomy(budgetMap: Record<string, BudgetEntry>) {
  const validSpecifics = new Set<string>();
  const validPrimaries = new Set<string>();
  for (const [specific, entry] of Object.entries(budgetMap)) {
    if (specific) validSpecifics.add(specific);
    if (entry.primary) validPrimaries.add(entry.primary);
  }
  // Miscellaneous is always considered a valid fallback bucket.
  validPrimaries.add(MISC_CATEGORY);
  validSpecifics.add(MISC_CATEGORY);
  return { validPrimaries, validSpecifics };
}

/**
 * Resolve a (primary, specific) pair against the budget taxonomy:
 *  - Specific exists → keep both unchanged.
 *  - Only primary exists → specific becomes "Miscellaneous".
 *  - Neither exists → both become "Miscellaneous".
 * Ensures no expense disappears from analytics due to category mismatches.
 */
export function resolveCategory(
  primary: string | undefined,
  specific: string | undefined,
  taxonomy: { validPrimaries: Set<string>; validSpecifics: Set<string> },
): { primary: string; specific: string } {
  const p = (primary || "").trim();
  const s = (specific || "").trim();
  if (s && taxonomy.validSpecifics.has(s)) {
    return { primary: p || MISC_CATEGORY, specific: s };
  }
  if (p && taxonomy.validPrimaries.has(p)) {
    return { primary: p, specific: MISC_CATEGORY };
  }
  return { primary: MISC_CATEGORY, specific: MISC_CATEGORY };
}

export const fmtSGD = (n: number) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n || 0);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 }).format(n || 0);

// Parse "DD/MM/YYYY" or ISO date string
export function parseDate(d: string): Date {
  if (!d) return new Date(NaN);
  if (d.includes("/")) {
    const [dd, mm, yyyy] = d.split("/").map(Number);
    return new Date(yyyy, (mm || 1) - 1, dd || 1);
  }
  return new Date(d);
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isExpense(h: HeaderRow) {
  return h["Transaction Type"] === "Expense";
}

export function isIncome(h: HeaderRow) {
  return h["Transaction Type"] === "Income";
}

// Transaction types that must NEVER count toward spending, budgets or charts.
const NON_SPEND_TYPES = new Set([
  "Transfer",
  "Credit Card Payment",
  "Lending",
  "Internal Transfer",
  "Currency Conversion",
  "Income",
]);

export function isNonSpend(h: HeaderRow) {
  return NON_SPEND_TYPES.has(h["Transaction Type"]);
}

export function groupByMonth(headers: HeaderRow[]) {
  const map = new Map<string, number>();
  for (const h of headers) {
    if (!isExpense(h)) continue;
    const k = monthKey(parseDate(h.Date));
    map.set(k, (map.get(k) || 0) + (h["SGD Total Amount"] || 0));
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function currentMonthKey() {
  return monthKey(new Date());
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Decide whether a budget entry (with optional frequency + pattern) applies in a given calendar month.
 *  - Monthly / blank  → every month
 *  - BiMonthly + Even → Feb, Apr, Jun, Aug, Oct, Dec
 *  - BiMonthly + Odd  → Jan, Mar, May, ... (also accepts a starting month name)
 *  - Quarterly + <Month> → that month + every 3 months
 *  - Yearly / Annually + <Month> → only that month
 */
export function budgetActiveInMonth(
  entry: { frequency?: string; pattern?: string },
  monthIndex: number, // 0-11
): boolean {
  const freq = (entry.frequency || "monthly").trim().toLowerCase();
  const pattern = (entry.pattern || "").trim().toLowerCase();
  const startFromName = MONTH_NAMES.indexOf(pattern.slice(0, 3));

  if (!freq || freq === "monthly") return true;

  if (freq === "bimonthly" || freq === "bi-monthly" || freq === "bi monthly") {
    if (pattern === "even") return monthIndex % 2 === 1; // Feb=1
    if (pattern === "odd") return monthIndex % 2 === 0;
    if (startFromName >= 0) return (monthIndex - startFromName + 12) % 2 === 0;
    return true;
  }

  if (freq === "quarterly") {
    if (startFromName >= 0) return (monthIndex - startFromName + 12) % 3 === 0;
    return monthIndex % 3 === 0;
  }

  if (freq === "yearly" || freq === "annual" || freq === "annually") {
    if (startFromName >= 0) return monthIndex === startFromName;
    return monthIndex === 0;
  }

  return true;
}
