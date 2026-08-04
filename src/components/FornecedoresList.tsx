"use client";

import { useState } from "react";
import Link from "next/link";

type FornecedorRow = {
  id: string;
  name: string;
  count: number;
  total: number;
};

export function FornecedoresList({ items }: { items: FornecedorRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? items.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  return (
    <>
      <input
        type="search"
        placeholder="Pesquisar fornecedor…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2.5 text-sm text-[#32373c] placeholder-gray-400 focus:outline-none focus:border-[#667470]/40"
      />

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
                    <p className="text-sm font-medium text-[#32373c] truncate">{f.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {f.count} {f.count === 1 ? "transação" : "transações"}
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
