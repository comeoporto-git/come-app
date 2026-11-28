import { put } from "@vercel/blob";
import { supabase, getFornecedores } from "@/lib/notion";
import { structured, obj, arr, str, int, bool, nullable } from "@/lib/claude";
import { guidePrompt } from "@/lib/companyGuide";
import { getAvailability, type DayAvailability } from "@/lib/availability";
import { priceLines, priceTableHtml, priceLinesText, type PricedLine } from "@/lib/priceTable";
import { analyzeInvoice } from "@/actions/invoice";
import {
  getMyEmail, listThreadIds, getThreadMeta, getThread, getAttachment, toApiThreadId, parseAddress,
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
};

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
async function candidateSales(apiThreadId: string, senderEmails: string[]) {
  const addon = toAddonThreadId(apiThreadId);
  const [{ data: byThread }, { data: clients }] = await Promise.all([
    supabase.from("sales").select(SALE_COLUMNS).or(`thread_ids.ilike.%${addon}%,thread_ids.ilike.%${apiThreadId}%`),
    senderEmails.length
      ? supabase.from("clients").select("id, name, email").in("email", senderEmails)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
  ]);
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
    linked: (byThread ?? []) as SaleRow[],
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
};

const EXTRACTION_SCHEMA = obj({
  category: { type: "string", enum: ["booking_request", "booking_change", "question", "invoice", "supplier", "internal", "other"] },
  summary: str,
  language: { type: "string", enum: ["pt", "en", "fr", "es", "other"] },
  needs_reply: bool,
  linked_sale_id: nullable(str),
  new_booking: bool,
  client: obj({ name: nullable(str), email: nullable(str), phone: nullable(str) }),
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
    names: nullable(str),
    phone_number: nullable(str),
    dietary_restrictions: nullable(str),
    mobility_restrictions: nullable(str),
    emergency_contact: nullable(str),
    meeting_point: nullable(str),
    notes: nullable(str),
  }),
  invoice_attachments: arr(str),
  open_questions: arr(str),
});

async function extract(opts: {
  thread: GmailThread;
  myEmail: string;
  guide: string;
  services: Awaited<ReturnType<typeof servicesForPrompt>>;
  cands: Awaited<ReturnType<typeof candidateSales>>;
}): Promise<Extraction> {
  const { cands } = opts;
  const linkedIds = new Set(cands.linked.map((s) => s.id));
  const clientSales = cands.clientSales.filter((s) => !linkedIds.has(s.id));
  return structured<Extraction>({
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
- invoice_attachments: nomes exatos dos ficheiros anexos que são faturas/recibos que a COME tem de pagar ou registar como despesa (de fornecedores, restaurantes, transportes…). Não incluas faturas emitidas pela COME a clientes.
- needs_reply: true se a última mensagem é de alguém externo e espera resposta nossa. false para newsletters, notificações automáticas, faturas sem pergunta, ou se a última mensagem é nossa.
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
${threadForPrompt(opts.thread, opts.myEmail)}`,
    schema: EXTRACTION_SCHEMA,
  });
}

// ── Pass 2: draft the reply ───────────────────────────────────────────────────

type Draft = { body_html: string; missing_info_requested: string[]; internal_note: string };

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
- Preços: NUNCA escrevas valores tu próprio. Se há linhas de preço abaixo, coloca o marcador {{TABELA_PRECOS}} exatamente uma vez, num parágrafo próprio, onde a tabela com o preço proposto deve aparecer. Se não há preços calculados para o serviço pedido (serviço à medida/sem tabela), diz que enviamos uma proposta personalizada em breve, ou pede o que falta para orçamentar (nº de pessoas, data).
- Disponibilidade: usa apenas a verificação abaixo. Se uma data não está disponível, propõe as alternativas disponíveis. Se o Bernardo está fora mas há outros guias livres, a data ESTÁ disponível (não mencionar o Bernardo ao cliente).${opts.calendarChecked ? "" : " (Atenção: o calendário Google não foi verificado — não confirmes datas de forma definitiva.)"}
- Informação em falta: se a reserva está confirmada ou a ser confirmada, pede de forma simpática e agrupada a informação em falta listada abaixo. Em missing_info_requested lista o que pediste.
- Responde às perguntas em aberto do cliente com a informação dos serviços e do guia; se não souberes, diz que confirmamos em breve (não inventes).
- Nunca incluas resumos internos da app (blocos tipo "ID: … Status: Pending Client: … Type: …"), estados internos, notas para a equipa ou nomes de campos. Para resumir uma reserva usa uma frase: data, nº de pessoas, serviço e horário.
- internal_note: nota curta em português para o administrador (o que verificar antes de enviar). Pode ser "".

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
${threadForPrompt(opts.thread, opts.myEmail)}`,
    schema: obj({ body_html: str, missing_info_requested: arr(str), internal_note: str }),
  });
}

