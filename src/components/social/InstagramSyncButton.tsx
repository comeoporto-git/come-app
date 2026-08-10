"use client";

import { useState, useTransition } from "react";
import { syncInstagramNow } from "@/actions/social";

function describeResult(result: Awaited<ReturnType<typeof syncInstagramNow>>): string {
  switch (result.status) {
    case "ok":
      return `Sincronizado: ${result.matched} publicação(ões) associada(s), ${result.insightsFetched} com métricas atualizadas.`;
    case "not_connected":
      return "Instagram não está ligado.";
    case "error":
      return `Erro ao sincronizar: ${result.message}`;
  }
}

export function InstagramSyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncInstagramNow();
      setMessage(describeResult(result));
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-semibold bg-white text-[#32373c] px-4 py-2 rounded-xl shadow-sm hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50"
      >
        {isPending ? "A sincronizar…" : "Sincronizar Instagram"}
      </button>
      {message && <p className="text-[11px] text-white/60 max-w-[280px] text-right">{message}</p>}
    </div>
  );
}
