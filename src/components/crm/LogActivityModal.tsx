"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { createCRMActivity } from "@/actions/crm";
import type { CRMContact } from "@/lib/notion";
import type { EmailMessage } from "@/lib/integration";

const ACTIVITY_TYPES = [
  { value: "call",     label: "Chamada",  icon: "📞" },
  { value: "email",    label: "Email",    icon: "✉️" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
  { value: "meeting",  label: "Reunião",  icon: "🤝" },
  { value: "note",     label: "Nota",     icon: "📝" },
];

function formatEmailDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

export function LogActivityModal({
  accountId,
  contacts,
  onClose,
}: {
  accountId: string;
  contacts: CRMContact[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("note");
  const [status, setStatus] = useState("done");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [gmailThreads, setGmailThreads] = useState<EmailMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState("");

  const fetchThreads = useCallback(async (contactEmail?: string | null) => {
    setLoadingThreads(true);
    setGmailThreads([]);
    try {
      const url = contactEmail
        ? `/api/crm/gmail-threads?email=${encodeURIComponent(contactEmail)}`
        : `/api/crm/gmail-threads`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setGmailThreads(data.emails ?? []);
      }
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    if (type === "email") {
      const contact = contacts.find((c) => c.id === selectedContactId);
      fetchThreads(contact?.email ?? null);
    } else {
      setGmailThreads([]);
      setSelectedThreadId(null);
    }
  }, [type, selectedContactId, contacts, fetchThreads]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    let threadId: string | undefined;
    if (selectedThreadId) {
      threadId = selectedThreadId;
    } else {
      const threadLink = manualLink.trim();
      threadId = threadLink
        ? threadLink.replace(/.*#[^/]+\//, "").trim()
        : undefined;
    }

    startTransition(async () => {
      const result = await createCRMActivity({
        account_id: accountId,
        title: fd.get("title") as string,
        description: (fd.get("description") as string) || undefined,
        thread_link: threadId || undefined,
        type,
        status,
        contact_id: selectedContactId || undefined,
        date: (fd.get("date") as string) || undefined,
        scheduled_at: status === "todo" && fd.get("scheduled_at") ? (fd.get("scheduled_at") as string) : undefined,
      });
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-[#32373c]">Registar Atividade</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Type selector */}
          <div className="flex gap-2 flex-wrap">
            {ACTIVITY_TYPES.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${type === value ? "bg-[#667470] text-white border-[#667470]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStatus("done")}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${status === "done" ? "bg-green-50 text-green-700 border-green-200" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
              ✓ Feito
            </button>
            <button type="button" onClick={() => setStatus("todo")}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${status === "todo" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
              ○ A fazer
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
            <input name="title" required className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder={`ex: ${ACTIVITY_TYPES.find((t) => t.value === type)?.label} com CEO`} />
          </div>

          {contacts.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contacto</label>
              <select
                name="contact_id"
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
              >
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{status === "todo" ? "Data prevista" : "Data"}</label>
            <input name="date" type="date" defaultValue={today} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
          </div>

          {/* Gmail thread selector — only for email type */}
          {type === "email" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">Email do Gmail</label>
                {selectedThreadId && (
                  <button type="button" onClick={() => setSelectedThreadId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                    Limpar seleção
                  </button>
                )}
              </div>

              {loadingThreads ? (
                <div className="text-xs text-gray-400 py-2 text-center">A carregar emails…</div>
              ) : gmailThreads.length > 0 ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {gmailThreads.map((email) => {
                    const isSelected = selectedThreadId === email.threadId;
                    return (
                      <button
                        key={email.id}
                        type="button"
                        onClick={() => setSelectedThreadId(isSelected ? null : email.threadId)}
                        className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-0 transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-medium truncate ${isSelected ? "text-blue-700" : "text-[#32373c]"}`}>
                            {email.subject || "(sem assunto)"}
                          </p>
                          <span className="text-xs text-gray-400 shrink-0">{formatEmailDate(email.date)}</span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{email.snippet}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-1">Nenhum email encontrado para este contacto.</p>
              )}

              {!selectedThreadId && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-400 mb-1">Ou cola o link do Gmail manualmente</label>
                  <input
                    value={manualLink}
                    onChange={(e) => setManualLink(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
                    placeholder="https://mail.google.com/..."
                  />
                </div>
              )}

              {selectedThreadId && (
                <a
                  href={`https://mail.google.com/mail/u/0/#all/${selectedThreadId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                >
                  ✉️ Ver email selecionado no Gmail
                </a>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea name="description" rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30 resize-none" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={isPending} className="flex-1 bg-[#667470] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#556360] transition-colors disabled:opacity-50">
              {isPending ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
