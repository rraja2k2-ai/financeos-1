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

/**
 * Parse a date string from the workbook / finance API.
 *
 * The source of truth is DD/MM/YYYY (Singapore locale). We must NEVER rely on
 * `new Date(str)` for these values because JS engines interpret "01/06/2026"
 * as MM/DD/YYYY (January 6) in many locales — which is the bug we are fixing.
 *
 * Supported inputs (in priority order):
 *   1. DD/MM/YYYY or DD-MM-YYYY  → primary workbook format
 *   2. YYYY-MM-DD (ISO date)     → API fallback
 *   3. Full ISO datetime         → safe to delegate to native Date
 *
 * All branches construct the Date in UTC so month grouping is stable across
 * timezones (a Jun 1 in SGT must not bucket as May in UTC, etc.).
 */
export function parseDate(d: string): Date {
  if (!d) return new Date(NaN);
  const s = d.trim();

  // DD/MM/YYYY or DD-MM-YYYY (also accepts 2-digit year)
  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return new Date(NaN);
    const dt = new Date(Date.UTC(year, month - 1, day));
    // Reject impossible dates (e.g. 31/02 silently rolling forward).
    if (dt.getUTCDate() !== day || dt.getUTCMonth() !== month - 1) return new Date(NaN);
    return dt;
  }

  // ISO date YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCDate() !== day || dt.getUTCMonth() !== month - 1) return new Date(NaN);
    return dt;
  }

  // Full ISO datetime (contains 'T') — safe for native parser.
  if (s.includes("T")) return new Date(s);

  return new Date(NaN);
}

export function monthKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  // Use UTC so month bucketing matches parseDate (which constructs in UTC).
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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
  // Use the user's local calendar month, formatted to match monthKey() output.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

export const GENERIC_PROJECT = "Generic";

export function projectOf(h: { Project?: string; Source?: string }): string {
  const v = (h.Project ?? h.Source ?? "").toString().trim();
  return v.length === 0 ? GENERIC_PROJECT : v;
}
