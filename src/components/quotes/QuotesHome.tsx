"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createQuoteAction, deleteQuoteAction } from "@/actions/eventQuotes";
import { eur, pct, type QuoteListItem, type QuoteStatus } from "@/lib/eventQuotes";
import type { EventService } from "@/lib/eventQuotesData";

type Tab = "quotes" | "templates" | "services";

const STATUS_STYLE: Record<QuoteStatus, string> = {
  Rascunho: "bg-gray-100 text-gray-600",
  Enviado: "bg-sky-50 text-sky-700",
  Aceite: "bg-emerald-50 text-emerald-700",
  Recusado: "bg-rose-50 text-rose-700",
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T12:00:00`)) : null);

export function QuotesHome({ quotes, services }: { quotes: QuoteListItem[]; services: EventService[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("quotes");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "">("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const templates = quotes.filter((q) => q.isTemplate);
  const realQuotes = quotes.filter((q) => !q.isTemplate);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tab === "templates" ? templates : realQuotes;
    return list.filter(
      (x) =>
        (!status || tab === "templates" || x.status === status) &&
        (!q || [x.name, x.serviceName, x.clientName, x.location].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [tab, query, status, templates, realQuotes]);

  const templatesByService = useMemo(() => {
    const m = new Map<string, QuoteListItem[]>();
    for (const t of templates) if (t.serviceId) m.set(t.serviceId, [...(m.get(t.serviceId) ?? []), t]);
    return m;
  }, [templates]);

  const stats = useMemo(() => {
    const open = realQuotes.filter((q) => q.status === "Enviado");
    const won = realQuotes.filter((q) => q.status === "Aceite");
    return {
      open: open.length,
      openValue: open.reduce((s, q) => s + q.totals.price, 0),
      won: won.length,
      wonProfit: won.reduce((s, q) => s + q.totals.profit, 0),
      avgMargin: won.length ? won.reduce((s, q) => s + q.totals.margin, 0) / won.length : null,
    };
  }, [realQuotes]);

  function create(opts: Parameters<typeof createQuoteAction>[0]) {
    setError("");
    startTransition(async () => {
      const res = await createQuoteAction(opts);
      if (res.error !== undefined) setError(res.error);
      else router.push(`/admin/orcamentos/${res.id}`);
    });
  }

  function remove(q: QuoteListItem) {
    if (!confirm(`Apagar "${q.name}"? Esta ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      const res = await deleteQuoteAction(q.id);
      if (res.error !== undefined) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Orçamentos de eventos</h1>
          <p className="text-sm text-white/60">Custos reais de fornecedores, margem e preço por pessoa — num só sítio.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/orcamentos/precos" className="text-sm font-medium text-white/85 hover:text-white px-3 py-2 rounded-xl hover:bg-white/10 transition-colors">
            Preços de fornecedores →
          </Link>
          <NewQuoteMenu templates={templates} disabled={pending} onCreate={create} />
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Em aberto (enviados)" value={String(stats.open)} sub={eur(stats.openValue) + " s/ IVA"} />
        <Stat label="Aceites" value={String(stats.won)} sub={`Lucro ${eur(stats.wonProfit)}`} />
        <Stat label="Margem média (aceites)" value={stats.avgMargin === null ? "—" : pct(stats.avgMargin)} sub="lucro ÷ preço" />
        <Stat label="Templates" value={String(templates.length)} sub={`${templatesByService.size} ligados a serviços`} />
      </section>

      {error && <p className="bg-rose-50 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 pt-3 flex items-center gap-1 border-b border-gray-100 overflow-x-auto">
          {([
            ["quotes", `Orçamentos (${realQuotes.length})`],
            ["templates", `Templates (${templates.length})`],
            ["services", `Serviços de evento (${services.length})`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t ? "border-[#32373c] text-[#32373c]" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== "services" && (
          <div className="px-4 py-3 flex gap-2 flex-wrap border-b border-gray-50">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar por nome, cliente, serviço, local…"
              className="flex-1 min-w-[200px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470]"
            />
            {tab === "quotes" && (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as QuoteStatus | "")}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#667470]"
              >
                <option value="">Todos os estados</option>
                {(Object.keys(STATUS_STYLE) as QuoteStatus[]).map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </div>
        )}

        {tab === "services" ? (
          <ServicesGrid services={services} templatesByService={templatesByService} disabled={pending} onCreate={create} />
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} onCreate={() => create({ asTemplate: tab === "templates" })} disabled={pending} />
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((q) => (
              <li key={q.id} className="group flex items-center gap-4 px-4 py-3 hover:bg-gray-50/70 transition-colors">
                <Link href={`/admin/orcamentos/${q.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{q.name}</span>
                    {!q.isTemplate && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[q.status]}`}>{q.status}</span>}
                    {q.serviceName && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#667470]/10 text-[#4d5a56]">{q.serviceName}</span>}
                    {q.totals.missingPrices > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{q.totals.missingPrices} sem preço</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {[fmtDate(q.eventDate), q.clientName, q.location, `${q.guests} pax`, `${q.lineCount} linhas`].filter(Boolean).join(" · ")}
                  </p>
                </Link>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="text-sm font-semibold">{eur(q.totals.pricePerPax)}<span className="text-xs text-gray-400 font-normal"> /pax</span></p>
                  <p className="text-xs text-gray-400">{eur(q.totals.price)} · margem {pct(q.totals.margin)}</p>
                </div>
                <div className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title={q.isTemplate ? "Criar orçamento a partir deste template" : "Duplicar"}
                    onClick={() => create({ fromId: q.id })}
                    disabled={pending}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    {q.isTemplate ? "Usar" : "Duplicar"}
                  </button>
                  <button
                    type="button"
                    title="Apagar"
                    onClick={() => remove(q)}
                    disabled={pending}
                    className="text-xs px-2 py-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white/95 rounded-2xl px-4 py-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
      <p className="text-xs text-gray-500 tabular-nums truncate">{sub}</p>
    </div>
  );
}

function NewQuoteMenu({
  templates,
  disabled,
  onCreate,
}: {
  templates: QuoteListItem[];
  disabled: boolean;
  onCreate: (o: Parameters<typeof createQuoteAction>[0]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="bg-white text-[#32373c] text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {disabled ? "A criar…" : "+ Novo orçamento"}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fechar" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 py-2 max-h-[70vh] overflow-y-auto">
            <MenuItem title="Em branco" sub="Começar do zero" onClick={() => { setOpen(false); onCreate({}); }} />
            <MenuItem title="Novo template" sub="Modelo para eventos que se repetem" onClick={() => { setOpen(false); onCreate({ asTemplate: true }); }} />
            {templates.length > 0 && <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-400">A partir de um template</p>}
            {templates.map((t) => (
              <MenuItem
                key={t.id}
                title={t.name}
                sub={`${t.serviceName ?? "Sem serviço"} · ${eur(t.totals.pricePerPax)}/pax`}
                onClick={() => { setOpen(false); onCreate({ fromId: t.id }); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left px-4 py-2 hover:bg-gray-50">
      <p className="text-sm font-medium truncate">{title}</p>
      <p className="text-xs text-gray-400 truncate">{sub}</p>
    </button>
  );
}

function ServicesGrid({
  services,
  templatesByService,
  disabled,
  onCreate,
}: {
  services: EventService[];
  templatesByService: Map<string, QuoteListItem[]>;
  disabled: boolean;
  onCreate: (o: Parameters<typeof createQuoteAction>[0]) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500">
        Cada serviço de evento pode ter um template. &quot;Novo orçamento&quot; copia as linhas do template; sem template começa em branco já ligado ao serviço.
        Para transformar um template num serviço repetido, abre-o e usa &quot;Guardar como serviço&quot;.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const ts = templatesByService.get(s.id) ?? [];
          const t = ts[0];
          return (
            <div key={s.id} className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
              <div>
                <p className="font-semibold text-sm">{s.name}</p>
                {s.description && <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{s.description}</p>}
              </div>
              {t ? (
                <Link href={`/admin/orcamentos/${t.id}`} className="text-xs rounded-xl bg-gray-50 px-3 py-2 hover:bg-gray-100">
                  <span className="text-gray-500">Template:</span> <span className="font-medium">{t.name}</span>
                  <span className="block text-gray-400 tabular-nums">{t.guests} pax · {eur(t.totals.pricePerPax)}/pax · margem {pct(t.totals.margin)}</span>
                </Link>
              ) : (
                <p className="text-xs text-gray-400 rounded-xl border border-dashed border-gray-200 px-3 py-2">Sem template</p>
              )}
              <div className="flex gap-2 mt-auto">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onCreate(t ? { fromId: t.id, serviceId: s.id } : { serviceId: s.id, name: s.name })}
                  className="flex-1 text-xs font-semibold bg-[#32373c] text-white rounded-xl px-3 py-2 hover:bg-[#1a2018] disabled:opacity-50"
                >
                  Novo orçamento
                </button>
                {!t && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCreate({ asTemplate: true, serviceId: s.id, name: `Template · ${s.name}` })}
                    className="text-xs font-medium bg-gray-100 rounded-xl px-3 py-2 hover:bg-gray-200 disabled:opacity-50"
                  >
                    Criar template
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ tab, onCreate, disabled }: { tab: Tab; onCreate: () => void; disabled: boolean }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium">{tab === "templates" ? "Ainda não há templates" : "Ainda não há orçamentos"}</p>
      <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
        {tab === "templates"
          ? "Um template guarda as linhas de um evento típico (material, equipa, comida…) para reutilizar com outro nº de pessoas."
          : "Cria um orçamento, adiciona material do catálogo da Amado e da Mesa Posta e vê a margem em tempo real."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        className="mt-4 text-sm font-semibold bg-[#32373c] text-white rounded-xl px-4 py-2 hover:bg-[#1a2018] disabled:opacity-50"
      >
        {tab === "templates" ? "Criar template" : "Criar orçamento"}
      </button>
    </div>
  );
}
