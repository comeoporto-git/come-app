"use client";

import { useTransition } from "react";
import { regenerateCaption } from "@/actions/social";

export function RegenerateCaptionButton({ postId }: { postId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Gerar uma legenda nova do zero? A legenda atual será substituída.")) return;
    startTransition(async () => {
      await regenerateCaption(postId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
    >
      {isPending ? "A gerar…" : "↻ Gerar novamente"}
    </button>
  );
}
