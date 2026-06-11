"use client";

import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import {
  listConversations,
  createConversation,
  getConversationMessages,
  saveMessage,
  setConversationTitle,
  deleteConversation,
  type Conversation,
  type ChatMessage,
} from "@/actions/aiChat";

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string, isStreaming: boolean) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter((l) => !/^\s*\|[\s\-:|]+\|\s*$/.test(l));
      if (rows.length > 0) {
        const parsed = rows.map((r) =>
          r.split("|").slice(1, -1).map((c) => c.trim())
        );
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-2">
            <table className="text-[11px] border-collapse w-full">
              <thead>
                <tr>
                  {parsed[0].map((cell, ci) => (
                    <th key={ci} className="px-2 py-1 text-left font-semibold border border-black/15 bg-black/5">
                      {inlineFormat(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 border border-black/10">
                        {inlineFormat(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (/^[-*] /.test(line.trimStart())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trimStart())) {
        items.push(lines[i].replace(/^[-*] /, "").trim());
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="text-[13px]">{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\. /.test(line.trimStart())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trimStart())) {
        items.push(lines[i].replace(/^\d+\. /, "").trim());
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="text-[13px]">{inlineFormat(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^#{1,3} /.test(line)) {
      const text = line.replace(/^#{1,3} /, "");
      elements.push(
        <p key={`h-${i}`} className="font-semibold text-[13px] mt-2 mb-0.5">
          {inlineFormat(text)}
        </p>
      );
      i++;
      continue;
    }

    if (line.trim() === "") {
      elements.push(<div key={`br-${i}`} className="h-1.5" />);
      i++;
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="text-[13px] leading-relaxed">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  if (isStreaming) {
    elements.push(
      <span key="cursor" className="inline-block w-1.5 h-3.5 bg-[#32373c]/40 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
    );
  }

  return elements;
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="bg-black/8 px-1 rounded text-[12px] font-mono">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `há ${Math.floor(diff / 86_400_000)}d`;
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

const SUGGESTED = [
  "Quantos serviços temos este mês?",
  "Como está o nosso pipeline de CRM?",
  "Quais foram os últimos serviços realizados?",
  "Temos disponibilidade amanhã?",
];

// ── Main component ────────────────────────────────────────────────────────────

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "chat">("list");

  // Conversations list
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Active conversation
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Chat input / streaming
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [creatingConv, setCreatingConv] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversation list when panel opens
  useEffect(() => {
    if (!open) return;
    setPanelError(null);
    setLoadingList(true);
    listConversations()
      .then(setConversations)
      .catch((e) => setPanelError(e?.message ?? "Erro ao carregar conversas"))
      .finally(() => setLoadingList(false));
  }, [open]);

  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Open an existing conversation
  async function openConversation(id: string) {
    setActiveId(id);
    setView("chat");
    setLoadingMessages(true);
    try {
      const msgs = await getConversationMessages(id);
      setMessages(msgs);
    } finally {
      setLoadingMessages(false);
    }
  }

  // Start a new conversation
  async function startNew() {
    setPanelError(null);
    setCreatingConv(true);
    try {
      const id = await createConversation();
      setActiveId(id);
      setMessages([]);
      setConversations((prev) => [
        { id, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...prev,
      ]);
      setView("chat");
    } catch (e) {
      setPanelError((e as Error)?.message ?? "Erro ao criar conversa");
    } finally {
      setCreatingConv(false);
    }
  }

  // Delete a conversation
  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Eliminar esta conversa?")) return;
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setView("list");
    }
  }

  // Back to list
  function backToList() {
    abortRef.current?.abort();
    setView("list");
    // Refresh list to pick up title updates
    listConversations().then(setConversations);
  }

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming || !activeId) return;

      setInput("");

      // Optimistic user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversation_id: activeId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);

      // Persist user message
      saveMessage(activeId, "user", content).catch(() => null);

      // Set title from first message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId && !c.title ? { ...c, title: content.slice(0, 60) } : c
        )
      );
      setConversationTitle(activeId, content.slice(0, 60)).catch(() => null);

      // Placeholder for assistant
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversation_id: activeId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      };
      const assistantIdx = messages.length + 1; // after the user msg we just added
      setMessages((prev) => [...prev, assistantMsg]);

      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content },
      ];

      const abort = new AbortController();
      abortRef.current = abort;
      let accumulated = "";

      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.text().catch(() => "Erro desconhecido");
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: `Erro: ${err}` };
            return next;
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const snap = accumulated;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: snap };
            return next;
          });
        }

        // Persist completed assistant message
        if (accumulated) {
          saveMessage(activeId, "assistant", accumulated).catch(() => null);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: "Ocorreu um erro. Tenta novamente.",
            };
            return next;
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, messages, streaming, activeId]
  );

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask AI"
        className={`fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
          open ? "bg-[#32373c] text-white" : "bg-[#111514] text-white hover:bg-[#32373c]"
        }`}
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col overflow-hidden"
          style={{ maxHeight: "min(620px, calc(100vh - 6rem))" }}
        >
          {/* Header */}
          <div className="bg-[#111514] px-4 py-3 flex items-center gap-3 flex-none">
            {view === "chat" && (
              <button
                onClick={backToList}
                className="text-white/50 hover:text-white transition-colors flex-none"
                aria-label="Voltar"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white leading-none">
                {view === "chat"
                  ? (conversations.find((c) => c.id === activeId)?.title ?? "Nova conversa")
                  : "Ask AI"}
              </p>
              <p className="text-[11px] text-white/40 mt-0.5">Dados em tempo real da COME Porto</p>
            </div>
            {view === "list" && (
              <button
                onClick={startNew}
                disabled={creatingConv}
                className="flex-none text-[11px] font-semibold text-white/60 hover:text-white bg-white/10 hover:bg-white/15 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {creatingConv ? "…" : "+ Nova"}
              </button>
            )}
          </div>

          {/* ── List view ── */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto min-h-0">
              {panelError && (
                <div className="mx-4 mt-4 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {panelError}
                </div>
              )}
              {loadingList ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-4 h-4 border-2 border-[#111514]/20 border-t-[#111514] rounded-full animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-12 text-center space-y-3 px-6">
                  <p className="text-[13px] text-[#32373c]/50">
                    Sem conversas anteriores.
                  </p>
                  <button
                    onClick={startNew}
                    disabled={creatingConv}
                    className="text-[13px] font-semibold text-white bg-[#111514] px-4 py-2 rounded-xl hover:bg-[#32373c] transition-colors disabled:opacity-40"
                  >
                    {creatingConv ? "A criar…" : "Iniciar conversa"}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-black/6">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv.id)}
                      className="w-full text-left px-4 py-3 hover:bg-[#f5f5f0] transition-colors group flex items-start gap-3"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#111514]/8 flex items-center justify-center flex-none mt-0.5">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#32373c]/40">
                          <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H8.5l-2.5 2v-2H3a1 1 0 01-1-1V3z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#32373c] truncate">
                          {conv.title ?? "Conversa sem título"}
                        </p>
                        <p className="text-[11px] text-[#32373c]/40 mt-0.5">
                          {formatDate(conv.updated_at)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="opacity-0 group-hover:opacity-100 text-[#32373c]/30 hover:text-red-500 transition-all flex-none"
                        aria-label="Eliminar conversa"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v.5H3.5a.5.5 0 000 1H4v7a1 1 0 001 1h6a1 1 0 001-1V4.5h.5a.5.5 0 000-1H11V3a1 1 0 00-1-1H6zm1 3.5a.5.5 0 011 0v5a.5.5 0 01-1 0v-5zm2.5 0a.5.5 0 011 0v5a.5.5 0 01-1 0v-5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Chat view ── */}
          {view === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-4 h-4 border-2 border-[#111514]/20 border-t-[#111514] rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-[12px] text-[#32373c]/50 text-center">
                      Pergunta-me sobre serviços, finanças, CRM ou equipa.
                    </p>
                    <div className="space-y-2">
                      {SUGGESTED.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="w-full text-left text-[12px] bg-[#f5f5f0] hover:bg-[#ebebea] text-[#32373c] px-3 py-2 rounded-xl transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] text-[13px] leading-relaxed px-3 py-2 rounded-xl break-words ${
                          msg.role === "user"
                            ? "bg-[#111514] text-white rounded-br-sm whitespace-pre-wrap"
                            : "bg-[#f5f5f0] text-[#32373c] rounded-bl-sm"
                        }`}
                      >
                        {msg.role === "user"
                          ? msg.content
                          : renderMarkdown(msg.content, streaming && i === messages.length - 1)}
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-black/8 p-3 flex-none">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Faz uma pergunta…"
                    disabled={streaming}
                    className="flex-1 resize-none text-[13px] bg-[#f5f5f0] text-[#32373c] placeholder-[#32373c]/35 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#111514]/20 transition-all disabled:opacity-50 min-h-[36px] max-h-[120px] overflow-y-auto"
                    style={{ scrollbarWidth: "none" }}
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || streaming}
                    className="flex-none w-9 h-9 rounded-xl bg-[#111514] text-white flex items-center justify-center hover:bg-[#32373c] transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
