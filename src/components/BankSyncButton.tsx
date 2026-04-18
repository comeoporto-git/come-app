"use client";

import { useState } from "react";
import { syncBankTransactions } from "@/actions/banking";

type SyncResult = {
  matched: number; unmatched: number; flagged: number;
  fetched: number; errors: string[]; fatalError?: string;
};

export function BankSyncButton() {
  const [syncing, setSyncing]   = useState<"normal" | "full" | null>(null);
  const [result, setResult]     = useState<SyncResult | null>(null);

  async function handleSync(fullSync: boolean) {
    setSyncing(fullSync ? "full" : "normal");
    setResult(null);
    try {
      const res = await syncBankTransactions({ fullSync });
      setResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ matched: 0, unmatched: 0, flagged: 0, fetched: 0, errors: [], fatalError: msg });
    } finally {
      setSyncing(null);
    }
  }

  const busy = syncing !== null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => handleSync(false)}
          disabled={busy}
          className="flex-1 bg-[#667470] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#597568] disabled:opacity-50 transition-colors"
        >
          {syncing === "normal" ? "A sincronizar…" : "Sincronizar Agora"}
        </button>
        <button
          onClick={() => handleSync(true)}
          disabled={busy}
          title="Vai buscar todos os movimentos dos últimos 90 dias"
          className="flex-1 bg-[#32373c] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#1a2018] disabled:opacity-50 transition-colors"
        >
          {syncing === "full" ? "A importar…" : "Importar 1 ano"}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        &ldquo;Importar 1 ano&rdquo; traz todos os movimentos dos últimos 12 meses. O banco pode limitar a 90 dias se não tiver histórico mais antigo.
      </p>

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
