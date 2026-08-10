"use client";

import { useState, useTransition } from "react";
import { syncDriveNow } from "@/actions/social";

function describeResult(result: Awaited<ReturnType<typeof syncDriveNow>>): string {
  switch (result.status) {
    case "ok":
      return `Sincronizado: ${result.added} nova(s) foto(s), ${result.scored} avaliada(s) por AI.`;
    case "no_connection":
      return "Nenhuma pasta do Google Drive ligada ainda.";
    case "no_token":
      return "Sem sessão Google válida — inicia sessão novamente.";
    case "no_scope":
      return "Falta autorizar o acesso ao Google Drive.";
    case "api_disabled":
      return "A Google Drive API não está ativa neste projeto.";
    case "error":
      return `Erro ao sincronizar: ${result.message ?? "desconhecido"}`;
  }
}

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncDriveNow();
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
        {isPending ? "A sincronizar…" : "Sincronizar agora"}
      </button>
      {message && <p className="text-[11px] text-white/60 max-w-[240px] text-right">{message}</p>}
    </div>
  );
}
