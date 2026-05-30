import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { fmtSGD } from "@/lib/finance-utils";
import type { HeaderRow, ItemRow } from "@/lib/api/finance.functions";

interface Props {
  transaction: HeaderRow | null;
  itemsByReceipt: Record<string, ItemRow[]>;
  onClose: () => void;
}

export function TransactionDrawer({ transaction, itemsByReceipt, onClose }: Props) {
  return (
    <Drawer open={!!transaction} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        {transaction && (
          <>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-xl">{transaction.Merchant || "—"}</DrawerTitle>
              <DrawerDescription>
                {transaction.Date} · {transaction["Transaction Type"]}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto">
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Payment
                  </dt>
                  <dd className="font-medium mt-0.5">
                    {transaction["Payment Method(Source)"] || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Category
                  </dt>
                  <dd className="font-medium mt-0.5">
                    {transaction["Category (Primary)"] || "—"}
                  </dd>
                </div>
                <div className="col-span-2 border-t border-border pt-3 flex items-baseline justify-between">
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Total
                  </dt>
                  <dd className="font-semibold text-lg tabular-nums">
                    {fmtSGD(transaction["SGD Total Amount"])}
                  </dd>
                </div>
              </dl>

              <h3 className="mt-5 mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Line Items
              </h3>
              {(() => {
                const items = itemsByReceipt?.[transaction["Receipt ID (Key)"]] ?? [];
                if (items.length === 0) {
                  return (
                    <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                      No item details available for this receipt.
                    </div>
                  );
                }
                return (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Description</th>
                          <th className="text-right font-medium px-2 py-2 w-10">Qty</th>
                          <th className="text-right font-medium px-3 py-2 w-20">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((it, idx) => (
                          <tr key={`${it["Item ID"]}-${idx}`}>
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium leading-tight">
                                {it["Item Description"] || "—"}
                              </div>
                              {it["Category (Specific)"] && (
                                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                  {it["Category (Specific)"]}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 align-top text-right tabular-nums">
                              {it.Qty ?? 0}
                            </td>
                            <td className="px-3 py-2 align-top text-right tabular-nums font-semibold">
                              {fmtSGD(it["Item Total"] || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
