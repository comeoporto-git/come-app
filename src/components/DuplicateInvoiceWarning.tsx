"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkDuplicateInvoiceAction } from "@/actions/transactions";
import type { DuplicateInvoiceMatch } from "@/lib/notion";

const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem data");

/**
 * Warns when the fatura being scanned/typed already exists in the system.
 * Re-checks (debounced) as the number, supplier, date or total change.
 */
export function DuplicateInvoiceWarning({
  kind,
  invoiceId,
  supplier,
  date,
  totalCost,
  excludeId,
}: {
  kind: "Expense" | "Earning";
  invoiceId: string;
  supplier?: string;
  date?: string | null;
  totalCost?: number;
  /** The transaction being edited, so it doesn't match itself */
  excludeId?: string;
}) {
  const [matches, setMatches] = useState<DuplicateInvoiceMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      checkDuplicateInvoiceAction({ kind, invoiceId, supplier, date, totalCost: Number(totalCost) || 0, excludeId })
        .then((m) => { if (!cancelled) setMatches(m); })
        .catch(() => { if (!cancelled) setMatches([]); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, invoiceId, supplier, date, totalCost, excludeId]);

  if (matches.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-800">
      <p className="font-semibold">⚠️ Esta fatura parece já estar no sistema</p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {matches.map((m) => (
          <li key={m.id}>
            {m.invoiceId && <span className="font-medium">{m.invoiceId} · </span>}
            {m.supplier} · {fmtDate(m.date)} · €{m.totalCost.toFixed(2)}
            {m.tourId && (
              <>
                {" · "}
                <Link href={`/guide/tours/${m.tourId}`} target="_blank" className="underline">
                  {m.tourName || "ver serviço"}
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs">Confirma antes de guardar para evitar duplicados.</p>
    </div>
  );
}
