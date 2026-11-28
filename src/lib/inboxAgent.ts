import { put } from "@vercel/blob";
import { supabase, getFornecedores, createSaleTask, updateTaskStatus } from "@/lib/notion";
import { structured, obj, arr, str, int, bool, nullable } from "@/lib/claude";
import { guidePrompt } from "@/lib/companyGuide";
import { getAvailability, type DayAvailability } from "@/lib/availability";
import { priceLines, priceTableHtml, priceLinesText, type PricedLine } from "@/lib/priceTable";
import { analyzeInvoice } from "@/actions/invoice";
import {
  getProfile, listChangedThreadIds, isRateLimit, listThreadIds, getThreadMeta, getThread, getAttachment, toApiThreadId, parseAddress,
  ensureLabel, archiveThread, highlightThread,
  type GmailThread, type GmailMessage,
} from "@/lib/gmail";
import { getGoogleToken, GMAIL_SCOPE, CALENDAR_SCOPE } from "@/lib/google-token";

/**
 * The inbox agent. Reads Gmail threads, links each to its tour (sale), and
 * turns what it reads into SUGGESTIONS: a reply with the proposed price table,
 * a new sale, changes to an existing sale, an expense from an attached invoice.
 * Nothing here sends an email or writes a sale/expense — that only happens in
 * actions/inbox.ts when a person accepts a suggestion.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaleChange = { field: SaleField; label: string; old: string | number | null; new: string | number | null };

export type ReplyPayload = {
  gmail_thread_id: string;
  to: string;
  cc: string;
  subject: string;
  body_html: string;
  in_reply_to: string;
  references: string;
  language: string;
  price_summary: string;
  missing_info: string[];
  internal_note: string;
  warnings?: string[];
};

export type CreateSalePayload = {
  service_id: string;
  service_name: string;
  date: string;
  start_time: string | null;
  guests: number;
  children_10_18: number;
  children_3_9: number;
  children_0_2: number;
  transport_vehicle: string | null;
  client_id: string | null;
  client_name: string;
  client_email: string;
  phone_number: string;
  names: string;
  dietary_restrictions: string;
  mobility_restrictions: string;
  emergency_contact: string;
  meeting_point: string;
  notes: string;
  status: string;
  gmail_thread_id: string | null;
  /** Sale ID (sales.notion_id): the agency reference; several services from one request get _1, _2, _3… */
  sale_code?: string;
};

export type UpdateSalePayload = { sale_id: string; sale_label: string; changes: SaleChange[]; gmail_thread_id: string | null };

export type AddExpensePayload = {
  supplier: string;
  fornecedor_id: string | null;
  date: string | null;
  invoice_id: string;
  tax_free: number;
  iva6: number;
  iva13: number;
  iva23: number;
  total: number;
  file_url: string;
  filename: string;
  sale_id: string | null;
  payment_method: string;
  status: string;
  duplicate_of: string | null;
  /** Learned from earlier expenses of the same supplier. */
  who_paid?: string;
  conta_pagamento?: string;
  /** Partner's personal expense paid by the company (transactions.socio_pessoal). */
  socio_pessoal?: string | null;
  /** An existing expense (e.g. created from the bank) this invoice belongs to: attach instead of creating. */
  attach_to_transaction_id?: string | null;
  history_note?: string;
};

type SupplierTx = {
  id: string; notion_id: string | null; valor: number | null; data: string | null; status: string | null;
  pago_por: string | null; metodo_pagamento: string | null; conta_pagamento: string | null; fatura_url: string | null; id_fatura: string | null;
  socio_pessoal: string | null; fornecedor_id: string | null;
};
const TX_COLUMNS = "id, notion_id, valor, data, status, pago_por, metodo_pagamento, conta_pagamento, fatura_url, id_fatura, socio_pessoal, fornecedor_id";

/** Defaults learned from earlier expenses (newest first). */
function learnDefaults(rows: SupplierTx[]) {
  const recent = rows.slice(0, 6);
  // A partner expense only when most recent ones were.
  const socios = recent.map((r) => r.socio_pessoal).filter(Boolean);
  return {
    count: rows.length,
    name: mostCommon(recent.map((r) => r.notion_id)),
    paymentMethod: mostCommon(recent.map((r) => r.metodo_pagamento)),
    account: mostCommon(recent.map((r) => r.conta_pagamento)),
    whoPaid: mostCommon(recent.map((r) => r.pago_por)),
    status: mostCommon(recent.map((r) => r.status)),
    socio: socios.length * 2 >= recent.length ? mostCommon(socios) : null,
    last: rows[0] ?? null,
  };
}

/**
 * Recurring expense with the same amount (e.g. a monthly insurance debit),
 * when the supplier isn't recognised by name.
 */
async function recurringByAmount(total: number) {
  if (!(total > 0)) return null;
  const since = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .gte("data", since)
    .lte("valor", -(total - 0.05))
    .gte("valor", -(total + 0.05))
    .order("data", { ascending: false })
    .limit(12);
  const rows = (data ?? []) as SupplierTx[];
  const forn = mostCommon(rows.map((r) => r.fornecedor_id));
  const same = rows.filter((r) => r.fornecedor_id === forn);
  return same.length >= 2 ? { fornecedorId: forn, rows: same } : null;
}

