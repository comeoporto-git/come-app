"use client";

import { useState } from "react";
import Link from "next/link";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { updateFornecedorAction } from "@/actions/transactions";
import { EditExpenseModal } from "@/components/EditExpenseModal";

const STATUS_COLORS: Record<string, string> = {
  "Paid":             "bg-green-100 text-green-700",
  "Pending Payment":  "bg-yellow-100 text-yellow-700",
  "Pending Receipt":  "bg-orange-100 text-orange-700",
  "Archived":         "bg-gray-100 text-gray-500",
};

export function FornecedorDetailClient({
  fornecedor,
  transactions,
  fornecedores,
}: {
  fornecedor: Fornecedor;
  transactions: Transaction[];
  fornecedores: Fornecedor[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(fornecedor);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const total = transactions.reduce((sum, t) => sum + t.totalCost, 0);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string)?.trim() || undefined;
    const next = {
      name:         get("name") ?? current.name,
      email:        get("email"),
      contact:      get("contact"),
      iban:         get("iban"),
      contribuinte: get("contribuinte"),
      categoria:    get("categoria"),
    };
    setSaving(true);
    setError("");
    updateFornecedorAction(current.id, next).then((res) => {
      setSaving(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setCurrent((prev) => ({ ...prev, ...next }));
      setEditing(false);
    });
  }

  return (
    <>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <Link
          href="/admin/fornecedores"
          className="text-xs text-gray-400 hover:text-[#667470] transition-colors mb-2 inline-flex items-center gap-1"
        >
          ← Fornecedores
        </Link>

        <div className="flex items-start justify-between mt-1 gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-[#32373c]">{current.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {transactions.length} {transactions.length === 1 ? "transação" : "transações"}
            </p>

            {!editing ? (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {current.categoria && <span>{current.categoria}</span>}
                  {current.contact && <span>{current.contact}</span>}
                  {current.email && <a href={`mailto:${current.email}`} className="hover:text-[#667470]">{current.email}</a>}
                  {current.iban && <span>IBAN: <span className="text-gray-600 font-medium">{current.iban}</span></span>}
                  {current.contribuinte && <span>Contribuinte: <span className="text-gray-600 font-medium">{current.contribuinte}</span></span>}
                </div>
                <button onClick={() => setEditing(true)} className="mt-2 text-xs text-gray-400 hover:text-[#667470] transition-colors">
                  Editar detalhes
                </button>
              </>
            ) : (
              <form onSubmit={handleSave} className="mt-3 space-y-2 max-w-md">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "name",         label: "Nome",         defaultValue: current.name },
                    { name: "categoria",    label: "Categoria",    defaultValue: current.categoria },
                    { name: "contact",      label: "Contacto",     defaultValue: current.contact },
                    { name: "email",        label: "Email",        defaultValue: current.email },
                    { name: "iban",         label: "IBAN",         defaultValue: current.iban },
                    { name: "contribuinte", label: "Contribuinte", defaultValue: current.contribuinte },
                  ].map(({ name, label, defaultValue }) => (
                    <div key={name}>
                      <label className="block text-[10px] text-gray-400 mb-0.5">{label}</label>
                      <input
                        name={name}
                        defaultValue={defaultValue ?? ""}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
                      />
                    </div>
                  ))}
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#667470] text-white rounded-lg text-xs font-medium hover:bg-[#556360] transition-colors disabled:opacity-50"
                  >
                    {saving ? "A guardar…" : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setError(""); }}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-base font-bold text-[#32373c]">{total.toFixed(2)} €</p>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Transações</h2>
        </div>
        {transactions.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            Sem transações para este fornecedor
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {transactions.map((t) => (
              <li
                key={t.id}
                onClick={() => setEditingTx(t)}
                className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#32373c]">
                      {t.date ?? "—"}
                    </p>
                    {t.tourName && (
                      <span className="text-xs text-gray-400 truncate max-w-[180px]">
                        {t.tourName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {t.whoPaid && (
                      <span className="text-xs text-gray-400">{t.whoPaid}</span>
                    )}
                    {t.paymentMethod && (
                      <span className="text-xs text-gray-300">· {t.paymentMethod}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.status && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {t.status}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-[#32373c] min-w-[70px] text-right">
                    {t.totalCost.toFixed(2)} €
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editingTx && (
        <EditExpenseModal
          transaction={editingTx}
          tourId={editingTx.tourId ?? ""}
          fornecedores={fornecedores}
          userRole="Admin"
          onClose={() => setEditingTx(null)}
        />
      )}
    </>
  );
}
