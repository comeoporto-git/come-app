import { supabase } from "@/lib/notion";
import {
  COST_COLUMNS,
  TIER_COLUMNS,
  mapCost,
  mapTier,
  type PriceTier,
  type PriceTierRow,
  type ServiceCost,
  type ServiceCostRow,
  type TransportOption,
} from "@/lib/pricing";

// ── Reads ───────────────────────────────────────────────────────────────────

export type PricedService = {
  id: string;
  name: string;
  type: string;
  description: string;
  durationMinutes: number | null;
  transportHours: number | null;
  /** Last year the service is offered; null = still offered. */
  availableUntil: number | null;
  tiers: PriceTier[];
  costs: ServiceCost[];
};

/** Every service that has at least one price tier, with its tiers and costs. */
export async function getPricedServices(): Promise<PricedService[]> {
  const { data, error } = await supabase
    .from("services")
    .select(`id, name, type, description, duration_minutes, transport_hours, available_until,
      service_price_tiers(${TIER_COLUMNS}),
      service_costs(${COST_COLUMNS})`)
    .order("name");
  if (error) throw new Error(`getPricedServices: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .map((s) => ({
      id: s.id,
      name: String(s.name ?? "").trim(),
      type: s.type ?? "",
      description: s.description ?? "",
      durationMinutes: s.duration_minutes ?? null,
      transportHours: s.transport_hours ?? null,
      availableUntil: s.available_until ?? null,
      tiers: ((s.service_price_tiers ?? []) as PriceTierRow[]).map(mapTier),
      costs: ((s.service_costs ?? []) as ServiceCostRow[]).map(mapCost).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((s) => s.tiers.length > 0);
}

export async function getTransportOptions(): Promise<TransportOption[]> {
  const { data, error } = await supabase
    .from("transport_options")
    .select("id, vehicle, hours, price, sort_order")
    .order("sort_order");
  if (error) throw new Error(`getTransportOptions: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    vehicle: r.vehicle,
    hours: r.hours,
    price: r.price === null ? null : Number(r.price),
    sortOrder: r.sort_order,
  }));
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Replaces every price tier of one service for one year. */
export async function replaceServiceTiers(serviceId: string, year: number, tiers: Omit<PriceTier, "id" | "year">[]): Promise<void> {
  const { error: delError } = await supabase.from("service_price_tiers").delete().eq("service_id", serviceId).eq("year", year);
  if (delError) throw new Error(`replaceServiceTiers (delete): ${delError.message}`);
  if (!tiers.length) return;
  const { error } = await supabase.from("service_price_tiers").insert(
    tiers.map((t) => ({
      service_id: serviceId,
      year,
      min_pax: t.minPax,
      max_pax: t.maxPax,
      price_per_pax: t.pricePerPax,
      min_charged_pax: t.minChargedPax,
    })),
  );
  if (error) throw new Error(`replaceServiceTiers: ${error.message}`);
}

/** Replaces every cost line of one service for one year. */
export async function replaceServiceCosts(serviceId: string, year: number, costs: Omit<ServiceCost, "id" | "year">[]): Promise<void> {
  const { error: delError } = await supabase.from("service_costs").delete().eq("service_id", serviceId).eq("year", year);
  if (delError) throw new Error(`replaceServiceCosts (delete): ${delError.message}`);
  if (!costs.length) return;
  const { error } = await supabase.from("service_costs").insert(
    costs.map((c, i) => ({
      service_id: serviceId,
      year,
      tier_min: c.tierMin,
      tier_max: c.tierMax,
      item: c.item,
      cost_type: c.costType,
      amount: c.amount,
      sort_order: i + 1,
    })),
  );
  if (error) throw new Error(`replaceServiceCosts: ${error.message}`);
}

export async function updateTransportPrices(prices: { id: string; price: number | null }[]): Promise<void> {
  for (const p of prices) {
    const { error } = await supabase.from("transport_options").update({ price: p.price }).eq("id", p.id);
    if (error) throw new Error(`updateTransportPrices: ${error.message}`);
  }
}

export async function updateServiceAvailableUntil(serviceId: string, year: number | null): Promise<void> {
  const { error } = await supabase.from("services").update({ available_until: year }).eq("id", serviceId);
  if (error) throw new Error(`updateServiceAvailableUntil: ${error.message}`);
}

export async function updateServiceTransportHours(serviceId: string, hours: number | null): Promise<void> {
  const { error } = await supabase.from("services").update({ transport_hours: hours }).eq("id", serviceId);
  if (error) throw new Error(`updateServiceTransportHours: ${error.message}`);
}
