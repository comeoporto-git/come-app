import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";
import { getAvailability } from "@/lib/availability";
import { priceLines, priceLinesText } from "@/lib/priceTable";
import { getGoogleToken, getInboxOwnerUserId, CALENDAR_SCOPE } from "@/lib/google-token";
import { addSuggestion, saleLabel, SALE_FIELDS, type SaleChange, type SaleField, type CreateSalePayload } from "@/lib/inboxAgent";
import { GUIDE_SECTIONS } from "@/lib/companyGuide";

/**
 * Tools for the AI Chat. Reading tools answer straight away; every tool that
 * would change something only creates a pending suggestion in /admin/inbox,
 * which a person must accept.
 */

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description: "Verifica a disponibilidade em datas concretas: serviços já marcados, limites por dia das regras de negócio, dias de operação, guias livres e dias OUT do Bernardo no calendário Google.",
    input_schema: {
      type: "object",
      properties: {
        dates: { type: "array", items: { type: "string", description: "yyyy-mm-dd" } },
        service_id: { type: ["string", "null"], description: "id do serviço (opcional) para os limites por serviço" },
      },
      required: ["dates"],
    },
  },
  {
    name: "quote_price",
    description: "Calcula o preço proposto com a tabela de preços da app (preço por pessoa, total sem IVA, IVA, total com IVA). Usa SEMPRE esta ferramenta para preços.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        guests: { type: "integer", description: "total de pessoas incluindo crianças" },
        date: { type: ["string", "null"] },
        children_10_18: { type: "integer" },
        children_3_9: { type: "integer" },
        children_0_2: { type: "integer" },
        transport_vehicle: { type: ["string", "null"] },
      },
      required: ["service_id", "guests"],
    },
  },
  {
    name: "list_services",
    description: "Lista os serviços (id, nome, tipo) para encontrar o service_id certo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "inbox_overview",
    description: "Emails por responder / com sugestões por aprovar na Caixa de Entrada, com o tour associado.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_create_sale",
    description: "Propõe criar uma venda/serviço novo. NÃO cria: fica como sugestão por aprovar na Caixa de Entrada.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        date: { type: "string" },
        start_time: { type: ["string", "null"] },
        guests: { type: "integer" },
        client_name: { type: "string" },
        client_email: { type: "string" },
        phone_number: { type: "string" },
        names: { type: "string" },
        notes: { type: "string" },
        status: { type: "string", enum: ["Pending", "Confirmed", "Paid"] },
        reason: { type: "string" },
      },
      required: ["service_id", "date", "guests", "client_name", "reason"],
    },
  },
  {
    name: "propose_update_sale",
    description: `Propõe alterar campos de uma venda existente. NÃO altera: fica como sugestão por aprovar. Campos: ${Object.keys(SALE_FIELDS).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        sale_id: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: { field: { type: "string", enum: Object.keys(SALE_FIELDS) }, new_value: { type: ["string", "null"] } },
            required: ["field", "new_value"],
          },
        },
        reason: { type: "string" },
      },
      required: ["sale_id", "changes", "reason"],
    },
  },
  {
    name: "propose_guide_entry",
    description: "Propõe acrescentar uma regra ao Guia da empresa (quando o utilizador ensina como a empresa funciona). Fica por aprovar.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", enum: [...GUIDE_SECTIONS] },
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["section", "title", "content"],
    },
  },
];

type Input = Record<string, unknown>;

async function calendarToken(): Promise<string | null> {
  const uid = await getInboxOwnerUserId();
  if (!uid) return null;
  const tok = await getGoogleToken(uid, [CALENDAR_SCOPE]);
  return tok.status === "ok" ? tok.token : null;
}

export async function runChatTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case "check_availability": {
      const r = await getAvailability({
        dates: (input.dates as string[]) ?? [],
        serviceId: (input.service_id as string | null) ?? null,
        calendarToken: await calendarToken(),
      });
      return JSON.stringify({ calendar_checked: r.calendarChecked, calendar_error: r.calendarError, days: r.days });
    }
    case "quote_price": {
      const lines = await priceLines([{
        serviceId: String(input.service_id),
        guests: Number(input.guests) || 0,
        date: (input.date as string | null) ?? null,
        children: {
          children1018: Number(input.children_10_18) || 0,
          children39: Number(input.children_3_9) || 0,
          children02: Number(input.children_0_2) || 0,
        },
        transportVehicle: (input.transport_vehicle as string | null) ?? null,
      }]);
      return lines.length ? priceLinesText(lines) : "Este serviço não tem tabela de preços (serviço à medida) ou o id é inválido.";
    }
    case "list_services": {
      const { data } = await supabase.from("services").select("id, name, type, available_until").order("name");
      return JSON.stringify(data ?? []);
    }
    case "inbox_overview": {
      const { data } = await supabase
        .from("inbox_threads")
        .select("subject, from_name, from_email, status, summary, last_message_at, sale:sales(date, services(name), clients(name))")
        .in("status", ["needs_reply", "awaiting_approval"])
        .order("last_message_at", { ascending: false })
        .limit(30);
      return JSON.stringify(data ?? []);
    }
    case "propose_create_sale": {
      const { data: svc } = await supabase.from("services").select("id, name").eq("id", String(input.service_id)).maybeSingle();
      if (!svc) return "service_id inválido — usa list_services.";
      const payload: CreateSalePayload = {
        service_id: svc.id,
        service_name: svc.name,
        date: String(input.date),
        start_time: (input.start_time as string | null) ?? null,
        guests: Number(input.guests) || 0,
        children_10_18: 0, children_3_9: 0, children_0_2: 0,
        transport_vehicle: null,
        client_id: null,
        client_name: String(input.client_name ?? ""),
        client_email: String(input.client_email ?? ""),
        phone_number: String(input.phone_number ?? ""),
        names: String(input.names ?? ""),
        dietary_restrictions: "", mobility_restrictions: "", emergency_contact: "", meeting_point: "",
        notes: String(input.notes ?? ""),
        status: String(input.status ?? "Pending"),
        gmail_thread_id: null,
      };
      await addSuggestion({
        thread_id: null, kind: "create_sale", source: "chat",
        title: `Nova venda: ${svc.name} · ${payload.date} · ${payload.guests} pax · ${payload.client_name}`,
        rationale: String(input.reason ?? ""), payload,
      });
      return "Sugestão criada na Caixa de Entrada (por aprovar).";
    }
    case "propose_update_sale": {
      const { data: sale } = await supabase.from("sales").select("*, services(name), clients(name)").eq("id", String(input.sale_id)).maybeSingle();
      if (!sale) return "sale_id inválido.";
      const changes: SaleChange[] = ((input.changes as { field: SaleField; new_value: string | null }[]) ?? [])
        .filter((c) => c.field in SALE_FIELDS)
        .map((c) => ({ field: c.field, label: SALE_FIELDS[c.field], old: sale[c.field] ?? null, new: c.new_value }));
      if (!changes.length) return "Nenhuma alteração válida.";
      await addSuggestion({
        thread_id: null, sale_id: sale.id, kind: "update_sale", source: "chat",
        title: `Atualizar ${saleLabel(sale)}: ${changes.map((c) => c.label).join(", ")}`,
        rationale: String(input.reason ?? ""),
        payload: { sale_id: sale.id, sale_label: saleLabel(sale), changes, gmail_thread_id: null },
      });
      return "Sugestão criada na Caixa de Entrada (por aprovar).";
    }
    case "propose_guide_entry": {
      await addSuggestion({
        thread_id: null, kind: "guide_entry", source: "chat",
        title: `Guia: ${String(input.title)}`,
        payload: { section: input.section, title: input.title, content: input.content },
      });
      return "Sugestão para o guia criada (por aprovar na Caixa de Entrada).";
    }
    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
