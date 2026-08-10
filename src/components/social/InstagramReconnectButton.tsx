"use client";

import { useTransition } from "react";
import { disconnectInstagram } from "@/actions/social";

export function InstagramReconnectButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Desligar o Instagram? Vais poder voltar a ligar com um novo token/IDs.")) return;
    startTransition(async () => {
      await disconnectInstagram();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
    >
      {isPending ? "A desligar…" : "Reconfigurar ligação"}
    </button>
  );
}
