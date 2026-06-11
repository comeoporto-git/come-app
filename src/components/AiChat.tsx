"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SUGGESTED = [
  "Quantos serviços temos este mês?",
  "Como está o nosso pipeline de CRM?",
  "Quais foram os últimos serviços realizados?",
  "Quantas pessoas servimos este ano?",
];

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      setInput("");
      const newMessages: Message[] = [...messages, { role: "user", content }];
      setMessages(newMessages);
      setStreaming(true);

      const assistantIdx = newMessages.length;
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.text().catch(() => "Erro desconhecido");
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = { role: "assistant", content: `Erro: ${err}` };
            return next;
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const snap = accumulated;
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = { role: "assistant", content: snap };
            return next;
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = {
              role: "assistant",
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
    [input, messages, streaming]
  );

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setInput("");
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask AI"
        className={`fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
          open
            ? "bg-[#32373c] text-white"
            : "bg-[#111514] text-white hover:bg-[#32373c]"
        }`}
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col overflow-hidden"
          style={{ maxHeight: "min(580px, calc(100vh - 6rem))" }}
        >
          {/* Header */}
          <div className="bg-[#111514] px-4 py-3 flex items-center justify-between flex-none">
            <div>
              <p className="text-[13px] font-semibold text-white">Ask AI</p>
              <p className="text-[11px] text-white/40">Dados em tempo real da COME Porto</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 ? (
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
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] text-[13px] leading-relaxed px-3 py-2 rounded-xl whitespace-pre-wrap break-words ${
                      msg.role === "user"
                        ? "bg-[#111514] text-white rounded-br-sm"
                        : "bg-[#f5f5f0] text-[#32373c] rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                    {msg.role === "assistant" && streaming && i === messages.length - 1 && (
                      <span className="inline-block w-1.5 h-3.5 bg-[#32373c]/40 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                    )}
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
        </div>
      )}
    </>
  );
}
