// Client-safe shared constants. Do NOT import anything server-only here
// (e.g. from "@/lib/notion") — this file is bundled into client components.

export const CONTA_PAGAMENTO_OPTIONS = ["COME", "António", "Manel", "Bernardo"] as const;

export const PARTNERS = ["António", "Bernardo", "Manel"] as const;
export const PARTNER_SPLIT_DATE = "2025-10-01";
export const OWNERSHIP_BEFORE: Record<string, number> = { "António": 50, "Bernardo": 50, "Manel": 0 };
export const OWNERSHIP_AFTER: Record<string, number> = { "António": 40, "Bernardo": 40, "Manel": 20 };

export function ownershipForDate(date: string | null | undefined): Record<string, number> {
  return date && date < PARTNER_SPLIT_DATE ? OWNERSHIP_BEFORE : OWNERSHIP_AFTER;
}
