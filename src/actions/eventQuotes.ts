"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { QUOTE_STATUSES, type QuoteLine } from "@/lib/eventQuotes";
import {
  createEventService,
  createQuote,
  deleteQuote,
  deleteSupplierItem,
  getQuote,
  getSaleQuoteDefaults,
  saveQuote,
  upsertSupplierItem,
  type QuoteHeaderInput,
  type SupplierItemInput,
} from "@/lib/eventQuotesData";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "Admin") throw new Error("Forbidden: apenas Admin");
  return session;
}

function fail(e: unknown): { error: string } {
  return { error: e instanceof Error ? e.message : String(e) };
}

function revalidateQuotes(id?: string, saleId?: string | null) {
  revalidatePath("/admin/orcamentos");
  if (id) revalidatePath(`/admin/orcamentos/${id}`);
  if (saleId) revalidatePath(`/guide/tours/${saleId}`);
}

function cleanLines(lines: QuoteLine[]): QuoteLine[] {
  return lines
    .filter((l) => l.description.trim())
    .map((l) => ({
      category: l.category || "Outros",
      description: l.description.trim(),
      supplierItemId: l.supplierItemId || null,
      fornecedorId: l.fornecedorId || null,
      qtyMode: l.qtyMode === "fixed" ? "fixed" : "per_pax",
      quantity: Math.max(0, Number(l.quantity) || 0),
      unitCost: Math.max(0, Number(l.unitCost) || 0),
      vatRate: Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : 0.23,
      notes: l.notes?.trim() || null,
      course: l.course?.trim() || null,
    }));
}

// ── Quotes ──────────────────────────────────────────────────────────────────

