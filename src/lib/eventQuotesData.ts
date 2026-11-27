import { supabase } from "@/lib/notion";
import {
  quoteTotals,
  type Quote,
  type QuoteHeader,
  type QuoteLine,
  type QuoteListItem,
  type QuoteStatus,
  type SupplierItem,
} from "@/lib/eventQuotes";

// ── Row mapping ─────────────────────────────────────────────────────────────

const QUOTE_COLUMNS =
  "id, name, is_template, status, service_id, client_id, sale_id, template_id, event_date, guests, location, markup_pct, price_per_pax_override, vat_rate, notes, created_at, updated_at";
const LINE_COLUMNS =
  "id, quote_id, sort_order, category, description, supplier_item_id, fornecedor_id, qty_mode, quantity, unit_cost, vat_rate, notes";

type QuoteRow = {
  id: string;
  name: string;
  is_template: boolean;
  status: QuoteStatus;
  service_id: string | null;
  client_id: string | null;
  sale_id: string | null;
  template_id: string | null;
  event_date: string | null;
  guests: number;
  location: string | null;
  markup_pct: number | string;
  price_per_pax_override: number | string | null;
  vat_rate: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  quote_id: string;
  sort_order: number;
  category: string;
  description: string;
  supplier_item_id: string | null;
  fornecedor_id: string | null;
  qty_mode: "per_pax" | "fixed";
  quantity: number | string;
  unit_cost: number | string;
  vat_rate: number | string;
  notes: string | null;
};

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