/** Most frequent non-empty value. */
function mostCommon(values: (string | null)[]): string | null {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * How this supplier's invoices were registered before: name used, payment
 * method, account, who paid, status — and whether this invoice's expense
 * already exists (e.g. created from the bank statement or a monthly card charge).
 */
async function supplierHistory(fornecedorId: string, total: number, date: string | null, invoiceId: string) {
  const { data } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("fornecedor_id", fornecedorId)
    .order("data", { ascending: false, nullsFirst: false })
    .limit(12);
  const rows = (data ?? []) as SupplierTx[];
  const near = (d: string | null) => !date || !d ? true : Math.abs(new Date(d).getTime() - new Date(date).getTime()) <= 12 * 86400_000;
  const match = rows.find((r) =>
    (invoiceId && r.id_fatura && r.id_fatura.trim() === invoiceId.trim()) ||
    (total > 0 && Math.abs(Math.abs(Number(r.valor ?? 0)) - total) < 0.06 && near(r.data)),
  ) ?? null;
  return { ...learnDefaults(rows), match };
}

/** Words that say nothing about which supplier it is (never used to match). */
const GENERIC_NAME_WORDS = new Set([
  "lda", "limited", "limitada", "inc", "company", "companhia", "seguros", "seguro", "portugal", "porto", "lisboa",
  "mail", "email", "billing", "invoice", "invoices", "statements", "stripe", "faturas", "fatura", "clientes", "cliente",
  "servicos", "services", "grupo", "group", "comercial", "unipessoal", "sociedade", "noreply", "reply",
]);

/** Supplier for an invoice: exact name, then a word of the name, then the sender's domain. */
function findFornecedor(fornecedores: { id: string; name: string }[], supplier: string | null, senderEmail: string) {
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const s = norm(supplier ?? "");
  if (s) {
    const exact = fornecedores.find((f) => norm(f.name) === s);
    if (exact) return exact;
    const words = s.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
    const byWord = fornecedores.find((f) => words.some((w) => norm(f.name).includes(w)));
    if (byWord) return byWord;
  }
  const domainWords = (senderEmail.split("@")[1] ?? "").split(".").filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
  return fornecedores.find((f) => domainWords.some((w) => norm(f.name).includes(w))) ?? null;
}

export type GuideEntryPayload = { section: string; title: string; content: string };

export type SuggestionKind = "reply" | "create_sale" | "update_sale" | "add_expense" | "guide_entry";

// Editable sale columns and their labels (pt).
export const SALE_FIELDS = {
  date: "Data",
  start_time: "Hora início",
  end_time: "Hora fim",
  number_of_guests: "Nº Pax",
  children_10_18: "Crianças 10-18",
  children_3_9: "Crianças 3-9",
  children_0_2: "Bebés 0-2",
  names: "Nomes",
  phone_number: "Contacto",
  meeting_point: "Ponto de encontro",
  notes: "Notas",
  dietary_restrictions: "Restrições alimentares",
  mobility_restrictions: "Mobilidade",
  emergency_contact: "Contacto de emergência",
  status: "Estado",
  service_id: "Serviço",
  transport_vehicle: "Transporte",
} as const;
export type SaleField = keyof typeof SALE_FIELDS;

/** Client-facing info every confirmed service needs (what we ask the client for). */
const CLIENT_INFO_FIELDS: { field: SaleField; label: string }[] = [
  { field: "number_of_guests", label: "Nº de pessoas" },
  { field: "names", label: "Nomes dos participantes" },
  { field: "phone_number", label: "Contacto telefónico" },
  { field: "dietary_restrictions", label: "Restrições alimentares / alergias" },
  { field: "mobility_restrictions", label: "Restrições de mobilidade" },
  { field: "emergency_contact", label: "Contacto de emergência" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function missingClientInfo(row: Record<string, any>): string[] {
  return CLIENT_INFO_FIELDS.filter(({ field }) => {
    const v = row[field];
    return v === null || v === undefined || String(v).trim() === "" || v === 0;
  }).map((f) => f.label);
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** "thread-f:<decimal>" — the format sales.thread_ids already uses (Gmail add-on). */
/**
 * Adds the conversation to the sale's emails (sales.thread_ids, in the add-on's
 * "thread-f:" form), so it shows in the "Emails" section of the service page.
 */
export async function linkThreadToSale(saleId: string, apiThreadId: string | null | undefined): Promise<void> {
  if (!apiThreadId) return;
  const { data } = await supabase.from("sales").select("thread_ids").eq("id", saleId).maybeSingle();
  const ids = String(data?.thread_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const addon = toAddonThreadId(apiThreadId);
  if (ids.includes(addon) || ids.includes(apiThreadId)) return;
  await supabase.from("sales").update({ thread_ids: [...ids, addon].join(",") }).eq("id", saleId);
}

export function toAddonThreadId(apiId: string): string {
  try {
    return `thread-f:${BigInt(`0x${apiId}`).toString(10)}`;
  } catch {
    return apiId;
  }
}

const SALE_COLUMNS = `id, notion_id, date, status, number_of_guests, names, phone_number, meeting_point, notes,
  start_time, end_time, dietary_restrictions, mobility_restrictions, emergency_contact, transport_vehicle,
  children_10_18, children_3_9, children_0_2, thread_ids, service_id, client_id, guide_id,
  services(name), clients(name, email), guide:team!sales_guide_id_fkey(name)`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SaleRow = Record<string, any>;

export function saleLabel(s: SaleRow): string {
  return [s.services?.name, s.date, s.clients?.name ?? s.notion_id].filter(Boolean).join(" · ");
}

function saleForPrompt(s: SaleRow) {
  return {
    sale_id: s.id,
    label: s.notion_id,
    service: s.services?.name ?? null,
    service_id: s.service_id,
    date: s.date,
    status: s.status,
    client: s.clients?.name ?? null,
    client_email: s.clients?.email ?? null,
    guests: s.number_of_guests,
    children: { "10_18": s.children_10_18, "3_9": s.children_3_9, "0_2": s.children_0_2 },
    start_time: s.start_time,
    end_time: s.end_time,
    names: s.names,
    phone_number: s.phone_number,
    meeting_point: s.meeting_point,
    notes: s.notes,
    dietary_restrictions: s.dietary_restrictions,
    mobility_restrictions: s.mobility_restrictions,
    emergency_contact: s.emergency_contact,
    transport_vehicle: s.transport_vehicle,
    guide: s.guide?.name ?? null,
    missing_client_info: missingClientInfo(s),
  };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Context ───────────────────────────────────────────────────────────────────

async function servicesForPrompt() {
  const { data } = await supabase
    .from("services")
    .select("id, name, type, description, duration_minutes, available_until, service_price_tiers(year)")
    .order("name");
  const year = new Date().getFullYear();
  return (data ?? [])
    .filter((s) => s.available_until === null || s.available_until >= year)
    .map((s) => ({
      id: s.id,
      name: String(s.name).trim(),
      type: s.type,
      duration_minutes: s.duration_minutes,
      has_price_table: ((s.service_price_tiers as unknown[]) ?? []).length > 0,
      description: (s.description ?? "").slice(0, 300),
    }));
}

/** Sales linked to the thread, the sender's sales, and the upcoming calendar. */
/**
 * Agency booking references in a conversation (MFSP…, TFY PR…/OC…, TLO nº):
 * the reliable way to find the sale an email is about.
 */
export function agencyRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(/\bMFSP\s?-?(\d{5,})\b/gi)) refs.add(`MFSP${m[1]}`);
  for (const m of text.matchAll(/\b((?:PR|OC)\d{4,}[A-Z]{0,3})\b/g)) refs.add(m[1]);
  for (const m of text.matchAll(/\bTLO\b[^\n]{0,60}?[-–]\s*(P?\d{3,5})\b/gi)) refs.add(m[1].toUpperCase());
  return [...refs];
}

/** "Gene & Kelley Shrock" → "Gene Shrock"; "Dick and Ruth Weisberg" → "Dick Weisberg". */
function firstGuest(names: string | null): string {
  const all = (names ?? "").trim();
  if (!all) return "";
  const first = (all.split(/[,;&\n]| e | and /i)[0] ?? "").trim();
  if (first.includes(" ")) return first;
  const surname = all.split(/\s+/).pop() ?? "";
  return surname && surname !== first ? `${first} ${surname}` : first;
}

/** PostgREST filter matching sales.notion_id against agency references. */
function refFilterFor(refs: string[]): string {
  return refs.map((raw) => {
    const r = raw.replace(/[%,()]/g, "");
    // TLO numbers are short digits: match them exactly or next to "TLO", never inside other codes.
    if (/^P?\d{3,5}$/.test(r)) {
      const n = r.replace(/^P/, "");
      return `notion_id.eq.${n},notion_id.eq.P${n},notion_id.ilike.${n}_%,notion_id.ilike.P${n}_%,notion_id.ilike.%TLO%${n}%`;
    }
    return `notion_id.ilike.%${r}%`;
  }).join(",");
}

/**
 * Automatic step for every incoming email: if the conversation isn't linked
 * to a sale yet and it carries an agency reference that matches exactly one
 * existing sale, link them (conversation row + the sale's Emails section).
 */
export async function autoLinkBySaleRef(threadRowId: string, apiThreadId: string, text: string): Promise<string | null> {
  const refs = agencyRefs(text);
  if (!refs.length) return null;
  const { data } = await supabase.from("sales").select("id, notion_id").or(refFilterFor(refs)).neq("status", "Cancelled").limit(10);
  if (!data?.length) return null;
  // One booking = one base ID; its services are REF, REF_1, REF_2…
  const bases = new Set(data.map((s) => String(s.notion_id ?? "").trim().replace(/_\d+$/, "").toUpperCase()));
  if (bases.size !== 1) return null; // different bookings: leave it to the person
  const sorted = [...data].sort((a, b) => String(a.notion_id).localeCompare(String(b.notion_id), undefined, { numeric: true }));
  await supabase.from("inbox_threads").update({ sale_id: sorted[0].id }).eq("id", threadRowId).is("sale_id", null);
  for (const s of sorted) await linkThreadToSale(s.id as string, apiThreadId);
  return sorted[0].id as string;
}

async function candidateSales(apiThreadId: string, senderEmails: string[], refs: string[] = []) {
  const addon = toAddonThreadId(apiThreadId);
  const refFilter = refFilterFor(refs);
  const [{ data: byThread }, { data: clients }, { data: byRef }] = await Promise.all([
    supabase.from("sales").select(SALE_COLUMNS).or(`thread_ids.ilike.%${addon}%,thread_ids.ilike.%${apiThreadId}%`),
    senderEmails.length
      ? supabase.from("clients").select("id, name, email").in("email", senderEmails)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
    refFilter
      ? supabase.from("sales").select(SALE_COLUMNS).or(refFilter).neq("status", "Cancelled")
      : Promise.resolve({ data: [] as SaleRow[] }),
  ]);
  // Same agency reference = same booking, even if the email isn't linked yet.
  const linked = [...(byThread ?? []) as SaleRow[]];
  for (const s of (byRef ?? []) as SaleRow[]) if (!linked.some((l) => l.id === s.id)) linked.push(s);
  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: byClient } = clientIds.length
    ? await supabase.from("sales").select(SALE_COLUMNS).in("client_id", clientIds).gte("date", addDays(today(), -14)).order("date")
    : { data: [] as SaleRow[] };
  const { data: upcoming } = await supabase
    .from("sales")
    .select("id, notion_id, date, status, number_of_guests, services(name), clients(name)")
    .gte("date", today())
    .lte("date", addDays(today(), 180))
    .neq("status", "Cancelled")
    .order("date")
    .limit(120);
  return {
    linked,
    clientSales: (byClient ?? []) as SaleRow[],
    clients: (clients ?? []) as { id: string; name: string; email: string }[],
    upcoming: (upcoming ?? []) as SaleRow[],
  };
}

function threadForPrompt(thread: GmailThread, myEmail: string): string {
  const msgs = thread.messages.slice(-8);
  return msgs
    .map((m) => {
      const who = m.fromEmail === myEmail || m.labelIds.includes("SENT") ? "COME (nós)" : m.from;
      const atts = m.attachments.length ? `\nAnexos: ${m.attachments.map((a) => `${a.filename} (${a.mimeType})`).join(", ")}` : "";
      return `--- Mensagem ${m.id} | De: ${who} | Para: ${m.to}${m.cc ? ` | Cc: ${m.cc}` : ""} | Data: ${m.date}\nAssunto: ${m.subject}\n\n${m.body.slice(0, 5000)}${atts}`;
    })
    .join("\n\n");
}

/**
 * The other email conversations already linked to the sale(s) this email is
 * about (sales.thread_ids) — e.g. the availability request before this
 * confirmation. Gives the agent the whole history of the booking.
 */
async function relatedThreadsText(token: string, sales: SaleRow[], currentId: string, myEmail: string): Promise<string> {
  const ids = new Set<string>();
  for (const sale of sales.slice(0, 2)) {
    for (const raw of String(sale.thread_ids ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const id = toApiThreadId(raw);
      if (id && id !== currentId) ids.add(id);
    }
  }
  const parts: string[] = [];
  for (const id of [...ids].slice(-3)) {
    try {
      const t = await getThread(token, id);
      if (!t.messages.length) continue;
      parts.push(`### Conversa ${id} (${t.messages[0].subject})\n${threadForPrompt({ ...t, messages: t.messages.slice(-4) }, myEmail).slice(0, 4000)}`);
    } catch (e) {
      if (isRateLimit(e)) break;
    }
  }
  return parts.join("\n\n");
}

/** One line per sale that tells the model exactly which booking is which (by id and agency code). */
function saleIdLine(s: SaleRow): string {
  return `id ${s.id} | código ${s.notion_id ?? "—"} | ${s.date ?? "?"} | ${s.services?.name ?? ""} | ${s.status ?? ""}`;
}

// ── Pass 1: read the thread ───────────────────────────────────────────────────

type Extraction = {
  category: "booking_request" | "booking_change" | "question" | "invoice" | "supplier" | "internal" | "other";
  summary: string;
  language: "pt" | "en" | "fr" | "es" | "other";
  needs_reply: boolean;
  linked_sale_id: string | null;
  new_booking: boolean;
  client: { name: string | null; email: string | null; phone: string | null };
  requests: {
    service_id: string | null;
    service_hint: string;
    date: string | null;
    alternative_dates: string[];
    start_time: string | null;
    guests: number | null;
    children_10_18: number;
    children_3_9: number;
    children_0_2: number;
    transport_vehicle: string | null;
  }[];
  sale_updates: { field: SaleField; new_value: string | null; reason: string }[];
  booking_info: {
    names: string | null;
    phone_number: string | null;
    dietary_restrictions: string | null;
    mobility_restrictions: string | null;
    emergency_contact: string | null;
    meeting_point: string | null;
    notes: string | null;
  };
  invoice_attachments: string[];
  open_questions: string[];
  tasks: AgentTask[];
  is_notification: boolean;
  important: boolean;
  situation: Situation;
};

/** "Ponto de situação" of a conversation, rewritten on every new message (ours or theirs). */
export type Situation = { estado: string; combinado: string; falta: string; proximo_passo: string; aguarda: "nós" | "cliente" | "ninguém" };

export type AgentTask = { key: string; name: string; description: string; due_date: string; owner: string; done: boolean };
const TASK_OWNERS = ["Bernardo", "António", "Manel"] as const;

const EXTRACTION_SCHEMA = obj({
  category: { type: "string", enum: ["booking_request", "booking_change", "question", "invoice", "supplier", "internal", "other"] },
  summary: str,
  language: { type: "string", enum: ["pt", "en", "fr", "es", "other"] },
  needs_reply: bool,
  linked_sale_id: nullable(str),
  new_booking: bool,
  client: obj({ name: str, email: str, phone: str }),
  requests: arr(obj({
    service_id: nullable(str),
    service_hint: str,
    date: nullable(str),
    alternative_dates: arr(str),
    start_time: nullable(str),
    guests: nullable(int),
    children_10_18: int,
    children_3_9: int,
    children_0_2: int,
    transport_vehicle: nullable(str),
  })),
  sale_updates: arr(obj({
    field: { type: "string", enum: Object.keys(SALE_FIELDS) },
    new_value: nullable(str),
    reason: str,
  })),
  booking_info: obj({
    names: str,
    phone_number: str,
    dietary_restrictions: str,
    mobility_restrictions: str,
    emergency_contact: str,
    meeting_point: str,
    notes: str,
  }),
  invoice_attachments: arr(str),
  open_questions: arr(str),
  is_notification: bool,
  important: bool,
  situation: obj({
    estado: str,
    combinado: str,
    falta: str,
    proximo_passo: str,
    aguarda: { type: "string", enum: ["nós", "cliente", "ninguém"] },
  }),
  tasks: arr(obj({
    key: str,
    name: str,
    description: str,
    due_date: str,
    owner: { type: "string", enum: [...TASK_OWNERS] },
    done: bool,
  })),
});

/** "" from the model means unknown. */
function blankToNull<T extends Record<string, string | null>>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim() : null])) as T;
}

