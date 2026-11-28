"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  syncInboxAction, reanalyzeThreadAction, setThreadStatusAction, linkThreadToSaleAction, saveInboxSettingsAction,
} from "@/actions/inbox";
import { SuggestionCard } from "./SuggestionCard";

export type InboxThread = {
  id: string;
  gmailThreadId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  lastMessageAt: string | null;
  lastFromUs: boolean;
  status: string;
  category: string | null;
  summary: string | null;
  error: string | null;
  pendingCount: number;
  sale: { id: string; date: string | null; label: string; status: string | null; guests: number | null } | null;
};

export type InboxSuggestion = {
  id: string;
  thread_id: string | null;
  sale_id: string | null;
  kind: string;
  title: string;
  rationale: string | null;
  payload: unknown;
  status: string;
  final_payload: unknown;
  feedback: string | null;
  error: string | null;
  source: string;
  created_at: string;
};

export type AgentTaskView = { id: string; name: string; status: string | null; dueDate: string | null; role: string | null };

export type ThreadMessage = { id: string; from: string; to: string; date: string; body: string; fromUs: boolean; attachments: string[] };
export type SaleOption = { id: string; label: string };

const CATEGORY: Record<string, string> = {
  booking_request: "Pedido de reserva",
  booking_change: "Alteração",
  question: "Pergunta",
  invoice: "Fatura",
  supplier: "Fornecedor",
  internal: "Interno",
  other: "Outro",
};

const STATUS: Record<string, { label: string; cls: string }> = {
  needs_reply: { label: "Por responder", cls: "bg-amber-100 text-amber-700" },
  awaiting_approval: { label: "Sugestões prontas", cls: "bg-blue-100 text-blue-700" },
  attention: { label: "⚠ Notificação importante", cls: "bg-red-100 text-red-700" },
  replied: { label: "Respondido", cls: "bg-emerald-100 text-emerald-700" },
  done: { label: "Tratado", cls: "bg-gray-100 text-gray-500" },
  no_reply: { label: "Sem resposta necessária", cls: "bg-gray-100 text-gray-500" },
};

function fmt(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString("pt-PT", sameDay
    ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }
    : { day: "numeric", month: "short", timeZone: "Europe/Lisbon" });
}

function fmtDay(d: string | null): string {
  if (!d) return "";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const WAITING = new Set(["needs_reply", "awaiting_approval"]);

/** Hours the client has been waiting for us, or null when we were the last to write. */
function waitingHours(t: InboxThread): number | null {
  if (!WAITING.has(t.status) || t.lastFromUs || !t.lastMessageAt) return null;
  return (Date.now() - new Date(t.lastMessageAt).getTime()) / 3_600_000;
}

function WaitingBadge({ hours }: { hours: number | null }) {
  if (hours === null || hours < 24) return null;
  const label = hours < 48 ? `${Math.floor(hours)}h sem resposta` : `${Math.floor(hours / 24)} dias sem resposta`;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold">{label}</span>;
}

function TourBadge({ sale }: { sale: InboxThread["sale"] }) {
  if (!sale) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Sem tour</span>;
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#667470]/10 text-[#3f4a47] font-medium truncate max-w-full">
      {fmtDay(sale.date)} · {sale.label}
    </span>
  );
}

