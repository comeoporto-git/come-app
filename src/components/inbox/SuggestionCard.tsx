"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptSuggestionAction, rejectSuggestionAction } from "@/actions/inbox";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import type { InboxSuggestion } from "./InboxClient";

type AnyPayload = Record<string, unknown>;

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  reply: { label: "Resposta", color: "bg-blue-50 text-blue-700" },
  create_sale: { label: "Nova venda", color: "bg-emerald-50 text-emerald-700" },
  update_sale: { label: "Atualizar venda", color: "bg-amber-50 text-amber-700" },
  add_expense: { label: "Despesa", color: "bg-rose-50 text-rose-700" },
  guide_entry: { label: "Guia", color: "bg-violet-50 text-violet-700" },
  record_change: { label: "Alteração", color: "bg-indigo-50 text-indigo-700" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Por aprovar",
  accepted: "Aceite",
  modified: "Aceite com alterações",
  rejected: "Rejeitada",
  superseded: "Substituída",
  failed: "Falhou",
};

const input = "w-full text-[13px] border border-black/15 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#111514]/15 bg-white";
const lbl = "text-[11px] font-medium text-gray-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={lbl}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="text-gray-400 w-40 shrink-0">{label}</span>
      <span className="text-[#32373c] break-words min-w-0">{String(value)}</span>
    </div>
  );
}

// ── Per-kind views ────────────────────────────────────────────────────────────

