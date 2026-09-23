// Client-safe shared constants. Do NOT import anything server-only here
// (e.g. from "@/lib/notion") — this file is bundled into client components.

export const CONTA_PAGAMENTO_OPTIONS = ["COME", "António", "Manel", "Bernardo"] as const;

export const PARTNERS = ["António", "Bernardo", "Manel"] as const;
export const PARTNER_SPLIT_DATE = "2025-10-01";
export const OWNERSHIP_BEFORE: Record<string, number> = { "António": 50, "Bernardo": 50, "Manel": 0 };
export const OWNERSHIP_AFTER: Record<string, number> = { "António": 40, "Bernardo": 40, "Manel": 20 };

// Payment methods for expenses paid personally by a partner — reimbursed like
// "Pelo Guia" (shows up in Transferências em Falta). `whoPaid` is stored in pago_por.
export const PARTNER_PAYMENT_METHODS = [
  { method: "Pago pelo Bernardo Providência", whoPaid: "Bernardo", name: "Bernardo Providência" },
  { method: "Pago pelo António Antunes",      whoPaid: "António",  name: "António Antunes" },
  { method: "Pago pelo Manuel Antunes",       whoPaid: "Manel",    name: "Manuel Antunes" },
] as const;

export function partnerPaymentByMethod(method: string | null | undefined) {
  return PARTNER_PAYMENT_METHODS.find((p) => p.method === method);
}

export function partnerPaymentByWhoPaid(whoPaid: string | null | undefined) {
  return PARTNER_PAYMENT_METHODS.find((p) => p.whoPaid === whoPaid);
}

export function ownershipForDate(date: string | null | undefined): Record<string, number> {
  return date && date < PARTNER_SPLIT_DATE ? OWNERSHIP_BEFORE : OWNERSHIP_AFTER;
}

// Roles that can be required team members on a service (services.equipa).
export const SERVICE_TEAM_ROLES = ["Guia", "Chef", "Copa", "Driver", "Logistics"] as const;

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

// Roles a task can be assigned to (tasks.role). Admin/Super Guide tasks are
// hidden from every other role — see getTasksForSale.
export const TASK_ROLE_OPTIONS = ["Admin", "Guide", "Super Guide", "Chef", "Driver", "Logistics"] as const;