async function extract(opts: {
  thread: GmailThread;
  myEmail: string;
  guide: string;
  services: Awaited<ReturnType<typeof servicesForPrompt>>;
  cands: Awaited<ReturnType<typeof candidateSales>>;
  related?: string;
}): Promise<Extraction> {
  const { cands } = opts;
  const linkedIds = new Set(cands.linked.map((s) => s.id));
  const clientSales = cands.clientSales.filter((s) => !linkedIds.has(s.id));
  const ex = await structured<Extraction>({
    effort: "medium",
    system: `És o assistente de gestão da caixa de entrada da COME Porto (food tours, cooking classes, chef em casa e eventos no Porto/Douro).
Hoje é ${today()}. O nosso email é ${opts.myEmail}.
Lê a conversa de email e extrai a informação estruturada. Não inventes: deixa a null o que não está escrito.

Regras:
- linked_sale_id: o sale_id da venda a que esta conversa diz respeito. Usa as vendas "ligadas a esta conversa" se existirem; senão uma venda do mesmo cliente ou da lista de próximas vendas SÓ se for claramente a mesma (mesmo cliente/data/serviço). Caso contrário null.
- new_booking: true se é um pedido de reserva/orçamento novo que ainda não existe como venda.
- requests: cada serviço/data pedido (para orçamento, disponibilidade ou reserva). service_id tem de ser um id da lista de serviços (o mais próximo do pedido) ou null. Datas em yyyy-mm-dd (assume o próximo ano em que a data faz sentido se o ano não for dito). guests = total de pessoas incluindo crianças.
- sale_updates: só para a venda ligada, só campos cujo valor no email é NOVO ou DIFERENTE do que está na venda. Para "notes" dá o texto completo novo (notas atuais + o que acrescentar). status só "Confirmed" ou "Cancelled" quando o cliente confirma/cancela explicitamente. number_of_guests e crianças como número em texto. date yyyy-mm-dd, horas HH:MM.
- booking_info: informação partilhada pelo cliente (nomes, contacto, alergias, mobilidade, contacto de emergência, ponto de encontro, notas) — útil para uma venda nova.
- invoice_attachments: nomes exatos dos ficheiros anexos que são faturas/recibos que a COME tem de pagar ou registar como despesa (fornecedores, restaurantes, transportes, aluguer de material, software como Vercel/Anthropic, seguros, taxas como a do RNAAT…). Notas de crédito/reembolsos também contam (valor negativo). Não incluas faturas emitidas pela COME a clientes.
- needs_reply: true se a última mensagem é de alguém externo e espera resposta nossa. Também true (resposta curta) para reconfirmações ("Chequeo", "Reconfirmation", "FINAL DETAILS"), comprovativos de pagamento que pedem para confirmar, e informações enviadas por agências (contactos, alergias). false para newsletters, questionários, notificações automáticas, respostas automáticas, spam comercial, recibos/faturas de fornecedores sem pergunta, ou se a última mensagem é nossa.
- client e booking_info: "" quando a informação não está escrita.
- tasks: tarefas internas que esta conversa cria para a equipa — tudo o que alguém da COME tem de FAZER além de responder ao email (a resposta já é tratada à parte). Exemplos: "Enviar fatura MFSP148054", "Pagar taxa RNAAT", "Enviar nome e contacto do guia à TLO", "Reservar transporte para 6 pax", "Registar despesa Vercel", "Preparar proposta para a Ovation (52 pax)", "Confirmar com o Barro a cooking class de 30/09". Não cries tarefas para "responder ao email". key: identificador curto e estável em minúsculas (ex.: "enviar-fatura", "nome-guia", "pagar-rnaat") — usa a MESMA key em análises seguintes da mesma conversa para a mesma tarefa. name: imperativo curto em português, com o cliente/código. description: 1-2 frases com o contexto. due_date: yyyy-mm-dd se houver prazo (ex.: prazo do email, ou 2 semanas antes da tour para o nome do guia, 7 dias após o serviço para faturas), senão "". owner: Bernardo (operação, guias, tours, chefs, fornecedores do serviço), António (faturação, pagamentos, despesas, contabilidade, administração, parcerias) ou Manel (reservas e comunicação com agências e clientes). done: true se a conversa mostra que a tarefa já foi feita (ex.: fatura enviada, pagamento confirmado). Se não houver tarefas, lista vazia.
- is_notification: true se é um email automático sem uma pessoa à espera de resposta — notificações de sistemas (Vercel, GitHub, Supabase, deploys, merges, pushes), newsletters, marketing, questionários, apps de viagem, redes sociais, respostas automáticas. false para clientes, agências, fornecedores, parceiros, contabilista, bancos e organismos que pedem algo, e para faturas/recibos.
- important: só para notificações — true se exige atenção da equipa (falha de deploy/build, erro, alerta de segurança, pagamento falhado, conta suspensa, limite atingido, prazo legal); false para avisos de rotina (deploy concluído, merge, push, newsletter).
- situation: ponto de situação da conversa INTEIRA (em português, frases curtas, "" se não se aplica). estado: onde estamos (ex.: "Reserva confirmada para 25/04, 2 pax, OSNS + Chef"). combinado: o que já ficou acordado (data, hora, preço, ponto de encontro…). falta: o que ainda falta (de nós ou do cliente: contacto, alergias, fatura, nome do guia, confirmação…). proximo_passo: a próxima ação concreta e de quem. aguarda: "nós" se a bola está do nosso lado, "cliente" se esperamos pela outra parte, "ninguém" se está tudo tratado.
- Se a última mensagem é NOSSA: needs_reply é false; usa-a para atualizar situation e tasks (ex.: enviámos a fatura → tarefa de faturar done; prometemos enviar o nome do guia → nova tarefa).
- summary: 1-2 frases em português.

${opts.guide}`,
    content: `## Serviços (id | nome | tipo | tem tabela de preços)
${opts.services.map((s) => `${s.id} | ${s.name} | ${s.type ?? ""} | ${s.has_price_table ? "sim" : "não"}`).join("\n")}

## Vendas ligadas a esta conversa
${cands.linked.length ? JSON.stringify(cands.linked.map(saleForPrompt), null, 1) : "(nenhuma)"}

## Outras vendas deste cliente
${clientSales.length ? JSON.stringify(clientSales.map(saleForPrompt), null, 1) : "(nenhuma)"}

## Próximas vendas (180 dias)
${cands.upcoming.map((s) => `${s.id} | ${s.date} | ${s.services?.name ?? ""} | ${s.clients?.name ?? s.notion_id ?? ""} | ${s.number_of_guests ?? "?"} pax | ${s.status}`).join("\n") || "(nenhuma)"}

## Conversa
${threadForPrompt(opts.thread, opts.myEmail)}${opts.related ? `

## Outras conversas já associadas a esta venda (histórico da reserva)
${opts.related}` : ""}`,
    schema: EXTRACTION_SCHEMA,
  });
  return {
    ...ex,
    client: blankToNull(ex.client),
    booking_info: blankToNull(ex.booking_info),
    tasks: (ex.tasks ?? []).filter((t) => t.key && t.name),
  };
}

