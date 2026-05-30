import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type PeriodKey = "current" | "previous" | "last3" | "last6" | "ytd";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "current", label: "Current Month" },
  { key: "previous", label: "Previous Month" },
  { key: "last3", label: "Last 3 Months" },
  { key: "last6", label: "Last 6 Months" },
  { key: "ytd", label: "Year to Date" },
];

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

export function periodRange(period: PeriodKey): PeriodRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startOfMonth = (yy: number, mm: number) => new Date(yy, mm, 1);
  const endOfMonth = (yy: number, mm: number) => new Date(yy, mm + 1, 0, 23, 59, 59, 999);
  switch (period) {
    case "current":
      return { start: startOfMonth(y, m), end: endOfMonth(y, m), label: "This month" };
    case "previous":
      return { start: startOfMonth(y, m - 1), end: endOfMonth(y, m - 1), label: "Last month" };
    case "last3":
      return { start: startOfMonth(y, m - 2), end: endOfMonth(y, m), label: "Last 3 months" };
    case "last6":
      return { start: startOfMonth(y, m - 5), end: endOfMonth(y, m), label: "Last 6 months" };
    case "ytd":
      return { start: startOfMonth(y, 0), end: endOfMonth(y, m), label: "Year to date" };
  }
}

/** Inclusive list of (year, monthIndex) tuples that overlap the period range. */
export function monthsInRange(range: PeriodRange): { year: number; monthIndex: number }[] {
  const out: { year: number; monthIndex: number }[] = [];
  let y = range.start.getFullYear();
  let m = range.start.getMonth();
  const endY = range.end.getFullYear();
  const endM = range.end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, monthIndex: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

interface PeriodContextValue {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  range: PeriodRange;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);
const STORAGE_KEY = "financeos.period";

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<PeriodKey>("current");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as PeriodKey | null;
      if (stored && PERIODS.some((p) => p.key === stored)) {
        setPeriodState(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setPeriod = useCallback((p: PeriodKey) => {
    setPeriodState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  const range = useMemo(() => periodRange(period), [period]);
  const value = useMemo(() => ({ period, setPeriod, range }), [period, setPeriod, range]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used within PeriodProvider");
  return ctx;
}
