"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createQuoteAction } from "@/actions/eventQuotes";
import { eur, pct, type QuoteListItem, type QuoteStatus } from "@/lib/eventQuotes";

const STATUS_STYLE: Record<QuoteStatus, string> = {
  Rascunho: "bg-gray-100 text-gray-600",
  Enviado: "bg-sky-50 text-sky-700",
  Aceite: "bg-emerald-50 text-emerald-700",
  Recusado: "bg-rose-50 text-rose-700",
};

type Template = { id: string; name: string; serviceId: string | null; pricePerPax: number };

/** Quotes linked to one booked event, and a button to start another (blank or from a template). */
export function SaleQuotes({
  saleId,
  serviceId,
  quotes,
  templates,
}: {
  saleId: string;
  serviceId: string | null;
  quotes: QuoteListItem[];
  templates: Template[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  // Templates of this event's service first.
  const sorted = [...templates].sort((a, b) => Number(b.serviceId === serviceId) - Number(a.serviceId === serviceId) || a.name.localeCompare(b.name));
  const accepted = quotes.find((q) => q.status === "Aceite");

  function create(fromId?: string) {
    setOpen(false);
    setError("");
    start(async () => {
      const res = await createQuoteAction({ saleId, fromId });
      if (res.error !== undefined) setError(res.error);
      else router.push(`/admin/orcamentos/${res.id}`);
    });
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 text-[#32373c]">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Orçamentos</h2>
          {accepted && (
            <p className="text-xs text-emerald-700 tabular-nums">Aceite: {eur(accepted.totals.pricePerPax)}/pax · {eur(accepted.totals.price)} s/ IVA</p>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={pending}
            className="text-xs font-semibold bg-[#32373c] text-white rounded-xl px-3 py-2 hover:bg-[#1a2018] disabled:opacity-50"
          >
            {pending ? "A criar…" : "+ Novo orçamento"}
          </button>
          {open && (
            <>
              <button type="button" aria-label="Fechar" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 py-2 max-h-[60vh] overflow-y-auto">
                <button type="button" onClick={() => create()} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                  <p className="text-sm font-medium text-[#32373c]">Em branco</p>
                  <p className="text-xs text-gray-400">Com a data, cliente e nº de pessoas deste serviço</p>
                </button>
                {sorted.length > 0 && <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-400">A partir de um template</p>}
                {sorted.map((t) => (
                  <button key={t.id} type="button" onClick={() => create(t.id)} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                    <p className="text-sm font-medium text-[#32373c] truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 tabular-nums">
                      {t.serviceId === serviceId ? "Deste serviço · " : ""}{eur(t.pricePerPax)}/pax
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="mx-4 mt-3 text-xs bg-rose-50 text-rose-700 rounded-xl px-3 py-2">{error}</p>}

      {quotes.length === 0 ? (
        <p className="px-4 py-5 text-sm text-gray-400 text-center">
          Ainda não há orçamentos. Podes fazer vários (ex.: menu A e menu B) e marcar o escolhido como Aceite.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link href={`/admin/orcamentos/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#32373c] break-words">{q.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[q.status]}`}>{q.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {q.guests} pax{q.courses.length ? ` · ${q.courses.join(" · ")}` : ""}
                    {q.totals.missingPrices > 0 ? ` · ${q.totals.missingPrices} sem preço` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="text-sm font-semibold text-[#32373c]">{eur(q.totals.pricePerPax)}<span className="text-xs text-gray-500 font-normal">/pax</span></p>
                  <p className="text-xs text-gray-500">{eur(q.totals.price)} · {pct(q.totals.margin)}</p>
                </div>
                <span className="text-gray-400" aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
