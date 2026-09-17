"use client";

import { useState } from "react";
import type { Fornecedor, Transaction } from "@/lib/notion";
import { getFornecedorDetailAction } from "@/actions/transactions";
import { FornecedorDetailClient } from "@/components/fornecedores/FornecedorDetailClient";

type FornecedorRow = {
  id: string;
  name: string;
  count: number;
  total: number;
};

type Detail = { fornecedor: Fornecedor; transactions: Transaction[] };

export function FornecedoresList({
  items,
  fornecedores,
}: {
  items: FornecedorRow[];
  fornecedores: Fornecedor[];
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = search.trim()
    ? items.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  function close() {
    setSelectedId(null);
    setDetail(null);
    setError("");
  }

  async function open(id: string) {
    setSelectedId(id);
    setDetail(null);
    setError("");
    setLoading(true);
    const res = await getFornecedorDetailAction(id);
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDetail(res);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
      {/* List column */}
      <div className="order-2 lg:order-1 space-y-4">
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
                  <button
                    type="button"
                    onClick={() => open(f.id)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left ${
                      selectedId === f.id ? "bg-[#667470]/5" : ""
                    }`}
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Detail column */}
      <div className="order-1 lg:order-2 space-y-4 lg:sticky lg:top-8">
        {!selectedId && (
          <div className="hidden lg:flex bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 items-center justify-center text-center text-gray-400 text-sm">
            Seleciona um fornecedor para ver os detalhes
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-gray-400 text-sm">
            A carregar…
          </div>
        )}

        {error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {detail && (
          <FornecedorDetailClient
            fornecedor={detail.fornecedor}
            transactions={detail.transactions}
            fornecedores={fornecedores}
            onClose={close}
          />
        )}
      </div>
    </div>
  );
}
