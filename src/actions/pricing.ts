"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { PriceTier, ServiceCost } from "@/lib/pricing";
import {
  replaceServiceCosts,
  replaceServiceTiers,
  updateServiceAvailableUntil,
  updateServiceTransportHours,
  updateTransportPrices,
} from "@/lib/pricingData";

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "Admin") throw new Error("Forbidden: apenas Admin");
}

function revalidatePricing(serviceId?: string) {
  if (serviceId) {
    revalidatePath(`/admin/produtos/${serviceId}`);
    revalidatePath(`/guide/produtos/${serviceId}`);
  }
  revalidatePath("/admin/produtos");
  revalidatePath("/admin/precos");
  revalidatePath("/admin/calculadora");
}

function checkYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Ano inválido");
}

type TierInput = Omit<PriceTier, "id" | "year">;
type CostInput = Omit<ServiceCost, "id" | "year">;

function validateTiers(tiers: TierInput[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.minPax - b.minPax);
  for (const [i, t] of sorted.entries()) {
    if (!Number.isInteger(t.minPax) || t.minPax < 1) return "O mínimo de pessoas tem de ser 1 ou mais";
    if (t.maxPax !== null && (!Number.isInteger(t.maxPax) || t.maxPax < t.minPax)) return `Escalão ${t.minPax}: o máximo tem de ser maior ou igual ao mínimo`;
    if (!(t.pricePerPax >= 0)) return `Escalão ${t.minPax}: preço inválido`;
    if (t.minChargedPax !== null && (!Number.isInteger(t.minChargedPax) || t.minChargedPax < 1)) return `Escalão ${t.minPax}: mínimo cobrado inválido`;
    const next = sorted[i + 1];
    if (next && (t.maxPax === null || t.maxPax >= next.minPax)) return `Os escalões ${t.minPax} e ${next.minPax} sobrepõem-se`;
  }
  return null;
}

export async function saveServiceTiersAction(serviceId: string, year: number, tiers: TierInput[]): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    checkYear(year);
    const problem = validateTiers(tiers);
    if (problem) return { error: problem };
    await replaceServiceTiers(serviceId, year, tiers);
    revalidatePricing(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveServiceCostsAction(serviceId: string, year: number, costs: CostInput[]): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    checkYear(year);
    for (const c of costs) {
      if (!c.item.trim()) return { error: "Cada custo precisa de uma descrição" };
      if (!(c.amount >= 0)) return { error: `${c.item}: valor inválido` };
      if (c.costType !== "Fixed" && c.costType !== "Variable") return { error: `${c.item}: tipo inválido` };
      if (c.tierMin !== null && c.tierMax !== null && c.tierMax < c.tierMin) return { error: `${c.item}: escalão inválido` };
      if (c.tierMin === null && c.tierMax !== null) return { error: `${c.item}: escalão inválido` };
    }
    await replaceServiceCosts(serviceId, year, costs.map((c) => ({ ...c, item: c.item.trim() })));
    revalidatePricing(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveTransportPricesAction(prices: { id: string; price: number | null }[]): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (prices.some((p) => p.price !== null && !(p.price >= 0))) return { error: "Preço de transporte inválido" };
    await updateTransportPrices(prices);
    revalidatePricing();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveServiceAvailableUntilAction(serviceId: string, year: number | null): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (year !== null) checkYear(year);
    await updateServiceAvailableUntil(serviceId, year);
    revalidatePricing(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveServiceTransportHoursAction(serviceId: string, hours: number | null): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (hours !== null && (!Number.isInteger(hours) || hours < 1)) return { error: "Horas inválidas" };
    await updateServiceTransportHours(serviceId, hours);
    revalidatePricing(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