function mapQuote(r: QuoteRow): QuoteHeader {
  return {
    id: r.id,
    name: r.name,
    isTemplate: r.is_template,
    status: r.status,
    serviceId: r.service_id,
    clientId: r.client_id,
    saleId: r.sale_id,
    templateId: r.template_id,
    eventDate: r.event_date,
    guests: r.guests,
    location: r.location,
    markupPct: Number(r.markup_pct),
    pricePerPaxOverride: num(r.price_per_pax_override),
    vatRate: Number(r.vat_rate),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapLine(r: LineRow): QuoteLine {
  return {
    id: r.id,
    category: r.category,
    description: r.description,
    supplierItemId: r.supplier_item_id,
    fornecedorId: r.fornecedor_id,
    qtyMode: r.qty_mode,
    quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost),
    vatRate: Number(r.vat_rate),
    notes: r.notes,
  };
}

// ── Supplier catalogue ──────────────────────────────────────────────────────

export async function getSupplierItems(): Promise<SupplierItem[]> {
  const { data, error } = await supabase
    .from("supplier_items")
    .select(`id, fornecedor_id, name, category, compare_key, unit, unit_price, vat_rate, price_date, source, url, notes, active,
      fornecedores(name),
      supplier_item_prices(unit_price, quoted_on, source)`)
    .order("category")
    .order("name");
  if (error) throw new Error(`getSupplierItems: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    fornecedorId: r.fornecedor_id,
    fornecedorName: r.fornecedores?.name ?? "",
    name: r.name,
    category: r.category,
    compareKey: r.compare_key,
    unit: r.unit,
    unitPrice: num(r.unit_price),
    vatRate: Number(r.vat_rate),
    priceDate: r.price_date,
    source: r.source,
    url: r.url,
    notes: r.notes,
    active: r.active,
    history: ((r.supplier_item_prices ?? []) as { unit_price: string | number; quoted_on: string; source: string | null }[])
      .map((p) => ({ unitPrice: Number(p.unit_price), quotedOn: p.quoted_on, source: p.source }))
      .sort((a, b) => a.quotedOn.localeCompare(b.quotedOn)),
  }));
}

export type SupplierItemInput = {
  id?: string;
  fornecedorId: string;
  name: string;
  category: string;
  compareKey: string | null;
  unit: string;
  unitPrice: number | null;
  priceDate: string | null;
  source: string | null;
  url: string | null;
  notes: string | null;
  active: boolean;
};

/** Creates or updates an item; a new price is also written to its history. */
export async function upsertSupplierItem(input: SupplierItemInput): Promise<string> {
  const row = {
    fornecedor_id: input.fornecedorId,
    name: input.name,
    category: input.category,
    compare_key: input.compareKey,
    unit: input.unit,
    unit_price: input.unitPrice,
    price_date: input.priceDate,
    source: input.source,
    url: input.url,
    notes: input.notes,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("supplier_items").update(row).eq("id", id);
    if (error) throw new Error(`upsertSupplierItem: ${error.message}`);
  } else {
    const { data, error } = await supabase.from("supplier_items").insert(row).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "Este fornecedor já tem um artigo com esse nome" : `upsertSupplierItem: ${error.message}`);
    id = data.id as string;
  }
  if (input.unitPrice !== null) {
    const { error } = await supabase.from("supplier_item_prices").upsert(
      { item_id: id, unit_price: input.unitPrice, quoted_on: input.priceDate ?? new Date().toISOString().slice(0, 10), source: input.source },
      { onConflict: "item_id,quoted_on,unit_price", ignoreDuplicates: true },
    );
    if (error) throw new Error(`upsertSupplierItem (history): ${error.message}`);
  }
  return id!;
}

export async function deleteSupplierItem(id: string): Promise<void> {
  const { error } = await supabase.from("supplier_items").delete().eq("id", id);
  if (error) throw new Error(`deleteSupplierItem: ${error.message}`);
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export async function getQuoteList(): Promise<QuoteListItem[]> {
  const { data, error } = await supabase
    .from("event_quotes")
    .select(`${QUOTE_COLUMNS}, services(name), clients(name), event_quote_lines(${LINE_COLUMNS})`)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`getQuoteList: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => {
    const header = mapQuote(r as QuoteRow);
    const lines = ((r.event_quote_lines ?? []) as LineRow[]).map(mapLine);
    return {
      ...header,
      serviceName: r.services?.name ? String(r.services.name).trim() : null,
      clientName: r.clients?.name ?? null,
      lineCount: lines.length,
      totals: quoteTotals(header, lines),
    };
  });
}

export async function getQuote(id: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from("event_quotes")
    .select(`${QUOTE_COLUMNS}, event_quote_lines(${LINE_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getQuote: ${error.message}`);
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  const lines = ((r.event_quote_lines ?? []) as LineRow[]).sort((a, b) => a.sort_order - b.sort_order).map(mapLine);
  return { ...mapQuote(r as QuoteRow), lines };
}

export type QuoteHeaderInput = Omit<QuoteHeader, "id" | "createdAt" | "updatedAt">;

function headerRow(h: Partial<QuoteHeaderInput>) {
  const row: Record<string, unknown> = {};
  if (h.name !== undefined) row.name = h.name;
  if (h.isTemplate !== undefined) row.is_template = h.isTemplate;
  if (h.status !== undefined) row.status = h.status;
  if (h.serviceId !== undefined) row.service_id = h.serviceId;
  if (h.clientId !== undefined) row.client_id = h.clientId;
  if (h.saleId !== undefined) row.sale_id = h.saleId;
  if (h.templateId !== undefined) row.template_id = h.templateId;
  if (h.eventDate !== undefined) row.event_date = h.eventDate;
  if (h.guests !== undefined) row.guests = h.guests;
  if (h.location !== undefined) row.location = h.location;
  if (h.markupPct !== undefined) row.markup_pct = h.markupPct;
  if (h.pricePerPaxOverride !== undefined) row.price_per_pax_override = h.pricePerPaxOverride;
  if (h.vatRate !== undefined) row.vat_rate = h.vatRate;
  if (h.notes !== undefined) row.notes = h.notes;
  return row;
}

async function replaceLines(quoteId: string, lines: QuoteLine[]) {
  const { error: delError } = await supabase.from("event_quote_lines").delete().eq("quote_id", quoteId);
  if (delError) throw new Error(`replaceLines (delete): ${delError.message}`);
  if (!lines.length) return;
  const { error } = await supabase.from("event_quote_lines").insert(
    lines.map((l, i) => ({
      quote_id: quoteId,
      sort_order: i + 1,
      category: l.category,
      description: l.description,
      supplier_item_id: l.supplierItemId,
      fornecedor_id: l.fornecedorId,
      qty_mode: l.qtyMode,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      vat_rate: l.vatRate,
      notes: l.notes,
    })),
  );
  if (error) throw new Error(`replaceLines: ${error.message}`);
}

export async function createQuote(header: Partial<QuoteHeaderInput> & { name: string }, lines: QuoteLine[], createdBy: string | null): Promise<string> {
  const { data, error } = await supabase
    .from("event_quotes")
    .insert({ ...headerRow(header), created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(`createQuote: ${error.message}`);
  const id = data.id as string;
  await replaceLines(id, lines);
  return id;
}

export async function saveQuote(id: string, header: Partial<QuoteHeaderInput>, lines: QuoteLine[]): Promise<void> {
  const { error } = await supabase
    .from("event_quotes")
    .update({ ...headerRow(header), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`saveQuote: ${error.message}`);
  await replaceLines(id, lines);
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from("event_quotes").delete().eq("id", id);
  if (error) throw new Error(`deleteQuote: ${error.message}`);
}

// ── Lookups for the builder ─────────────────────────────────────────────────

export type EventService = { id: string; name: string; description: string };

/** Services of type Evento that are still offered. */
export async function getEventServices(): Promise<EventService[]> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, description, available_until")
    .eq("type", "Evento")
    .order("name");
  if (error) throw new Error(`getEventServices: ${error.message}`);
  return (data ?? [])
    .filter((s) => s.available_until === null || s.available_until >= year)
    .map((s) => ({ id: s.id, name: String(s.name ?? "").trim(), description: s.description ?? "" }));
}

export async function createEventService(name: string, description: string | null): Promise<string> {
  const { data, error } = await supabase
    .from("services")
    .insert({ id: crypto.randomUUID(), name, type: "Evento", description })
    .select("id")
    .single();
  if (error) throw new Error(`createEventService: ${error.message}`);
  return data.id as string;
}

export type ClientOption = { id: string; name: string };

export async function getClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await supabase.from("clients").select("id, name").order("name").limit(2000);
  if (error) throw new Error(`getClientOptions: ${error.message}`);
  return (data ?? []).filter((c) => c.name).map((c) => ({ id: c.id, name: String(c.name).trim() }));
}

export type EventSaleOption = { id: string; label: string; date: string | null; guests: number | null };

/** Upcoming and recent sales of event services, to link a quote to its booking. */
export async function getEventSaleOptions(): Promise<EventSaleOption[]> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("sales")
    .select("id, date, names, number_of_guests, status, services!inner(name, type), clients(name)")
    .eq("services.type", "Evento")
    .neq("status", "Cancelled")
    .gte("date", since)
    .order("date");
  if (error) throw new Error(`getEventSaleOptions: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((s) => {
    const who = (s.clients?.name || s.names || "").trim();
    const svc = String(s.services?.name ?? "").trim();
    return {
      id: s.id,
      date: s.date,
      guests: s.number_of_guests,
      label: [s.date, svc, who].filter(Boolean).join(" · "),
    };
  });
}
