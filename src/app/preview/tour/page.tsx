/**
 * PREVIEW ONLY — remove before deploying.
 */
import Image from "next/image";
import { AddExpenseButton } from "@/components/AddExpenseButton";

const MOCK_FORNECEDORES = [
  { id: "1", name: "Mercado do Bolhão" },
  { id: "2", name: "Taberna dos Mercadores" },
  { id: "3", name: "Tasca do Chico" },
  { id: "4", name: "Adega São Nicolau" },
  { id: "5", name: "Cervejaria Brasão" },
  { id: "6", name: "Majestic Café" },
  { id: "7", name: "Padaria Ribeiro" },
];

export default function PreviewTourPage() {
  return (
    <div className="min-h-screen bg-[#667470] pb-24">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-white/60 text-lg">←</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-white truncate">Porto Food & Wine Tour</h1>
            <p className="text-xs text-white/50">domingo, 12 de abril, 13:11</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Guest Info */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#32373c]">Informação do Grupo</h2>
          </div>
          <div className="px-4 py-3 space-y-2">
            {[
              ["Cliente", "Smith Family"],
              ["Nº de Pax", "4"],
              ["ID de Venda", "FT-2024-089"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-sm text-[#32373c] font-medium">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Telefone</span>
              <a href="tel:+351912345678" className="text-sm font-medium text-[#667470] underline underline-offset-2">
                +351 912 345 678
              </a>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Notas</p>
              <p className="text-sm text-[#32373c]">Celebrating anniversary. Couple prefers outdoor seating when possible.</p>
            </div>
          </div>
        </section>

        {/* Restrictions */}
        <section className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-red-700 mb-2">⚠️ Restrições Alimentares</h2>
          <div className="flex flex-wrap gap-2">
            {["Sem Glúten", "Vegetariano"].map((r) => (
              <span key={r} className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
                {r}
              </span>
            ))}
          </div>
        </section>

        {/* Expenses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#32373c]">
              Despesas <span className="text-gray-400 font-normal">€47.80</span>
            </h2>
            <AddExpenseButton tourId="preview-tour" fornecedores={MOCK_FORNECEDORES} />
          </div>

          <ul className="space-y-2">
            {[
              { supplier: "Mercado do Bolhão", total: 23.50, status: "Paid", iva13: 2.64 },
              { supplier: "Taberna dos Mercadores", total: 24.30, status: "Pending Receipt", iva13: 2.74 },
            ].map((tx) => (
              <li key={tx.supplier} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[#32373c]">{tx.supplier}</p>
                    <p className="text-xs text-gray-400">2024-04-12</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#32373c]">€{tx.total.toFixed(2)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      tx.status === "Paid" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {tx.status}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-400">IVA 13%: €{tx.iva13.toFixed(2)}</div>
                {tx.status === "Pending Receipt" && (
                  <button className="mt-1 text-xs text-[#667470] font-semibold hover:underline">
                    + Adicionar Recibo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Close Tour */}
        <button className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm tracking-wide">
          Fechar Tour e Despesas
        </button>
      </main>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#7b8b87] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
        Preview Mode — Tour Detail
      </div>
    </div>
  );
}
