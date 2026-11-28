"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { runInboxSync } from "@/lib/inboxSyncRunner";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { supabase, createTransaction, findOrCreateFornecedor } from "@/lib/notion";
import { getGoogleToken, GMAIL_SCOPE } from "@/lib/google-token";
import { sendReply, markThreadRead } from "@/lib/gmail";
import { learnFromDecision, GUIDE_SECTIONS } from "@/lib/companyGuide";
import {
  syncInbox, toAddonThreadId, SALE_FIELDS,
  type SyncResult, type ReplyPayload, type CreateSalePayload, type UpdateSalePayload,
  type AddExpensePayload, type GuideEntryPayload, type SuggestionKind, type SaleField,
} from "@/lib/inboxAgent";

/**
 * Inbox actions. Every write to Gmail, sales or transactions starts here, from a
 * person pressing "Aceitar" on a suggestion. Edited or rejected suggestions
 * teach the company guide (in the background, after the response).
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Unauthorized");
  return session;
}

function revalidateInbox() {
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/guia");
}

/** The Google account the inbox uses: the admin who connected Gmail. */
async function ownerUserId(sessionUserId: string): Promise<string> {
  const mine = await getGoogleToken(sessionUserId, [GMAIL_SCOPE]);
  if (mine.status === "ok") {
    await supabase.from("inbox_settings").update({ owner_user_id: sessionUserId }).eq("id", 1);
    return sessionUserId;
  }
  const { data } = await supabase.from("inbox_settings").select("owner_user_id").eq("id", 1).maybeSingle();
  if (data?.owner_user_id) return data.owner_user_id as string;
  throw new Error("Ninguém ligou o Gmail ainda. Clica em \"Ligar Gmail e Calendário\".");
}

async function gmailToken(sessionUserId: string): Promise<string> {
  const uid = await ownerUserId(sessionUserId);
  const tok = await getGoogleToken(uid, [GMAIL_SCOPE]);
  if (tok.status !== "ok") throw new Error("Ligação ao Gmail expirou — volta a ligar o Gmail.");
  return tok.token;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

/** Remembers the app's public address so the database job can call it every 2 minutes. */
async function rememberAppUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || host.startsWith("localhost") || host.startsWith("127.")) return;
  const proto = h.get("x-forwarded-proto") ?? "https";
  await supabase.from("inbox_settings").update({ app_url: `${proto}://${host}` }).eq("id", 1);
}