// ── Pass 2: draft the reply ───────────────────────────────────────────────────

type Draft = { body_html: string; missing_info_requested: string[]; internal_note: string; warnings: string[] };

export async function draftReply(opts: {
  thread: GmailThread;
  myEmail: string;
  guide: string;
  summary: string;
  language: string;
  sale: SaleRow | null;
  newBooking: Partial<CreateSalePayload> | null;
  availability: DayAvailability[];
  calendarChecked: boolean;
  prices: PricedLine[];
  missingInfo: string[];
  openQuestions: string[];
  purpose?: string;
  related?: string;
  /** Sales on the requested dates that are THIS booking (same id) — not a conflict. */
  sameBookingNote?: string;
}): Promise<Draft> {
  const avail = opts.availability.map((d) =>
    `${d.date} (${d.weekday}): ${d.available ? "DISPONÍVEL" : "NÃO DISPONÍVEL"}${d.reasons.length ? ` — ${d.reasons.join("; ")}` : ""} | ${d.totalBookings} serviço(s) marcados | guias livres: ${d.freeGuides.join(", ") || "nenhum"}`,
  ).join("\n");
  return structured<Draft>({
    effort: "medium",
    system: `Escreves rascunhos de resposta de email em nome da COME Porto. O rascunho será revisto e aprovado por um administrador antes de ser enviado.
Hoje é ${today()}.

Regras:
- Escreve na língua do cliente (${opts.language}). Segue o tom e as regras do guia e das regras de negócio abaixo.
- Usa a assinatura e o estilo das nossas mensagens anteriores nesta conversa, se existirem.
- body_html: só o corpo em HTML simples (<p>, <br>, <ul>, <li>, <strong>). Sem <html>/<body>, sem citar a mensagem anterior.
- Preços: NUNCA escrevas valores tu próprio. Se há linhas de preço abaixo, coloca SEMPRE o marcador {{TABELA_PRECOS}} exatamente uma vez, num parágrafo próprio antes do fecho, onde a tabela com o preço proposto deve aparecer. Restrições alimentares, alergias ou pedidos de menu não alteram o preço: não prometas "proposta personalizada" por causa disso — apresenta o preço da tabela. Se não há preços calculados para o serviço pedido (serviço à medida/sem tabela), diz que enviamos uma proposta personalizada em breve, ou pede o que falta para orçamentar (nº de pessoas, data).
- Disponibilidade: usa apenas a verificação abaixo. Se uma data não está disponível, propõe as alternativas disponíveis. Se o Bernardo está fora mas há outros guias livres, a data ESTÁ disponível (não mencionar o Bernardo ao cliente).${opts.calendarChecked ? "" : " (Atenção: o calendário Google não foi verificado — não confirmes datas de forma definitiva.)"}
- Informação em falta: se a reserva está confirmada ou a ser confirmada, pede de forma simpática e agrupada a informação em falta listada abaixo. Em missing_info_requested lista o que pediste.
- Responde às perguntas em aberto do cliente com a informação dos serviços e do guia; se não souberes, diz que confirmamos em breve (não inventes).
- Nunca incluas resumos internos da app (blocos tipo "ID: … Status: Pending Client: … Type: …"), estados internos, notas para a equipa ou nomes de campos. Para resumir uma reserva usa uma frase: data, nº de pessoas, serviço e horário.
- Lê a última mensagem do cliente até ao fim. Responde a TODAS as perguntas e a TODAS as datas/alternativas propostas (ex.: "se não for possível, pode ser a 7 de outubro?"). Nunca recuses sem propor uma alternativa (outra data, outro serviço, o Barro em vez da casa do chef).
- Cumprimenta pelo primeiro nome de quem assinou a última mensagem (não de outra pessoa da conversa; se a mensagem não está assinada, usa só "Olá,"/"Hello,").
- Repete a data, o nº de pessoas, o serviço (com ou sem chef) e o horário exatamente como pedidos e confirmados — não troques a data por outra reserva.
- Horário: as tours são de manhã (11h00). Se pedirem tarde, propõe a manhã ou ajusta a hora de manhã (ex.: 10h30–14h30) para encaixar no programa do cliente; não aceites tours à tarde sem aprovação.
- Se o email diz "em anexo"/"attached", lembra-te de que esta app ainda não envia anexos: avisa em warnings.
- internal_note: nota curta em português para o administrador (o que verificar antes de enviar). Pode ser "".
- warnings: lista de alertas para o administrador (em português), por exemplo: data/nº de pessoas/serviço do rascunho diferente do pedido; variante com/sem chef ambígua ou contrária à regra da agência; pedido à tarde; pergunta do cliente que ficou sem resposta; texto refere um anexo. Lista vazia se não houver.

${opts.guide}`,
    content: `## Objetivo
${opts.purpose ?? "Responder à última mensagem do cliente."}

## Resumo da conversa
${opts.summary}

## Venda associada
${opts.sale ? JSON.stringify(saleForPrompt(opts.sale), null, 1) : opts.newBooking ? `Pedido novo (ainda não é venda): ${JSON.stringify(opts.newBooking)}` : "(nenhuma)"}

## Verificação de disponibilidade
${avail || "(nenhuma data pedida)"}

## Preço proposto (calculado pela tabela de preços da app — vai na tabela {{TABELA_PRECOS}})
${opts.prices.length ? priceLinesText(opts.prices) : "(nenhum preço calculado)"}

## Informação em falta para o serviço
${opts.missingInfo.length ? opts.missingInfo.join(", ") : "(nada em falta)"}

## Perguntas em aberto do cliente
${opts.openQuestions.length ? opts.openQuestions.map((q) => `- ${q}`).join("\n") : "(nenhuma)"}

## Conversa
${threadForPrompt(opts.thread, opts.myEmail)}${opts.related ? `

## Outras conversas já associadas a esta venda (histórico da reserva)
${opts.related}` : ""}${opts.sameBookingNote ? `

## Esta reserva já existe na app
${opts.sameBookingNote}
A disponibilidade acima já não conta esta venda. Não avises que a data está ocupada por causa dela.` : ""}`,
    schema: obj({ body_html: str, missing_info_requested: arr(str), internal_note: str, warnings: arr(str) }),
  });
}

/** Swap {{TABELA_PRECOS}} for the computed table (or append it when the AI forgot). */
export function withPriceTable(html: string, prices: PricedLine[], language: string): string {
  const table = priceTableHtml(prices, language === "pt" ? "pt" : "en");
  if (!table) return html.replace(/<p>\s*\{\{TABELA_PRECOS\}\}\s*<\/p>/g, "").replace(/\{\{TABELA_PRECOS\}\}/g, "");
  if (html.includes("{{TABELA_PRECOS}}")) {
    return html.replace(/<p>\s*\{\{TABELA_PRECOS\}\}\s*<\/p>/, table).replace(/\{\{TABELA_PRECOS\}\}/, table).replace(/\{\{TABELA_PRECOS\}\}/g, "");
  }
  // No placeholder: put the table before the closing ("Kind regards", "Obrigado"…), not under the signature.
  const closing = /<p>\s*(kind regards|best regards|warm regards|regards|obrigad[oa]|cumprimentos|com os melhores cumprimentos|atenciosamente|saludos|un saludo)\b/i.exec(html);
  return closing ? `${html.slice(0, closing.index)}${table}\n${html.slice(closing.index)}` : `${html}\n${table}`;
}

