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
  /** Read-only (views, bank data): find/get only. */
  readOnly?: boolean;
  /** Which page of the app shows it (for the AI to point the person there). */
  page?: string;
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
    table: "sales", page: "/admin/servicos · /guide/tours/[id]", label: "Venda / serviço marcado", display: ["notion_id", "date"], search: ["notion_id", "names", "notes"],
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
    table: "services", page: "/admin/produtos · /admin/gestao-servicos", label: "Serviço (tour / experiência)", display: ["name"], search: ["name", "description"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [
      t("name", "Nome"), t("type", "Tipo"), ta("description", "Descrição"), ta("processo", "Processo / guião"),
      n("duration_minutes", "Duração (min)"), n("transport_hours", "Horas de transporte"), n("available_until", "Disponível até (dias antes)"),
    ],
  },
  service_prices: {
    table: "service_prices", page: "/admin/precos", label: "Tabela de preços (por ano)", display: ["year"], search: [],
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
    table: "service_tasks", page: "/admin/gestao-servicos", label: "Tarefa-modelo do serviço", display: ["name"], search: ["name", "description"],
    order: { column: "sort_order", ascending: true },
    canCreate: true, canDelete: true,
    fields: [fk("service_id", "Serviço", "services"), t("name", "Nome"), ta("description", "Descrição"), t("role", "Função")],
  },
  tasks: {
    table: "tasks", page: "/admin/tarefas", label: "Tarefa", display: ["name"], search: ["name", "task_description"],
    order: { column: "created_at", ascending: false },
    canCreate: true, canDelete: true,
    fields: [
      t("name", "Tarefa"), ta("task_description", "Descrição"), en("status", "Estado", ["To do", "In Progress", "Done"]),
      t("priority", "Prioridade"), d("due_date", "Prazo"), en("role", "Responsável", ["Bernardo", "António", "Manel", "Admin", "Guide", "Super Guide", "Chef", "Driver", "Logistics", "Decorador"]),
      fk("sale_id", "Venda", "sales"),
    ],
  },
  clients: {
    table: "clients", page: "/admin/crm", label: "Cliente", display: ["name"], search: ["name", "email"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("email", "Email"), t("phone", "Telefone"), t("nif", "NIF"), t("nome_fiscal", "Nome fiscal"), t("morada_fiscal", "Morada fiscal"), t("source", "Origem")],
  },
  team: {
    table: "team", page: "/admin/equipa", label: "Equipa", display: ["name"], search: ["name", "email"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("email", "Email"), t("contact", "Contacto"), t("role", "Função"), t("categoria", "Categoria"), t("iban", "IBAN"), t("numero_contribuinte", "NIF")],
  },
  fornecedores: {
    table: "fornecedores", page: "/admin/fornecedores", label: "Fornecedor", display: ["name"], search: ["name", "email"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("email", "Email"), t("contact", "Contacto"), t("iban", "IBAN"), t("contribuinte", "NIF"), t("categoria", "Categoria")],
  },
  transactions: {
    table: "transactions", page: "/admin/transacoes · /admin/transferencias · /admin/socios · /admin/em-falta", label: "Despesa / receita", display: ["notion_id", "data"], search: ["notion_id", "id_fatura"],
    order: { column: "data", ascending: false },
    canCreate: true, canDelete: false,
    extra: ["fatura_url"],
    fields: [
      t("notion_id", "Descrição"), en("type", "Tipo", ["Expense", "Earning"]), d("data", "Data"),
      n("valor", "Valor (despesa negativa)"), n("valor_sem_iva", "Base s/ IVA"), n("iva_6", "IVA 6%"), n("iva_13", "IVA 13%"), n("iva_23", "IVA 23%"),
      en("status", "Estado", ["Pending Payment", "Paid"]), t("metodo_pagamento", "Método de pagamento"), t("conta_pagamento", "Conta"),
      t("pago_por", "Pago por"), en("socio_pessoal", "Despesa de sócio", ["António", "Manel", "Bernardo"]), t("id_fatura", "Nº fatura"),
      fk("fornecedor_id", "Fornecedor", "fornecedores"), fk("sale_id", "Venda", "sales"), fk("client_id", "Cliente", "clients"),
      fk("team_id", "Membro da equipa", "team"), fk("paid_by_team_id", "Pago por (equipa)", "team"),
      t("status_fatura", "Estado da fatura"), t("precisa_fatura", "Precisa de fatura"), t("pagamento_ao_fornecedor", "Pagamento ao fornecedor"),
      t("fatura_sem_saida_direta", "Fatura sem saída direta"),
      { key: "transferencia_feita", label: "Transferência feita", type: "bool" }, d("data_transferencia", "Data da transferência"),
      { key: "socio_transferencia_feita", label: "Transferência ao sócio feita", type: "bool" },
      { key: "validado_contabilidade", label: "Validado pela contabilidade", type: "bool" }, t("id_banco", "Movimento do banco (id)"),
    ],
  },
  company_guide: {
    table: "company_guide", page: "/admin/guia", label: "Guia da empresa", display: ["title"], search: ["title", "content"],
    order: { column: "section", ascending: true },
    canCreate: true, canDelete: false,
    fields: [
      en("section", "Secção", ["Respostas", "Preços", "Disponibilidade", "Serviços", "Clientes", "Despesas", "Processos", "Marca e redes sociais"]),
      t("title", "Título"), ta("content", "Regra"), { key: "active", label: "Ativa", type: "bool" },
    ],
  },
  business_rules: {
    table: "business_rules", page: "/admin/configuracoes · /admin/guia", label: "Regra de negócio", display: ["name"], search: ["name", "value", "notes"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("value", "Valor"), ta("notes", "Notas")],
  },
  sales_pipeline: {
    table: "sales_pipeline", page: "/admin/crm", label: "Conta CRM", display: ["name"], search: ["name", "pessoa", "email"],
    order: { column: "created_at", ascending: false },
    canCreate: true, canDelete: false,
    fields: [
      t("name", "Empresa"), t("pessoa", "Pessoa"), t("email", "Email"), t("phone", "Telefone"), t("website", "Website"),
      t("stage", "Fase"), t("country", "País"), t("industry", "Setor"), ta("notes", "Notas"), d("last_contacted_at", "Último contacto"),
      t("nif", "NIF"), t("nome_fiscal", "Nome fiscal"), t("morada_fiscal", "Morada fiscal"),
    ],
  },
  service_price_tiers: {
    table: "service_price_tiers", label: "Preço por escalão de pax", display: ["year", "min_pax", "max_pax"], search: [],
    order: { column: "year", ascending: false }, page: "/admin/precos",
    canCreate: true, canDelete: true,
    fields: [fk("service_id", "Serviço", "services"), n("year", "Ano"), n("min_pax", "Pax mín."), n("max_pax", "Pax máx."), n("price_per_pax", "Preço/pax"), n("min_charged_pax", "Pax mínimo cobrado")],
  },
  service_costs: {
    table: "service_costs", label: "Custo do serviço", display: ["item", "year"], search: ["item"],
    order: { column: "year", ascending: false }, page: "/admin/gestao-servicos",
    canCreate: true, canDelete: true,
    fields: [fk("service_id", "Serviço", "services"), n("year", "Ano"), n("tier_min", "Pax de"), n("tier_max", "Pax até"), t("item", "Item"), t("cost_type", "Tipo de custo"), n("amount", "Valor")],
  },
  service_team_payments: {
    table: "service_team_payments", label: "Pagamento à equipa por serviço", display: ["role", "year"], search: ["role"],
    order: { column: "year", ascending: false }, page: "/admin/gestao-servicos",
    canCreate: true, canDelete: true,
    fields: [fk("service_id", "Serviço", "services"), n("year", "Ano"), t("role", "Função"), n("tier_min", "Pax de"), n("tier_max", "Pax até"), n("amount", "Valor")],
  },
  transport_options: {
    table: "transport_options", label: "Opção de transporte", display: ["vehicle", "hours"], search: ["vehicle"],
    order: { column: "sort_order", ascending: true }, page: "/admin/precos",
    canCreate: true, canDelete: true,
    fields: [t("vehicle", "Veículo"), n("hours", "Horas"), n("price", "Preço")],
  },
  service_steps: {
    table: "service_steps", label: "Passo do serviço (guião)", display: ["title"], search: ["title", "description"],
    order: { column: "sort_order", ascending: true }, page: "/admin/produtos",
    canCreate: true, canDelete: true,
    fields: [fk("service_id", "Serviço", "services"), n("sort_order", "Ordem"), t("title", "Título"), ta("description", "Descrição")],
  },
  restaurants: {
    table: "restaurants", label: "Restaurante / parceiro", display: ["name"], search: ["name", "address", "notes"],
    order: { column: "name", ascending: true }, page: "/admin/produtos",
    canCreate: true, canDelete: false,
    fields: [t("name", "Nome"), t("address", "Morada"), t("phone", "Telefone"), t("google_url", "Google Maps"), ta("notes", "Notas")],
  },
  restaurant_hours: {
    table: "restaurant_hours", label: "Horário de restaurante", display: ["day_of_week"], search: [],
    order: { column: "day_of_week", ascending: true }, page: "/admin/produtos",
    canCreate: true, canDelete: true,
    fields: [
      fk("restaurant_id", "Restaurante", "restaurants"), n("day_of_week", "Dia (0=domingo)"),
      tm("open_time", "Abre"), tm("close_time", "Fecha"), tm("open_time_2", "Abre (2.º turno)"), tm("close_time_2", "Fecha (2.º turno)"),
      { key: "closed", label: "Fechado", type: "bool" },
    ],
  },
  sale_team_members: {
    table: "sale_team_members", label: "Equipa de uma venda", display: ["role"], search: ["role"],
    order: { column: "created_at", ascending: false }, page: "/guide/tours/[id]",
    canCreate: true, canDelete: true,
    fields: [fk("sale_id", "Venda", "sales"), fk("team_id", "Pessoa", "team"), t("role", "Função")],
  },
  sale_registrations: {
    table: "sale_registrations", label: "Inscrição num evento", display: ["name"], search: ["name", "email"],
    order: { column: "sort_order", ascending: true }, page: "/guide/tours/[id]",
    canCreate: true, canDelete: true,
    fields: [
      fk("sale_id", "Venda / evento", "sales"), t("name", "Nome"), t("email", "Email"), t("phone", "Telefone"), t("ticket_type", "Bilhete"),
      t("payment_status", "Pagamento"), t("payment_method", "Método"), d("payment_date", "Data de pagamento"), t("invoice_status", "Fatura"),
      t("dietary_restrictions", "Restrições"), ta("notes", "Notas"),
    ],
  },
  event_quotes: {
    table: "event_quotes", label: "Orçamento de evento", display: ["name", "event_date"], search: ["name", "location", "notes"],
    order: { column: "updated_at", ascending: false }, page: "/admin/orcamentos",
    canCreate: true, canDelete: false,
    fields: [
      t("name", "Nome"), t("status", "Estado"), fk("service_id", "Serviço", "services"), fk("client_id", "Cliente", "clients"), fk("sale_id", "Venda", "sales"),
      d("event_date", "Data do evento"), n("guests", "Pax"), t("location", "Local"), n("markup_pct", "Margem %"),
      n("price_per_pax_override", "Preço/pax (forçado)"), n("vat_rate", "IVA %"), ta("notes", "Notas"), { key: "is_template", label: "É modelo", type: "bool" },
    ],
  },
  event_quote_lines: {
    table: "event_quote_lines", label: "Linha de orçamento", display: ["description"], search: ["description", "category"],
    order: { column: "sort_order", ascending: true }, page: "/admin/orcamentos",
    canCreate: true, canDelete: true,
    fields: [
      fk("quote_id", "Orçamento", "event_quotes"), t("category", "Categoria"), t("course", "Prato / momento"), t("description", "Descrição"),
      fk("fornecedor_id", "Fornecedor", "fornecedores"), t("qty_mode", "Modo de quantidade"), n("quantity", "Quantidade"),
      n("unit_cost", "Custo unitário"), n("vat_rate", "IVA %"), ta("notes", "Notas"),
    ],
  },
  supplier_items: {
    table: "supplier_items", label: "Artigo de fornecedor (catálogo de preços)", display: ["name"], search: ["name", "category", "notes"],
    order: { column: "name", ascending: true }, page: "/admin/orcamentos",
    canCreate: true, canDelete: false,
    fields: [
      fk("fornecedor_id", "Fornecedor", "fornecedores"), t("name", "Artigo"), t("category", "Categoria"), t("unit", "Unidade"),
      n("unit_price", "Preço unitário"), n("vat_rate", "IVA %"), d("price_date", "Data do preço"), t("url", "Link"), ta("notes", "Notas"),
      { key: "active", label: "Ativo", type: "bool" },
    ],
  },
  crm_contacts: {
    table: "crm_contacts", label: "Contacto CRM", display: ["name"], search: ["name", "email"],
    order: { column: "created_at", ascending: false }, page: "/admin/crm",
    canCreate: true, canDelete: true,
    fields: [fk("account_id", "Conta", "sales_pipeline"), t("name", "Nome"), t("email", "Email"), t("phone", "Telefone"), t("role", "Cargo"), t("country", "País"), t("linkedin_url", "LinkedIn"), { key: "is_primary", label: "Principal", type: "bool" }],
  },
  sales_activities: {
    table: "sales_activities", label: "Atividade CRM", display: ["activitie", "date"], search: ["activitie", "description"],
    order: { column: "date", ascending: false }, page: "/admin/crm",
    canCreate: true, canDelete: true,
    fields: [
      fk("sales_pipeline_id", "Conta", "sales_pipeline"), fk("contact_id", "Contacto", "crm_contacts"), t("activitie", "Atividade"), ta("description", "Descrição"),
      t("type", "Tipo"), t("status", "Estado"), d("date", "Data"), fk("assigned_to", "Responsável", "team"), t("thread_link", "Link do email"),
    ],
  },
  crm_weekly_actions: {
    table: "crm_weekly_actions", label: "Ação semanal CRM", display: ["subject", "week_of"], search: ["subject"],
    order: { column: "week_of", ascending: false }, page: "/admin/crm",
    canCreate: true, canDelete: true,
    fields: [d("week_of", "Semana"), fk("account_id", "Conta", "sales_pipeline"), fk("contact_id", "Contacto", "crm_contacts"), t("action_type", "Tipo"), t("subject", "Assunto"), ta("suggested_script", "Guião"), n("priority", "Prioridade"), t("status", "Estado")],
  },
  social_posts: {
    table: "social_posts", label: "Publicação (Instagram)", display: ["category", "scheduled_for"], search: ["caption"],
    order: { column: "created_at", ascending: false }, page: "/admin/social",
    canCreate: false, canDelete: false,
    fields: [ta("caption", "Legenda"), t("status", "Estado"), t("scheduled_for", "Agendada para (data e hora ISO)"), t("category", "Categoria"), t("platform", "Plataforma")],
  },
  social_photos: {
    table: "social_photos", label: "Foto (Social)", display: ["filename"], search: ["filename", "parent_folder_name"],
    order: { column: "created_at", ascending: false }, page: "/admin/social",
    canCreate: false, canDelete: false,
    extra: ["blob_url", "ai_score", "ai_score_reason"],
    fields: [t("review_status", "Revisão"), t("category", "Categoria")],
  },
  social_media_planner: {
    table: "social_media_planner", label: "Plano de redes sociais", display: ["post_name", "post_date"], search: ["post_name", "copy"],
    order: { column: "post_date", ascending: false }, page: "/admin/social",
    canCreate: true, canDelete: true,
    fields: [t("post_name", "Publicação"), ta("copy", "Texto"), d("post_date", "Data"), t("status", "Estado"), t("post_url", "Link")],
  },
  clothing: {
    table: "clothing", label: "Fardas / roupa (stock)", display: ["name", "tamanho"], search: ["name", "categoria", "cor"],
    order: { column: "name", ascending: true },
    canCreate: true, canDelete: true,
    fields: [t("name", "Nome"), t("categoria", "Categoria"), n("quantidade", "Quantidade"), t("cor", "Cor"), t("desenho", "Desenho"), t("tamanho", "Tamanho")],
  },
  bank_transactions: {
    table: "bank_transactions", label: "Movimento bancário", display: ["transaction_date", "merchant_name", "amount"], search: ["merchant_name", "remittance_info"],
    order: { column: "transaction_date", ascending: false }, page: "/admin/reconciliation",
    canCreate: false, canDelete: false, readOnly: true,
    extra: ["transaction_id", "institution_name"],
    fields: [d("transaction_date", "Data"), n("amount", "Valor"), t("credit_debit", "Débito/Crédito"), t("merchant_name", "Entidade"), t("remittance_info", "Descritivo")],
  },
  sales_computed: {
    table: "sales_computed", label: "Rentabilidade das vendas (só leitura)", display: ["notion_id", "date"], search: ["notion_id", "names"],
    order: { column: "date", ascending: false }, page: "/admin/analytics",
    canCreate: false, canDelete: false, readOnly: true,
    extra: ["preco_servico", "preco_servico_iva", "faturacao", "custo", "lucro_tour", "pct_lucro", "custo_por_pax", "lucro_por_pax"],
    fields: [d("date", "Data"), t("status", "Estado"), n("number_of_guests", "Pax"), fk("service_id", "Serviço", "services"), fk("client_id", "Cliente", "clients")],
  },
} satisfies Record<string, EntityDef>;