export async function syncInboxAction(): Promise<Result<{ result: SyncResult | null }>> {
  try {
    const session = await requireAdmin();
    const uid = await ownerUserId(session.user.id);
    await rememberAppUrl();
    // A short run so the button answers in time; the 2-minute job does the rest.
    const result = await runInboxSync({ userId: uid, maxAnalyses: 3 });
    revalidateInbox();
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reanalyzeThreadAction(threadRowId: string): Promise<Result<{ result: SyncResult }>> {
  try {
    const session = await requireAdmin();
    const uid = await ownerUserId(session.user.id);
    const { data: row } = await supabase.from("inbox_threads").select("gmail_thread_id").eq("id", threadRowId).single();
    if (!row) return { error: "Conversa não encontrada" };
    const result = await syncInbox({ userId: uid, threadIds: [row.gmail_thread_id], maxAnalyses: 1 });
    revalidateInbox();
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setThreadStatusAction(threadRowId: string, status: "done" | "needs_reply" | "no_reply"): Promise<Result> {
  try {
    await requireAdmin();
    await supabase.from("inbox_threads").update({ status, updated_at: new Date().toISOString() }).eq("id", threadRowId);
    if (status !== "needs_reply") {
      await supabase.from("inbox_suggestions").update({ status: "superseded" }).eq("thread_id", threadRowId).eq("status", "pending");
    }
    revalidateInbox();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function linkThreadToSaleAction(threadRowId: string, saleId: string | null): Promise<Result> {
  try {
    await requireAdmin();
    await supabase.from("inbox_threads").update({ sale_id: saleId }).eq("id", threadRowId);
    if (saleId) {
      const { data: t } = await supabase.from("inbox_threads").select("gmail_thread_id").eq("id", threadRowId).single();
      if (t) await appendThreadToSale(saleId, t.gmail_thread_id);
    }
    revalidateInbox();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Accept / reject ───────────────────────────────────────────────────────────

async function appendThreadToSale(saleId: string, apiThreadId: string | null | undefined) {
  if (!apiThreadId) return;
  const { data } = await supabase.from("sales").select("thread_ids").eq("id", saleId).maybeSingle();
  const ids = String(data?.thread_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const addon = toAddonThreadId(apiThreadId);
  if (ids.includes(addon) || ids.includes(apiThreadId)) return;
  await supabase.from("sales").update({ thread_ids: [...ids, addon].join(",") }).eq("id", saleId);
}

async function execReply(p: ReplyPayload, sessionUserId: string, threadRowId: string | null, saleId: string | null) {
  if (!p.to?.trim()) throw new Error("Falta o destinatário");
  if (!p.body_html?.trim()) throw new Error("A resposta está vazia");
  if (p.body_html.includes("{{TABELA_PRECOS}}")) throw new Error("A resposta ainda tem o marcador {{TABELA_PRECOS}}");
  const token = await gmailToken(sessionUserId);
  const sent = await sendReply(token, {
    threadId: p.gmail_thread_id,
    to: p.to,
    cc: p.cc,
    subject: p.subject,
    html: p.body_html,
    inReplyTo: p.in_reply_to,
    references: p.references,
  });
  await markThreadRead(token, p.gmail_thread_id).catch(() => {});
  if (threadRowId) {
    await supabase.from("inbox_threads").update({
      // Not marked analysed: our reply is read like any new message, to update
      // the "ponto de situação" and the tasks.
      status: "replied", last_from_us: true, last_message_id: sent.id, updated_at: new Date().toISOString(),
    }).eq("id", threadRowId);
  }
  if (saleId) await appendThreadToSale(saleId, p.gmail_thread_id);
  return { gmail_message_id: sent.id };
}

async function findOrCreateClient(name: string, email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (e) {
    const { data } = await supabase.from("clients").select("id").ilike("email", e).limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (!name.trim() && !e) return null;
  const { data, error } = await supabase.from("clients")
    .insert({ name: name.trim() || e, email: e || null, source: "Email" })
    .select("id").single();
  if (error) throw new Error(`Cliente: ${error.message}`);
  return data.id;
}

async function execCreateSale(p: CreateSalePayload, threadRowId: string | null) {
  if (!p.service_id || !p.date) throw new Error("Falta serviço ou data");
  const clientId = p.client_id || (await findOrCreateClient(p.client_name, p.client_email));
  const { data: svc } = await supabase.from("services").select("name, type").eq("id", p.service_id).maybeSingle();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("sales").insert({
    id,
    service_id: p.service_id,
    client_id: clientId,
    date: p.date,
    status: p.status || "Pending",
    type: svc?.type ?? null,
    notion_id: [svc?.name, p.client_name].filter(Boolean).join(" - ") || null,
    number_of_guests: p.guests || null,
    children_10_18: p.children_10_18 || 0,
    children_3_9: p.children_3_9 || 0,
    children_0_2: p.children_0_2 || 0,
    start_time: p.start_time || null,
    transport_vehicle: p.transport_vehicle || null,
    names: p.names || null,
    phone_number: p.phone_number || null,
    meeting_point: p.meeting_point || null,
    notes: p.notes || null,
    dietary_restrictions: p.dietary_restrictions || null,
    mobility_restrictions: p.mobility_restrictions || null,
    emergency_contact: p.emergency_contact || null,
    thread_ids: p.gmail_thread_id ? toAddonThreadId(p.gmail_thread_id) : null,
  });
  if (error) throw new Error(`Venda: ${error.message}`);
  if (threadRowId) {
    await supabase.from("inbox_threads").update({ sale_id: id, client_id: clientId }).eq("id", threadRowId);
    // The pending reply for this thread now belongs to the new sale.
    await supabase.from("inbox_suggestions").update({ sale_id: id }).eq("thread_id", threadRowId).eq("status", "pending");
  }
  revalidatePath("/admin/gestao-servicos");
  revalidatePath("/admin/servicos");
  return { sale_id: id, client_id: clientId };
}

const NUMERIC_FIELDS = new Set<SaleField>(["number_of_guests", "children_10_18", "children_3_9", "children_0_2"]);

async function execUpdateSale(p: UpdateSalePayload) {
  const updates: Record<string, string | number | null> = {};
  for (const c of p.changes) {
    if (!(c.field in SALE_FIELDS)) continue;
    const v = c.new === null || String(c.new).trim() === "" ? null : c.new;
    updates[c.field] = NUMERIC_FIELDS.has(c.field) ? (v === null ? (c.field === "number_of_guests" ? null : 0) : Number(v)) : v;
  }
  if (!Object.keys(updates).length) throw new Error("Nenhuma alteração");
  const { error } = await supabase.from("sales").update(updates).eq("id", p.sale_id);
  if (error) throw new Error(`Venda: ${error.message}`);
  await appendThreadToSale(p.sale_id, p.gmail_thread_id);
  revalidatePath(`/guide/tours/${p.sale_id}`);
  revalidatePath("/admin/em-falta");
  return { sale_id: p.sale_id, updated: Object.keys(updates) };
}

async function execAddExpense(p: AddExpensePayload, createdBy: string | null) {
  if (!p.total) throw new Error("Falta o valor total");
  let fornecedorId = p.fornecedor_id;
  if (!fornecedorId && p.supplier.trim()) fornecedorId = (await findOrCreateFornecedor(p.supplier)).fornecedor.id;
  const id = await createTransaction({
    supplier: p.supplier || "Despesa",
    fornecedorId,
    date: p.date,
    invoiceId: p.invoice_id,
    taxFree: p.tax_free,
    iva6: p.iva6,
    iva13: p.iva13,
    iva23: p.iva23,
    totalCost: p.total,
    whoPaid: "Company",
    paymentMethod: p.payment_method,
    status: p.status,
    tourId: p.sale_id,
    bankReference: "",
    invoiceImageUrl: p.file_url,
    contaPagamento: "COME",
  }, createdBy);
  revalidatePath("/admin/transacoes");
  revalidatePath("/admin/transferencias");
  if (p.sale_id) revalidatePath(`/guide/tours/${p.sale_id}`);
  return { transaction_id: id };
}

async function execGuideEntry(p: GuideEntryPayload, suggestionId: string) {
  const section = (GUIDE_SECTIONS as readonly string[]).includes(p.section) ? p.section : "Processos";
  const { data, error } = await supabase.from("company_guide")
    .insert({ section, title: p.title, content: p.content, source: "learned", source_suggestion_id: suggestionId })
    .select("id").single();
  if (error) throw new Error(error.message);
  return { guide_id: data.id };
}

const stable = (v: unknown) => JSON.stringify(v, Object.keys((v ?? {}) as object).sort());

/**
 * Run a suggestion. `edited` is the payload after the person changed it
 * ("Alterar"); when it differs from the AI's proposal, the guide learns from it.
 */
export async function acceptSuggestionAction(
  id: string,
  edited?: unknown,
  feedback?: string,
): Promise<Result<{ result: unknown }>> {
  let session;
  try {
    session = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const { data: s } = await supabase.from("inbox_suggestions").select("*").eq("id", id).maybeSingle();
  if (!s) return { error: "Sugestão não encontrada" };
  if (s.status !== "pending" && s.status !== "failed") return { error: "Esta sugestão já foi tratada" };

  const payload = (edited ?? s.payload) as never;
  const modified = edited !== undefined && stable(edited) !== stable(s.payload);
  try {
    let result: unknown;
    switch (s.kind as SuggestionKind) {
      case "reply": {
        result = await execReply(payload, session.user.id, s.thread_id, s.sale_id);
        const threadId = (payload as ReplyPayload).gmail_thread_id;
        const uid = await ownerUserId(session.user.id);
        after(async () => {
          try {
            await syncInbox({ userId: uid, threadIds: [threadId], maxAnalyses: 1 });
          } catch (e) {
            console.error("[inbox] re-analysis after reply failed:", e);
          }
        });
        break;
      }
      case "create_sale": result = await execCreateSale(payload, s.thread_id); break;
      case "update_sale": result = await execUpdateSale(payload); break;
      case "add_expense": result = await execAddExpense(payload, session.user.notionId || null); break;
      case "guide_entry": result = await execGuideEntry(payload, s.id); break;
      default: throw new Error(`Tipo desconhecido: ${s.kind}`);
    }
    await supabase.from("inbox_suggestions").update({
      status: modified ? "modified" : "accepted",
      final_payload: modified ? edited : null,
      feedback: feedback || null,
      result,
      error: null,
      decided_by: session.user.email,
      decided_at: new Date().toISOString(),
    }).eq("id", id);

    if (s.thread_id) {
      const { count } = await supabase.from("inbox_suggestions").select("id", { count: "exact", head: true }).eq("thread_id", s.thread_id).eq("status", "pending");
      if (!count && s.kind !== "reply") {
        await supabase.from("inbox_threads").update({ status: "done" }).eq("id", s.thread_id).eq("status", "awaiting_approval");
      }
    }

    if (modified || feedback) {
      after(async () => {
        try {
          await learnFromDecision({ suggestionId: id, kind: s.kind, decision: modified ? "modified" : "accepted", original: s.payload, final: edited, feedback, context: s.title });
        } catch (e) {
          console.error("[inbox] learn failed:", e);
        }
      });
    }
    revalidateInbox();
    return { result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("inbox_suggestions").update({ status: "failed", error: msg }).eq("id", id);
    revalidateInbox();
    return { error: msg };
  }
}

export async function rejectSuggestionAction(id: string, feedback?: string): Promise<Result> {
  try {
    const session = await requireAdmin();
    const { data: s } = await supabase.from("inbox_suggestions").select("*").eq("id", id).maybeSingle();
    if (!s) return { error: "Sugestão não encontrada" };
    await supabase.from("inbox_suggestions").update({
      status: "rejected",
      feedback: feedback || null,
      decided_by: session.user.email,
      decided_at: new Date().toISOString(),
    }).eq("id", id);
    after(async () => {
      try {
        await learnFromDecision({ suggestionId: id, kind: s.kind, decision: "rejected", original: s.payload, feedback, context: s.title });
      } catch (e) {
        console.error("[inbox] learn failed:", e);
      }
    });
    revalidateInbox();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Company guide ─────────────────────────────────────────────────────────────

export async function saveGuideEntryAction(entry: { id?: string; section: string; title: string; content: string; active?: boolean }): Promise<Result> {
  try {
    await requireAdmin();
    if (!entry.title.trim() || !entry.content.trim()) return { error: "Título e conteúdo são obrigatórios" };
    const row = {
      section: entry.section,
      title: entry.title.trim(),
      content: entry.content.trim(),
      active: entry.active ?? true,
      updated_at: new Date().toISOString(),
    };
    const { error } = entry.id
      ? await supabase.from("company_guide").update(row).eq("id", entry.id)
      : await supabase.from("company_guide").insert({ ...row, source: "manual" });
    if (error) return { error: error.message };
    revalidateInbox();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteGuideEntryAction(id: string): Promise<Result> {
  try {
    await requireAdmin();
    const { error } = await supabase.from("company_guide").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidateInbox();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveInboxSettingsAction(s: { gmail_query: string; calendar_id: string; auto_archive_notifications: boolean; notifications_label: string }): Promise<Result> {
  try {
    await requireAdmin();
    const { error } = await supabase.from("inbox_settings").update({
      gmail_query: s.gmail_query.trim() || "in:inbox newer_than:30d",
      calendar_id: s.calendar_id.trim() || "primary",
      auto_archive_notifications: s.auto_archive_notifications,
      notifications_label: s.notifications_label.trim() || "Notificações",
    }).eq("id", 1);
    if (error) return { error: error.message };
    revalidateInbox();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