function replyEnvelope(thread: GmailThread, myEmail: string): Pick<ReplyPayload, "to" | "cc" | "subject" | "in_reply_to" | "references"> {
  const last = thread.messages[thread.messages.length - 1];
  const isOurs = (m: GmailMessage) => m.fromEmail === myEmail || m.labelIds.includes("SENT");
  const lastExternal = [...thread.messages].reverse().find((m) => !isOurs(m));
  // Reply to the client; if only we have written so far (follow-up), write to whoever we wrote to.
  const to = lastExternal ? lastExternal.from : last.to;
  const toEmail = parseAddress(to).email;
  const others = lastExternal ? [lastExternal.to, lastExternal.cc] : [last.cc];
  const cc = [...new Set(
    others.join(",").split(",").map((s) => s.trim()).filter(Boolean)
      .filter((s) => {
        const e = parseAddress(s).email;
        return e && e !== myEmail && e !== toEmail;
      }),
  )].join(", ");
  return {
    to,
    cc,
    subject: thread.messages[0]?.subject || last.subject,
    in_reply_to: last.messageIdHeader,
    references: [last.references, last.messageIdHeader].filter(Boolean).join(" "),
  };
}

// ── Suggestions ───────────────────────────────────────────────────────────────

async function addSuggestion(s: {
  thread_id: string | null;
  sale_id?: string | null;
  kind: SuggestionKind;
  title: string;
  rationale?: string;
  payload: unknown;
  for_message_id?: string | null;
  source?: "inbox" | "chat";
}) {
  const { error } = await supabase.from("inbox_suggestions").insert({
    thread_id: s.thread_id,
    sale_id: s.sale_id ?? null,
    kind: s.kind,
    title: s.title,
    rationale: s.rationale ?? null,
    payload: s.payload,
    for_message_id: s.for_message_id ?? null,
    source: s.source ?? "inbox",
  });
  if (error) throw new Error(`addSuggestion: ${error.message}`);
}

export { addSuggestion };

function toFieldValue(field: SaleField, v: string | null): string | number | null {
  if (v === null || v.trim() === "") return null;
  if (field === "number_of_guests" || field.startsWith("children_")) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (field === "start_time" || field === "end_time") return v.slice(0, 5);
  return v.trim();
}

function sameValue(a: unknown, b: unknown): boolean {
  // Times come back from Postgres as HH:MM:SS; compare on HH:MM.
  const n = (x: unknown) =>
    x === null || x === undefined ? "" : String(x).trim().replace(/^(\d{2}:\d{2}):\d{2}$/, "$1").toLowerCase();
  return n(a) === n(b);
}

async function invoiceSuggestions(opts: {
  token: string;
  thread: GmailThread;
  threadRowId: string;
  filenames: string[];
  saleId: string | null;
}): Promise<number> {
  const wanted = new Set(opts.filenames.map((f) => f.trim().toLowerCase()));
  const atts = opts.thread.messages
    .flatMap((m) => m.attachments)
    .filter((a) => wanted.has(a.filename.trim().toLowerCase()))
    .filter((a) => /pdf|jpe?g|png|webp/.test(a.mimeType) && a.size < 10_000_000)
    .slice(0, 3);
  if (!atts.length) return 0;

  const { data: existing } = await supabase
    .from("inbox_suggestions")
    .select("payload")
    .eq("thread_id", opts.threadRowId)
    .eq("kind", "add_expense");
  const done = new Set((existing ?? []).map((e) => String((e.payload as AddExpensePayload).filename).toLowerCase()));
  const fornecedores = await getFornecedores();

  let n = 0;
  for (const a of atts) {
    if (done.has(a.filename.toLowerCase())) continue;
    const b64 = await getAttachment(opts.token, a.messageId, a.attachmentId);
    const mediaType = (a.mimeType.includes("pdf") ? "application/pdf"
      : a.mimeType.includes("png") ? "image/png"
      : a.mimeType.includes("webp") ? "image/webp" : "image/jpeg") as Parameters<typeof analyzeInvoice>[1];
    const data = await analyzeInvoice(b64, mediaType, fornecedores.map((f) => f.name));
    const ext = mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1];
    const blob = await put(`invoices/email-${Date.now()}.${ext}`, Buffer.from(b64, "base64"), { access: "public", contentType: mediaType });
    const sender = opts.thread.messages.find((m) => m.id === a.messageId)?.fromEmail ?? "";
    const forn = findFornecedor(fornecedores, data.supplier, sender);
    const total = Number(data.totalCost) || 0;
    const invDate = /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date : null;

    // Same invoice already registered?
    let duplicateOf: string | null = null;
    if (data.invoiceId?.trim()) {
      const { data: dup } = await supabase.from("transactions").select("id").eq("id_fatura", data.invoiceId.trim()).limit(1);
      duplicateOf = dup?.[0]?.id ?? null;
    }

    // Do it the way this supplier's invoices were done before.
    let hist: (Awaited<ReturnType<typeof supplierHistory>> & { byAmount?: boolean }) | null =
      forn ? await supplierHistory(forn.id, total, invDate, data.invoiceId ?? "") : null;
    let histForn = forn;
    if (!hist || !hist.count) {
      // Not known by name: a recurring charge of the same amount tells how it's registered.
      const rec = await recurringByAmount(total);
      if (rec?.fornecedorId) {
        histForn = fornecedores.find((f) => f.id === rec.fornecedorId) ?? null;
        if (histForn) hist = { ...(await supplierHistory(histForn.id, total, invDate, data.invoiceId ?? "")), byAmount: true };
      }
    }
    let attachTo: string | null = null;
    if (hist?.match) {
      if (hist.match.fatura_url) duplicateOf ??= hist.match.id;  // already registered with its invoice
      else attachTo = hist.match.id;                            // expense exists (bank), invoice missing
    }
    if (duplicateOf && !attachTo) continue; // nothing to do: this invoice is already in the app

    const historyNote = hist && hist.count && histForn
      ? `${hist.byAmount ? `Mesmo valor que as despesas recorrentes de ${histForn.name}` : `Como nas ${hist.count} despesas anteriores de ${histForn.name}`}: ${[hist.paymentMethod, hist.status === "Paid" ? "marcada como paga" : hist.status, hist.account ? `conta ${hist.account}` : null, hist.socio ? `despesa de sócio (${hist.socio})` : null].filter(Boolean).join(", ")}.${hist.last ? ` Última: ${hist.last.data ?? "?"}, ${Math.abs(Number(hist.last.valor ?? 0)).toFixed(2)} €.` : ""}`
      : forn ? `Primeira despesa de ${forn.name} com fatura.` : "Fornecedor novo — confirme o nome.";

    const payload: AddExpensePayload = {
      supplier: hist?.byAmount ? (forn?.name ?? data.supplier ?? hist.name ?? "") : (hist?.name ?? forn?.name ?? data.supplier ?? ""),
      fornecedor_id: forn?.id ?? null,
      date: invDate,
      invoice_id: data.invoiceId ?? "",
      tax_free: Number(data.taxFree) || 0,
      iva6: Number(data.iva6) || 0,
      iva13: Number(data.iva13) || 0,
      iva23: Number(data.iva23) || 0,
      total,
      file_url: blob.url,
      filename: a.filename,
      sale_id: opts.saleId,
      payment_method: hist?.paymentMethod ?? "Transferência Bancária COME",
      status: hist?.status ?? "Pending Payment",
      duplicate_of: duplicateOf,
      who_paid: hist?.whoPaid ?? "Company",
      conta_pagamento: hist?.account ?? "COME",
      socio_pessoal: hist?.socio ?? null,
      attach_to_transaction_id: attachTo,
      history_note: historyNote,
    };
    await addSuggestion({
      thread_id: opts.threadRowId,
      sale_id: opts.saleId,
      kind: "add_expense",
      title: attachTo
        ? `Anexar fatura à despesa existente: ${payload.supplier} — ${payload.total.toFixed(2)} €`
        : `Adicionar despesa: ${payload.supplier || a.filename} — ${payload.total.toFixed(2)} €`,
      // The history note is shown in the card itself (payload.history_note).
      rationale: attachTo ? "A despesa já existe (do banco/cartão) sem fatura — a fatura é anexada a essa despesa." : `Fatura anexada (${a.filename}).`,
      payload,
      for_message_id: a.messageId,
    });
    n++;
  }
  return n;
}

// ── Analyse one thread ────────────────────────────────────────────────────────

export type AnalyzeResult = { suggestions: number; status: string; tasks: number };

/**
 * Creates, updates or closes the team tasks a conversation calls for. Tasks are
 * internal (nothing leaves the company), so they are applied straight away; the
 * key ties a task to its conversation so later emails update the same task.
 */
async function syncAgentTasks(threadRowId: string, saleId: string | null, tasks: AgentTask[]): Promise<number> {
  if (!tasks.length) return 0;
  const { data: links } = await supabase.from("inbox_tasks").select("key, task_id").eq("thread_id", threadRowId);
  const byKey = new Map((links ?? []).map((l) => [l.key as string, l.task_id as string]));
  let n = 0;
  for (const t of tasks.slice(0, 6)) {
    const key = t.key.trim().toLowerCase().slice(0, 60);
    const owner = (TASK_OWNERS as readonly string[]).includes(t.owner) ? t.owner : "Manel";
    const due = /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null;
    const existingId = byKey.get(key);
    const { data: existing } = existingId
      ? await supabase.from("tasks").select("id, sale_id, status").eq("id", existingId).maybeSingle()
      : { data: null };
    try {
      if (existing) {
        if (t.done) {
          if (existing.status !== "Done") { await updateTaskStatus(existing.sale_id, existing.id, "Done", "Admin"); n++; }
        } else if (existing.status !== "Done") {
          await supabase.from("tasks").update({ name: t.name, task_description: t.description || null, due_date: due, role: owner }).eq("id", existing.id);
          n++;
        }
        await supabase.from("inbox_tasks").update({ updated_at: new Date().toISOString() }).eq("thread_id", threadRowId).eq("key", key);
      } else if (!t.done) {
        const id = await createSaleTask(saleId, { name: t.name, description: t.description, role: owner, priority: null, dueDate: due });
        await supabase.from("inbox_tasks").upsert({ thread_id: threadRowId, task_id: id, key, updated_at: new Date().toISOString() }, { onConflict: "thread_id,key" });
        n++;
      }
    } catch (e) {
      console.error("[inbox] task sync failed:", key, e);
    }
  }
  return n;
}

