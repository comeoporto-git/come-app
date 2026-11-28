import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";
import { getAvailability } from "@/lib/availability";
import { priceLines, priceLinesText } from "@/lib/priceTable";
import { getGoogleToken, getInboxOwnerUserId, CALENDAR_SCOPE } from "@/lib/google-token";
import { addSuggestion, saleLabel, SALE_FIELDS, type SaleChange, type SaleField, type CreateSalePayload } from "@/lib/inboxAgent";
import { GUIDE_SECTIONS } from "@/lib/companyGuide";
import { syncInbox } from "@/lib/inboxAgent";
import { ENTITIES } from "@/lib/comeAi/entities";
import { findRecords, getRecord, buildRecordChange } from "@/lib/comeAi/records";

/**
 * Tools of COME AI. Reading tools answer straight away; every tool that would
 * change something creates a suggestion that appears in the chat as a card with
 * a "Confirmar" button (and in /admin/inbox) — nothing is written until a
 * person confirms.
 */

/** Where the person is in the app (sent by the chat with every message). */
export type ChatContext = { path?: string; threadRowId?: string | null; saleId?: string | null };

export type ToolOutput = { content: string; suggestionIds: string[] };

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
    name: "find_records",
    description: "Procura registos de qualquer área da app (vendas, serviços, preços, clientes, equipa, tarefas, fornecedores, despesas, guia, regras, CRM). Devolve ids e campos. Usa antes de propor alterações.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: Object.keys(ENTITIES) },
        query: { type: "string", description: "Texto a procurar (pode ser vazio)" },
        filters: { type: "object", description: "Igualdades por campo, ex. {\"service_id\": \"…\", \"date\": \"2027-05-22\"}" },
        limit: { type: "integer" },
      },
      required: ["entity"],
    },
  },
  {
    name: "get_record",
    description: "Lê um registo completo (todos os campos editáveis e os nomes das ligações).",
    input_schema: {
      type: "object",
      properties: { entity: { type: "string", enum: Object.keys(ENTITIES) }, id: { type: "string" } },
      required: ["entity", "id"],
    },
  },
  {
    name: "propose_change",
    description: "Propõe criar, alterar ou apagar um registo de qualquer área da app. Mostra ao utilizador um cartão com o antes/depois e um botão Confirmar — só é gravado quando ele confirma. Para ligações (guia, cliente, serviço…) podes dar o id ou o nome exato.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: Object.keys(ENTITIES) },
        op: { type: "string", enum: ["create", "update", "delete"] },
        id: { type: "string", description: "Obrigatório para update/delete" },
        values: { type: "object", description: "Campo → novo valor (só os campos a mudar)" },
        reason: { type: "string", description: "Uma frase: porquê" },
      },
      required: ["entity", "op"],
    },
  },
  {
    name: "revise_email",
    description: "Só quando o utilizador está numa conversa de email: guarda a informação/instrução dele nessa conversa e volta a preparar a resposta e as sugestões (venda, despesa, tarefas, ponto de situação) tendo-a em conta. Usa sempre que ele der informação ou pedir mudanças à resposta.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string", description: "A informação/instrução, numa frase clara (ex.: 'O cliente já pagou por transferência; propor 10h30 em vez das 11h00.')" } },
      required: ["note"],
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

const out = (content: string, suggestionIds: string[] = []): ToolOutput => ({ content, suggestionIds });

export async function runChatTool(name: string, input: Input, ctx: ChatContext = {}): Promise<ToolOutput> {
  const r = await runTool(name, input, ctx);
  return typeof r === "string" ? out(r) : r;
}

