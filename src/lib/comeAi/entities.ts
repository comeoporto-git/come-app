/**
 * What COME AI can read and change in the app, table by table. Every change
 * goes through a suggestion the person confirms (button in the chat), and only
 * the fields listed here can be written.
 */

export type FieldType = "text" | "textarea" | "number" | "date" | "time" | "bool" | "enum" | "fk";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];   // enum
  fk?: string;                   // foreign key → entity key
};

export type EntityDef = {
  table: string;
  label: string;                 // "Venda"
  /** Columns joined into the human label of a record. */
  display: string[];
  /** Columns searched by find_records (ilike). */
  search: string[];
  fields: FieldDef[];
  canCreate: boolean;
  canDelete: boolean;
  /** Extra columns to read (not editable) for context. */
  extra?: string[];
  order?: { column: string; ascending: boolean };
};

const t = (key: string, label: string): FieldDef => ({ key, label, type: "text" });
const ta = (key: string, label: string): FieldDef => ({ key, label, type: "textarea" });
const n = (key: string, label: string): FieldDef => ({ key, label, type: "number" });
const d = (key: string, label: string): FieldDef => ({ key, label, type: "date" });
const tm = (key: string, label: string): FieldDef => ({ key, label, type: "time" });
const fk = (key: string, label: string, to: string): FieldDef => ({ key, label, type: "fk", fk: to });
const en = (key: string, label: string, options: readonly string[]): FieldDef => ({ key, label, type: "enum", options });