/** Swap {{TABELA_PRECOS}} for the computed table (or append it when the AI forgot). */
export function withPriceTable(html: string, prices: PricedLine[], language: string): string {
  const table = priceTableHtml(prices, language === "pt" ? "pt" : "en");
  if (!table) return html.replace(/<p>\s*\{\{TABELA_PRECOS\}\}\s*<\/p>/g, "").replace(/\{\{TABELA_PRECOS\}\}/g, "");
  if (html.includes("{{TABELA_PRECOS}}")) {
    return html.replace(/<p>\s*\{\{TABELA_PRECOS\}\}\s*<\/p>/, table).replace(/\{\{TABELA_PRECOS\}\}/, table).replace(/\{\{TABELA_PRECOS\}\}/g, "");
  }
  return `${html}\n${table}`;
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
    const forn = fornecedores.find((f) => f.name.trim().toLowerCase() === (data.supplier ?? "").trim().toLowerCase()) ?? null;

    // Same invoice already registered?
    let duplicateOf: string | null = null;
    if (data.invoiceId?.trim()) {
      const { data: dup } = await supabase.from("transactions").select("id").eq("id_fatura", data.invoiceId.trim()).limit(1);
      duplicateOf = dup?.[0]?.id ?? null;
    }

    const payload: AddExpensePayload = {
      supplier: forn?.name ?? data.supplier ?? "",
      fornecedor_id: forn?.id ?? null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date : null,
      invoice_id: data.invoiceId ?? "",
      tax_free: Number(data.taxFree) || 0,
      iva6: Number(data.iva6) || 0,
      iva13: Number(data.iva13) || 0,
      iva23: Number(data.iva23) || 0,
      total: Number(data.totalCost) || 0,
      file_url: blob.url,
      filename: a.filename,
      sale_id: opts.saleId,
      payment_method: "Transferência Bancária COME",
      status: "Pending Payment",
      duplicate_of: duplicateOf,
    };
    await addSuggestion({
      thread_id: opts.threadRowId,
      sale_id: opts.saleId,
      kind: "add_expense",
      title: `Adicionar despesa: ${payload.supplier || a.filename} — ${payload.total.toFixed(2)} €`,
      rationale: duplicateOf ? "Atenção: já existe uma despesa com o mesmo nº de fatura." : `Fatura anexada (${a.filename}).`,
      payload,
      for_message_id: a.messageId,
    });
    n++;
  }
  return n;
}

// ── Analyse one thread ────────────────────────────────────────────────────────

export type AnalyzeResult = { suggestions: number; status: string };

