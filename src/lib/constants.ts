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

// Who a task can be assigned to (tasks.role / service_tasks.role): a role or
// one of the partners. Admin, Super Guide and partner tasks are hidden from
// every other role — see PRIVILEGED_TASK_ROLES / getTasksForSale.
export const TASK_PARTNER_OPTIONS = ["Bernardo", "António", "Manel"] as const;
export const TASK_ROLE_OPTIONS = ["Admin", "Guide", "Super Guide", "Chef", "Driver", "Logistics", ...TASK_PARTNER_OPTIONS] as const;
export const PRIVILEGED_TASK_ROLES: ReadonlyArray<string> = ["Admin", "Super Guide", ...TASK_PARTNER_OPTIONS];

// Participant registrations on event services (services.type = EVENT_SERVICE_TYPE).
export const EVENT_SERVICE_TYPE = "Evento";
export const REGISTRATION_TICKET_TYPES = ["Bilhete", "Convite"] as const;
export const REGISTRATION_PAYMENT_STATUSES = ["Feito", "Não Feito"] as const;
export const REGISTRATION_INVOICE_STATUSES = ["Feito", "Não Feito", "Não precisa"] as const;
// Suggestions only — the payment method field stays free text.
export const REGISTRATION_PAYMENT_METHODS = ["Website - Cartão", "MB Way - António", "MB Way - Manel", "Transferência", "Dinheiro"] as const;

// "Pelo …" payment methods → the service role whose member paid out of pocket.
export const TEAM_PAYMENT_METHOD_ROLE: Record<string, "Guide" | "Chef" | "Driver" | "Logistics"> = {
  "Pelo Guia": "Guide",
  "Pelo Chef": "Chef",
  "Pelo Driver": "Driver",
  "Pelo Logistics": "Logistics",
};