/** New quote: blank, from a template, or from a service (copies the service's template). */
export async function createQuoteAction(opts: {
  fromId?: string | null;
  serviceId?: string | null;
  asTemplate?: boolean;
  name?: string;
  /** Link the new quote to this booking and take its date, client, guests and place. */
  saleId?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const session = await requireAdmin();
    const source = opts.fromId ? await getQuote(opts.fromId) : null;
    const asTemplate = !!opts.asTemplate && !opts.saleId;
    const sale = opts.saleId ? await getSaleQuoteDefaults(opts.saleId) : null;
    if (opts.saleId && !sale) return { error: "Serviço não encontrado" };
    const header: Partial<QuoteHeaderInput> & { name: string } = source
      ? {
          name: opts.name?.trim() || (asTemplate ? `${source.name} (cópia)` : source.isTemplate ? source.name : `${source.name} (cópia)`),
          isTemplate: asTemplate,
          status: "Rascunho",
          serviceId: opts.serviceId ?? source.serviceId,
          templateId: source.isTemplate ? source.id : source.templateId,
          guests: source.guests,
          location: source.location,
          markupPct: source.markupPct,
          pricePerPaxOverride: source.pricePerPaxOverride,
          vatRate: source.vatRate,
          notes: source.notes,
          courses: source.courses,
        }
      : {
          name: opts.name?.trim() || (asTemplate ? "Novo template" : "Novo orçamento"),
          isTemplate: asTemplate,
          serviceId: opts.serviceId ?? null,
        };
    if (sale) {
      header.isTemplate = false;
      header.status = "Rascunho";
      header.saleId = sale.saleId;
      header.serviceId = sale.serviceId ?? header.serviceId ?? null;
      header.clientId = sale.clientId;
      header.eventDate = sale.eventDate;
      if (sale.guests) header.guests = sale.guests;
      header.location = sale.location ?? header.location ?? null;
      if (!opts.name) header.name = source ? `${sale.name} · ${source.name.replace(/^Template · /, "")}` : sale.name;
    }
    const id = await createQuote(header, source ? cleanLines(source.lines) : [], session.user.name ?? session.user.email ?? null);
    revalidateQuotes();
    if (sale) revalidatePath(`/guide/tours/${sale.saleId}`);
    return { id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveQuoteAction(id: string, header: Partial<QuoteHeaderInput>, lines: QuoteLine[]): Promise<Result> {
  try {
    await requireAdmin();
    if (header.name !== undefined && !header.name.trim()) return { error: "O orçamento precisa de um nome" };
    if (header.status !== undefined && !QUOTE_STATUSES.includes(header.status)) return { error: "Estado inválido" };
    if (header.guests !== undefined && (!Number.isInteger(header.guests) || header.guests < 0)) return { error: "Nº de pessoas inválido" };
    if (header.markupPct !== undefined && !(header.markupPct >= 0 && header.markupPct <= 1000)) return { error: "Margem inválida" };
    const clean = cleanLines(lines);
    // Every course a line refers to is kept in the course list, in order.
    const courses = header.courses ? [...new Set([...header.courses.map((c) => c.trim()).filter(Boolean), ...clean.map((l) => l.course).filter((c): c is string => !!c)])] : undefined;
    await saveQuote(id, { ...header, name: header.name?.trim(), courses }, clean);
    revalidateQuotes(id, header.saleId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function deleteQuoteAction(id: string): Promise<Result> {
  try {
    await requireAdmin();
    await deleteQuote(id);
    revalidateQuotes();
    return {};
  } catch (e) {
    return fail(e);
  }
}

/** Turns a template into a repeatable event service: creates the service (type Evento) and links the template. */
export async function createServiceFromTemplateAction(templateId: string, name: string, description: string | null): Promise<Result<{ serviceId: string }>> {
  try {
    await requireAdmin();
    const n = name.trim();
    if (!n) return { error: "O serviço precisa de um nome" };
    const template = await getQuote(templateId);
    if (!template) return { error: "Template não encontrado" };
    const serviceId = await createEventService(n, description?.trim() || null);
    await saveQuote(templateId, { serviceId, isTemplate: true }, template.lines);
    revalidateQuotes(templateId);
    revalidatePath("/admin/produtos");
    revalidatePath("/admin/gestao-servicos");
    return { serviceId };
  } catch (e) {
    return fail(e);
  }
}

// ── Supplier catalogue ──────────────────────────────────────────────────────

export async function saveSupplierItemAction(input: SupplierItemInput): Promise<Result<{ id: string }>> {
  try {
    await requireAdmin();
    if (!input.name.trim()) return { error: "O artigo precisa de um nome" };
    if (!input.fornecedorId) return { error: "Escolhe o fornecedor" };
    if (input.unitPrice !== null && !(input.unitPrice >= 0)) return { error: "Preço inválido" };
    const id = await upsertSupplierItem({
      ...input,
      name: input.name.trim(),
      compareKey: input.compareKey?.trim() || null,
      unit: input.unit.trim() || "un",
      source: input.source?.trim() || null,
      url: input.url?.trim() || null,
      notes: input.notes?.trim() || null,
    });
    revalidatePath("/admin/orcamentos/precos");
    return { id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSupplierItemAction(id: string): Promise<Result> {
  try {
    await requireAdmin();
    await deleteSupplierItem(id);
    revalidatePath("/admin/orcamentos/precos");
    return {};
  } catch (e) {
    return fail(e);
  }
}

export type ExtractedPrice = { name: string; unitPrice: number; quantity: number | null; category: string | null };

/**
 * Reads a supplier's quote pasted from an email (Amado, Mesa Posta…) and returns
 * the item lines with their unit prices excl. VAT, for review before saving.
 */
export async function extractPricesFromEmailAction(text: string): Promise<Result<{ items: ExtractedPrice[]; date: string | null }>> {
  try {
    await requireAdmin();
    const body = text.trim().slice(0, 60_000);
    if (body.length < 20) return { error: "Cola o texto do email do fornecedor" };
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `You read Portuguese equipment-rental quotes (aluguer de material para eventos) pasted from emails.
Return ONLY JSON: {"date": "YYYY-MM-DD" or null, "items": [{"name": string, "unitPrice": number, "quantity": number or null, "category": string or null}]}.
- unitPrice is the price per unit EXCLUDING VAT (these quotes say "acresce IVA" or show "TOTAL S/IVA").
- Include transport/delivery lines (transporte, deslocação, piquete) with their price as unitPrice.
- Skip subtotal, total, discount and VAT rows.
- category is one of: Mobiliário, Loiça, Talheres, Copos, Têxteis, Serviço, Exterior, Equipamento, Transporte, Outros.
- Use the item name as written, in sentence case, without codes like "MULT 25".
- If the same item appears more than once (quoted replies), return it once with the most recent price.`,
      messages: [{ role: "user", content: body }],
    });
    const raw = response.content.find((c) => c.type === "text")?.text ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { date?: string | null; items?: ExtractedPrice[] };
    const items = (parsed.items ?? [])
      .filter((i) => i && typeof i.name === "string" && Number.isFinite(Number(i.unitPrice)))
      .map((i) => ({
        name: i.name.trim(),
        unitPrice: Math.round(Number(i.unitPrice) * 100) / 100,
        quantity: i.quantity == null ? null : Number(i.quantity),
        category: i.category ?? null,
      }));
    const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    return { items, date };
  } catch (e) {
    return fail(e);
  }
}
