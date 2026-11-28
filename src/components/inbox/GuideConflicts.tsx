"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { detectGuideConflictsAction, resolveGuideConflictAction } from "@/actions/inbox";

export type ConflictView = {
  id: string;
  summary: string;
  proposed_section: string | null;
  proposed_title: string | null;
  proposed_content: string | null;
  entries: { id: string; section: string; title: string; content: string }[];
};

/**
 * Rules in the guide that contradict each other. The AI flags them; a person
 * decides: apply the proposed single rule, keep one of them, or say they don't
 * conflict. Until then the AI treats those rules as "in conflict".
 */
export function GuideConflicts({ conflicts }: { conflicts: ConflictView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.error ? `Erro: ${r.error}` : ok);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          onClick={() => run(async () => {
            const r = await detectGuideConflictsAction();
            return "found" in r ? { error: undefined } : r;
          }, "Verificação feita.")}
          className="text-[13px] font-semibold bg-white px-4 py-1.5 rounded-xl disabled:opacity-40"
        >
          {pending ? "A verificar…" : "Verificar conflitos no guia"}
        </button>
        {msg && <span className="text-[12px] text-white/70">{msg}</span>}
      </div>

      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-4">
          <p className="text-[14px] font-bold text-amber-900">
            {conflicts.length} {conflicts.length === 1 ? "conflito" : "conflitos"} no guia — decide qual regra vale
          </p>
          {conflicts.map((c) => (
            <div key={c.id} className="bg-white rounded-xl p-3 space-y-3">
              <p className="text-[13px] text-gray-800">{c.summary}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {c.entries.map((e) => (
                  <div key={e.id} className="border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-[11px] text-gray-400">{e.section}</p>
                    <p className="text-[13px] font-semibold">{e.title}</p>
                    <p className="text-[12px] text-gray-600 whitespace-pre-line max-h-40 overflow-y-auto">{e.content}</p>
                    <button
                      disabled={pending}
                      onClick={() => run(() => resolveGuideConflictAction(c.id, { kind: "keep", keepId: e.id }), `Mantida "${e.title}"; as outras foram desativadas.`)}
                      className="text-[12px] font-semibold text-[#32373c] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg"
                    >
                      Manter esta
                    </button>
                  </div>
                ))}
              </div>
              {c.proposed_content && (
                <div className="border border-emerald-200 bg-emerald-50/60 rounded-lg p-2.5 space-y-1.5">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Proposta do COME AI · {c.proposed_section} · {c.proposed_title}</p>
                  <textarea
                    className="w-full text-[13px] border border-black/10 rounded-lg px-2.5 py-1.5 bg-white"
                    rows={4}
                    value={edits[c.id] ?? c.proposed_content}
                    onChange={(ev) => setEdits((x) => ({ ...x, [c.id]: ev.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={pending}
                      onClick={() => run(() => resolveGuideConflictAction(c.id, { kind: "proposal", content: edits[c.id] }), "Regra única aplicada.")}
                      className="text-[12px] font-semibold text-white bg-[#111514] px-3 py-1 rounded-lg"
                    >
                      Aprovar proposta
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => run(() => resolveGuideConflictAction(c.id, { kind: "dismiss" }), "Marcado como não sendo conflito.")}
                      className="text-[12px] text-gray-500 px-2"
                    >
                      Não é conflito
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
