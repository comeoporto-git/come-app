"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cheapestByCompareKey,
  eur,
  lineFromItem,
  lineUnits,
  type QuoteLine,
  type SupplierItem,
} from "@/lib/eventQuotes";

type Pick = { line: QuoteLine };

const dateFmt = new Intl.DateTimeFormat("pt-PT", { month: "short", year: "numeric" });

export function CatalogPicker({
  items,
  guests,
  onAdd,
  onClose,
}: {
  items: SupplierItem[];
  guests: number;
  onAdd: (lines: QuoteLine[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [picked, setPicked] = useState<Map<string, Pick>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const suppliers = useMemo(() => [...new Set(items.map((i) => i.fornecedorName))].sort(), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const cheapest = useMemo(() => cheapestByCompareKey(items), [items]);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/\s+/).filter(Boolean);
    return items.filter((i) => {
      if (supplier && i.fornecedorName !== supplier) return false;
      if (category && i.category !== category) return false;
      const hay = `${i.name} ${i.category} ${i.compareKey ?? ""}`.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
      return words.every((w) => hay.includes(w));
    });
  }, [items, query, supplier, category]);

  const toggle = (item: SupplierItem) => {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, { line: lineFromItem(item) });
      return next;
    });
  };
  const patch = (id: string, p: Partial<QuoteLine>) =>
    setPicked((m) => {
      const cur = m.get(id);
      if (!cur) return m;
      const next = new Map(m);
      next.set(id, { line: { ...cur.line, ...p } });
      return next;
    });

  const pickedTotal = [...picked.values()].reduce((s, p) => s + lineUnits(p.line, guests) * p.line.unitCost, 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-3xl h-[92vh] sm:h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Catálogo de fornecedores"
      >
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar: copo vinho, cadeira, prato ladeiro…"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#667470] focus:ring-2 focus:ring-[#667470]/15"
            />
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg px-2" aria-label="Fechar">✕</button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <Chip active={!supplier} onClick={() => setSupplier("")}>Todos</Chip>
            {suppliers.map((s) => <Chip key={s} active={supplier === s} onClick={() => setSupplier(supplier === s ? "" : s)}>{s}</Chip>)}
            <span className="w-px bg-gray-200 mx-1 shrink-0" />
            {categories.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? "" : c)} subtle>{c}</Chip>)}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 && <li className="p-8 text-center text-sm text-gray-400">Nada encontrado. Adiciona artigos em Preços de fornecedores.</li>}
          {filtered.map((item) => {
            const p = picked.get(item.id);
            const best = item.compareKey ? cheapest.get(item.compareKey) : undefined;
            const isBest = best?.id === item.id;
            const hasAlt = best && !isBest && best.unitPrice != null && item.unitPrice != null && best.unitPrice < item.unitPrice;
            return (
              <li key={item.id} className={`px-4 py-2.5 ${p ? "bg-[#667470]/5" : "hover:bg-gray-50"}`}>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center text-[11px] ${p ? "bg-[#32373c] border-[#32373c] text-white" : "border-gray-300"}`}
                    aria-label={p ? "Remover" : "Selecionar"}
                  >
                    {p ? "✓" : ""}
                  </button>
                  <button type="button" onClick={() => toggle(item)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {item.fornecedorName} · {item.category}
                      {item.priceDate ? ` · ${dateFmt.format(new Date(`${item.priceDate}T12:00:00`))}` : ""}
                    </p>
                  </button>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{item.unitPrice == null ? "—" : eur(item.unitPrice)}</p>
                    {isBest && item.compareKey && <p className="text-[10px] text-emerald-600 font-medium">mais barato</p>}
                    {hasAlt && <p className="text-[10px] text-amber-600">{best!.fornecedorName}: {eur(best!.unitPrice!)}</p>}
                  </div>
                </div>
                {p && (
                  <div className="flex items-center gap-2 mt-2 ml-8 flex-wrap">
                    <div className="flex rounded-lg bg-white border border-gray-200 p-0.5 text-[11px] font-medium">
                      {(["per_pax", "fixed"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => patch(item.id, { qtyMode: m, quantity: m === "fixed" ? Math.max(1, lineUnits(p.line, guests)) : 1 })}
                          className={`px-2 py-1 rounded-md ${p.line.qtyMode === m ? "bg-[#32373c] text-white" : "text-gray-500"}`}
                        >
                          {m === "per_pax" ? "por pax" : "total"}
                        </button>
                      ))}
                    </div>
                    <input
                      inputMode="decimal"
                      value={String(p.line.quantity).replace(".", ",")}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(",", "."));
                        if (Number.isFinite(n)) patch(item.id, { quantity: n });
                      }}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:border-[#667470]"
                      aria-label="Quantidade"
                    />
                    <span className="text-xs text-gray-500 tabular-nums">
                      = {lineUnits(p.line, guests)} un · {eur(lineUnits(p.line, guests) * p.line.unitCost)}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-white">
          <p className="text-sm text-gray-500 tabular-nums">
            {picked.size} {picked.size === 1 ? "artigo" : "artigos"} · {eur(pickedTotal)} para {guests} pax
          </p>
          <button
            type="button"
            disabled={!picked.size}
            onClick={() => {
              onAdd([...picked.values()].map((p) => p.line));
              onClose();
            }}
            className="bg-[#32373c] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#1a2018] disabled:opacity-40"
          >
            Adicionar ao orçamento
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children, subtle }: { active: boolean; onClick: () => void; children: React.ReactNode; subtle?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs whitespace-nowrap px-3 py-1.5 rounded-full transition ${
        active ? "bg-[#32373c] text-white" : subtle ? "bg-gray-50 text-gray-500 hover:bg-gray-100" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