export function InboxClient(props: {
  threads: InboxThread[];
  filter: string;
  selected: InboxThread | null;
  suggestions: InboxSuggestion[];
  agentTasks: AgentTaskView[];
  chatSuggestions: InboxSuggestion[];
  messages: ThreadMessage[];
  messagesError: string | null;
  saleOptions: SaleOption[];
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  settings: { gmailQuery: string; calendarId: string; autoArchive: boolean; notificationsLabel: string };
  calendarConnected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [query, setQuery] = useState(props.settings.gmailQuery);
  const [calendarId, setCalendarId] = useState(props.settings.calendarId);
  const [autoArchive, setAutoArchive] = useState(props.settings.autoArchive);
  const [notifLabel, setNotifLabel] = useState(props.settings.notificationsLabel);
  const [showHistory, setShowHistory] = useState(false);
  const sel = props.selected;

  // New emails are read every 2 minutes in the background: refresh the list,
  // but never while someone is typing or editing a reply.
  useEffect(() => {
    const id = setInterval(() => {
      const a = document.activeElement as HTMLElement | null;
      const busy = a && (a.isContentEditable || a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
      if (!busy && document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);
  const qs = (t?: string) => `/admin/inbox?f=${props.filter}${t ? `&t=${t}` : ""}`;

  function sync() {
    setMsg("A ler emails e a preparar sugestões… (pode demorar 1-2 minutos)");
    start(async () => {
      const r = await syncInboxAction();
      if (!("result" in r)) setMsg(`Erro: ${r.error}`);
      else if (!r.result) setMsg("Os emails já estão a ser lidos em segundo plano — a página atualiza sozinha.");
      else {
        const x = r.result;
        setMsg(`${x.checked} conversas verificadas · ${x.analyzed} analisadas · ${x.suggestions} sugestões · ${x.tasks} tarefas${x.archived ? ` · ${x.archived} notificações arquivadas` : ""}${x.followups ? ` · ${x.followups} pedidos de info em falta` : ""}${x.errors.length ? ` · ${x.errors.length} com erro` : ""}${x.remaining ? ` — faltam ${x.remaining}, continuam a ser lidas automaticamente` : ""}`);
      }
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ error?: string }>, okMsg?: string) {
    start(async () => {
      const r = await fn();
      setMsg(r.error ? `Erro: ${r.error}` : okMsg ?? null);
      router.refresh();
    });
  }

  const overdue = props.threads.filter((t) => (waitingHours(t) ?? 0) >= 24).length;
  const pendingSugg = props.suggestions.filter((s) => s.status === "pending" || s.status === "failed");
  const pastSugg = props.suggestions.filter((s) => s.status !== "pending" && s.status !== "failed");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-white/10 rounded-xl p-0.5">
          {["pendentes", "todos", "tratados"].map((f) => (
            <Link key={f} href={`/admin/inbox?f=${f}`} className={`text-[13px] px-3 py-1.5 rounded-lg capitalize ${props.filter === f ? "bg-white text-[#32373c] font-semibold" : "text-white/80 hover:text-white"}`}>
              {f}
            </Link>
          ))}
        </div>
        <button onClick={sync} disabled={pending} className="text-[13px] font-semibold bg-white text-[#32373c] px-4 py-1.5 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-50">
          {pending ? "A trabalhar…" : "Ler novos emails"}
        </button>
        <button onClick={() => setShowSettings((v) => !v)} className="text-[13px] text-white/70 hover:text-white px-2">Definições</button>
        <Link href="/admin/guia" className="text-[13px] text-white/70 hover:text-white px-2">Guia da empresa →</Link>
        <span className="text-[12px] text-white/50 ml-auto">
          {props.lastSyncedAt ? `Última leitura: ${new Date(props.lastSyncedAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}` : "Ainda não sincronizado"}
          {!props.calendarConnected && " · Calendário não autorizado"}
        </span>
      </div>
      {overdue > 0 && (
        <p className="text-[13px] font-semibold text-white bg-red-600/90 rounded-xl px-4 py-2">
          {overdue} {overdue === 1 ? "conversa está" : "conversas estão"}{" "}há mais de 24h sem resposta — responder hoje, nem que seja &quot;Estamos a verificar&quot;.
        </p>
      )}
      {msg && <p className="text-[13px] bg-white/90 rounded-xl px-4 py-2 break-words"><Linkified text={msg} /></p>}
      {props.lastSyncError && !msg && <p className="text-[12px] text-red-100 bg-red-500/30 rounded-xl px-4 py-2 whitespace-pre-line break-words"><Linkified text={props.lastSyncError} /></p>}

      {showSettings && (
        <div className="bg-white rounded-2xl p-4 grid sm:grid-cols-[1fr_220px_auto] gap-3 items-end">
          <label className="flex flex-col gap-1 text-[12px] text-gray-500">
            Pesquisa Gmail (que emails ler)
            <input className="text-[13px] border border-black/15 rounded-lg px-2.5 py-1.5" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-gray-500">
            Calendário (id)
            <input className="text-[13px] border border-black/15 rounded-lg px-2.5 py-1.5" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-gray-600 sm:col-span-2">
            <input type="checkbox" checked={autoArchive} onChange={(e) => setAutoArchive(e.target.checked)} />
            Arquivar notificações automáticas (Vercel, GitHub, newsletters…) na etiqueta
            <input className="text-[13px] border border-black/15 rounded-lg px-2 py-1 w-36" value={notifLabel} onChange={(e) => setNotifLabel(e.target.value)} />
            — as importantes ficam na caixa com estrela.
          </label>
          <button
            disabled={pending}
            onClick={() => run(() => saveInboxSettingsAction({ gmail_query: query, calendar_id: calendarId, auto_archive_notifications: autoArchive, notifications_label: notifLabel }), "Definições guardadas")}
            className="text-[13px] font-semibold text-white bg-[#111514] px-4 py-1.5 rounded-xl"
          >
            Guardar
          </button>
        </div>
      )}

      {/* AI Chat suggestions (not tied to an email) */}
      {props.chatSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-white/70 uppercase tracking-wide">Sugestões do AI Chat</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {props.chatSuggestions.map((s) => <SuggestionCard key={s.id} s={s} saleOptions={props.saleOptions} />)}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr] items-start">
        {/* Thread list */}
        <div className={`bg-white rounded-2xl shadow-sm overflow-hidden ${sel ? "hidden lg:block" : ""}`}>
          {props.threads.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">Nada por aqui. Carrega em &quot;Ler novos emails&quot;.</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[75vh] overflow-y-auto">
              {props.threads.map((t) => {
                const st = STATUS[t.status] ?? { label: t.status, cls: "bg-gray-100 text-gray-500" };
                return (
                  <li key={t.id}>
                    <Link href={qs(t.id)} className={`block px-4 py-3 hover:bg-gray-50 ${sel?.id === t.id ? "bg-[#667470]/5" : ""}`}>
                      <div className="flex items-baseline gap-2">
                        <p className="text-[13px] font-semibold truncate flex-1">{t.fromName || t.fromEmail}</p>
                        <span className="text-[11px] text-gray-400 shrink-0">{fmt(t.lastMessageAt)}</span>
                      </div>
                      <p className="text-[13px] text-[#32373c] truncate">{t.subject || "(sem assunto)"}</p>
                      <p className="text-[12px] text-gray-400 truncate">{t.summary || t.snippet}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <WaitingBadge hours={waitingHours(t)} />
                        <TourBadge sale={t.sale} />
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        {t.pendingCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">{t.pendingCount}</span>}
                        {t.error && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600">erro</span>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread detail */}
        {sel ? (
          <div className="space-y-3 min-w-0">
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Link href={qs()} className="lg:hidden text-[13px] text-gray-400">←</Link>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold break-words">{sel.subject || "(sem assunto)"}</p>
                  <p className="text-[12px] text-gray-500">{sel.fromName} &lt;{sel.fromEmail}&gt;{sel.category ? ` · ${CATEGORY[sel.category] ?? sel.category}` : ""}</p>
                </div>
                <a href={`https://mail.google.com/mail/u/0/#all/${sel.gmailThreadId}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-600 hover:underline shrink-0">
                  Gmail ↗
                </a>
              </div>
              {sel.summary && <p className="text-[13px] text-gray-600 bg-gray-50 rounded-xl px-3 py-2">{sel.summary}</p>}
              {sel.error && <p className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-2 break-words">{sel.error}</p>}
              {props.agentTasks.length > 0 && (
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tarefas criadas por esta conversa</p>
                  <ul className="space-y-0.5">
                    {props.agentTasks.map((t) => (
                      <li key={t.id} className={`text-[13px] ${t.status === "Done" ? "line-through text-gray-400" : "text-gray-700"}`}>
                        {t.status === "Done" ? "✓" : "○"} {t.name}
                        <span className="text-[11px] text-gray-400">{t.role ? ` · ${t.role}` : ""}{t.dueDate ? ` · até ${fmtDay(t.dueDate)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-gray-400">Tour:</span>
                {sel.sale ? (
                  <Link href={`/guide/tours/${sel.sale.id}`} className="text-[12px] font-medium text-[#3f4a47] bg-[#667470]/10 px-2 py-0.5 rounded-full hover:underline">
                    {fmtDay(sel.sale.date)} · {sel.sale.label}{sel.sale.guests ? ` · ${sel.sale.guests} pax` : ""}{sel.sale.status ? ` · ${sel.sale.status}` : ""}
                  </Link>
                ) : null}
                <select
                  className="text-[12px] border border-black/10 rounded-lg px-2 py-1 max-w-[260px]"
                  value={sel.sale?.id ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => linkThreadToSaleAction(sel.id, e.target.value || null), "Associação guardada")}
                >
                  <option value="">{sel.sale ? "— Desassociar —" : "Associar a um tour…"}</option>
                  {props.saleOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button disabled={pending} onClick={() => run(() => reanalyzeThreadAction(sel.id), "Reanalisado")} className="text-[12px] font-semibold bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-40">
                  {pending ? "…" : "Reanalisar com AI"}
                </button>
                {sel.status !== "done" && (
                  <button disabled={pending} onClick={() => run(() => setThreadStatusAction(sel.id, "done"), "Marcado como tratado")} className="text-[12px] font-semibold bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
                    Marcar como tratado
                  </button>
                )}
                {sel.status === "done" && (
                  <button disabled={pending} onClick={() => run(() => setThreadStatusAction(sel.id, "needs_reply"))} className="text-[12px] font-semibold bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
                    Reabrir
                  </button>
                )}
              </div>
            </div>

            {pendingSugg.length > 0 ? (
              pendingSugg.map((s) => <SuggestionCard key={s.id} s={s} saleOptions={props.saleOptions} />)
            ) : (
              <p className="text-[13px] text-white/70 px-1">Sem sugestões por aprovar nesta conversa.</p>
            )}

            {pastSugg.length > 0 && (
              <div>
                <button onClick={() => setShowHistory((v) => !v)} className="text-[12px] text-white/70 hover:text-white px-1">
                  {showHistory ? "Esconder" : "Ver"} sugestões anteriores ({pastSugg.length})
                </button>
                {showHistory && <div className="space-y-3 mt-2">{pastSugg.map((s) => <SuggestionCard key={s.id} s={s} saleOptions={props.saleOptions} />)}</div>}
              </div>
            )}

            {/* Conversation */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <p className="px-4 py-2.5 text-[12px] font-semibold text-gray-500 border-b border-gray-50">Conversa</p>
              {props.messagesError && <p className="px-4 py-3 text-[12px] text-red-600">{props.messagesError}</p>}
              <ul className="divide-y divide-gray-50">
                {props.messages.map((m) => (
                  <li key={m.id} className={`px-4 py-3 ${m.fromUs ? "bg-[#667470]/5" : ""}`}>
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <span className="font-semibold truncate flex-1">{m.fromUs ? "COME" : m.from}</span>
                      <span className="text-gray-400 shrink-0">{m.date ? new Date(m.date).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : ""}</span>
                    </div>
                    <p className="text-[13px] whitespace-pre-line break-words mt-1 text-[#32373c]">{m.body}</p>
                    {m.attachments.length > 0 && <p className="text-[11px] text-gray-400 mt-1">📎 {m.attachments.join(", ")}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex bg-white/10 rounded-2xl p-10 text-white/60 text-sm items-center justify-center">
            Escolhe uma conversa para ver as sugestões.
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows text with any URL in it as a short clickable link (error messages carry setup links). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="underline font-semibold">
            Abrir na Google Cloud
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