function ReplyView({ p, editing, set, bodyRef }: { p: AnyPayload; editing: boolean; set: (k: string, v: unknown) => void; bodyRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="space-y-2">
      {editing ? (
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="Para"><input className={input} value={String(p.to ?? "")} onChange={(e) => set("to", e.target.value)} /></Field>
          <Field label="Cc"><input className={input} value={String(p.cc ?? "")} onChange={(e) => set("cc", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Assunto"><input className={input} value={String(p.subject ?? "")} onChange={(e) => set("subject", e.target.value)} /></Field></div>
        </div>
      ) : (
        <div className="text-[12px] text-gray-500 space-y-0.5">
          <p><span className="text-gray-400">Para:</span> {String(p.to)}</p>
          {p.cc ? <p><span className="text-gray-400">Cc:</span> {String(p.cc)}</p> : null}
          <p><span className="text-gray-400">Assunto:</span> {String(p.subject)}</p>
        </div>
      )}
      <div
        ref={bodyRef}
        contentEditable={editing}
        suppressContentEditableWarning
        className={`email-body [&_p]:mb-2 [&_p:last-child]:mb-0 text-[13px] leading-relaxed rounded-xl border p-3 overflow-x-auto ${editing ? "border-blue-300 bg-white ring-2 ring-blue-100 outline-none" : "border-gray-100 bg-gray-50/60"}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(p.body_html ?? "")) }}
      />
      {replyWarnings(p).length > 0 && (
        <ul className="text-[12px] text-red-700 bg-red-50 rounded-lg px-3 py-2 space-y-0.5">
          {replyWarnings(p).map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      {Array.isArray(p.missing_info) && p.missing_info.length > 0 && (
        <p className="text-[12px] text-amber-700">Pede informação em falta: {(p.missing_info as string[]).join(", ")}</p>
      )}
      {p.internal_note ? <p className="text-[12px] text-gray-500 whitespace-pre-line bg-amber-50/60 rounded-lg px-3 py-2">Nota: {String(p.internal_note)}</p> : null}
    </div>
  );
}

const ATTACHMENT_RE = /\b(em anexo|segue(m)? (em )?anexo|anexo|attached|attachment|adjunto)\b/i;

/** Alerts for the person approving a reply: the agent's own checks, plus a
 *  mention of an attachment (the app sends replies without attachments). */
function replyWarnings(p: Record<string, unknown>): string[] {
  const out = Array.isArray(p.warnings) ? (p.warnings as unknown[]).map(String).filter(Boolean) : [];
  const text = String(p.body_html ?? "").replace(/<[^>]+>/g, " ");
  if (ATTACHMENT_RE.test(text) && !out.some((w) => /anexo/i.test(w))) {
    out.push("O texto refere um anexo, mas a app envia sem anexos — envie este email pelo Gmail com o ficheiro.");
  }
  return out;
}

const SALE_EDIT_FIELDS: { k: string; label: string; type?: string }[] = [
  { k: "sale_code", label: "ID da venda *" },
  { k: "date", label: "Data", type: "date" },
  { k: "start_time", label: "Hora", type: "time" },
  { k: "guests", label: "Nº Pax", type: "number" },
  { k: "children_10_18", label: "Crianças 10-18", type: "number" },
  { k: "children_3_9", label: "Crianças 3-9", type: "number" },
  { k: "children_0_2", label: "Bebés 0-2", type: "number" },
  { k: "client_name", label: "Cliente" },
  { k: "client_email", label: "Email do cliente" },
  { k: "phone_number", label: "Contacto" },
  { k: "names", label: "Nomes" },
  { k: "dietary_restrictions", label: "Restrições alimentares" },
  { k: "mobility_restrictions", label: "Mobilidade" },
  { k: "emergency_contact", label: "Contacto de emergência" },
  { k: "meeting_point", label: "Ponto de encontro" },
  { k: "notes", label: "Notas" },
  { k: "status", label: "Estado" },
];

function CreateSaleView({ p, editing, set }: { p: AnyPayload; editing: boolean; set: (k: string, v: unknown) => void }) {
  if (!editing) {
    return (
      <div className="space-y-1">
        <Row label="Serviço" value={p.service_name} />
        {SALE_EDIT_FIELDS.map((f) => <Row key={f.k} label={f.label} value={p[f.k] === 0 ? null : p[f.k]} />)}
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      <div className="sm:col-span-2"><Row label="Serviço" value={p.service_name} /></div>
      {SALE_EDIT_FIELDS.map((f) => (
        <Field key={f.k} label={f.label}>
          {f.k === "status" ? (
            <select className={input} value={String(p.status ?? "Pending")} onChange={(e) => set("status", e.target.value)}>
              {["Pending", "Confirmed", "Paid"].map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <input
              className={input}
              type={f.type ?? "text"}
              value={p[f.k] === null || p[f.k] === undefined ? "" : String(p[f.k])}
              onChange={(e) => set(f.k, f.type === "number" ? Number(e.target.value) || 0 : e.target.value)}
            />
          )}
        </Field>
      ))}
    </div>
  );
}

type Change = { field: string; label: string; old: unknown; new: unknown };

function UpdateSaleView({ p, editing, set }: { p: AnyPayload; editing: boolean; set: (k: string, v: unknown) => void }) {
  const changes = (p.changes as Change[]) ?? [];
  const update = (i: number, v: unknown) => set("changes", changes.map((c, j) => (j === i ? { ...c, new: v } : c)));
  const remove = (i: number) => set("changes", changes.filter((_, j) => j !== i));
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-gray-500">{String(p.sale_label ?? "")}</p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-gray-400">
            <th className="font-medium py-1 pr-2">Campo</th>
            <th className="font-medium py-1 pr-2">Atual</th>
            <th className="font-medium py-1">Novo</th>
            {editing && <th />}
          </tr>
        </thead>
        <tbody>
          {changes.map((c, i) => (
            <tr key={c.field} className="border-t border-gray-100 align-top">
              <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{c.label}</td>
              <td className="py-1.5 pr-2 text-gray-400 line-through decoration-gray-300 break-words">{c.old === null || c.old === "" ? "—" : String(c.old)}</td>
              <td className="py-1.5 font-medium break-words">
                {editing ? (
                  c.field === "notes" ? (
                    <textarea className={input} rows={3} value={String(c.new ?? "")} onChange={(e) => update(i, e.target.value)} />
                  ) : (
                    <input className={input} value={String(c.new ?? "")} onChange={(e) => update(i, e.target.value)} />
                  )
                ) : (
                  String(c.new ?? "—")
                )}
              </td>
              {editing && (
                <td className="py-1.5 pl-2">
                  <button type="button" onClick={() => remove(i)} className="text-[12px] text-red-400 hover:text-red-600">Remover</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EXPENSE_FIELDS: { k: string; label: string; type?: string }[] = [
  { k: "supplier", label: "Fornecedor" },
  { k: "date", label: "Data", type: "date" },
  { k: "invoice_id", label: "Nº fatura" },
  { k: "tax_free", label: "Base (s/ IVA)", type: "number" },
  { k: "iva6", label: "IVA 6%", type: "number" },
  { k: "iva13", label: "IVA 13%", type: "number" },
  { k: "iva23", label: "IVA 23%", type: "number" },
  { k: "total", label: "Total", type: "number" },
  { k: "payment_method", label: "Método de pagamento" },
  { k: "status", label: "Estado" },
  { k: "socio_pessoal", label: "Despesa de sócio" },
];

function ExpenseView({ p, editing, set, saleOptions }: { p: AnyPayload; editing: boolean; set: (k: string, v: unknown) => void; saleOptions: { id: string; label: string }[] }) {
  const saleLabel = saleOptions.find((s) => s.id === p.sale_id)?.label ?? null;
  return (
    <div className="space-y-2">
      {p.attach_to_transaction_id ? <p className="text-[12px] text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">A despesa já existe (do banco/cartão) sem fatura — ao aceitar, a fatura é anexada a essa despesa.</p>
        : p.duplicate_of ? <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-1.5">Já existe uma despesa com este nº de fatura.</p> : null}
      {p.history_note ? <p className="text-[12px] text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5">{String(p.history_note)}</p> : null}
      {editing ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {EXPENSE_FIELDS.map((f) => (
            <Field key={f.k} label={f.label}>
              {f.k === "status" ? (
                <select className={input} value={String(p.status ?? "")} onChange={(e) => set("status", e.target.value)}>
                  {["Pending Payment", "Paid"].map((s) => <option key={s}>{s}</option>)}
                </select>
              ) : f.k === "socio_pessoal" ? (
                <select className={input} value={String(p.socio_pessoal ?? "")} onChange={(e) => set("socio_pessoal", e.target.value || null)}>
                  <option value="">Não (despesa da empresa)</option>
                  {["António", "Manel", "Bernardo"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : f.k === "payment_method" ? (
                <select className={input} value={String(p.payment_method ?? "")} onChange={(e) => set("payment_method", e.target.value)}>
                  {["Transferência Bancária COME", "Cartão COME", "Pago pelo Bernardo Providência", "Pago pelo Manuel Antunes"].map((s) => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <input
                  className={input}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "0.01" : undefined}
                  value={p[f.k] === null || p[f.k] === undefined ? "" : String(p[f.k])}
                  onChange={(e) => set(f.k, f.type === "number" ? Number(e.target.value) || 0 : e.target.value)}
                />
              )}
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label="Serviço (opcional)">
              <select className={input} value={String(p.sale_id ?? "")} onChange={(e) => set("sale_id", e.target.value || null)}>
                <option value="">— Nenhum —</option>
                {saleOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {EXPENSE_FIELDS.map((f) => <Row key={f.k} label={f.label} value={f.type === "number" ? (p[f.k] ? `${Number(p[f.k]).toFixed(2)} €` : null) : p[f.k]} />)}
          <Row label="Serviço" value={saleLabel} />
        </div>
      )}
      {p.file_url ? (
        <a href={String(p.file_url)} target="_blank" rel="noopener noreferrer" className="inline-block text-[12px] text-blue-600 hover:underline">
          Ver fatura ({String(p.filename ?? "ficheiro")}) ↗
        </a>
      ) : null}
    </div>
  );
}

function GuideView({ p, editing, set }: { p: AnyPayload; editing: boolean; set: (k: string, v: unknown) => void }) {
  if (!editing) {
    return (
      <div className="text-[13px]">
        <p className="text-[11px] text-gray-400">{String(p.section)}</p>
        <p className="font-semibold">{String(p.title)}</p>
        <p className="text-gray-600 whitespace-pre-line">{String(p.content)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Field label="Secção"><input className={input} value={String(p.section ?? "")} onChange={(e) => set("section", e.target.value)} /></Field>
      <Field label="Título"><input className={input} value={String(p.title ?? "")} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Conteúdo"><textarea className={input} rows={4} value={String(p.content ?? "")} onChange={(e) => set("content", e.target.value)} /></Field>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

type RecChange = { field: string; label: string; old: unknown; new: unknown; old_label?: string | null; new_label?: string | null };

const show = (v: unknown, label?: string | null) =>
  label ? label
  : v === null || v === undefined || v === "" ? "—"
  : typeof v === "boolean" ? (v ? "Sim" : "Não")
  : typeof v === "string" && /^\d{2}:\d{2}:\d{2}$/.test(v) ? v.slice(0, 5)
  : String(v);

/** Before → after of a change anywhere in the app (COME AI). */
function RecordChangeView({ p, editing, set }: { p: AnyPayload; editing: boolean; set: (k: string, v: unknown) => void }) {
  const changes = (p.changes as RecChange[]) ?? [];
  const op = String(p.op);
  const update = (i: number, v: unknown) => set("changes", changes.map((c, j) => (j === i ? { ...c, new: v, new_label: null } : c)));
  const remove = (i: number) => set("changes", changes.filter((_, j) => j !== i));
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-gray-500">
        {op === "create" ? "Novo registo em " : op === "delete" ? "Apagar de " : ""}<span className="font-semibold">{String(p.entity_label ?? "")}</span>
        {p.record_label ? ` · ${String(p.record_label)}` : ""}
      </p>
      {op === "delete" ? (
        <p className="text-[13px] text-red-600 bg-red-50 rounded-lg px-3 py-2">Este registo vai ser apagado.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-gray-400">
              <th className="font-medium py-1 pr-2">Campo</th>
              {op !== "create" && <th className="font-medium py-1 pr-2">Atual</th>}
              <th className="font-medium py-1">{op === "create" ? "Valor" : "Novo"}</th>
              {editing && <th />}
            </tr>
          </thead>
          <tbody>
            {changes.map((c, i) => (
              <tr key={c.field} className="border-t border-gray-100 align-top">
                <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{c.label}</td>
                {op !== "create" && <td className="py-1.5 pr-2 text-gray-400 line-through decoration-gray-300 break-words whitespace-pre-line">{show(c.old, c.old_label)}</td>}
                <td className="py-1.5 font-medium break-words whitespace-pre-line bg-emerald-50/50">
                  {editing ? (
                    String(c.new ?? "").length > 60 ? (
                      <textarea className={input} rows={4} value={String(c.new ?? "")} onChange={(e) => update(i, e.target.value)} />
                    ) : (
                      <input className={input} value={String(c.new ?? "")} onChange={(e) => update(i, e.target.value)} />
                    )
                  ) : (
                    show(c.new, c.new_label)
                  )}
                </td>
                {editing && (
                  <td className="py-1.5 pl-2">
                    <button type="button" onClick={() => remove(i)} className="text-[12px] text-red-400 hover:text-red-600">Remover</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SuggestionCard({ s, saleOptions }: { s: InboxSuggestion; saleOptions: { id: string; label: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AnyPayload>(s.payload as AnyPayload);
  const [feedback, setFeedback] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(s.status === "failed" ? s.error : null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const kind = KIND_LABEL[s.kind] ?? { label: s.kind, color: "bg-gray-100 text-gray-600" };
  const actionable = s.status === "pending" || s.status === "failed";
  const shown = actionable ? draft : ((s.final_payload ?? s.payload) as AnyPayload);

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  function currentPayload(): AnyPayload {
    if (s.kind === "reply" && editing && bodyRef.current) return { ...draft, body_html: bodyRef.current.innerHTML };
    return draft;
  }

  function accept() {
    setError(null);
    const payload = currentPayload();
    const changed = JSON.stringify(payload) !== JSON.stringify(s.payload);
    if (s.kind === "reply" && !confirm(`Enviar este email para ${String(payload.to)}?`)) return;
    start(async () => {
      const r = await acceptSuggestionAction(s.id, changed ? payload : undefined, feedback || undefined);
      if (r.error) setError(r.error);
      else {
        setDone(changed ? "Aceite com alterações — o guia vai aprender com isto." : s.kind === "record_change" ? "Alteração gravada." : "Aceite.");
        router.refresh();
      }
    });
  }

  function reject() {
    setError(null);
    start(async () => {
      const r = await rejectSuggestionAction(s.id, feedback || undefined);
      if (r.error) setError(r.error);
      else setDone("Rejeitada — o guia vai aprender com isto.");
    });
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm ${actionable ? "border-gray-100" : "border-gray-100 opacity-70"}`}>
      <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${kind.color}`}>{kind.label}</span>
        {s.source === "chat" && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">COME AI</span>}
        <p className="text-[13px] font-semibold flex-1 min-w-0 truncate">{s.title}</p>
        {!actionable && <span className="text-[11px] text-gray-400">{STATUS_LABEL[s.status] ?? s.status}</span>}
      </div>
      {s.rationale && <p className="px-4 pb-2 text-[12px] text-gray-500">{s.rationale}</p>}
      <div className="px-4 pb-3">
        {s.kind === "reply" && <ReplyView key={editing ? "edit" : "view"} p={shown} editing={editing} set={set} bodyRef={bodyRef} />}
        {s.kind === "create_sale" && <CreateSaleView p={shown} editing={editing} set={set} />}
        {s.kind === "update_sale" && <UpdateSaleView p={shown} editing={editing} set={set} />}
        {s.kind === "add_expense" && <ExpenseView p={shown} editing={editing} set={set} saleOptions={saleOptions} />}
        {s.kind === "guide_entry" && <GuideView p={shown} editing={editing} set={set} />}
        {s.kind === "record_change" && <RecordChangeView p={shown} editing={editing} set={set} />}
      </div>

      {s.feedback && !actionable && <p className="px-4 pb-3 text-[12px] text-gray-500">Comentário: {s.feedback}</p>}

      {actionable && !done && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-2">
          {(editing || rejecting) && (
            <input
              className={input}
              placeholder={rejecting ? "Porquê? (opcional — ajuda o AI a aprender)" : "Comentário para o AI aprender (opcional)"}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          )}
          {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-1.5">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {rejecting ? (
              <>
                <button disabled={pending} onClick={reject} className="text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 px-4 py-1.5 rounded-xl disabled:opacity-40">
                  {pending ? "…" : "Confirmar rejeição"}
                </button>
                <button disabled={pending} onClick={() => setRejecting(false)} className="text-[13px] text-gray-500 px-3 py-1.5">Cancelar</button>
              </>
            ) : (
              <>
                <button disabled={pending} onClick={accept} className="text-[13px] font-semibold text-white bg-[#111514] hover:bg-[#32373c] px-4 py-1.5 rounded-xl disabled:opacity-40">
                  {pending ? "A executar…" : s.kind === "reply" ? (editing ? "Enviar alterado" : "Aceitar e enviar") : s.kind === "record_change" ? (editing ? "Confirmar alterado" : "Confirmar") : editing ? "Guardar e aceitar" : "Aceitar"}
                </button>
                {!editing ? (
                  <button disabled={pending} onClick={() => setEditing(true)} className="text-[13px] font-semibold text-[#32373c] bg-gray-100 hover:bg-gray-200 px-4 py-1.5 rounded-xl">
                    Alterar
                  </button>
                ) : (
                  <button
                    disabled={pending}
                    onClick={() => { setEditing(false); setDraft(s.payload as AnyPayload); }}
                    className="text-[13px] text-gray-500 px-3 py-1.5"
                  >
                    Desfazer alterações
                  </button>
                )}
                <button disabled={pending} onClick={() => setRejecting(true)} className="text-[13px] font-semibold text-red-500 hover:text-red-600 px-3 py-1.5">
                  Rejeitar
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {done && <p className="border-t border-gray-50 px-4 py-2.5 text-[12px] text-emerald-700">{done}</p>}
    </div>
  );
}