export async function analyzeThread(opts: {
  token: string;
  calendarToken: string | null;
  calendarId: string;
  myEmail: string;
  thread: GmailThread;
  threadRowId: string;
  notifications?: { autoArchive: boolean; labelName: string };
}): Promise<AnalyzeResult> {
  const { thread, myEmail } = opts;
  const last = thread.messages[thread.messages.length - 1];
  const senders = [...new Set(thread.messages.map((m) => m.fromEmail).filter((e) => e && e !== myEmail))];

  const [guide, services, cands] = await Promise.all([
    guidePrompt(),
    servicesForPrompt(),
    candidateSales(thread.id, senders, agencyRefs(thread.messages.map((m) => `${m.subject}\n${m.body.slice(0, 3000)}`).join("\n"))),
  ]);
  const related = cands.linked.length ? await relatedThreadsText(opts.token, cands.linked, thread.id, myEmail) : "";
  const extracted = await extract({ thread, myEmail, guide, services, cands, related });
  const lastFromUs = last.fromEmail === myEmail || last.labelIds.includes("SENT");
  // Our own message was the last one: nothing to answer, but the situation,
  // tasks and sale info still move on.
  const ex = lastFromUs ? { ...extracted, needs_reply: false, is_notification: false } : extracted;

  // Automatic notifications: archive the routine ones, highlight the important.
  if (opts.notifications?.autoArchive && ex.is_notification && !ex.invoice_attachments.length && !cands.linked.length) {
    const tasks = ex.important ? await syncAgentTasks(opts.threadRowId, null, ex.tasks) : 0;
    const status = await handleNotification({ token: opts.token, thread, threadRowId: opts.threadRowId, important: ex.important, summary: ex.summary, labelName: opts.notifications.labelName });
    return { suggestions: 0, status, tasks };
  }

  // Validate ids coming back from the model.
  const allSales = [...cands.linked, ...cands.clientSales];
  let sale: SaleRow | null = cands.linked[0] ?? null;
  if (ex.linked_sale_id) {
    sale = allSales.find((s) => s.id === ex.linked_sale_id) ?? null;
    if (!sale && cands.upcoming.some((s) => s.id === ex.linked_sale_id)) {
      const { data } = await supabase.from("sales").select(SALE_COLUMNS).eq("id", ex.linked_sale_id).maybeSingle();
      sale = (data as SaleRow | null) ?? null;
    }
  }
  const serviceIds = new Set(services.map((s) => s.id));
  const requests = ex.requests.map((r) => ({ ...r, service_id: r.service_id && serviceIds.has(r.service_id) ? r.service_id : null }));

  // Older pending suggestions for this thread no longer reflect the conversation.
  await supabase.from("inbox_suggestions").update({ status: "superseded" })
    .eq("thread_id", opts.threadRowId).eq("status", "pending").neq("kind", "add_expense");
  // Sale changes and new sales are proposed again below if still needed; a
  // reply only when the other side is waiting for us.

  let count = 0;

  // 1. Changes to the linked sale.
  if (sale) {
    const changes: SaleChange[] = [];
    for (const u of ex.sale_updates) {
      if (!(u.field in SALE_FIELDS)) continue;
      if (u.field === "service_id" && u.new_value && !serviceIds.has(u.new_value)) continue;
      const nv = toFieldValue(u.field, u.new_value);
      if (nv === null || sameValue(sale[u.field], nv)) continue;
      changes.push({ field: u.field, label: SALE_FIELDS[u.field], old: sale[u.field] ?? null, new: nv });
    }
    // Info the client shared that fills an empty field.
    for (const [k, v] of Object.entries(ex.booking_info) as [SaleField, string | null][]) {
      if (!v || !blank(sale[k]) || changes.some((c) => c.field === k)) continue;
      changes.push({ field: k, label: SALE_FIELDS[k], old: sale[k] ?? null, new: v });
    }
    if (changes.length) {
      const payload: UpdateSalePayload = { sale_id: sale.id, sale_label: saleLabel(sale), changes, gmail_thread_id: thread.id };
      await addSuggestion({
        thread_id: opts.threadRowId,
        sale_id: sale.id,
        kind: "update_sale",
        title: `Atualizar ${saleLabel(sale)}: ${changes.map((c) => c.label).join(", ")}`,
        rationale: ex.sale_updates.map((u) => u.reason).filter(Boolean).join(" "),
        payload,
        for_message_id: last.id,
      });
      count++;
    }
  }

  // 2. New sale(s) for a new booking request.
  let newBooking: CreateSalePayload | null = null;
  if (!sale && ex.new_booking) {
    // Bookings made on the website (Calendly) belong to the client "Website";
    // the person who booked goes in "Nomes" and gives the sale its ID.
    const fromWebsite = thread.messages.some((m) => /calendly\.com$/i.test(m.fromEmail.split("@")[1] ?? "") || /calendly/i.test(m.from));
    const websiteClient = fromWebsite
      ? ((await supabase.from("clients").select("id, name, email").ilike("name", "website").limit(1)).data?.[0] ?? null)
      : null;
    const client = websiteClient ?? cands.clients[0] ?? null;
    const toCreate = requests.filter((r) => r.service_id && r.date).slice(0, 8);
    // The booking's ID is the agency reference; one request with several
    // services becomes REF_1, REF_2, REF_3…
    const baseRef = agencyRefs(thread.messages.map((m) => `${m.subject}\n${m.body.slice(0, 3000)}`).join("\n"))[0] ?? "";
    for (const [i, r] of toCreate.entries()) {
      const svc = services.find((s) => s.id === r.service_id)!;
      // Without an agency code the ID is the guest's name, as on the website: "Lynn_Hamilton".
      const person = (websiteClient ? ex.client.name : null) || firstGuest(ex.booking_info.names) || ex.client.name || (websiteClient ? "" : client?.name) || "";
      const fallbackName = person.normalize("NFC").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_.-]/gu, "");
      const base = baseRef || fallbackName || `${svc.name.replace(/\s+/g, "_")}_${r.date}`;
      const saleCode = toCreate.length > 1 ? `${base}_${i + 1}` : base;
      const payload: CreateSalePayload = {
        service_id: svc.id,
        service_name: svc.name,
        date: r.date!,
        start_time: r.start_time,
        guests: r.guests ?? 0,
        children_10_18: r.children_10_18,
        children_3_9: r.children_3_9,
        children_0_2: r.children_0_2,
        transport_vehicle: r.transport_vehicle,
        client_id: client?.id ?? null,
        client_name: client?.name ?? ex.client.name ?? senders[0] ?? "",
        client_email: websiteClient ? (ex.client.email ?? "") : (client?.email ?? ex.client.email ?? senders[0] ?? ""),
        phone_number: ex.booking_info.phone_number ?? ex.client.phone ?? "",
        names: ex.booking_info.names ?? (websiteClient ? ex.client.name ?? "" : ""),
        dietary_restrictions: ex.booking_info.dietary_restrictions ?? "",
        mobility_restrictions: ex.booking_info.mobility_restrictions ?? "",
        emergency_contact: ex.booking_info.emergency_contact ?? "",
        meeting_point: ex.booking_info.meeting_point ?? "",
        notes: ex.booking_info.notes ?? "",
        status: "Pending",
        gmail_thread_id: thread.id,
        sale_code: saleCode,
      };
      newBooking ??= payload;
      await addSuggestion({
        thread_id: opts.threadRowId,
        kind: "create_sale",
        title: `Nova venda ${saleCode}: ${svc.name} · ${r.date} · ${r.guests ?? "?"} pax · ${payload.client_name}`,
        rationale: ex.summary,
        payload,
        for_message_id: last.id,
      });
      count++;
    }
  }

  // 3. Expenses from attached invoices.
  if (ex.invoice_attachments.length) {
    try {
      count += await invoiceSuggestions({ token: opts.token, thread, threadRowId: opts.threadRowId, filenames: ex.invoice_attachments, saleId: sale?.id ?? null });
    } catch (e) {
      console.error("[inbox] invoice scan failed:", e);
    }
  }

  // 4. Reply draft with prices, availability and missing info.
  if (ex.needs_reply) {
    const serviceForAvail = requests[0]?.service_id ?? sale?.service_id ?? null;
    const dates = [...new Set(requests.flatMap((r) => [r.date, ...r.alternative_dates]).filter((d): d is string => !!d))].slice(0, 8);
    const availability = dates.length
      ? await getAvailability({
          dates, serviceId: serviceForAvail, calendarToken: opts.calendarToken, calendarId: opts.calendarId,
          // The booking this email is about doesn't make its own date "unavailable".
          excludeSaleIds: [...new Set([sale?.id, ...cands.linked.map((s) => s.id)].filter((x): x is string => !!x))],
        })
      : { days: [], calendarChecked: false };
    const prices = await priceLines(
      requests
        .filter((r) => r.service_id && (r.guests ?? sale?.number_of_guests))
        .map((r) => ({
          serviceId: r.service_id!,
          guests: r.guests ?? sale?.number_of_guests ?? 0,
          date: r.date,
          children: { children1018: r.children_10_18, children39: r.children_3_9, children02: r.children_0_2 },
          transportVehicle: r.transport_vehicle,
        })),
    );
    const missingInfo = sale ? missingClientInfo(sale) : newBooking ? missingClientInfo({ ...newBooking, number_of_guests: newBooking.guests }) : [];
    const draft = await draftReply({
      thread, myEmail, guide,
      summary: ex.summary,
      language: ex.language,
      sale,
      newBooking,
      availability: availability.days,
      calendarChecked: availability.calendarChecked,
      prices,
      missingInfo,
      openQuestions: ex.open_questions,
      related,
      sameBookingNote: [sale, ...cands.linked].filter((x, i, a): x is SaleRow => !!x && a.findIndex((y) => y?.id === x.id) === i).map(saleIdLine).join("\n") || undefined,
    });
    const payload: ReplyPayload = {
      gmail_thread_id: thread.id,
      ...replyEnvelope(thread, myEmail),
      body_html: withPriceTable(draft.body_html, prices, ex.language),
      language: ex.language,
      price_summary: priceLinesText(prices),
      missing_info: draft.missing_info_requested,
      warnings: draft.warnings,
      internal_note: [draft.internal_note, availability.days.map((d) => `${d.date}: ${d.available ? "disponível" : "indisponível"}${d.reasons.length ? ` (${d.reasons.join("; ")})` : ""}`).join(" · ")].filter(Boolean).join("\n"),
    };
    await addSuggestion({
      thread_id: opts.threadRowId,
      sale_id: sale?.id ?? null,
      kind: "reply",
      title: `Responder: ${payload.subject}`,
      rationale: ex.summary,
      payload,
      for_message_id: last.id,
    });
    count++;
  }

  // New emails about an existing service go to that service's "Emails" section.
  if (sale) {
    try {
      await linkThreadToSale(sale.id, thread.id);
    } catch (e) {
      console.error("[inbox] link thread to sale failed:", e);
    }
  }

  // 5. Team tasks (created/updated straight away — internal only).
  const tasks = await syncAgentTasks(opts.threadRowId, sale?.id ?? null, ex.tasks);

  const status = count > 0 ? "awaiting_approval" : ex.needs_reply ? "needs_reply" : lastFromUs ? "replied" : "no_reply";
  await supabase.from("inbox_threads").update({
    category: ex.category,
    summary: ex.summary,
    language: ex.language,
    sale_id: sale?.id ?? null,
    client_id: sale?.client_id ?? cands.clients[0]?.id ?? null,
    analysis: ex,
    situation: ex.situation,
    last_from_us: lastFromUs,
    analyzed_message_id: last.id,
    analyzed_at: new Date().toISOString(),
    status,
    error: null,
    error_message_id: null,
    error_attempts: 0,
    updated_at: new Date().toISOString(),
  }).eq("id", opts.threadRowId);

  return { suggestions: count, status, tasks };
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export type SyncResult = { checked: number; analyzed: number; suggestions: number; tasks: number; archived: number; followups: number; errors: string[]; remaining: number };

