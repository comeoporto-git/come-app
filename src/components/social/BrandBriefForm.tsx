"use client";

import { useState, useTransition } from "react";
import { saveBrandBrief } from "@/actions/social";

type Fields = { tone: string; offerings: string; websiteSummary: string; audience: string; guidelines: string };

export function BrandBriefForm({ initial }: { initial: Fields }) {
  const [fields, setFields] = useState<Fields>(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      await saveBrandBrief(fields);
      setSaved(true);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <Field
        label="Tom de voz"
        value={fields.tone}
        onChange={(v) => update("tone", v)}
        placeholder="ex: Caloroso, próximo, orgulhoso da cultura gastronómica do Porto"
      />
      <Field
        label="O que vendemos"
        value={fields.offerings}
        onChange={(v) => update("offerings", v)}
        placeholder="ex: Tours e experiências gastronómicas no Porto"
      />
      <Field
        label="Audiência"
        value={fields.audience}
        onChange={(v) => update("audience", v)}
        placeholder="ex: Turistas internacionais interessados em cultura e gastronomia local"
      />
      <Field
        label="Sobre o negócio / website"
        value={fields.websiteSummary}
        onChange={(v) => update("websiteSummary", v)}
        placeholder="Resumo do que o negócio oferece, tal como aparece no site"
        rows={4}
      />
      <Field
        label="Diretrizes"
        value={fields.guidelines}
        onChange={(v) => update("guidelines", v)}
        placeholder="ex: Evitar emojis excessivos; usar sempre #comeoporto; nunca mencionar preços"
        rows={3}
      />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="text-sm font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
        >
          {isPending ? "A guardar…" : "Guardar"}
        </button>
        {saved && !isPending && <span className="text-xs text-emerald-600">Guardado ✓</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 resize-none"
      />
    </div>
  );
}
