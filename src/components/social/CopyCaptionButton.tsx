"use client";

import { useState } from "react";

export function CopyCaptionButton({ caption }: { caption: string | null }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing else to fall back to here.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!caption}
      className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
    >
      {copied ? "Copiado ✓" : "Copiar legenda"}
    </button>
  );
}
