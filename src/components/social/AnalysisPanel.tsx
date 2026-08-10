"use client";

import { useState, useTransition } from "react";
import { generateAnalysis } from "@/actions/social";

export function AnalysisPanel({ initialSummary }: { initialSummary: string | null }) {
  const [summary, setSummary] = useState(initialSummary);
  const [isPending, startTransition] = useTransition();

  function handleAnalyze() {
    startTransition(async () => {
      const result = await generateAnalysis();
      setSummary(result);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Análise AI</p>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isPending}
          className="text-xs font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
        >
          {isPending ? "A analisar…" : summary ? "Reanalisar" : "Analisar com AI"}
        </button>
      </div>
      {summary ? (
        <p className="text-sm text-[#32373c] whitespace-pre-wrap leading-relaxed">{summary}</p>
      ) : (
        <p className="text-sm text-gray-400">
          Ainda sem análise. Clica em &quot;Analisar com AI&quot; depois de teres publicações com métricas.
        </p>
      )}
    </div>
  );
}
