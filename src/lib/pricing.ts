// Pricing rules shared by faturação, the price calculator and the price list.
// Mirrors the sale_pricing() SQL function (supabase/migrations/price_tiers_costs_transport.sql),
// so the calculator, the invoice screens and the earning created for a sale agree.
//
// All prices are per person, excl. VAT. Costs are estimates incl. VAT.

export const VAT_RATE = 0.23;

export type PriceTier = {
  id?: string;
  year: number;
  minPax: number;
  maxPax: number | null;
  pricePerPax: number;
  /** Always charge at least this many people (e.g. Capucine 1-2 = 2). */
  minChargedPax: number | null;
};

export type ServiceCost = {
  id?: string;
  year: number;
  tierMin: number | null;
  tierMax: number | null;
  item: string;
  costType: "Fixed" | "Variable";
  amount: number;
  sortOrder: number;
};

/** What a team member is paid per service (Chef, Copa, Driver…). NULL tier = every group. */
export type TeamPayment = {
  id?: string;
  year: number;
  role: string;
  tierMin: number | null;
  tierMax: number | null;
  amount: number;
  sortOrder: number;
};

export type TransportOption = {
  id: string;
  vehicle: string;
  hours: number;
  price: number | null;
  sortOrder: number;
};

/** Children are part of the group size; they pay a share of the tier's price.
 *  Mirrors sale_pricing() in supabase/migrations/child_prices.sql. */
export const CHILD_RATES = [
  { key: "children1018", label: "Criança 10-18 anos", short: "10-18", rate: 0.75 },
  { key: "children39", label: "Criança 3-9 anos", short: "3-9", rate: 0.5 },
  { key: "children02", label: "Bebé 0-2 anos", short: "0-2", rate: 0 },
] as const;

export type Children = { children1018: number; children39: number; children02: number };
export const NO_CHILDREN: Children = { children1018: 0, children39: 0, children02: 0 };

/** e.g. "1 × 10-18 anos, 2 × 3-9 anos" — empty when there are no children. */
export function childrenSummary(c: Children): string {
  return CHILD_RATES.filter((r) => c[r.key] > 0)
    .map((r) => `${c[r.key]} × ${r.short} anos`)
    .join(", ");
}

export type Quote = {
  year: number | null;
  tier: PriceTier | null;
  guests: number;
  /** Adults = guests minus children. */
  adults: number;
  /** Children counted (never more than the group). */
  children: Children;
  /** Extra full-price people charged to reach the tier's minimum. */
  minimumTopUp: number;
  chargedPax: number;
  pricePerPax: number;
  serviceTotal: number;
  transportVehicle: string | null;
  transportHours: number | null;
  transportTotal: number;
  totalExclVat: number;
  vat: number;
  totalInclVat: number;
};

// ── Row mapping ─────────────────────────────────────────────────────────────

export type PriceTierRow = {
  id?: string;
  year: number;
  min_pax: number;
  max_pax: number | null;
  price_per_pax: number | string;
  min_charged_pax: number | null;
};

export type ServiceCostRow = {
  id?: string;
  year: number;
  tier_min: number | null;
  tier_max: number | null;
  item: string;
  cost_type: "Fixed" | "Variable";
  amount: number | string;
  sort_order: number;
};

export const TIER_COLUMNS = "id, year, min_pax, max_pax, price_per_pax, min_charged_pax";
export const COST_COLUMNS = "id, year, tier_min, tier_max, item, cost_type, amount, sort_order";

export type TeamPaymentRow = {
  id?: string;
  year: number;
  role: string;
  tier_min: number | null;
  tier_max: number | null;
  amount: number | string;
  sort_order: number;
};

export const TEAM_PAYMENT_COLUMNS = "id, year, role, tier_min, tier_max, amount, sort_order";

export function mapTeamPayment(r: TeamPaymentRow): TeamPayment {
  return {
    id: r.id,
    year: r.year,
    role: r.role,
    tierMin: r.tier_min,
    tierMax: r.tier_max,
    amount: Number(r.amount),
    sortOrder: r.sort_order,
  };
}

export function mapTier(r: PriceTierRow): PriceTier {
  return {
    id: r.id,
    year: r.year,
    minPax: r.min_pax,
    maxPax: r.max_pax,
    pricePerPax: Number(r.price_per_pax),
    minChargedPax: r.min_charged_pax,
  };
}

