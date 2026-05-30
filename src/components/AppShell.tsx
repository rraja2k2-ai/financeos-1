import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, Receipt, PiggyBank, Sparkles, Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { usePrivacy } from "@/lib/privacy";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

export function AppShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { hidden, toggle } = usePrivacy();
  const showPrivacy = path === "/" || path === "/accounts";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-60">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-border bg-card">
        <div className="px-5 py-6">
          <div className="text-lg font-semibold tracking-tight">FinanceOS</div>
          <div className="text-xs text-muted-foreground">v2.0</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((n) => {
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-xs text-muted-foreground">Powered by Google Sheets</div>
      </aside>

      {/* Top header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="px-4 md:px-8 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate" suppressHydrationWarning>{subtitle}</p>}
          </div>
          {showPrivacy && (
            <button
              type="button"
              onClick={toggle}
              aria-label={hidden ? "Show values" : "Hide values"}
              title={hidden ? "Show values" : "Hide values"}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            >
              {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              <span className="hidden sm:inline">{hidden ? "Hidden" : "Visible"}</span>
            </button>
          )}
        </div>
      </header>

      <main className="px-4 md:px-8 py-5 md:py-7 max-w-6xl mx-auto">{children}</main>

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <n.icon className="size-5" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
