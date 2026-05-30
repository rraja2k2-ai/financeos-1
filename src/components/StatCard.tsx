import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "primary" | "success" | "destructive" | "accent";
  icon?: ReactNode;
}) {
  const accentClass =
    accent === "success"
      ? "text-success"
      : accent === "destructive"
        ? "text-destructive"
        : accent === "accent"
          ? "text-accent"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${accentClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