async function upsertThreadRow(thread: GmailThread, myEmail: string): Promise<{ id: string; analyzed_message_id: string | null; status: string; sale_id: string | null }> {
  const first = thread.messages[0];
  const last = thread.messages[thread.messages.length - 1];
  const lastExternal = [...thread.messages].reverse().find((m) => m.fromEmail !== myEmail) ?? first;
  const lastFromUs = last.fromEmail === myEmail || last.labelIds.includes("SENT");
  const base = {
    gmail_thread_id: thread.id,
    subject: first.subject || last.subject,
    from_name: lastExternal.fromName,
    from_email: lastExternal.fromEmail,
    snippet: last.snippet,
    last_message_id: last.id,
    last_message_at: new Date(last.date || Date.now()).toISOString(),
    last_from_us: lastFromUs,
    message_count: thread.messages.length,
    unread: thread.messages.some((m) => m.labelIds.includes("UNREAD")),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("inbox_threads")
    .upsert(base, { onConflict: "gmail_thread_id" })
    .select("id, analyzed_message_id, status, sale_id")
    .single();
  if (error) throw new Error(`upsertThreadRow: ${error.message}`);
  return data as { id: string; analyzed_message_id: string | null; status: string; sale_id: string | null };
}

// ── Automatic notifications ──────────────────────────────────────────────────

/** Senders that only ever send system notifications — handled without AI. */
const NOTIFICATION_SENDERS = /(@|\.)(vercel\.com|github\.com|githubusercontent\.com)$/i;
/** Words that make a notification worth a look. */
const IMPORTANT_WORDS = /\b(fail(ed|ure)?|error|erro|falh(ou|a)|crash|security|segurança|vulnerab\w*|alert|incident|outage|down|suspend\w*|billing|payment|pagamento|overdue|quota|limit|exceeded|expir\w*|action required)\b/i;

export function ruleNotification(thread: GmailThread): { important: boolean } | null {
  const last = thread.messages[thread.messages.length - 1];
  if (!thread.messages.every((m) => NOTIFICATION_SENDERS.test(m.fromEmail))) return null;
  return { important: IMPORTANT_WORDS.test(`${last.subject} ${last.snippet}`) };
}

/**
 * Routine notifications are read and moved to the notifications label; the
 * important ones stay in the inbox, starred, and are flagged in the app.
 */
async function handleNotification(opts: { token: string; thread: GmailThread; threadRowId: string; important: boolean; summary: string; labelName: string }): Promise<string> {
  if (opts.important) {
    await highlightThread(opts.token, opts.thread.id);
  } else {
    const labelId = await ensureLabel(opts.token, opts.labelName);
    await archiveThread(opts.token, opts.thread.id, labelId);
  }
  const status = opts.important ? "attention" : "done";
  const last = opts.thread.messages[opts.thread.messages.length - 1];
  await supabase.from("inbox_suggestions").update({ status: "superseded" }).eq("thread_id", opts.threadRowId).eq("status", "pending");
  await supabase.from("inbox_threads").update({
    category: "notification",
    summary: opts.summary,
    status,
    analyzed_message_id: last.id,
    analyzed_at: new Date().toISOString(),
    error: null, error_message_id: null, error_attempts: 0,
    updated_at: new Date().toISOString(),
  }).eq("id", opts.threadRowId);
  return status;
}

/** One readable line for an error (API errors arrive as long JSON). */
function shortError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = /"message"\s*:\s*"([^"]+)"/.exec(raw);
  return (m ? m[1] : raw).slice(0, 200);
}

