"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createQuoteAction,
  createServiceFromTemplateAction,
  deleteQuoteAction,
  saveQuoteAction,
} from "@/actions/eventQuotes";
import {
  QUOTE_CATEGORIES,
  QUOTE_STATUSES,
  cheapestByCompareKey,
  eur,
  lineCost,
  lineUnits,
  pct,
  quoteTotals,
  type Quote,
  type QuoteLine,
  type QuoteStatus,
  type SupplierItem,
} from "@/lib/eventQuotes";
import type { ClientOption, EventSaleOption, EventService } from "@/lib/eventQuotesData";
import { CatalogPicker } from "./CatalogPicker";
import { MenuBuilder } from "./MenuBuilder";

type Fornecedor = { id: string; name: string };
type Draft = Omit<Quote, "lines" | "createdAt" | "updatedAt">;
type Line = QuoteLine & { key: string };

const field =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] bg-white focus:outline-none focus:border-[#667470] focus:ring-2 focus:ring-[#667470]/15 transition";
const cell =
  "w-full border border-transparent hover:border-gray-200 focus:border-[#667470] rounded-lg px-2 py-1.5 text-sm bg-transparent focus:bg-white focus:outline-none tabular-nums transition";

/** One-click starter lines that aren't rentals from a supplier. */
const QUICK_LINES: { category: string; description: string; qtyMode: "per_pax" | "fixed"; quantity: number; unitCost: number }[] = [
  { category: "Comida", description: "Food cost", qtyMode: "per_pax", quantity: 1, unitCost: 15 },
  { category: "Bebidas", description: "Vinhos e bebidas", qtyMode: "per_pax", quantity: 1, unitCost: 15 },
  { category: "Equipa", description: "Chef", qtyMode: "fixed", quantity: 1, unitCost: 300 },
  { category: "Equipa", description: "Staff de sala", qtyMode: "fixed", quantity: 3, unitCost: 100 },
  { category: "Equipa", description: "Copa", qtyMode: "fixed", quantity: 1, unitCost: 80 },
  { category: "Equipa", description: "Logística / montagem", qtyMode: "fixed", quantity: 2, unitCost: 100 },
  { category: "Equipa", description: "Alimentação staff", qtyMode: "fixed", quantity: 1, unitCost: 60 },
  { category: "Espaço", description: "Aluguer do espaço", qtyMode: "fixed", quantity: 1, unitCost: 0 },
  { category: "Decoração", description: "Decoração (flores, velas…)", qtyMode: "per_pax", quantity: 1, unitCost: 5 },
  { category: "Transporte", description: "Transporte de material", qtyMode: "fixed", quantity: 1, unitCost: 120 },
];

let keySeq = 0;
const newKey = () => `l${++keySeq}`;
const toLines = (ls: QuoteLine[]): Line[] => ls.map((l) => ({ ...l, key: newKey() }));

export function QuoteBuilder({
  quote,
  items,
  services,
  clients,
  sales,
  fornecedores,
}: {
  quote: Quote;
  items: SupplierItem[];
  services: EventService[];
  clients: ClientOption[];
  sales: EventSaleOption[];
  fornecedores: Fornecedor[];
}) {
  const router = useRouter();
  const { lines: initialLines, createdAt: _c, updatedAt: _u, ...initialDraft } = quote;
  void _c; void _u;
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [lines, setLines] = useState<Line[]>(() => toLines(initialLines));
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [serviceDialog, setServiceDialog] = useState(false);

  const totals = useMemo(() => quoteTotals(draft, lines), [draft, lines]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cheapest = useMemo(() => cheapestByCompareKey(items), [items]);
  const fornecedorName = useCallback((id: string | null) => fornecedores.find((f) => f.id === id)?.name ?? null, [fornecedores]);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const updateLine = (key: string, patch: Partial<QuoteLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const removeLine = (key: string) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
    setDirty(true);
  };
  const addLines = (newOnes: QuoteLine[]) => {
    setLines((ls) => [...ls, ...toLines(newOnes)]);
    setDirty(true);
  };
  const moveLine = (key: string, dir: -1 | 1) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      const cat = ls[i]?.category;
      let j = i + dir;
      while (j >= 0 && j < ls.length && ls[j].category !== cat) j += dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const copy = [...ls];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  };

  const save = useCallback(() => {
    setMessage(null);
    startSaving(async () => {
      const { id, ...header } = draft;
      const res = await saveQuoteAction(id, header, lines.map(({ key: _k, ...l }) => { void _k; return l; }));
      if (res.error !== undefined) setMessage({ kind: "error", text: res.error });
      else {
        setDirty(false);
        setMessage({ kind: "ok", text: "Guardado" });
        router.refresh();
      }
    });
  }, [draft, lines, router]);

  // Ctrl/Cmd+S saves; warn before leaving with unsaved changes.
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);
  useEffect(() => {
    if (message?.kind !== "ok") return;
    const t = setTimeout(() => setMessage(null), 2000);
    return () => clearTimeout(t);
  }, [message]);

  function copyAs(asTemplate: boolean) {
    if (dirty && !confirm("Há alterações por guardar. A cópia usa a última versão guardada. Continuar?")) return;
    startBusy(async () => {
      const res = await createQuoteAction({ fromId: draft.id, asTemplate, name: asTemplate ? `Template · ${draft.name}` : undefined });
      if (res.error !== undefined) setMessage({ kind: "error", text: res.error });
      else router.push(`/admin/orcamentos/${res.id}`);
    });
  }

  function remove() {
    if (!confirm(`Apagar "${draft.name}"? Esta ação não pode ser desfeita.`)) return;
    startBusy(async () => {
      const res = await deleteQuoteAction(draft.id);
      if (res.error !== undefined) setMessage({ kind: "error", text: res.error });
      else router.push("/admin/orcamentos");
    });
  }

  const grouped = useMemo(() => {
    const cats = [...QUOTE_CATEGORIES, ...new Set(lines.map((l) => l.category).filter((c) => !QUOTE_CATEGORIES.includes(c as never)))];
    return cats.map((c) => ({ category: c, lines: lines.filter((l) => l.category === c && !l.course) }));
  }, [lines]);

  const supplierOrders = useMemo(() => {
    const m = new Map<string, { name: string; rows: { description: string; units: number; unitCost: number }[] }>();
    for (const l of lines) {
      if (!l.fornecedorId) continue;
      const name = fornecedorName(l.fornecedorId) ?? "Fornecedor";
      const e = m.get(l.fornecedorId) ?? { name, rows: [] };
      const same = e.rows.find((r) => r.description === l.description && r.unitCost === l.unitCost);
      if (same) same.units += lineUnits(l, totals.guests);
      else e.rows.push({ description: l.description, units: lineUnits(l, totals.guests), unitCost: l.unitCost });
      m.set(l.fornecedorId, e);
    }
    return [...m.values()];
  }, [lines, totals.guests, fornecedorName]);

  const linkedService = services.find((s) => s.id === draft.serviceId) ?? null;
  const clientName = clients.find((c) => c.id === draft.clientId)?.name ?? "";

  return (
    <div className="space-y-4">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/admin/orcamentos" className="text-sm text-white/70 hover:text-white transition-colors">← Orçamentos</Link>
          {draft.saleId && (
            <Link href={`/guide/tours/${draft.saleId}`} className="text-sm text-white/70 hover:text-white transition-colors">Ver serviço →</Link>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {message && (
            <span className={`text-xs px-3 py-1.5 rounded-full ${message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message.text}</span>
          )}
          {dirty && !message && <span className="text-xs text-white/70">Alterações por guardar</span>}
          <ActionsMenu
            isTemplate={draft.isTemplate}
            hasService={!!draft.serviceId}
            disabled={busy}
            onDuplicate={() => copyAs(false)}
            onSaveAsTemplate={() => copyAs(true)}
            onSaveAsService={() => setServiceDialog(true)}
            onDelete={remove}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="bg-white text-[#32373c] text-sm font-semibold px-5 py-2 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-60"
            title="Ctrl/⌘ + S"
          >
            {saving ? "A guardar…" : dirty ? "Guardar" : "Guardado ✓"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
        <div className="space-y-4 min-w-0">
          {/* ── Event details ───────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-start gap-3 flex-wrap">
              <input
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
                className="flex-1 min-w-[220px] text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-100 focus:border-[#667470] focus:outline-none py-1"
                placeholder="Nome do orçamento"
                aria-label="Nome do orçamento"
              />
              {draft.isTemplate ? (
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-50 text-violet-700">Template</span>
              ) : (
                <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-medium" role="radiogroup" aria-label="Estado">
                  {QUOTE_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={draft.status === s}
                      onClick={() => update("status", s as QuoteStatus)}
                      className={`px-2.5 py-1 rounded-lg transition ${draft.status === s ? "bg-white shadow-sm text-[#32373c]" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Serviço de evento">
                <select value={draft.serviceId ?? ""} onChange={(e) => update("serviceId", e.target.value || null)} className={field}>
                  <option value="">— Nenhum —</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              {!draft.isTemplate && (
                <>
                  <Field label="Cliente">
                    <ClientInput clients={clients} value={clientName} onChange={(id) => update("clientId", id)} />
                  </Field>
                  <Field label="Data do evento">
                    <input type="date" value={draft.eventDate ?? ""} onChange={(e) => update("eventDate", e.target.value || null)} className={field} />
                  </Field>
                </>
              )}
              <Field label="Local">
                <input value={draft.location ?? ""} onChange={(e) => update("location", e.target.value || null)} className={field} placeholder="ex.: Casa da Eira, Maia" />
              </Field>
              <Field label="Nº de pessoas">
                <Stepper value={draft.guests} onChange={(v) => update("guests", v)} />
              </Field>
              {!draft.isTemplate && (
                <Field label="Reserva (venda)">
                  <select
                    value={draft.saleId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      update("saleId", id);
                      const s = sales.find((x) => x.id === id);
                      if (s?.date && !draft.eventDate) update("eventDate", s.date);
                      if (s?.guests && s.guests !== draft.guests && confirm(`A reserva tem ${s.guests} pessoas. Usar esse número?`)) update("guests", s.guests);
                    }}
                    className={field}
                  >
                    <option value="">— Não ligada —</option>
                    {draft.saleId && !sales.some((s) => s.id === draft.saleId) && <option value={draft.saleId}>Serviço ligado</option>}
                    {sales.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
              )}
            </div>
            {linkedService && draft.isTemplate && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                Template do serviço <strong>{linkedService.name}</strong>: &quot;Novo orçamento&quot; nesse serviço copia estas linhas.
              </p>
            )}
          </section>

          {/* ── Menu: courses and the material each one needs ─────────── */}
          <MenuBuilder
            courses={draft.courses}
            lines={lines}
            items={items}
            guests={totals.guests}
            onCourses={(cs) => update("courses", cs)}
            onAddLines={addLines}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
            onReplaceLines={(fn) => { setLines((ls) => fn(ls)); setDirty(true); }}
          />

          {/* ── Lines by category ───────────────────────────────────── */}
          {lines.length === 0 && (
            <section className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm font-medium">Outros custos</p>
              <p className="text-xs text-gray-400 mt-1">Além do material do menu: equipa, comida, bebidas, espaço, mesas, transporte…</p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                <button type="button" onClick={() => setPickerFor("Material")} className="text-sm font-semibold bg-[#32373c] text-white rounded-xl px-4 py-2 hover:bg-[#1a2018]">
                  + Material do catálogo
                </button>
                <button
                  type="button"
                  onClick={() => addLines(QUICK_LINES.filter((q) => ["Food cost", "Vinhos e bebidas", "Chef", "Staff de sala"].includes(q.description)).map(quickToLine))}
                  className="text-sm font-medium bg-gray-100 rounded-xl px-4 py-2 hover:bg-gray-200"
                >
                  + Base: comida, bebida e equipa
                </button>
              </div>
            </section>
          )}

          {grouped.map(({ category, lines: catLines }) => {
            const catTotal = catLines.reduce((s, l) => s + lineCost(l, totals.guests), 0);
            if (!catLines.length) return null;
            return (
              <section key={category} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <h3 className="text-sm font-semibold">{category}</h3>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {eur(catTotal)} <span className="text-gray-300">·</span> {eur(totals.guests ? catTotal / totals.guests : 0)}/pax
                  </p>
                </header>
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_118px_76px_56px_88px_92px_52px] gap-1 px-3 pt-2 text-[11px] uppercase tracking-wide text-gray-400">
                  <span className="px-2">Descrição</span>
                  <span className="px-2">Qtd.</span>
                  <span className="px-2 text-right">Valor</span>
                  <span className="text-right">Un.</span>
                  <span className="px-2 text-right">€/un.</span>
                  <span className="text-right pr-1">Total</span>
                  <span />
                </div>
                <ul className="divide-y divide-gray-50 md:divide-y-0 px-1 md:px-3 pb-2">
                  {catLines.map((l) => {
                    const item = l.supplierItemId ? itemsById.get(l.supplierItemId) : undefined;
                    const cheaper = item?.compareKey ? cheapest.get(item.compareKey) : undefined;
                    const hasCheaper = !!cheaper && cheaper.id !== item?.id && (cheaper.unitPrice ?? 0) < l.unitCost;
                    const outdated = item && item.unitPrice !== null && item.unitPrice !== l.unitCost;
                    return (
                      <li key={l.key} className="group flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_118px_76px_56px_88px_92px_52px] gap-1 md:items-center py-2 md:py-0.5">
                        <div className="min-w-0">
                          <input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} className={`${cell} font-medium`} aria-label="Descrição" />
                          {(l.fornecedorId || hasCheaper || outdated) && (
                            <div className="flex flex-wrap gap-1 px-2 -mt-0.5 pb-1">
                              {l.fornecedorId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{fornecedorName(l.fornecedorId)}</span>}
                              {outdated && (
                                <button
                                  type="button"
                                  onClick={() => updateLine(l.key, { unitCost: item!.unitPrice! })}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100"
                                  title="O preço do catálogo mudou"
                                >
                                  Catálogo: {eur(item!.unitPrice!)} — atualizar
                                </button>
                              )}
                              {hasCheaper && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(l.key, {
                                      supplierItemId: cheaper!.id,
                                      fornecedorId: cheaper!.fornecedorId,
                                      description: cheaper!.name,
                                      unitCost: cheaper!.unitPrice ?? 0,
                                    })
                                  }
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  title={`${cheaper!.name}`}
                                >
                                  Mais barato: {cheaper!.fornecedorName} {eur(cheaper!.unitPrice!)} — trocar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-[84px_48px_30px_60px_1fr_28px] gap-1 items-center px-1 md:contents">
                        <div className="flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-medium w-full">
                          {(["per_pax", "fixed"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => updateLine(l.key, { qtyMode: m })}
                              className={`flex-1 px-2 py-1 rounded-md whitespace-nowrap ${l.qtyMode === m ? "bg-white shadow-sm" : "text-gray-500"}`}
                            >
                              {m === "per_pax" ? "por pax" : "total"}
                            </button>
                          ))}
                        </div>
                        <NumberCell value={l.quantity} onChange={(v) => updateLine(l.key, { quantity: v })} label="Quantidade" step={l.qtyMode === "per_pax" ? 0.25 : 1} />
                        <span className="text-xs text-gray-400 text-right tabular-nums" title="Unidades">{lineUnits(l, totals.guests)}×</span>
                        <NumberCell value={l.unitCost} onChange={(v) => updateLine(l.key, { unitCost: v })} label="Custo unitário" step={0.05} warn={!(l.unitCost > 0)} />
                        <span className="text-sm font-semibold text-right tabular-nums pr-1">{eur(lineCost(l, totals.guests))}</span>
                        <div className="flex justify-end gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                          <button type="button" onClick={() => moveLine(l.key, -1)} className="text-gray-300 hover:text-gray-600 text-xs px-1" aria-label="Subir">↑</button>
                          <button type="button" onClick={() => removeLine(l.key)} className="text-gray-300 hover:text-rose-600 text-sm px-1" aria-label="Remover linha">✕</button>
                        </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-4 pb-3 flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => addLines([{ category, description: "Nova linha", supplierItemId: null, fornecedorId: null, qtyMode: "fixed", quantity: 1, unitCost: 0, vatRate: 0.23, notes: null, course: null }])}
                    className="text-gray-500 hover:text-[#32373c] font-medium"
                  >
                    + Linha
                  </button>
                  {category === "Material" && (
                    <button type="button" onClick={() => setPickerFor(category)} className="text-[#4d5a56] hover:text-[#32373c] font-semibold">
                      + Do catálogo
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          {/* ── Add more ───────────────────────────────────────────── */}
          {lines.length > 0 && (
            <section className="bg-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-medium text-white/80">Adicionar</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPickerFor("Material")} className="text-xs font-semibold bg-white text-[#32373c] rounded-full px-3 py-1.5 hover:bg-gray-50">
                  + Material do catálogo
                </button>
                {QUICK_LINES.map((q) => (
                  <button
                    key={q.description}
                    type="button"
                    onClick={() => addLines([quickToLine(q)])}
                    className="text-xs bg-white/15 text-white rounded-full px-3 py-1.5 hover:bg-white/25"
                  >
                    + {q.description}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Notes & supplier orders ─────────────────────────────── */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <label className="text-xs font-medium text-gray-500" htmlFor="quote-notes">Notas internas</label>
              <textarea
                id="quote-notes"
                value={draft.notes ?? ""}
                onChange={(e) => update("notes", e.target.value || null)}
                rows={5}
                className={`${field} mt-1 resize-y`}
                placeholder="Menu, condições, o que está incluído…"
              />
            </div>
            <SupplierOrders orders={supplierOrders} eventDate={draft.eventDate} location={draft.location} />
          </section>
        </div>

        {/* ── Summary (sticky) ───────────────────────────────────────── */}
        <Summary
          draft={draft}
          totals={totals}
          onMarkup={(v) => update("markupPct", v)}
          onOverride={(v) => update("pricePerPaxOverride", v)}
          onGuests={(v) => update("guests", v)}
          clientName={clientName}
        />
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#32373c] text-white px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
        <div className="tabular-nums min-w-0">
          <p className="text-base font-bold">{eur(totals.pricePerPax)}<span className="text-xs font-normal text-white/60"> /pax s/ IVA</span></p>
          <p className="text-xs text-white/60 truncate">Total {eur(totals.price)} · margem {pct(totals.margin)}</p>
        </div>
        <button type="button" onClick={save} disabled={saving || !dirty} className="bg-white text-[#32373c] text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60">
          {saving ? "…" : dirty ? "Guardar" : "✓"}
        </button>
      </div>

      {pickerFor && (
        <CatalogPicker
          items={items}
          guests={totals.guests}
          onClose={() => setPickerFor(null)}
          onAdd={(ls) => {
            addLines(ls.map((l) => ({ ...l, category: l.category === "Transporte" ? "Transporte" : pickerFor })));
          }}
        />
      )}

      {serviceDialog && (
        <ServiceDialog
          defaultName={draft.name.replace(/^Template · /, "")}
          dirty={dirty}
          onClose={() => setServiceDialog(false)}
          onCreate={(name, description) =>
            startBusy(async () => {
              const res = await createServiceFromTemplateAction(draft.id, name, description);
              if (res.error !== undefined) setMessage({ kind: "error", text: res.error });
              else {
                setServiceDialog(false);
                setDraft((d) => ({ ...d, serviceId: res.serviceId, isTemplate: true }));
                setMessage({ kind: "ok", text: "Serviço criado" });
                router.refresh();
              }
            })
          }
          busy={busy}
        />
      )}
    </div>
  );
}

function quickToLine(q: (typeof QUICK_LINES)[number]): QuoteLine {
  return { ...q, supplierItemId: null, fornecedorId: null, vatRate: 0.23, notes: null, course: null };
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-stretch rounded-xl border border-gray-200 overflow-hidden bg-white focus-within:border-[#667470]">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="px-3 text-gray-500 hover:bg-gray-50" aria-label="Menos">−</button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="w-full text-center text-sm font-semibold py-2 focus:outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} className="px-3 text-gray-500 hover:bg-gray-50" aria-label="Mais">+</button>
    </div>
  );
}

/** Number input that lets the user type freely (commas included) and commits a number. */
function NumberCell({ value, onChange, label, step, warn }: { value: number; onChange: (v: number) => void; label: string; step?: number; warn?: boolean }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value).replace(".", ",");
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={shown}
      step={step}
      onFocus={() => { setFocused(true); setText(String(value).replace(".", ",")); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const n = Math.max(0, Math.round((value + (e.key === "ArrowUp" ? 1 : -1) * (step ?? 1)) * 100) / 100);
          onChange(n);
          setText(String(n).replace(".", ","));
        }
      }}
      className={`${cell} text-right ${warn ? "bg-amber-50/60" : ""}`}
    />
  );
}

function ClientInput({ clients, value, onChange }: { clients: ClientOption[]; value: string; onChange: (id: string | null) => void }) {
  const [text, setText] = useState(value);
  return (
    <>
      <input
        list="quote-clients"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const match = clients.find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
          onChange(match?.id ?? null);
        }}
        className={field}
        placeholder="Procurar cliente…"
      />
      <datalist id="quote-clients">
        {clients.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
    </>
  );
}

function Summary({
  draft,
  totals,
  onMarkup,
  onOverride,
  onGuests,
  clientName,
}: {
  draft: Draft;
  totals: ReturnType<typeof quoteTotals>;
  onMarkup: (v: number) => void;
  onOverride: (v: number | null) => void;
  onGuests: (v: number) => void;
  clientName: string;
}) {
  const [copied, setCopied] = useState("");
  const marginTone = totals.margin >= 0.3 ? "bg-emerald-500" : totals.margin >= 0.15 ? "bg-amber-400" : "bg-rose-500";
  const roundTargets = [...new Set([5, 10].map((step) => Math.ceil(totals.suggestedPricePerPax / step) * step))].filter((v) => v > 0);

  async function copyForClient() {
    const rows: [string, string][] = [
      ["Evento", draft.name],
      ...(draft.courses.length ? [["Menu", draft.courses.join(" · ")] as [string, string]] : []),
      ...(clientName ? [["Cliente", clientName] as [string, string]] : []),
      ...(draft.eventDate ? [["Data", new Date(`${draft.eventDate}T12:00:00`).toLocaleDateString("pt-PT")] as [string, string]] : []),
      ...(draft.location ? [["Local", draft.location] as [string, string]] : []),
      ["Nº de convidados", String(totals.guests)],
      ["Preço por pessoa (s/ IVA)", eur(totals.pricePerPax)],
      ["Preço por pessoa (c/ IVA)", eur(totals.pricePerPaxInclVat)],
      ["Total s/ IVA", eur(totals.price)],
      [`IVA (${Math.round(draft.vatRate * 100)}%)`, eur(totals.vat)],
      ["Total c/ IVA", eur(totals.priceInclVat)],
    ];
    const td = "padding:6px 12px;border:1px solid #d9dedc;font-family:Arial,sans-serif;font-size:14px;color:#32373c;";
    const html = `<table style="border-collapse:collapse;">${rows
      .map(([k, v], i) => `<tr><td style="${td}${i === rows.length - 1 ? "font-weight:bold;" : ""}">${esc(k)}</td><td style="${td}text-align:right;${i === rows.length - 1 ? "font-weight:bold;" : ""}">${esc(v)}</td></tr>`)
      .join("")}</table>`;
    const text = rows.map(([k, v]) => `${k}\t${v}`).join("\n");
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else await navigator.clipboard.writeText(text);
      setCopied("Copiado ✓");
    } catch {
      setCopied("Não foi possível copiar");
    }
    setTimeout(() => setCopied(""), 2500);
  }

  return (
    <aside className="lg:sticky lg:top-4 space-y-4">
      <section className="bg-[#32373c] text-white rounded-2xl shadow-lg p-5 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Preço por pessoa</p>
          <p className="text-4xl font-bold tabular-nums mt-1">{eur(totals.pricePerPax)}</p>
          <p className="text-sm text-white/60 tabular-nums">{eur(totals.pricePerPaxInclVat)} c/ IVA · {totals.guests} pax</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Margem sobre o preço</span>
            <span className="font-semibold tabular-nums">{pct(totals.margin, 1)} · {eur(totals.profit)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full ${marginTone} transition-all`} style={{ width: `${Math.max(0, Math.min(100, totals.margin * 100))}%` }} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="markup" className="text-xs text-white/60">Markup sobre o custo</label>
            <span className="text-sm font-semibold tabular-nums">{draft.markupPct}%</span>
          </div>
          <input
            id="markup"
            type="range"
            min={0}
            max={150}
            step={5}
            value={draft.markupPct}
            onChange={(e) => onMarkup(Number(e.target.value))}
            className="w-full accent-white"
            disabled={draft.pricePerPaxOverride !== null}
          />
          <p className="text-[11px] text-white/50 tabular-nums">Sugerido: {eur(totals.suggestedPricePerPax)}/pax · {eur(totals.suggestedPrice)}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-white/60">Preço final por pessoa (s/ IVA)</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onOverride(null)}
              className={`text-xs px-3 py-1.5 rounded-full ${draft.pricePerPaxOverride === null ? "bg-white text-[#32373c] font-semibold" : "bg-white/10 hover:bg-white/20"}`}
            >
              Automático
            </button>
            {roundTargets.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onOverride(v)}
                className={`text-xs px-3 py-1.5 rounded-full tabular-nums ${draft.pricePerPaxOverride === v ? "bg-white text-[#32373c] font-semibold" : "bg-white/10 hover:bg-white/20"}`}
              >
                {eur(v)}
              </button>
            ))}
            <input
              inputMode="decimal"
              placeholder="Outro"
              value={draft.pricePerPaxOverride !== null && !roundTargets.includes(draft.pricePerPaxOverride) ? String(draft.pricePerPaxOverride).replace(".", ",") : ""}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                onOverride(e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : null);
              }}
              className="w-20 text-xs px-3 py-1.5 rounded-full bg-white/10 placeholder:text-white/40 focus:bg-white/20 focus:outline-none tabular-nums"
            />
          </div>
        </div>

        <dl className="text-sm space-y-1.5 border-t border-white/10 pt-4 tabular-nums">
          <Row k="Custo total" v={eur(totals.cost)} sub={`${eur(totals.costPerPax)}/pax`} />
          <Row k="Preço s/ IVA" v={eur(totals.price)} />
          <Row k={`IVA ${Math.round(draft.vatRate * 100)}%`} v={eur(totals.vat)} />
          <Row k="Total c/ IVA" v={eur(totals.priceInclVat)} strong />
          <Row k="Lucro" v={eur(totals.profit)} strong tone={totals.profit < 0 ? "text-rose-300" : "text-emerald-300"} />
        </dl>

        {totals.missingPrices > 0 && (
          <p className="text-xs bg-amber-400/15 text-amber-200 rounded-xl px-3 py-2">{totals.missingPrices} linha(s) sem custo — o lucro pode estar sobrestimado.</p>
        )}

        <button type="button" onClick={copyForClient} className="w-full bg-white text-[#32373c] text-sm font-semibold rounded-xl py-2.5 hover:bg-gray-100">
          {copied || "Copiar resumo para email"}
        </button>
      </section>

      {totals.byCategory.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5">
          <p className="text-xs font-medium text-gray-500">Onde vai o custo</p>
          {totals.byCategory.map((c) => (
            <div key={c.category} className="space-y-1">
              <div className="flex justify-between text-xs tabular-nums">
                <span>{c.category}</span>
                <span className="text-gray-500">{eur(c.cost)} · {pct(c.share)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-[#667470]" style={{ width: `${c.share * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="bg-white/10 rounded-2xl p-4 text-xs text-white/70 space-y-1">
        <p className="font-medium text-white/90">Para {totals.guests} pessoas</p>
        <p>Muda o nº de pessoas e todas as linhas &quot;por pax&quot; recalculam (arredondadas à unidade).</p>
        <div className="flex gap-2 pt-1">
          {[20, 40, 60, 80, 100].map((n) => (
            <button key={n} type="button" onClick={() => onGuests(n)} className={`px-2.5 py-1 rounded-full ${totals.guests === n ? "bg-white text-[#32373c] font-semibold" : "bg-white/10 hover:bg-white/20"}`}>
              {n}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function Row({ k, v, sub, strong, tone }: { k: string; v: string; sub?: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/60">{k}</dt>
      <dd className={`${strong ? "font-semibold" : ""} ${tone ?? ""} text-right`}>
        {v}
        {sub && <span className="block text-[11px] text-white/40 font-normal">{sub}</span>}
      </dd>
    </div>
  );
}

function SupplierOrders({ orders, eventDate, location }: { orders: { name: string; rows: { description: string; units: number; unitCost: number }[] }[]; eventDate: string | null; location: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!orders.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-medium text-gray-500">Pedidos aos fornecedores</p>
        <p className="text-xs text-gray-400 mt-2">Adiciona material do catálogo e aqui aparece a lista pronta a enviar à Amado ou à Mesa Posta.</p>
      </div>
    );
  }
  async function copy(o: (typeof orders)[number]) {
    const when = eventDate ? new Date(`${eventDate}T12:00:00`).toLocaleDateString("pt-PT", { day: "numeric", month: "long" }) : "[data]";
    const text = [
      "Bom dia,",
      "",
      `Gostávamos de pedir orçamento para o aluguer dos seguintes itens para o dia ${when}${location ? ` (${location})` : ""}:`,
      "",
      ...o.rows.map((r) => `- ${r.description} - ${r.units} un`),
      "",
      "Obrigado,",
      "COME Food Tours",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(o.name);
    } catch {
      setCopied(null);
    }
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <p className="text-xs font-medium text-gray-500">Pedidos aos fornecedores</p>
      {orders.map((o) => {
        const total = o.rows.reduce((s, r) => s + r.units * r.unitCost, 0);
        return (
          <div key={o.name} className="rounded-xl bg-gray-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{o.name}</p>
              <button type="button" onClick={() => copy(o)} className="text-xs font-medium text-[#4d5a56] hover:text-[#32373c]">
                {copied === o.name ? "Copiado ✓" : "Copiar pedido"}
              </button>
            </div>
            <p className="text-xs text-gray-500 tabular-nums">{o.rows.length} artigos · {eur(total)} s/ IVA (sem transporte)</p>
          </div>
        );
      })}
    </div>
  );
}

function ActionsMenu({
  isTemplate,
  hasService,
  disabled,
  onDuplicate,
  onSaveAsTemplate,
  onSaveAsService,
  onDelete,
}: {
  isTemplate: boolean;
  hasService: boolean;
  disabled: boolean;
  onDuplicate: () => void;
  onSaveAsTemplate: () => void;
  onSaveAsService: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const act = (f: () => void) => () => { setOpen(false); f(); };
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl disabled:opacity-50">
        {disabled ? "…" : "Mais ▾"}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fechar" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 py-2 text-sm">
            {isTemplate ? (
              <button type="button" onClick={act(onDuplicate)} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                <span className="font-medium">Usar template</span>
                <span className="block text-xs text-gray-400">Novo orçamento com estas linhas</span>
              </button>
            ) : (
              <>
                <button type="button" onClick={act(onDuplicate)} className="w-full text-left px-4 py-2 hover:bg-gray-50 font-medium">Duplicar orçamento</button>
                <button type="button" onClick={act(onSaveAsTemplate)} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                  <span className="font-medium">Guardar como template</span>
                  <span className="block text-xs text-gray-400">Para reutilizar noutros eventos</span>
                </button>
              </>
            )}
            {isTemplate && !hasService && (
              <button type="button" onClick={act(onSaveAsService)} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                <span className="font-medium">Guardar como serviço</span>
                <span className="block text-xs text-gray-400">Cria um serviço de evento repetido</span>
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button type="button" onClick={act(onDelete)} className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600">Apagar</button>
          </div>
        </>
      )}
    </div>
  );
}

function ServiceDialog({
  defaultName,
  dirty,
  busy,
  onClose,
  onCreate,
}: {
  defaultName: string;
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="svc-title">
        <div>
          <h2 id="svc-title" className="text-base font-bold">Guardar como serviço de evento</h2>
          <p className="text-xs text-gray-500 mt-1">
            Cria um serviço do tipo Evento (aparece em Produtos &amp; Serviços e nas reservas) e liga-lhe este template. Cada novo orçamento desse serviço começa com estas linhas.
          </p>
        </div>
        {dirty && <p className="text-xs bg-amber-50 text-amber-700 rounded-xl px-3 py-2">Guarda primeiro as alterações — o serviço usa as linhas guardadas.</p>}
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Nome do serviço</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Descrição (opcional)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={field} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-xl hover:bg-gray-100">Cancelar</button>
          <button
            type="button"
            disabled={busy || !name.trim() || dirty}
            onClick={() => onCreate(name, description)}
            className="text-sm font-semibold bg-[#32373c] text-white px-4 py-2 rounded-xl hover:bg-[#1a2018] disabled:opacity-50"
          >
            {busy ? "A criar…" : "Criar serviço"}
          </button>
        </div>
      </div>
    </div>
  );
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
