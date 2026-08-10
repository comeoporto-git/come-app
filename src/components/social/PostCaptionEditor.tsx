"use client";

import { useState, useTransition } from "react";
import { updatePostCaption, regenerateCaption } from "@/actions/social";

export function PostCaptionEditor({ postId, initialCaption }: { postId: string; initialCaption: string | null }) {
  const [value, setValue] = useState(initialCaption ?? "");
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isRegenerating, startRegenerating] = useTransition();
  const isPending = isSaving || isRegenerating;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setDirty(true);
  }

  function handleSave() {
    startSaving(async () => {
      await updatePostCaption(postId, value);
      setDirty(false);
    });
  }

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — nothing else to fall back to here.
    }
  }

  function handleRegenerate() {
    if (!confirm("Gerar uma legenda nova do zero? A legenda atual será substituída.")) return;
    startRegenerating(async () => {
      await regenerateCaption(postId);
      setDirty(false);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Legenda atual</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isPending}
            className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
          >
            {isRegenerating ? "A gerar…" : "↻ Gerar novamente"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value}
            className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
          >
            {copied ? "Copiado ✓" : "Copiar legenda"}
          </button>
        </div>
      </div>

      <textarea
        value={value}
        onChange={handleChange}
        disabled={isPending}
        rows={10}
        placeholder="Ainda sem legenda."
        className="w-full text-sm text-[#32373c] bg-gray-50 rounded-xl p-3 resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#667470]/30 disabled:opacity-50"
      />

      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="text-xs font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
        >
          {isSaving ? "A guardar…" : "Guardar edição"}
        </button>
        {!dirty && !isPending && <span className="text-xs text-gray-400">Sem alterações por guardar</span>}
      </div>
    </div>
  );
}
