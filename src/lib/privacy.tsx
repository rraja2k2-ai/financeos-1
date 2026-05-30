import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = {
  hidden: boolean;
  toggle: () => void;
  mask: (value: string | number) => string;
};

const PrivacyContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "financeos.privacy.hidden";
const DOTS = "••••••";

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  // Hydrate from localStorage on client
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") setHidden(true);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [hidden]);

  const value: Ctx = {
    hidden,
    toggle: () => setHidden((h) => !h),
    mask: (v) => (hidden ? DOTS : typeof v === "string" ? v : String(v)),
  };

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): Ctx {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    // Safe fallback: act as visible if provider missing
    return {
      hidden: false,
      toggle: () => {},
      mask: (v) => (typeof v === "string" ? v : String(v)),
    };
  }
  return ctx;
}