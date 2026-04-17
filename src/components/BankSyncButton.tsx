"use client";

import { useState } from "react";
import { syncBankTransactions } from "@/actions/banking";

export function BankSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    matched: number; unmatched: number; flagged: number;
    fetched: number; errors: string[]; fatalError?: string;
  } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await syncBankTransactions();
      setResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ matched: 0, unmatched: 0, flagged: 0, fetched: 0, errors: [], fatalError: msg });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="w-full bg-[#667470] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#597568] disabled:opacity-50 transition-colors"
      >
        {syncing ? "A sincronizar…" : "Sincronizar Agora"}
      </button>

      {result && (
        <>
          {(result.fatalError || result.errors.length > 0) && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              {result.fatalError && (
                <p className="text-xs text-red-600 font-medium">{result.fatalError}</p>
              )}
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e}</p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-lg font-bold text-blue-600">{result.fetched}</p>
              <p className="text-xs text-gray-500">Importados</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-lg font-bold text-green-600">{result.matched}</p>
              <p className="text-xs text-gray-500">Matched</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-lg font-bold text-orange-500">{result.unmatched}</p>
              <p className="text-xs text-gray-500">Sem fatura</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-lg font-bold text-red-500">{result.flagged}</p>
              <p className="text-xs text-gray-500">Flagged</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