/** Pull recent inbox threads, analyse new messages, propose follow-ups for missing info. */
export async function syncInbox(opts: { userId: string; maxAnalyses?: number; threadIds?: string[] }): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, analyzed: 0, suggestions: 0, tasks: 0, archived: 0, followups: 0, errors: [], remaining: 0 };
  const tok = await getGoogleToken(opts.userId, [GMAIL_SCOPE]);
  if (tok.status !== "ok") throw new Error(tok.status === "no_scope" ? "Falta autorizar o Gmail." : "Sem ligação ao Google.");
  const cal = tok.scopes.includes(CALENDAR_SCOPE) ? tok.token : null;
  const { data: settings } = await supabase.from("inbox_settings").select("*").eq("id", 1).maybeSingle();
  const query = (settings?.gmail_query as string) || "in:inbox newer_than:30d";
  const calendarId = (settings?.calendar_id as string) || "primary";
  const notifications = {
    autoArchive: settings?.auto_archive_notifications !== false,
    labelName: (settings?.notifications_label as string) || "Notificações",
  };
  const profile = await getProfile(tok.token);
  const myEmail = profile.email;
  const max = opts.maxAnalyses ?? 5;

  // Which threads to look at: only what changed since the last run (Gmail
  // history — one cheap call), plus earlier ones still waiting for analysis.
  // A full listing only on the first run or when the history is too old.
  let ids: string[];
  let fullScan = false;
  if (opts.threadIds) {
    ids = opts.threadIds.map(toApiThreadId);
  } else {
    const since = settings?.last_history_id as string | null;
    const changed = since ? await listChangedThreadIds(tok.token, since) : null;
    if (changed === null) {
      ids = await listThreadIds(tok.token, query, 40);
      fullScan = true;
    } else {
      const { data: waiting } = await supabase
        .from("inbox_threads")
        .select("gmail_thread_id, analyzed_message_id, last_message_id, error_attempts, situation")
        .in("status", ["needs_reply", "awaiting_approval", "replied"])
        // Rows registered without opening the thread have no date yet.
        .or(`last_message_at.gte.${new Date(Date.now() - 30 * 86400_000).toISOString()},last_message_at.is.null`)
        .order("last_message_at", { ascending: false })
        .limit(100);
      const backlog = (waiting ?? [])
        // Not yet analysed, or analysed before the "ponto de situação" existed.
        .filter((w) => (w.analyzed_message_id !== w.last_message_id || !w.situation) && (w.error_attempts ?? 0) < 3)
        .map((w) => w.gmail_thread_id as string);
      ids = [...new Set([...changed, ...backlog])];
    }
  }

  // Unread in Gmail = pending in the app: one listing keeps the flag in step
  // (also when someone reads or marks unread directly in Gmail).
  if (!opts.threadIds) {
    try {
      const unreadIds = await listThreadIds(tok.token, "in:inbox is:unread -category:promotions -category:social", 100);
      const { data: flagged } = await supabase.from("inbox_threads").select("gmail_thread_id").eq("unread", true);
      const nowRead = (flagged ?? []).map((r) => r.gmail_thread_id as string).filter((g) => !unreadIds.includes(g));
      if (nowRead.length) await supabase.from("inbox_threads").update({ unread: false }).in("gmail_thread_id", nowRead);
      if (unreadIds.length) {
        await supabase.from("inbox_threads").update({ unread: true }).in("gmail_thread_id", unreadIds);
        // Unread conversations the app doesn't know yet are read now.
        const { data: known } = await supabase.from("inbox_threads").select("gmail_thread_id").in("gmail_thread_id", unreadIds);
        const knownSet = new Set((known ?? []).map((k) => k.gmail_thread_id as string));
        ids = [...new Set([...ids, ...unreadIds.filter((u) => !knownSet.has(u))])];
      }
    } catch (e) {
      if (isRateLimit(e)) throw e;
      console.error("[inbox] unread listing failed:", e);
    }
  }

  let rateLimited = false;
  for (const id of ids) {
    result.checked++;
    try {
      const { data: row } = await supabase.from("inbox_threads").select("id, analyzed_message_id, last_message_id, status, error_message_id, error_attempts, situation").eq("gmail_thread_id", id).maybeSingle();
      let lastMessageId: string | null = null;
      if (!opts.threadIds) {
        const meta = await getThreadMeta(tok.token, id);
        lastMessageId = meta.lastMessageId;
        // From the history: only inbox conversations, not promotions/social.
        if (!fullScan && (!meta.labelIds.includes("INBOX") || meta.labelIds.some((l) => l === "CATEGORY_PROMOTIONS" || l === "CATEGORY_SOCIAL"))) continue;
        if (row) {
          if ((row.analyzed_message_id === meta.lastMessageId && row.situation) || (row.last_message_id === meta.lastMessageId && row.status === "done")) continue;
          // Same message failed 3 times: wait for a new message or a manual "Reanalisar".
          if (row.error_message_id === meta.lastMessageId && (row.error_attempts ?? 0) >= 3) continue;
        }
      }
      // Over this run's limit: remember the conversation (so the next run picks
      // it up) without opening it — keeps well under Gmail's per-minute limit.
      if (result.analyzed >= max) {
        if (!row) await supabase.from("inbox_threads").upsert({ gmail_thread_id: id, status: "needs_reply", last_message_id: lastMessageId }, { onConflict: "gmail_thread_id", ignoreDuplicates: true });
        result.remaining++;
        continue;
      }
      const thread = await getThread(tok.token, id);
      if (!thread.messages.length) continue;
      const saved = await upsertThreadRow(thread, myEmail);
      const last = thread.messages[thread.messages.length - 1];
      // Not linked to a sale yet? Find it by the agency reference in the email.
      if (!saved.sale_id) {
        try {
          await autoLinkBySaleRef(saved.id, thread.id, thread.messages.map((m) => `${m.subject}\n${m.body.slice(0, 3000)}`).join("\n"));
        } catch (e) {
          console.error("[inbox] auto-link by reference failed:", e);
        }
      }
      const ourLast = last.fromEmail === myEmail || last.labelIds.includes("SENT");
      if (ourLast) {
        // We answered (in Gmail or from the app): the pending reply is no longer needed.
        await supabase.from("inbox_suggestions").update({ status: "superseded" }).eq("thread_id", saved.id).eq("status", "pending").eq("kind", "reply");
        await supabase.from("inbox_threads").update({ status: "replied", last_from_us: true }).eq("id", saved.id);
      }
      // Known system senders (Vercel, GitHub): no AI needed.
      const rule = notifications.autoArchive && !ourLast ? ruleNotification(thread) : null;
      if (rule) {
        await handleNotification({ token: tok.token, thread, threadRowId: saved.id, important: rule.important, summary: last.subject, labelName: notifications.labelName });
        result.archived += rule.important ? 0 : 1;
        continue;
      }
      const r = await analyzeThread({ token: tok.token, calendarToken: cal, calendarId, myEmail, thread, threadRowId: saved.id, notifications });
      if (r.status === "done") result.archived++;
      result.analyzed++;
      result.suggestions += r.suggestions;
      result.tasks += r.tasks;
    } catch (e) {
      if (isRateLimit(e)) {
        // Stop here; the next run (2 minutes) carries on from the same point.
        rateLimited = true;
        result.errors.push(`gmail: ${shortError(e)}`);
        break;
      }
      const msg = shortError(e);
      result.errors.push(`${id}: ${msg}`);
      const { data: cur } = await supabase.from("inbox_threads").select("last_message_id, error_message_id, error_attempts").eq("gmail_thread_id", id).maybeSingle();
      const same = cur && cur.error_message_id === cur.last_message_id;
      await supabase.from("inbox_threads").update({
        error: msg.slice(0, 500),
        error_message_id: cur?.last_message_id ?? null,
        error_attempts: same ? (cur!.error_attempts ?? 0) + 1 : 1,
      }).eq("gmail_thread_id", id);
    }
  }

  if (!opts.threadIds) {
    try {
      result.followups = await proposeMissingInfoFollowups({ token: tok.token, myEmail, limit: 3 });
    } catch (e) {
      result.errors.push(`follow-ups: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await supabase.from("inbox_settings").update({
    // Next run reads only what changed after this point (not after a cut-short run).
    ...(!opts.threadIds && !rateLimited ? { last_history_id: profile.historyId } : {}),
    last_synced_at: new Date().toISOString(),
    last_sync_error: result.errors.length
      ? `${result.errors.length} conversa(s) com erro: ${[...new Set(result.errors.map((e) => e.replace(/^[^:]+: /, "")))].slice(0, 2).join(" | ")}`
      : null,
    owner_email: myEmail,
  }).eq("id", 1);
  return result;
}

/**
 * Upcoming services (next 21 days) that still miss client info and have an
 * email thread: propose a follow-up email asking for it (once every 3 days).
 */
export async function proposeMissingInfoFollowups(opts: { token: string; myEmail: string; limit: number }): Promise<number> {
  const { data: sales } = await supabase
    .from("sales")
    .select(SALE_COLUMNS)
    .gte("date", today())
    .lte("date", addDays(today(), 21))
    .in("status", ["Confirmed", "Paid"])
    .not("thread_ids", "is", null)
    .order("date");
  let n = 0;
  const guide = await guidePrompt();
  for (const sale of (sales ?? []) as SaleRow[]) {
    if (n >= opts.limit) break;
    const missing = missingClientInfo(sale);
    if (!missing.length) continue;
    const threadIds = String(sale.thread_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!threadIds.length) continue;
    const { data: recent } = await supabase
      .from("inbox_suggestions")
      .select("id")
      .eq("sale_id", sale.id)
      .eq("kind", "reply")
      .gte("created_at", new Date(Date.now() - 3 * 86400_000).toISOString())
      .limit(1);
    if (recent?.length) continue;

    const apiId = toApiThreadId(threadIds[threadIds.length - 1]);
    let thread: GmailThread;
    try {
      thread = await getThread(opts.token, apiId);
    } catch {
      continue;
    }
    if (!thread.messages.length) continue;
    const row = await upsertThreadRow(thread, opts.myEmail);
    await supabase.from("inbox_threads").update({ sale_id: sale.id }).eq("id", row.id);
    const { count: pending } = await supabase.from("inbox_suggestions").select("id", { count: "exact", head: true }).eq("thread_id", row.id).eq("status", "pending");
    if (pending) continue;

    const lang = /[ãçõéêáí]|obrigad|bom dia|olá/i.test(thread.messages.map((m: GmailMessage) => m.body).join(" ").slice(0, 3000)) ? "pt" : "en";
    const draft = await draftReply({
      thread, myEmail: opts.myEmail, guide,
      summary: `Serviço ${saleLabel(sale)} confirmado; falta informação do cliente.`,
      language: lang,
      sale,
      newBooking: null,
      availability: [],
      calendarChecked: true,
      prices: [],
      missingInfo: missing,
      openQuestions: [],
      purpose: `Pedir ao cliente, de forma simpática e curta, a informação em falta para o serviço de ${sale.date}: ${missing.join(", ")}. Não repetir perguntas já respondidas na conversa.`,
    });
    const payload: ReplyPayload = {
      gmail_thread_id: thread.id,
      ...replyEnvelope(thread, opts.myEmail),
      body_html: withPriceTable(draft.body_html, [], lang),
      language: lang,
      price_summary: "",
      missing_info: draft.missing_info_requested.length ? draft.missing_info_requested : missing,
      warnings: draft.warnings,
      internal_note: draft.internal_note,
    };
    await addSuggestion({
      thread_id: row.id,
      sale_id: sale.id,
      kind: "reply",
      title: `Pedir informação em falta: ${saleLabel(sale)}`,
      rationale: `Em falta: ${missing.join(", ")}`,
      payload,
      for_message_id: thread.messages[thread.messages.length - 1].id,
    });
    await supabase.from("inbox_threads").update({ status: "awaiting_approval" }).eq("id", row.id);
    n++;
  }
  return n;
}

