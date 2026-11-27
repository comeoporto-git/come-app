// Event quotes: types and the pure calculation shared by the builder (client)
// and the list (server). All costs and prices are excl. VAT unless named "incl".

export const QUOTE_CATEGORIES = [
  "Material",
  "Equipa",
  "Comida",
  "Bebidas",
  "Espaço",
  "Decoração",
  "Transporte",
  "Outros",
] as const;
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export const ITEM_CATEGORIES = [
  "Mobiliário",
  "Loiça",
  "Talheres",
  "Copos",
  "Têxteis",
  "Serviço",
  "Exterior",
  "Equipamento",
  "Transporte",
  "Outros",
] as const;

export const QUOTE_STATUSES = ["Rascunho", "Enviado", "Aceite", "Recusado"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type QtyMode = "per_pax" | "fixed";

export type SupplierItem = {
  id: string;
  fornecedorId: string;
  fornecedorName: string;
  name: string;
  category: string;
  compareKey: string | null;
  unit: string;
  unitPrice: number | null;
  vatRate: number;
  priceDate: string | null;
  source: string | null;
  url: string | null;
  notes: string | null;
  active: boolean;
  /** Oldest first. */
  history: { unitPrice: number; quotedOn: string; source: string | null }[];
};

export type QuoteLine = {
  id?: string;
  category: string;
  description: string;
  supplierItemId: string | null;
  fornecedorId: string | null;
  qtyMode: QtyMode;
  /** Per person when qtyMode = per_pax, total otherwise. */
  quantity: number;
  unitCost: number;
  vatRate: number;
  notes: string | null;
};

export type QuoteHeader = {
  id: string;
  name: string;
  isTemplate: boolean;
  status: QuoteStatus;
  serviceId: string | null;
  clientId: string | null;
  saleId: string | null;
  templateId: string | null;
  eventDate: string | null;
  guests: number;
  location: string | null;
  markupPct: number;
  pricePerPaxOverride: number | null;
  vatRate: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Quote = QuoteHeader & { lines: QuoteLine[] };

export type QuoteListItem = QuoteHeader & {
  serviceName: string | null;
  clientName: string | null;
  lineCount: number;
  totals: QuoteTotals;
};

// ── Calculation ─────────────────────────────────────────────────────────────

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Units needed for a line. Per-person quantities round up to whole units (0.125 tables × 20 pax = 3). */
export function lineUnits(line: Pick<QuoteLine, "qtyMode" | "quantity">, guests: number): number {
  const q = Number(line.quantity) || 0;
  if (line.qtyMode === "fixed") return q;
  const raw = q * Math.max(0, guests);
  return Math.ceil(raw - 1e-9);
}

export function lineCost(line: QuoteLine, guests: number): number {
  return round2(lineUnits(line, guests) * (Number(line.unitCost) || 0));
}

export type QuoteTotals = {
  guests: number;
  cost: number;            // excl. VAT
  costInclVat: number;
  costPerPax: number;
  byCategory: { category: string; cost: number; share: number }[];
  /** Price before any manual per-person override. */
  suggestedPrice: number;
  suggestedPricePerPax: number;
  price: number;           // excl. VAT
  pricePerPax: number;
  vat: number;
  priceInclVat: number;
  pricePerPaxInclVat: number;
  profit: number;
  /** Profit as a share of the price (margem), 0–1. */
  margin: number;
  /** Lines with no price yet. */
  missingPrices: number;
};

export function quoteTotals(q: Pick<QuoteHeader, "guests" | "markupPct" | "pricePerPaxOverride" | "vatRate">, lines: QuoteLine[]): QuoteTotals {
  const guests = Math.max(0, Math.floor(Number(q.guests) || 0));
  const cats = new Map<string, number>();
  let cost = 0;
  let costInclVat = 0;
  let missingPrices = 0;
  for (const l of lines) {
    const c = lineCost(l, guests);
    cost += c;
    costInclVat += c * (1 + (Number(l.vatRate) || 0));
    cats.set(l.category, (cats.get(l.category) ?? 0) + c);
    if (!(Number(l.unitCost) > 0)) missingPrices += 1;
  }
  cost = round2(cost);
  costInclVat = round2(costInclVat);
  const suggestedPrice = round2(cost * (1 + (Number(q.markupPct) || 0) / 100));
  const override = q.pricePerPaxOverride != null && q.pricePerPaxOverride > 0 ? q.pricePerPaxOverride : null;
  const price = override !== null && guests > 0 ? round2(override * guests) : suggestedPrice;
  const vat = round2(price * q.vatRate);
  const profit = round2(price - cost);
  return {
    guests,
    cost,
    costInclVat,
    costPerPax: guests > 0 ? round2(cost / guests) : 0,
    byCategory: [...cats.entries()]
      .map(([category, c]) => ({ category, cost: round2(c), share: cost > 0 ? c / cost : 0 }))
      .sort((a, b) => b.cost - a.cost),
    suggestedPrice,
    suggestedPricePerPax: guests > 0 ? round2(suggestedPrice / guests) : 0,
    price,
    pricePerPax: guests > 0 ? round2(price / guests) : 0,
    vat,
    priceInclVat: round2(price + vat),
    pricePerPaxInclVat: guests > 0 ? round2((price + vat) / guests) : 0,
    profit,
    margin: price > 0 ? profit / price : 0,
    missingPrices,
  };
}

/** A new line taken from a supplier's catalogue. */
export function lineFromItem(item: SupplierItem, qtyMode: QtyMode = "per_pax", quantity = 1): QuoteLine {
  return {
    category: item.category === "Transporte" ? "Transporte" : "Material",
    description: item.name,
    supplierItemId: item.id,
    fornecedorId: item.fornecedorId,
    qtyMode: isFixedByDefault(item) ? "fixed" : qtyMode,
    quantity,
    unitCost: item.unitPrice ?? 0,
    vatRate: item.vatRate,
    notes: null,
  };
}

/** Things ordered as a total (tables, transport, heaters) rather than one per guest. */
function isFixedByDefault(item: SupplierItem): boolean {
  if (["Transporte", "Exterior", "Equipamento", "Serviço"].includes(item.category)) return true;
  return /mesa|toalha|saiote|tenda/i.test(item.name);
}

/** Cheapest active item per compare_key, to flag a cheaper supplier. */
export function cheapestByCompareKey(items: SupplierItem[]): Map<string, SupplierItem> {
  const m = new Map<string, SupplierItem>();
  for (const it of items) {
    if (!it.compareKey || it.unitPrice == null || !it.active) continue;
    const cur = m.get(it.compareKey);
    if (!cur || (cur.unitPrice ?? Infinity) > it.unitPrice) m.set(it.compareKey, it);
  }
  return m;
}

/** Change since the previous quoted price, as a fraction (0.2 = +20%). */
export function lastPriceChange(item: SupplierItem): number | null {
  const h = item.history;
  if (h.length < 2) return null;
  const last = h[h.length - 1].unitPrice;
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i].unitPrice !== last) return h[i].unitPrice > 0 ? (last - h[i].unitPrice) / h[i].unitPrice : null;
  }
  return null;
}

const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n: number) => eurFmt.format(n);
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits).replace(".", ",")}%`;