export function mapCost(r: ServiceCostRow): ServiceCost {
  return {
    id: r.id,
    year: r.year,
    tierMin: r.tier_min,
    tierMax: r.tier_max,
    item: r.item,
    costType: r.cost_type,
    amount: Number(r.amount),
    sortOrder: r.sort_order,
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function tierLabel(t: Pick<PriceTier, "minPax" | "maxPax">): string {
  if (t.maxPax === null) return `${t.minPax}+`;
  if (t.maxPax === t.minPax) return `${t.minPax}`;
  return `${t.minPax}-${t.maxPax}`;
}

export function yearsOf(tiers: PriceTier[]): number[] {
  return [...new Set(tiers.map((t) => t.year))].sort((a, b) => b - a);
}

/** Year with prices closest to `year`, the earlier one on a tie. */
export function pickYear(tiers: PriceTier[], year: number): number | null {
  const years = yearsOf(tiers);
  if (!years.length) return null;
  return [...years].sort((a, b) => Math.abs(a - year) - Math.abs(b - year) || a - b)[0];
}

export function tiersForYear(tiers: PriceTier[], year: number | null): PriceTier[] {
  if (year === null) return [];
  return tiers.filter((t) => t.year === year).sort((a, b) => a.minPax - b.minPax);
}

/** Tier holding the group; smaller groups use the first tier, larger the last. */
export function pickTier(yearTiers: PriceTier[], guests: number): PriceTier | null {
  if (!yearTiers.length) return null;
  const sorted = [...yearTiers].sort((a, b) => a.minPax - b.minPax);
  const inRange = sorted.find((t) => guests >= t.minPax && (t.maxPax === null || guests <= t.maxPax));
  if (inRange) return inRange;
  const bigger = sorted.find((t) => guests < t.minPax);
  if (bigger) return bigger;
  return sorted[sorted.length - 1];
}

export function transportPrice(
  options: TransportOption[],
  vehicle: string | null | undefined,
  hours: number | null | undefined,
): number {
  if (!vehicle || !hours) return 0;
  return options.find((o) => o.vehicle === vehicle && o.hours === hours)?.price ?? 0;
}

export function quote(args: {
  tiers: PriceTier[];
  date?: string | null;
  year?: number | null;
  guests: number;
  transportVehicle?: string | null;
  transportHours?: number | null;
  transportOptions?: TransportOption[];
  children?: Partial<Children>;
}): Quote {
  const targetYear = args.year ?? (args.date ? new Date(args.date).getFullYear() : new Date().getFullYear());
  const year = args.year != null && yearsOf(args.tiers).includes(args.year) ? args.year : pickYear(args.tiers, targetYear);
  const tier = pickTier(tiersForYear(args.tiers, year), args.guests);
  const guests = Math.max(0, Math.floor(args.guests || 0));
  const chargedPax = guests > 0 ? Math.max(guests, tier?.minChargedPax ?? 0) : 0;
  const pricePerPax = tier?.pricePerPax ?? 0;
  // Children can't outnumber the group; the oldest band is counted first.
  const n = (v: number | undefined) => Math.max(0, Math.floor(v || 0));
  const c1018 = Math.min(n(args.children?.children1018), guests);
  const c39 = Math.min(n(args.children?.children39), guests - c1018);
  const c02 = Math.min(n(args.children?.children02), guests - c1018 - c39);
  const adults = guests - c1018 - c39 - c02;
  const minimumTopUp = guests > 0 ? Math.max((tier?.minChargedPax ?? 0) - guests, 0) : 0;
  const units = adults + c1018 * CHILD_RATES[0].rate + c39 * CHILD_RATES[1].rate + c02 * CHILD_RATES[2].rate + minimumTopUp;
  const serviceTotal = guests > 0 ? round2(pricePerPax * units) : 0;
  const vehicle = args.transportVehicle || null;
  const hours = vehicle ? args.transportHours ?? null : null;
  const transportTotal = round2(transportPrice(args.transportOptions ?? [], vehicle, hours));
  const totalExclVat = round2(serviceTotal + transportTotal);
  const vat = round2(totalExclVat * VAT_RATE);
  return {
    year,
    tier,
    guests,
    adults,
    children: { children1018: c1018, children39: c39, children02: c02 },
    minimumTopUp,
    chargedPax,
    pricePerPax,
    serviceTotal,
    transportVehicle: vehicle,
    transportHours: hours,
    transportTotal,
    totalExclVat,
    vat,
    totalInclVat: round2(totalExclVat + vat),
  };
}

/** Does a cost line apply to a group of `guests`? NULL tier = every group. */
export function costApplies(c: ServiceCost, guests: number): boolean {
  if (c.tierMin === null && c.tierMax === null) return true;
  return guests >= (c.tierMin ?? 0) && guests <= (c.tierMax ?? Number.MAX_SAFE_INTEGER);
}

/** Estimated cost (incl. VAT) of running the service for `guests` people in `year`. */
export function costFor(costs: ServiceCost[], year: number, guests: number) {
  const lines = costs.filter((c) => c.year === year && costApplies(c, guests));
  const fixed = lines.filter((c) => c.costType === "Fixed").reduce((s, c) => s + c.amount, 0);
  const variablePerPax = lines.filter((c) => c.costType === "Variable").reduce((s, c) => s + c.amount, 0);
  const total = fixed + variablePerPax * guests;
  return { fixed, variablePerPax, total, perPax: guests > 0 ? total / guests : 0 };
}

export function costTierLabel(c: Pick<ServiceCost, "tierMin" | "tierMax">): string {
  if (c.tierMin === null && c.tierMax === null) return "Todos";
  return tierLabel({ minPax: c.tierMin ?? 1, maxPax: c.tierMax });
}

const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n: number) => eurFmt.format(n);
export const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")}%`;
