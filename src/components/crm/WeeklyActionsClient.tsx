"use client";

import { useState, useTransition } from "react";
import type { CRMWeeklyAction } from "@/lib/notion";
import { updateWeeklyActionStatus, clearWeeklyActions } from "@/actions/crm";

function ActionRow({ action, weekOf }: { action: CRMWeeklyAction; weekOf: string }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(action.status);
  const [showScript, setShowScript] = useState(false);

  function updateStatus(next: "pending" | "done" | "skipped") {
    startTransition(async () => {
      await updateWeeklyActionStatus(action.id, next, weekOf);
      setStatus(next);
    });
  }

  const isDone = status === "done";
  const isSkipped = status === "skipped";
  const mailtoUrl = action.contact_email
    ? `mailto:${action.contact_email}?subject=${encodeURIComponent(action.subject ?? "")}&body=${encodeURIComponent(action.suggested_script ?? "")}`
    : null;

  return (
    <div className={`rounded-xl border p-4 transition-all ${isDone ? "opacity-50 border-gray-100 bg-gray-50" : isSkipped ? "opacity-40 border-gray-100 bg-gray-50" : "border-gray-200 bg-white shadow-sm"}`}>
      <div className="flex items-start gap-3">
        {/* Priority */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${action.priority <= 3 ? "bg-red-100 text-red-600" : action.priority <= 7 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
          {action.priority}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#32373c]">{action.account_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${action.action_type === "call" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
              {action.action_type === "call" ? "📞 Chamada" : "✉️ Email"}
            </span>
          </div>
          {action.contact_name && (
            <p className="text-xs text-gray-500 mt-0.5">
              {action.contact_name}
              {action.contact_phone && action.action_type === "call" && ` · ${action.contact_phone}`}
              {action.contact_email && action.action_type === "email" && ` · ${action.contact_email}`}
            </p>
          )}
          {action.subject && <p className="text-xs text-gray-600 mt-1 font-medium">{action.subject}</p>}

          {action.suggested_script && (
            <div className="mt-2">
              <button onClick={() => setShowScript(!showScript)} className="text-xs text-[#667470] hover:underline">
                {showScript ? "▲ Ocultar guião" : "▼ Ver guião"}
              </button>
              {showScript && (
                <p className="mt-1 text-xs text-gray-600 bg-gray-50 rounded-lg p-2 whitespace-pre-line">{action.suggested_script}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {action.action_type === "email" && mailtoUrl && !isDone && (
            <a
              href={mailtoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 rounded-lg text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
            >
              Compor
            </a>
          )}
          {action.action_type === "call" && action.contact_phone && !isDone && (
            <a
              href={`tel:${action.contact_phone}`}
              className="px-2 py-1 rounded-lg text-xs bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium"
            >
              Ligar
            </a>
          )}
          {!isDone && !isSkipped && (
            <button
              onClick={() => updateStatus("done")}
              disabled={isPending}
              className="px-2 py-1 rounded-lg text-xs bg-[#667470] text-white hover:bg-[#556360] transition-colors font-medium disabled:opacity-50"
            >✓</button>
          )}
          {!isSkipped && (
            <button
              onClick={() => updateStatus(isDone ? "pending" : "skipped")}
              disabled={isPending}
              className="px-2 py-1 rounded-lg text-xs border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            >{isDone ? "↩" : "×"}</button>
          )}
          {isSkipped && (
            <button
              onClick={() => updateStatus("pending")}
              disabled={isPending}
              className="px-2 py-1 rounded-lg text-xs border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            >↩</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyActionsClient({ actions, weekOf }: { actions: CRMWeeklyAction[]; weekOf: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const calls = actions.filter((a) => a.action_type === "call");
  const emails = actions.filter((a) => a.action_type === "email");
  const doneCount = actions.filter((a) => a.status === "done").length;

  async function handleRegenerate() {
    setIsGenerating(true);
    setMsg(null);
    try {
      startTransition(async () => {
        await clearWeeklyActions(weekOf);
      });
      const res = await fetch("/api/crm/weekly-actions", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMsg(`${data.count ?? 0} ações geradas. A recarregar…`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMsg(data.error ?? "Erro ao gerar");
      }
    } catch {
      setMsg("Erro ao gerar");
    } finally {
      setIsGenerating(false);
    }
  }

  const progressPct = actions.length > 0 ? Math.round((doneCount / actions.length) * 100) : 0;

  return (
    <div>
      {/* Progress + controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-[#32373c]">{doneCount}/{actions.length} concluídas</p>
            <p className="text-xs text-gray-400 mt-0.5">Semana de {new Date(weekOf + "T00:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}</p>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={isGenerating || isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
          >
            {isGenerating ? "A gerar…" : "✨ Regenerar"}
          </button>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-[#667470] h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        {msg && <p className="text-xs text-purple-600 mt-2">{msg}</p>}
      </div>

      {/* Calls */}
      {calls.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white/80 mb-2 px-1">📞 Chamadas ({calls.length})</h2>
          <div className="space-y-2">
            {calls.map((a) => <ActionRow key={a.id} action={a} weekOf={weekOf} />)}
          </div>
        </div>
      )}

      {/* Emails */}
      {emails.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white/80 mb-2 px-1">✉️ Emails ({emails.length})</h2>
          <div className="space-y-2">
            {emails.map((a) => <ActionRow key={a.id} action={a} weekOf={weekOf} />)}
          </div>
        </div>
      )}

      {actions.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm font-semibold text-[#32373c] mb-1">Sem ações para esta semana</p>
          <p className="text-xs text-gray-400 mb-4">Clica em &ldquo;Regenerar&rdquo; para a IA gerar a tua lista</p>
          <button
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="px-6 py-2.5 bg-[#667470] text-white rounded-xl text-sm font-medium hover:bg-[#556360] transition-colors disabled:opacity-50"
          >
            {isGenerating ? "A gerar…" : "✨ Gerar ações da semana"}
          </button>
          {msg && <p className="text-xs text-gray-500 mt-2">{msg}</p>}
        </div>
      )}
    </div>
  );
}