export async function analyzeThread(opts: {
  token: string;
  calendarToken: string | null;
  calendarId: string;
  myEmail: string;
  thread: GmailThread;
  threadRowId: string;
}): Promise<AnalyzeResult> {
  const { thread, myEmail } = opts;
  const last = thread.messages[thread.messages.length - 1];
  const senders = [...new Set(thread.messages.map((m) => m.fromEmail).filter((e) => e && e !== myEmail))];

  const [guide, services, cands] = await Promise.all([
    guidePrompt(),
    servicesForPrompt(),
    candidateSales(thread.id, senders),
  ]);
  const ex = await extract({ thread, myEmail, guide, services, cands });

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
    const client = cands.clients[0] ?? null;
    for (const r of requests.filter((r) => r.service_id && r.date).slice(0, 3)) {
      const svc = services.find((s) => s.id === r.service_id)!;
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
        client_email: client?.email ?? ex.client.email ?? senders[0] ?? "",
        phone_number: ex.booking_info.phone_number ?? ex.client.phone ?? "",
        names: ex.booking_info.names ?? "",
        dietary_restrictions: ex.booking_info.dietary_restrictions ?? "",
        mobility_restrictions: ex.booking_info.mobility_restrictions ?? "",
        emergency_contact: ex.booking_info.emergency_contact ?? "",
        meeting_point: ex.booking_info.meeting_point ?? "",
        notes: ex.booking_info.notes ?? "",
        status: "Pending",
        gmail_thread_id: thread.id,
      };
      newBooking ??= payload;
      await addSuggestion({
        thread_id: opts.threadRowId,
        kind: "create_sale",
        title: `Nova venda: ${svc.name} · ${r.date} · ${r.guests ?? "?"} pax · ${payload.client_name}`,
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
      ? await getAvailability({ dates, serviceId: serviceForAvail, calendarToken: opts.calendarToken, calendarId: opts.calendarId })
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
    });
    const payload: ReplyPayload = {
      gmail_thread_id: thread.id,
      ...replyEnvelope(thread, myEmail),
      body_html: withPriceTable(draft.body_html, prices, ex.language),
      language: ex.language,
      price_summary: priceLinesText(prices),
      missing_info: draft.missing_info_requested,
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

  const status = count > 0 ? "awaiting_approval" : ex.needs_reply ? "needs_reply" : "no_reply";
  await supabase.from("inbox_threads").update({
    category: ex.category,
    summary: ex.summary,
    language: ex.language,
    sale_id: sale?.id ?? null,
    client_id: sale?.client_id ?? cands.clients[0]?.id ?? null,
    analysis: ex,
    analyzed_message_id: last.id,
    analyzed_at: new Date().toISOString(),
    status,
    error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", opts.threadRowId);

  return { suggestions: count, status };
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export type SyncResult = { checked: number; analyzed: number; suggestions: number; followups: number; errors: string[] };

async function upsertThreadRow(thread: GmailThread, myEmail: string): Promise<{ id: string; analyzed_message_id: string | null; status: string }> {
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
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("inbox_threads")
    .upsert(base, { onConflict: "gmail_thread_id" })
    .select("id, analyzed_message_id, status")
    .single();
  if (error) throw new Error(`upsertThreadRow: ${error.message}`);
  return data as { id: string; analyzed_message_id: string | null; status: string };
}

/** Pull recent inbox threads, analyse new messages, propose follow-ups for missing info. */
export async function syncInbox(opts: { userId: string; maxAnalyses?: number; threadIds?: string[] }): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, analyzed: 0, suggestions: 0, followups: 0, errors: [] };
  const tok = await getGoogleToken(opts.userId, [GMAIL_SCOPE]);
  if (tok.status !== "ok") throw new Error(tok.status === "no_scope" ? "Falta autorizar o Gmail." : "Sem ligação ao Google.");
  const cal = tok.scopes.includes(CALENDAR_SCOPE) ? tok.token : null;
  const { data: settings } = await supabase.from("inbox_settings").select("*").eq("id", 1).maybeSingle();
  const query = (settings?.gmail_query as string) || "in:inbox newer_than:30d";
  const calendarId = (settings?.calendar_id as string) || "primary";
  const myEmail = await getMyEmail(tok.token);
  const max = opts.maxAnalyses ?? 5;

  const ids = opts.threadIds?.map(toApiThreadId) ?? (await listThreadIds(tok.token, query, 40));
  for (const id of ids) {
    result.checked++;
    try {
      const { data: row } = await supabase.from("inbox_threads").select("id, analyzed_message_id, last_message_id, status").eq("gmail_thread_id", id).maybeSingle();
      if (!opts.threadIds && row) {
        const meta = await getThreadMeta(tok.token, id);
        if (row.analyzed_message_id === meta.lastMessageId || (row.last_message_id === meta.lastMessageId && row.status === "done")) continue;
      }
      const thread = await getThread(tok.token, id);
      if (!thread.messages.length) continue;
      const saved = await upsertThreadRow(thread, myEmail);
      const last = thread.messages[thread.messages.length - 1];
      if (last.fromEmail === myEmail || last.labelIds.includes("SENT")) {
        // We already answered (in Gmail or from the app).
        await supabase.from("inbox_suggestions").update({ status: "superseded" }).eq("thread_id", saved.id).eq("status", "pending").eq("kind", "reply");
        const { count: pending } = await supabase.from("inbox_suggestions").select("id", { count: "exact", head: true }).eq("thread_id", saved.id).eq("status", "pending");
        await supabase.from("inbox_threads").update({ status: pending ? "awaiting_approval" : "replied", analyzed_message_id: last.id }).eq("id", saved.id);
        continue;
      }
      if (result.analyzed >= max) continue;
      const r = await analyzeThread({ token: tok.token, calendarToken: cal, calendarId, myEmail, thread, threadRowId: saved.id });
      result.analyzed++;
      result.suggestions += r.suggestions;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${id}: ${msg}`);
      await supabase.from("inbox_threads").update({ error: msg.slice(0, 500) }).eq("gmail_thread_id", id);
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
    last_synced_at: new Date().toISOString(),
    last_sync_error: result.errors.length ? result.errors.slice(0, 5).join("\n") : null,
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

