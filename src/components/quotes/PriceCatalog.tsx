"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  deleteSupplierItemAction,
  extractPricesFromEmailAction,
  saveSupplierItemAction,
  type ExtractedPrice,
} from "@/actions/eventQuotes";
import { ITEM_CATEGORIES, cheapestByCompareKey, eur, lastPriceChange, pct, type SupplierItem } from "@/lib/eventQuotes";
import type { SupplierItemInput } from "@/lib/eventQuotesData";

type Fornecedor = { id: string; name: string; categoria: string | null };
type View = "catalog" | "compare";

const field =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#667470] focus:ring-2 focus:ring-[#667470]/15";
const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T12:00:00`)) : "—");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export function PriceCatalog({ items, fornecedores }: { items: SupplierItem[]; fornecedores: Fornecedor[] }) {
  const [view, setView] = useState<View>("catalog");
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [editing, setEditing] = useState<SupplierItem | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const suppliersWithItems = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number; latest: string | null }>();
    for (const i of items) {
      const e = m.get(i.fornecedorId) ?? { id: i.fornecedorId, name: i.fornecedorName, count: 0, latest: null };
      e.count += 1;
      if (i.priceDate && (!e.latest || i.priceDate > e.latest)) e.latest = i.priceDate;
      m.set(i.fornecedorId, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const cheapest = useMemo(() => cheapestByCompareKey(items), [items]);
  const changes = useMemo(() => items.map((i) => ({ item: i, change: lastPriceChange(i) })).filter((x) => x.change !== null && x.change !== 0), [items]);

  const filtered = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return items.filter(
      (i) => (!supplier || i.fornecedorId === supplier) && words.every((w) => norm(`${i.name} ${i.category} ${i.compareKey ?? ""}`).includes(w)),
    );
  }, [items, query, supplier]);

  const byCategory = useMemo(() => {
    const m = new Map<string, SupplierItem[]>();
    for (const i of filtered) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    const order = ITEM_CATEGORIES as readonly string[];
    const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length);
    return [...m.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [filtered]);

  const compareRows = useMemo(() => {
    const m = new Map<string, SupplierItem[]>();
    for (const i of items) if (i.compareKey && i.active) m.set(i.compareKey, [...(m.get(i.compareKey) ?? []), i]);
    return [...m.entries()].filter(([, v]) => new Set(v.map((x) => x.fornecedorId)).size > 1).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const compareSuppliers = useMemo(() => [...new Set(compareRows.flatMap(([, v]) => v.map((x) => x.fornecedorName)))].sort(), [compareRows]);

  return (
    <div className="space-y-4">
      {/* Suppliers overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {suppliersWithItems.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setSupplier(supplier === s.id ? "" : s.id); setView("catalog"); }}
            className={`text-left rounded-2xl px-4 py-3 shadow-sm transition ${supplier === s.id ? "bg-[#32373c] text-white" : "bg-white hover:bg-gray-50"}`}
          >
            <p className="font-semibold text-sm">{s.name}</p>
            <p className={`text-xs ${supplier === s.id ? "text-white/60" : "text-gray-400"}`}>{s.count} artigos · último preço {fmtDate(s.latest)}</p>
          </button>
        ))}
        <button type="button" onClick={() => setImporting(true)} className="text-left rounded-2xl px-4 py-3 border-2 border-dashed border-white/30 text-white hover:bg-white/10 transition">
          <p className="font-semibold text-sm">Importar de email</p>
          <p className="text-xs text-white/60">Cola um orçamento da Amado, Mesa Posta…</p>
        </button>
      </div>

      {changes.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Alterações de preço nos últimos orçamentos</p>
          <div className="flex flex-wrap gap-2">
            {changes.map(({ item, change }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEditing(item)}
                className={`text-xs rounded-full px-3 py-1 ${change! > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {item.fornecedorName} · {item.name}: {change! > 0 ? "+" : ""}{pct(change!)} → {eur(item.unitPrice!)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap gap-2 items-center border-b border-gray-100">
          <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-medium">
            {([["catalog", "Catálogo"], ["compare", `Comparar (${compareRows.length})`]] as [View, string][]).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg ${view === v ? "bg-white shadow-sm" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
          {view === "catalog" && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar artigo…" className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470]" />
          )}
          <button type="button" onClick={() => setEditing("new")} className="ml-auto text-sm font-semibold bg-[#32373c] text-white rounded-xl px-4 py-2 hover:bg-[#1a2018]">
            + Artigo
          </button>
        </div>

        {view === "compare" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-medium px-4 py-2">Artigo equivalente</th>
                  {compareSuppliers.map((s) => <th key={s} className="font-medium px-4 py-2 text-right">{s}</th>)}
                  <th className="font-medium px-4 py-2 text-right">Poupança</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {compareRows.map(([key, list]) => {
                  const prices = list.filter((x) => x.unitPrice != null).map((x) => x.unitPrice!);
                  const min = Math.min(...prices);
                  const max = Math.max(...prices);
                  return (
                    <tr key={key}>
                      <td className="px-4 py-2 font-medium">{key}</td>
                      {compareSuppliers.map((s) => {
                        const it = list.filter((x) => x.fornecedorName === s).sort((a, b) => (a.unitPrice ?? 1e9) - (b.unitPrice ?? 1e9))[0];
                        return (
                          <td key={s} className="px-4 py-2 text-right">
                            {it ? (
                              <button type="button" onClick={() => setEditing(it)} title={it.name} className={`rounded-lg px-2 py-0.5 ${it.unitPrice === min ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
                                {it.unitPrice == null ? "—" : eur(it.unitPrice)}
                              </button>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right text-xs text-gray-500">{max > min ? `${pct((max - min) / max)} por un.` : "igual"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-gray-400">Liga artigos equivalentes pondo o mesmo nome em &quot;Comparar como&quot;. Nos orçamentos aparece a sugestão &quot;Mais barato — trocar&quot;.</p>
          </div>
        ) : (
          <div>
            {byCategory.length === 0 && <p className="p-8 text-center text-sm text-gray-400">Sem artigos.</p>}
            {byCategory.map(([cat, list]) => (
              <section key={cat}>
                <h3 className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{cat}</h3>
                <ul className="divide-y divide-gray-50">
                  {list.map((i) => {
                    const change = lastPriceChange(i);
                    const best = i.compareKey ? cheapest.get(i.compareKey) : undefined;
                    return (
                      <li key={i.id}>
                        <button type="button" onClick={() => setEditing(i)} className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${i.active ? "" : "opacity-50"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{i.name}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {i.fornecedorName} · {fmtDate(i.priceDate)}{i.source ? ` · ${i.source}` : ""}
                            </p>
                          </div>
                          {best && best.id === i.id && <span className="hidden sm:inline text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">mais barato</span>}
                          {change !== null && change !== 0 && (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${change > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                              {change > 0 ? "▲" : "▼"} {pct(Math.abs(change))}
                            </span>
                          )}
                          <span className="text-sm font-semibold tabular-nums w-20 text-right">{i.unitPrice == null ? "pedir" : eur(i.unitPrice)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ItemEditor
          item={editing === "new" ? null : editing}
          fornecedores={fornecedores}
          defaultFornecedor={supplier || suppliersWithItems[0]?.id || ""}
          compareKeys={[...new Set(items.map((i) => i.compareKey).filter(Boolean) as string[])].sort()}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <EmailImport items={items} fornecedores={fornecedores} defaultFornecedor={supplier} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ── Editor drawer ───────────────────────────────────────────────────────────

function ItemEditor({
  item,
  fornecedores,
  defaultFornecedor,
  compareKeys,
  onClose,
}: {
  item: SupplierItem | null;
  fornecedores: Fornecedor[];
  defaultFornecedor: string;
  compareKeys: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<SupplierItemInput>(() => ({
    id: item?.id,
    fornecedorId: item?.fornecedorId ?? defaultFornecedor,
    name: item?.name ?? "",
    category: item?.category ?? "Loiça",
    compareKey: item?.compareKey ?? null,
    unit: item?.unit ?? "un",
    unitPrice: item?.unitPrice ?? null,
    priceDate: item?.priceDate ?? today,
    source: item?.source ?? null,
    url: item?.url ?? null,
    notes: item?.notes ?? null,
    active: item?.active ?? true,
  }));
  const [priceText, setPriceText] = useState(item?.unitPrice != null ? String(item.unitPrice).replace(".", ",") : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof SupplierItemInput>(k: K, v: SupplierItemInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    setError("");
    start(async () => {
      const res = await saveSupplierItemAction(form);
      if (res.error !== undefined) setError(res.error);
      else { router.refresh(); onClose(); }
    });
  }
  function remove() {
    if (!item || !confirm(`Apagar "${item.name}" e o seu histórico de preços?`)) return;
    start(async () => {
      const res = await deleteSupplierItemAction(item.id);
      if (res.error !== undefined) setError(res.error);
      else { router.refresh(); onClose(); }
    });
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Artigo">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{item ? "Editar artigo" : "Novo artigo"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar">✕</button>
        </div>
        <Labeled label="Fornecedor">
          <select value={form.fornecedorId} onChange={(e) => set("fornecedorId", e.target.value)} className={field}>
            <option value="">— Escolher —</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Labeled>
        <Labeled label="Artigo">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={field} autoFocus={!item} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Preço s/ IVA (€)">
            <input
              inputMode="decimal"
              value={priceText}
              onChange={(e) => {
                setPriceText(e.target.value);
                const n = Number(e.target.value.replace(",", "."));
                set("unitPrice", e.target.value.trim() === "" ? null : Number.isFinite(n) ? n : form.unitPrice);
                if (item && n !== item.unitPrice) set("priceDate", today);
              }}
              className={`${field} tabular-nums`}
              placeholder="pedir"
            />
          </Labeled>
          <Labeled label="Data do preço">
            <input type="date" value={form.priceDate ?? ""} onChange={(e) => set("priceDate", e.target.value || null)} className={field} />
          </Labeled>
          <Labeled label="Categoria">
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className={field}>
              {ITEM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Labeled>
          <Labeled label="Unidade">
            <input value={form.unit} onChange={(e) => set("unit", e.target.value)} className={field} />
          </Labeled>
        </div>
        <Labeled label="Comparar como (opcional)">
          <input list="compare-keys" value={form.compareKey ?? ""} onChange={(e) => set("compareKey", e.target.value || null)} className={field} placeholder="ex.: Prato ladeiro" />
          <datalist id="compare-keys">{compareKeys.map((k) => <option key={k} value={k} />)}</datalist>
        </Labeled>
        <Labeled label="Origem do preço">
          <input value={form.source ?? ""} onChange={(e) => set("source", e.target.value || null)} className={field} placeholder="ex.: Gmail · Orçamento nº109046" />
        </Labeled>
        <Labeled label="Link">
          <input value={form.url ?? ""} onChange={(e) => set("url", e.target.value || null)} className={field} placeholder="https://…" />
        </Labeled>
        <Labeled label="Notas">
          <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={2} className={field} />
        </Labeled>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Disponível nos orçamentos
        </label>

        {item && item.history.length > 0 && (
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Histórico de preços</p>
            <ul className="space-y-1">
              {[...item.history].reverse().map((h, idx) => (
                <li key={idx} className="flex justify-between gap-3 text-xs tabular-nums">
                  <span className="text-gray-500 truncate">{fmtDate(h.quotedOn)}{h.source ? ` · ${h.source}` : ""}</span>
                  <span className="font-semibold">{eur(h.unitPrice)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm bg-rose-50 text-rose-700 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-2 pt-2">
          {item && <button type="button" onClick={remove} disabled={pending} className="text-sm text-rose-600 px-3 py-2 rounded-xl hover:bg-rose-50">Apagar</button>}
          <button type="button" onClick={save} disabled={pending} className="ml-auto text-sm font-semibold bg-[#32373c] text-white px-5 py-2 rounded-xl hover:bg-[#1a2018] disabled:opacity-50">
            {pending ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// ── Import from email ───────────────────────────────────────────────────────

type ImportRow = ExtractedPrice & { include: boolean; matchId: string | ""; category: string };

function bestMatch(name: string, candidates: SupplierItem[]): SupplierItem | undefined {
  const words = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/s$/, "")));
  const target = words(name);
  let best: { item: SupplierItem; score: number } | undefined;
  for (const c of candidates) {
    const cw = words(c.name);
    const inter = [...target].filter((w) => cw.has(w)).length;
    const score = inter / Math.max(target.size, cw.size, 1);
    if (score > (best?.score ?? 0)) best = { item: c, score };
  }
  return best && best.score >= 0.5 ? best.item : undefined;
}

function EmailImport({
  items,
  fornecedores,
  defaultFornecedor,
  onClose,
}: {
  items: SupplierItem[];
  fornecedores: Fornecedor[];
  defaultFornecedor: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [fornecedorId, setFornecedorId] = useState(defaultFornecedor);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const supplierItems = items.filter((i) => i.fornecedorId === fornecedorId);

  function read() {
    setError("");
    start(async () => {
      const res = await extractPricesFromEmailAction(text);
      if (res.error !== undefined) return setError(res.error);
      if (res.date) setDate(res.date);
      setRows(
        res.items.map((r) => {
          const m = bestMatch(r.name, supplierItems);
          return { ...r, include: true, matchId: m?.id ?? "", category: m?.category ?? r.category ?? "Outros" };
        }),
      );
    });
  }

  function apply() {
    if (!rows || !fornecedorId) return;
    setError("");
    start(async () => {
      for (const r of rows.filter((x) => x.include)) {
        const existing = items.find((i) => i.id === r.matchId);
        const res = await saveSupplierItemAction({
          id: existing?.id,
          fornecedorId,
          name: existing?.name ?? r.name,
          category: existing?.category ?? r.category,
          compareKey: existing?.compareKey ?? null,
          unit: existing?.unit ?? "un",
          unitPrice: r.unitPrice,
          priceDate: date,
          source: source.trim() || "Email",
          url: existing?.url ?? null,
          notes: existing?.notes ?? null,
          active: true,
        });
        if (res.error !== undefined) return setError(`${r.name}: ${res.error}`);
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Importar preços de email">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Importar preços de um email</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar">✕</button>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Labeled label="Fornecedor">
            <select value={fornecedorId} onChange={(e) => { setFornecedorId(e.target.value); setRows(null); }} className={field}>
              <option value="">— Escolher —</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Data do orçamento">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </Labeled>
          <Labeled label="Origem">
            <input value={source} onChange={(e) => setSource(e.target.value)} className={field} placeholder="Gmail · assunto" />
          </Labeled>
        </div>

        {!rows ? (
          <>
            <Labeled label="Texto do email (abre o email no Gmail, seleciona tudo e cola aqui)">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${field} font-mono text-xs`} placeholder={"QUANT.  EQUIPAMENTO  €/UNI.  TOTAL\n17  Cadeiras madeira mogno  3,30 €  56,10 €\n…"} />
            </Labeled>
            {error && <p className="text-sm bg-rose-50 text-rose-700 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={read} disabled={pending || !fornecedorId || text.trim().length < 20} className="text-sm font-semibold bg-[#32373c] text-white px-5 py-2 rounded-xl hover:bg-[#1a2018] disabled:opacity-50">
                {pending ? "A ler…" : "Ler preços"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500">Confirma cada linha. Se o artigo já existe, o preço novo entra no histórico; senão é criado.</p>
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-2xl">
              {rows.map((r, idx) => {
                const existing = supplierItems.find((i) => i.id === r.matchId);
                const delta = existing?.unitPrice ? (r.unitPrice - existing.unitPrice) / existing.unitPrice : null;
                return (
                  <li key={idx} className={`p-3 flex flex-wrap items-center gap-2 ${r.include ? "" : "opacity-40"}`}>
                    <input type="checkbox" checked={r.include} onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === idx ? { ...x, include: e.target.checked } : x)))} aria-label="Incluir" />
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-medium">{r.name}</p>
                      <select
                        value={r.matchId}
                        onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === idx ? { ...x, matchId: e.target.value } : x)))}
                        className="mt-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-full"
                      >
                        <option value="">Novo artigo</option>
                        {supplierItems.map((i) => <option key={i.id} value={i.id}>= {i.name}</option>)}
                      </select>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-sm font-semibold">{eur(r.unitPrice)}</p>
                      {existing && (
                        <p className={`text-[11px] ${delta && delta > 0 ? "text-rose-600" : delta && delta < 0 ? "text-emerald-600" : "text-gray-400"}`}>
                          era {existing.unitPrice == null ? "—" : eur(existing.unitPrice)}{delta ? ` (${delta > 0 ? "+" : ""}${pct(delta)})` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {error && <p className="text-sm bg-rose-50 text-rose-700 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setRows(null)} className="text-sm px-4 py-2 rounded-xl hover:bg-gray-100">← Voltar</button>
              <button type="button" onClick={apply} disabled={pending || !rows.some((r) => r.include)} className="text-sm font-semibold bg-[#32373c] text-white px-5 py-2 rounded-xl hover:bg-[#1a2018] disabled:opacity-50">
                {pending ? "A guardar…" : `Guardar ${rows.filter((r) => r.include).length} preços`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
