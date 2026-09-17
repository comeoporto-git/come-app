"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { categoriaBadgeClass } from "@/lib/fornecedor-categories";

type FornecedorRow = {
  id: string;
  name: string;
  count: number;
  total: number;
  categoria: string | null;
  contact: string | null;
  email: string | null;
};

const UNCATEGORIZED = "__uncategorized__";

export function FornecedoresList({ items }: { items: FornecedorRow[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    let hasUncategorized = false;
    for (const f of items) {
      if (f.categoria) set.add(f.categoria);
      else hasUncategorized = true;
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return hasUncategorized ? [...sorted, UNCATEGORIZED] : sorted;
  }, [items]);

  const filtered = items.filter((f) => {
    const matchesSearch = !search.trim() || f.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory =
      !categoryFilter || (categoryFilter === UNCATEGORIZED ? !f.categoria : f.categoria === categoryFilter);
    return matchesSearch && matchesCategory;
  });

  return (
    <>
      <input
        type="search"
        placeholder="Pesquisar fornecedor…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2.5 text-sm text-[#32373c] placeholder-gray-400 focus:outline-none focus:border-[#667470]/40"
      />

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("")}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
              categoryFilter === ""
                ? "bg-[#667470] text-white border-[#667470]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            Todas
          </button>
          {categories.map((c) => {
            const isUncategorized = c === UNCATEGORIZED;
            const label = isUncategorized ? "Sem categoria" : c;
            const active = categoryFilter === c;
            const colorClass = isUncategorized ? "bg-gray-100 text-gray-500" : categoriaBadgeClass(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(active ? "" : c)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                  active
                    ? `${colorClass} border-transparent ring-2 ring-offset-1 ring-[#667470]/30`
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            {items.length === 0 ? "Sem fornecedores registados" : "Nenhum fornecedor encontrado"}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/admin/fornecedores/${f.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#667470]/10 flex items-center justify-center text-xs font-bold text-[#667470] flex-shrink-0">
                    {f.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#32373c] truncate">{f.name}</p>
                      {f.categoria && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${categoriaBadgeClass(f.categoria)}`}
                        >
                          {f.categoria}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {f.count} {f.count === 1 ? "transação" : "transações"}
                      {f.contact && ` · ${f.contact}`}
                      {f.email && ` · ${f.email}`}
                    </p>
                  </div>
                  {f.count > 0 && (
                    <p className="text-sm font-semibold text-[#32373c] flex-shrink-0">
                      {f.total.toFixed(2)} €
                    </p>
                  )}
                  <span className="text-gray-300 flex-shrink-0">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
