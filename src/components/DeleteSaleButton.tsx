"use client";

import { useState } from "react";

type Props = { action: () => Promise<void> };

export function DeleteSaleButton({ action }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await action();
    setLoading(false);
  }

  if (confirming) {
    return (
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex-1 bg-red-600 text-white font-semibold py-3.5 rounded-2xl text-sm hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? "A apagar…" : "Confirmar eliminação"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="px-5 bg-gray-100 text-gray-700 font-semibold py-3.5 rounded-2xl text-sm hover:bg-gray-200 active:scale-[0.98] transition-all"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full border border-red-200 text-red-600 font-semibold py-3.5 rounded-2xl text-sm hover:bg-red-50 active:scale-[0.98] transition-all"
    >
      Eliminar Serviço
    </button>
  );
}