async function runTool(name: string, input: Input, ctx: ChatContext): Promise<string | ToolOutput> {
  switch (name) {
    case "find_records": {
      const rows = await findRecords(String(input.entity), String(input.query ?? ""), (input.filters as Input) ?? {}, Number(input.limit) || 10);
      return JSON.stringify(rows);
    }
    case "get_record":
      return JSON.stringify(await getRecord(String(input.entity), String(input.id)));
    case "propose_change": {
      const op = (String(input.op) as "create" | "update" | "delete");
      const payload = await buildRecordChange(String(input.entity), op, (input.id as string) ?? null, (input.values as Input) ?? {});
      const verb = op === "create" ? "Criar" : op === "delete" ? "Apagar" : "Alterar";
      const id = await addSuggestion({
        thread_id: ctx.threadRowId ?? null,
        sale_id: payload.entity === "sales" ? payload.record_id : ctx.saleId ?? null,
        kind: "record_change", source: "chat",
        title: `${verb} ${payload.entity_label}${payload.record_label ? `: ${payload.record_label}` : ""}${op === "update" ? ` — ${payload.changes.map((c) => c.label).join(", ")}` : ""}`,
        rationale: String(input.reason ?? ""),
        payload,
      });
      return out(`Proposta criada e mostrada ao utilizador com botão Confirmar (${payload.changes.length} campo(s)). Não está gravada até ele confirmar.`, [id]);
    }
    case "revise_email": {
      if (!ctx.threadRowId) return "Não há nenhuma conversa de email aberta. Pede ao utilizador para abrir o email na Caixa de Entrada.";
      const { data: row } = await supabase.from("inbox_threads").select("gmail_thread_id, team_notes").eq("id", ctx.threadRowId).maybeSingle();
      if (!row) return "Conversa não encontrada.";
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const notes = `${row.team_notes ? `${row.team_notes}\n` : ""}- (${stamp}) ${String(input.note).trim()}`;
      await supabase.from("inbox_threads").update({ team_notes: notes, analyzed_message_id: null }).eq("id", ctx.threadRowId);
      const uid = await getInboxOwnerUserId();
      if (!uid) return "Nota guardada, mas o Gmail não está ligado — não foi possível refazer a resposta.";
      const res = await syncInbox({ userId: uid, threadIds: [row.gmail_thread_id as string], maxAnalyses: 1 });
      if (res.errors.length) return `Nota guardada, mas a reanálise falhou: ${res.errors[0]}`;
      const { data: sugg } = await supabase.from("inbox_suggestions").select("id, kind, title").eq("thread_id", ctx.threadRowId).eq("status", "pending").order("created_at", { ascending: false });
      return out(
        `Nota guardada na conversa e sugestões refeitas: ${(sugg ?? []).map((x) => `${x.kind}: ${x.title}`).join(" | ") || "(nenhuma sugestão pendente)"}. Os cartões novos estão abaixo e na página do email.`,
        (sugg ?? []).map((x) => x.id as string),
      );
    }
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
      const sid = await addSuggestion({
        thread_id: ctx.threadRowId ?? null, kind: "create_sale", source: "chat",
        title: `Nova venda: ${svc.name} · ${payload.date} · ${payload.guests} pax · ${payload.client_name}`,
        rationale: String(input.reason ?? ""), payload,
      });
      return out("Proposta de venda mostrada ao utilizador com botão Confirmar.", [sid]);
    }
    case "propose_update_sale": {
      const { data: sale } = await supabase.from("sales").select("*, services(name), clients(name)").eq("id", String(input.sale_id)).maybeSingle();
      if (!sale) return "sale_id inválido.";
      const changes: SaleChange[] = ((input.changes as { field: SaleField; new_value: string | null }[]) ?? [])
        .filter((c) => c.field in SALE_FIELDS)
        .map((c) => ({ field: c.field, label: SALE_FIELDS[c.field], old: sale[c.field] ?? null, new: c.new_value }));
      if (!changes.length) return "Nenhuma alteração válida.";
      const sid = await addSuggestion({
        thread_id: ctx.threadRowId ?? null, sale_id: sale.id, kind: "update_sale", source: "chat",
        title: `Atualizar ${saleLabel(sale)}: ${changes.map((c) => c.label).join(", ")}`,
        rationale: String(input.reason ?? ""),
        payload: { sale_id: sale.id, sale_label: saleLabel(sale), changes, gmail_thread_id: null },
      });
      return out("Proposta de alteração mostrada ao utilizador com botão Confirmar.", [sid]);
    }
    case "propose_guide_entry": {
      const sid = await addSuggestion({
        thread_id: null, kind: "guide_entry", source: "chat",
        title: `Guia: ${String(input.title)}`,
        payload: { section: input.section, title: input.title, content: input.content },
      });
      return out("Regra para o guia mostrada ao utilizador com botão Confirmar.", [sid]);
    }
    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
