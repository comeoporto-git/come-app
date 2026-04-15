"use client";

import { useState } from "react";
import { disconnectBankAction } from "@/actions/banking";

export function DisconnectBankButton({ itemId, name }: { itemId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    try {
      await disconnectBankAction(itemId);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Tens a certeza?</span>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {loading ? "A remover…" : "Sim, desligar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
      title={`Desligar ${name}`}
    >
      Desligar
    </button>
  );
}