export const ENTITIES = {
  sales: {
    table: "sales", label: "Venda / serviço marcado", display: ["notion_id", "date"], search: ["notion_id", "names", "notes"],
    order: { column: "date", ascending: false },
    canCreate: true, canDelete: false,
    fields: [
      t("notion_id", "ID da venda"), d("date", "Data"), tm("start_time", "Hora início"), tm("end_time", "Hora fim"),
      en("status", "Estado", ["Pending", "Confirmed", "Paid", "Cancelled"]),
      fk("service_id", "Serviço", "services"), fk("client_id", "Cliente", "clients"),
      n("number_of_guests", "Nº pax"), n("children_10_18", "Crianças 10-18"), n("children_3_9", "Crianças 3-9"), n("children_0_2", "Bebés 0-2"),
      t("names", "Nomes"), t("phone_number", "Contacto"), t("meeting_point", "Ponto de encontro"),
      t("dietary_restrictions", "Restrições alimentares"), t("mobility_restrictions", "Mobilidade"), t("emergency_contact", "Contacto de emergência"),
      t("transport_vehicle", "Transporte"), ta("notes", "Notas"),
      fk("guide_id", "Guia", "team"), fk("chef_id", "Chef", "team"), fk("driver_id", "Motorista", "team"),
      fk("logistics_id", "Logística", "team"), fk("decorador_id", "Decorador", "team"),
    ],
  },
  services: {
    table: "services", label: "Serviço (tour / experiência)", display: ["name"], search: ["name", "description"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [
      t("name", "Nome"), t("type", "Tipo"), ta("description", "Descrição"), ta("processo", "Processo / guião"),
      n("duration_minutes", "Duração (min)"), n("transport_hours", "Horas de transporte"), n("available_until", "Disponível até (dias antes)"),
    ],
  },
  service_prices: {
    table: "service_prices", label: "Tabela de preços (por ano)", display: ["year"], search: [],
    order: { column: "year", ascending: false },
    canCreate: true, canDelete: false,
    fields: [
      fk("service_id", "Serviço", "services"), n("year", "Ano"),
      n("pax_2_3", "Preço/pax 2-3"), n("pax_4_6", "Preço/pax 4-6"), n("pax_7_plus", "Preço/pax 7+"),
      n("valor_chef_2_3", "Chef 2-3"), n("valor_chef_4_6", "Chef 4-6"), n("valor_chef_7_10", "Chef 7-10"),
      n("valor_copa", "Copa"), n("valor_driver", "Motorista"),
    ],
  },
  service_tasks: {
    table: "service_tasks", label: "Tarefa-modelo do serviço", display: ["name"], search: ["name", "description"],
    order: { column: "sort_order", ascending: true },
    canCreate: true, canDelete: true,
    fields: [fk("service_id", "Serviço", "services"), t("name", "Nome"), ta("description", "Descrição"), t("role", "Função")],
  },
  tasks: {
    table: "tasks", label: "Tarefa", display: ["name"], search: ["name", "task_description"],
    order: { column: "created_at", ascending: false },
    canCreate: true, canDelete: true,
    fields: [
      t("name", "Tarefa"), ta("task_description", "Descrição"), en("status", "Estado", ["To do", "In Progress", "Done"]),
      t("priority", "Prioridade"), d("due_date", "Prazo"), en("role", "Responsável", ["Bernardo", "António", "Manel", "Admin", "Guide", "Super Guide", "Chef", "Driver", "Logistics", "Decorador"]),
      fk("sale_id", "Venda", "sales"),
    ],
  },
  clients: {
    table: "clients", label: "Cliente", display: ["name"], search: ["name", "email"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("email", "Email"), t("phone", "Telefone"), t("nif", "NIF"), t("nome_fiscal", "Nome fiscal"), t("morada_fiscal", "Morada fiscal"), t("source", "Origem")],
  },
  team: {
    table: "team", label: "Equipa", display: ["name"], search: ["name", "email"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("email", "Email"), t("contact", "Contacto"), t("role", "Função"), t("categoria", "Categoria"), t("iban", "IBAN"), t("numero_contribuinte", "NIF")],
  },
  fornecedores: {
    table: "fornecedores", label: "Fornecedor", display: ["name"], search: ["name", "email"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("email", "Email"), t("contact", "Contacto"), t("iban", "IBAN"), t("contribuinte", "NIF"), t("categoria", "Categoria")],
  },
  transactions: {
    table: "transactions", label: "Despesa / receita", display: ["notion_id", "data"], search: ["notion_id", "id_fatura"],
    order: { column: "data", ascending: false },
    canCreate: true, canDelete: false,
    extra: ["fatura_url"],
    fields: [
      t("notion_id", "Descrição"), en("type", "Tipo", ["Expense", "Earning"]), d("data", "Data"),
      n("valor", "Valor (despesa negativa)"), n("valor_sem_iva", "Base s/ IVA"), n("iva_6", "IVA 6%"), n("iva_13", "IVA 13%"), n("iva_23", "IVA 23%"),
      en("status", "Estado", ["Pending Payment", "Paid"]), t("metodo_pagamento", "Método de pagamento"), t("conta_pagamento", "Conta"),
      t("pago_por", "Pago por"), en("socio_pessoal", "Despesa de sócio", ["António", "Manel", "Bernardo"]), t("id_fatura", "Nº fatura"),
      fk("fornecedor_id", "Fornecedor", "fornecedores"), fk("sale_id", "Venda", "sales"),
    ],
  },
  company_guide: {
    table: "company_guide", label: "Guia da empresa", display: ["title"], search: ["title", "content"],
    order: { column: "section", ascending: true },
    canCreate: true, canDelete: false,
    fields: [
      en("section", "Secção", ["Respostas", "Preços", "Disponibilidade", "Serviços", "Clientes", "Despesas", "Processos", "Marca e redes sociais"]),
      t("title", "Título"), ta("content", "Regra"), { key: "active", label: "Ativa", type: "bool" },
    ],
  },
  business_rules: {
    table: "business_rules", label: "Regra de negócio", display: ["name"], search: ["name", "value", "notes"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("value", "Valor"), ta("notes", "Notas")],
  },
  sales_pipeline: {
    table: "sales_pipeline", label: "Conta CRM", display: ["name"], search: ["name", "pessoa", "email"],
    order: { column: "created_at", ascending: false },
    canCreate: true, canDelete: false,
    fields: [
      t("name", "Empresa"), t("pessoa", "Pessoa"), t("email", "Email"), t("phone", "Telefone"), t("website", "Website"),
      t("stage", "Fase"), t("country", "País"), t("industry", "Setor"), ta("notes", "Notas"), d("last_contacted_at", "Último contacto"),
      t("nif", "NIF"), t("nome_fiscal", "Nome fiscal"), t("morada_fiscal", "Morada fiscal"),
    ],
  },
} satisfies Record<string, EntityDef>;

export type EntityKey = keyof typeof ENTITIES;

export function entityDef(key: string): EntityDef | null {
  return (ENTITIES as Record<string, EntityDef>)[key] ?? null;
}