export type EntityKey = keyof typeof ENTITIES;

export function entityDef(key: string): EntityDef | null {
  return (ENTITIES as Record<string, EntityDef>)[key] ?? null;
}

/**
 * The page of the app where a record lives, so cards can link to it.
 * `row` gives parent ids (e.g. a price tier → its service page).
 */
export function urlFor(entity: string, id: string | null | undefined, row: Record<string, unknown> = {}): string | null {
  const v = (k: string) => (typeof row[k] === "string" && row[k] ? String(row[k]) : null);
  switch (entity) {
    case "sales":
    case "sales_computed":
      return id ? `/guide/tours/${id}` : null;
    case "services":
      return id ? `/admin/produtos/${id}` : "/admin/produtos";
    case "service_prices":
    case "service_price_tiers":
    case "service_costs":
    case "service_team_payments":
    case "service_steps":
    case "service_tasks":
      return v("service_id") ? `/admin/produtos/${v("service_id")}` : "/admin/gestao-servicos";
    case "clients":
    case "sales_pipeline":
      return id ? `/admin/crm/accounts/${id}` : "/admin/crm";
    case "crm_contacts":
    case "crm_weekly_actions":
      return v("account_id") ? `/admin/crm/accounts/${v("account_id")}` : "/admin/crm";
    case "sales_activities":
      return v("sales_pipeline_id") ? `/admin/crm/accounts/${v("sales_pipeline_id")}` : "/admin/crm";
    case "fornecedores":
      return id ? `/admin/fornecedores/${id}` : "/admin/fornecedores";
    case "supplier_items":
      return v("fornecedor_id") ? `/admin/fornecedores/${v("fornecedor_id")}` : "/admin/orcamentos";
    case "event_quotes":
      return id ? `/admin/orcamentos/${id}` : "/admin/orcamentos";
    case "event_quote_lines":
      return v("quote_id") ? `/admin/orcamentos/${v("quote_id")}` : "/admin/orcamentos";
    case "sale_team_members":
    case "sale_registrations":
      return v("sale_id") ? `/guide/tours/${v("sale_id")}` : "/admin/servicos";
    case "tasks":
      return v("sale_id") ? `/guide/tours/${v("sale_id")}` : "/admin/tarefas";
    case "transactions":
      return v("sale_id") ? `/guide/tours/${v("sale_id")}` : "/admin/transacoes";
    case "team":
      return "/admin/equipa";
    case "company_guide":
      return "/admin/guia";
    case "business_rules":
      return "/admin/configuracoes";
    case "restaurants":
    case "restaurant_hours":
      return "/admin/produtos";
    case "transport_options":
      return "/admin/precos";
    case "social_posts":
      return id ? `/admin/social/posts/${id}` : "/admin/social";
    case "social_photos":
    case "social_media_planner":
      return "/admin/social";
    case "bank_transactions":
      return "/admin/reconciliation";
    default:
      return null;
  }
}
