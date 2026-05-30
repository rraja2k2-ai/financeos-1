import { createServerFn } from "@tanstack/react-start";

export interface AccountRow {
  name: string;
  group: string;
  balance: number;
  currency: string;
  rate: number;
  weightSGD: number;
  display: string;
}

export interface HeaderRow {
  "Receipt ID (Key)": string;
  Date: string;
  Merchant: string;
  "Transaction Type": string;
  "Category (Primary)": string;
  "Payment Method(Source)": string;
  "Target Account": string;
  Currency: string;
  "Original Amount": number;
  "Exchange Rate": number;
  "SGD Total Amount": number;
  Comments: string;
  Source: string;
}

export interface ItemRow {
  "Item ID": number | string;
  "Receipt ID (Key)": string;
  "Item Description": string;
  "Category (Specific)": string;
  Qty: number;
  "Unit Price": number;
  "Item Total": number;
}

export interface BudgetEntry {
  primary: string;
  budget: number;
  currency: string;
  frequency?: string;
  pattern?: string;
}

export interface FinanceData {
  ok: boolean;
  lastUpdated: string;
  budgetMap: Record<string, BudgetEntry>;
  headers: HeaderRow[];
  items: ItemRow[];
  itemsByReceipt: Record<string, ItemRow[]>;
  financialAccounts: AccountRow[];
  meta: {
    netWorthSGD: number;
    financialAccounts: AccountRow[];
    fixedIncomeMap: Record<string, number>;
    financialHealthScore?: number;
  };
}

export const getFinanceData = createServerFn({ method: "GET" }).handler(
  async (): Promise<FinanceData> => {
    const url = process.env.FINANCE_API_URL;
    const token = process.env.FINANCE_API_TOKEN;
    if (!url || !token) throw new Error("Finance API not configured");

    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}token=${encodeURIComponent(token)}&monthsLimit=6`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Finance API ${res.status}`);
    const data = (await res.json()) as FinanceData;
    if (!data.ok) throw new Error("Finance API returned error");
    return data;
  },
);
