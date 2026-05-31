/**
 * Migrates all data from Notion to Supabase.
 *
 * Run with:
 *   npx tsx scripts/migrate-from-notion.ts
 *
 * Requires in .env.local:
 *   NOTION_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { Client, isFullPage } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const notion = new Client({ auth: process.env.NOTION_TOKEN! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DB = {
  TEAM:                "26a17fed-f54b-80b1-8a02-ddd9f72ac80b",
  SALES:               "26917fed-f54b-8013-9e87-fd282cee8c0f",
  TRANSACTIONS:        "29417fed-f54b-8065-b47a-ea63c202098c",
  FORNECEDORES:        "6fdf5aa7-78b6-4e84-8554-c2c0bca69b23",
  CLIENTS:             "6237a34d-06e5-4a1b-bb45-98c5dd277c18",
  SERVICES:            "32117fed-f54b-803b-af90-c2957bde0762",
  TASKS:               "87786153-a346-4045-976a-2739c908b6c1",
  CLOTHING:            "31f17fed-f54b-8060-90cd-f5751361a5e8",
  SALES_PIPELINE:      "32117fed-f54b-801f-9447-ff43c59eeb13",
  SALES_ACTIVITIES:    "32117fed-f54b-8080-8495-c4c637142884",
  SOCIAL_MEDIA:        "32517fed-f54b-80b6-8892-d07fa2e00e3f",
  BUSINESS_RULES:      "36d17fed-f54b-80d6-8446-e308c0f67498",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toUUID(id: string): string {
  const clean = id.replace(/-/g, "");
  if (clean.length !== 32) return id;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

async function fetchAll(databaseId: string): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      if (isFullPage(page)) pages.push(page);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return pages;
}

function p(page: PageObjectResponse, name: string) {
  return page.properties[name];
}

const title      = (v: unknown) => (v as any)?.title?.[0]?.plain_text ?? "";
const status     = (v: unknown): string | null => (v as any)?.status?.name ?? null;
const text       = (v: unknown) => (v as any)?.rich_text?.map((r: any) => r.plain_text).join("") ?? "";
const num        = (v: unknown): number | null => (v as any)?.number ?? null;
const bool       = (v: unknown): boolean => (v as any)?.checkbox ?? false;
const sel        = (v: unknown): string | null => (v as any)?.select?.name ?? null;
const multiSel   = (v: unknown): string[] => (v as any)?.multi_select?.map((s: any) => s.name) ?? [];
const dateStr    = (v: unknown): string | null => (v as any)?.date?.start ?? null;
const emailProp  = (v: unknown): string | null => (v as any)?.email ?? null;
const phoneProp  = (v: unknown): string | null => (v as any)?.phone_number ?? null;
const urlProp    = (v: unknown): string | null => (v as any)?.url ?? null;
const rel        = (v: unknown): string[] => ((v as any)?.relation ?? []).map((r: any) => toUUID(r.id));
const fileUrl    = (v: unknown): string | null => {
  const files = (v as any)?.files ?? [];
  if (files.length === 0) return null;
  const f = files[0];
  return f.type === "external" ? (f.external?.url ?? null) : (f.file?.url ?? null);
};

async function upsert(table: string, rows: object[]) {
  if (rows.length === 0) return;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}

// ── Migration functions ───────────────────────────────────────────────────────

async function migrateTeam() {
  console.log("Migrating Team...");
  const pages = await fetchAll(DB.TEAM);
  await upsert("team", pages.map((page) => ({
    id:                  toUUID(page.id),
    name:                title(p(page, "Name")),
    email:               emailProp(p(page, "email")),
    contact:             phoneProp(p(page, "Contact")),
    role:                sel(p(page, "Role")),
    categoria:           sel(p(page, "Categoria")),
    source:              sel(p(page, "Source")),
    iban:                urlProp(p(page, "IBAN")),
    numero_contribuinte: urlProp(p(page, "Número de Contribuinte")),
  })));
  console.log(`  ✓ ${pages.length} team members`);
}

async function migrateServices() {
  console.log("Migrating Services...");
  const pages = await fetchAll(DB.SERVICES);
  await upsert("services", pages.map((page) => ({
    id:              toUUID(page.id),
    name:            title(p(page, "Name")),
    type:            sel(p(page, "Type")),
    equipa:          multiSel(p(page, "Equipa")),
    valor_chef_2_3:  num(p(page, "Valor Chef 2-3")),
    valor_chef_4_6:  num(p(page, "Valor Chef 4-6")),
    valor_chef_7_10: num(p(page, "Valor Chef  7-10")),
    valor_copa:      num(p(page, "Valor Copa")),
    valor_driver:    num(p(page, "Valor Driver")),
    pax_2_3:         num(p(page, "2-3")),
    pax_4_6:         num(p(page, "4-6")),
    pax_7_plus:      num(p(page, "7-")),
    processo:        text(p(page, "Processo")),
  })));
  console.log(`  ✓ ${pages.length} services`);
}

async function migrateClients() {
  console.log("Migrating Clients...");
  const pages = await fetchAll(DB.CLIENTS);
  await upsert("clients", pages.map((page) => ({
    id:            toUUID(page.id),
    name:          title(p(page, "Name")),
    email:         emailProp(p(page, "Email")),
    phone:         phoneProp(p(page, "Phone")),
    nif:           text(p(page, "NIF")),
    nome_fiscal:   text(p(page, "Nome Fiscal")),
    morada_fiscal: text(p(page, "Morada Fiscal")),
    source:        sel(p(page, "Source")),
  })));
  console.log(`  ✓ ${pages.length} clients`);
}

async function migrateFornecedores() {
  console.log("Migrating Fornecedores...");
  const pages = await fetchAll(DB.FORNECEDORES);
  await upsert("fornecedores", pages.map((page) => ({
    id:           toUUID(page.id),
    name:         title(p(page, "Name")),
    email:        emailProp(p(page, "email")),
    contact:      phoneProp(p(page, "Contact")),
    iban:         urlProp(p(page, "IBAN")),
    contribuinte: urlProp(p(page, "Contribuinte")),
    categoria:    sel(p(page, "Categoria")),
  })));
  console.log(`  ✓ ${pages.length} fornecedores`);
}

async function migrateSales() {
  console.log("Migrating Sales...");
  const pages = await fetchAll(DB.SALES);

  await upsert("sales", pages.map((page) => ({
    id:               toUUID(page.id),
    notion_id:        title(p(page, "ID")),
    date:             dateStr(p(page, "Date")),
    type:             sel(p(page, "Type")),
    status:           sel(p(page, "Status")),
    number_of_guests: num(p(page, "Number of Guests")),
    names:            text(p(page, "Names")),
    meeting_point:    text(p(page, "Meeting Point")),
    notes:            text(p(page, "Notes")),
    phone_number:     text(p(page, "Phone Number")),
    email_link:       urlProp(p(page, "Email Link")),
    driver_type:      sel(p(page, "Driver")),
    expenses_closed:  sel(p(page, "Expenses Closed")),
    gcal_event_id:    text(p(page, "GCal_Event_ID")),
    synced_at:        dateStr(p(page, "Synced_At")),
    thread_ids:       text(p(page, "Thread_IDs")),
    service_id:       rel(p(page, "Service"))[0] ?? null,
    client_id:        rel(p(page, "💼 Client"))[0] ?? null,
    guide_id:         rel(p(page, "Guia"))[0] ?? null,
    chef_id:          rel(p(page, "Chef"))[0] ?? null,
    driver_id:        rel(p(page, "Driver 1"))[0] ?? null,
  })));
  console.log(`  ✓ ${pages.length} sales`);

  // sales_team junction (🧑🏼‍🍳 Team — additional team members per sale)
  const junctionRows: { sale_id: string; team_id: string }[] = [];
  for (const page of pages) {
    for (const teamId of rel(p(page, "🧑🏼‍🍳 Team"))) {
      junctionRows.push({ sale_id: toUUID(page.id), team_id: teamId });
    }
  }
  if (junctionRows.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < junctionRows.length; i += BATCH) {
      const { error } = await supabase
        .from("sales_team")
        .upsert(junctionRows.slice(i, i + BATCH), { onConflict: "sale_id,team_id" });
      if (error) throw new Error(`sales_team batch ${i}: ${error.message}`);
    }
    console.log(`  ✓ ${junctionRows.length} sales_team entries`);
  }
}

async function migrateTransactions() {
  console.log("Migrating Transactions...");
  const pages = await fetchAll(DB.TRANSACTIONS);

  await upsert("transactions", pages.map((page) => ({
    id:                      toUUID(page.id),
    notion_id:               title(p(page, "ID")),
    valor:                   num(p(page, "Valor")),
    valor_sem_iva:           num(p(page, "Valor Sem IVA")),
    iva_6:                   num(p(page, "IVA 6%")),
    iva_13:                  num(p(page, "IVA 13%")),
    iva_23:                  num(p(page, "IVA 23%")),
    data:                    dateStr(p(page, "Data")),
    data_transferencia:      dateStr(p(page, "Data da Transferência")),
    type:                    sel(p(page, "Type")),
    status:                  sel(p(page, "Status")),
    status_fatura:           sel(p(page, "Status Fatura")),
    pago_por:                sel(p(page, "Pago Por")),
    metodo_pagamento:        sel(p(page, "Método de Pagamento")),
    conta_pagamento:         sel(p(page, "Conta de Pagamento")),
    precisa_fatura:          sel(p(page, "Precisa de Fatura")),
    pagamento_ao_fornecedor: sel(p(page, "Pagam. ao Fornecedor Feito")),
    fatura_sem_saida_direta: sel(p(page, "Fatura sem Saida direta da COME")),
    transferencia_feita:     bool(p(page, "Transferência Feita")),
    validado_contabilidade:  bool(p(page, "Validado pela Contabilidade")),
    id_banco:                text(p(page, "ID do Banco")),
    id_fatura:               text(p(page, "ID Fatura")),
    fatura_url:              fileUrl(p(page, "Fatura")),
    comprovativo_url:        fileUrl(p(page, "Comprovativo de Pagamento")),
    sale_id:                 rel(p(page, "🎫 Sales"))[0] ?? null,
    fornecedor_id:           rel(p(page, "👭 Fornecedores"))[0] ?? null,
    client_id:               rel(p(page, "💼 Clientes"))[0] ?? null,
    team_id:                 rel(p(page, "🧑🏼‍🍳 Team"))[0] ?? null,
  })));
  console.log(`  ✓ ${pages.length} transactions`);
}

async function migrateClothing() {
  console.log("Migrating Clothing...");
  const pages = await fetchAll(DB.CLOTHING);
  await upsert("clothing", pages.map((page) => ({
    id:         toUUID(page.id),
    name:       title(p(page, "Name")),
    categoria:  sel(p(page, "Categoria")),
    quantidade: num(p(page, "Quantidade")),
    cor:        sel(p(page, "Cor")),
    desenho:    sel(p(page, "Desenho")),
    tamanho:    sel(p(page, "Tamanho")),
  })));
  console.log(`  ✓ ${pages.length} clothing items`);
}

async function migrateBusinessRules() {
  console.log("Migrating Business Rules...");
  const pages = await fetchAll(DB.BUSINESS_RULES);
  await upsert("business_rules", pages.map((page) => ({
    id:    toUUID(page.id),
    name:  title(p(page, "Name")),
    value: text(p(page, "Value")),
    notes: text(p(page, "Notes")),
  })));
  console.log(`  ✓ ${pages.length} business rules`);
}

async function migrateSalesPipeline() {
  console.log("Migrating Sales Pipeline...");
  const pages = await fetchAll(DB.SALES_PIPELINE);
  await upsert("sales_pipeline", pages.map((page) => ({
    id:           toUUID(page.id),
    name:         title(p(page, "Name")),
    pessoa:       text(p(page, "Pessoa")),
    email:        emailProp(p(page, "Email")),
    phone_number: phoneProp(p(page, "Phone Number")),
    website:      text(p(page, "Website")),
    sales_status: status(p(page, "Sales Status")),
  })));
  console.log(`  ✓ ${pages.length} pipeline entries`);
}

async function migrateSalesActivities() {
  console.log("Migrating Sales Activities...");
  const pages = await fetchAll(DB.SALES_ACTIVITIES);
  await upsert("sales_activities", pages.map((page) => ({
    id:                toUUID(page.id),
    activitie:         title(p(page, "Activitie")),
    description:       text(p(page, "Description")),
    thread_link:       text(p(page, "Thread Link")),
    date:              dateStr(p(page, "Date")),
    sales_pipeline_id: rel(p(page, "🎯 Sales Pipeline"))[0] ?? null,
  })));
  console.log(`  ✓ ${pages.length} sales activities`);
}

async function migrateSocialMedia() {
  console.log("Migrating Social Media Planner...");
  const pages = await fetchAll(DB.SOCIAL_MEDIA);
  await upsert("social_media_planner", pages.map((page) => ({
    id:           toUUID(page.id),
    post_name:    title(p(page, "Post name")),
    copy:         text(p(page, "Copy")),
    post_date:    dateStr(p(page, "Post date")),
    post_url:     urlProp(p(page, "Post URL")),
    platform:     multiSel(p(page, "Platform")),
    content_type: multiSel(p(page, "Content type")),
    status:       status(p(page, "Status")),
    file_url:     fileUrl(p(page, "Files & media")),
    owner_id:     rel(p(page, "Owner"))[0] ?? null,
  })));
  console.log(`  ✓ ${pages.length} social media posts`);
}

async function migrateTasks() {
  console.log("Migrating Tasks...");
  const pages = await fetchAll(DB.TASKS);
  await upsert("tasks", pages.map((page) => ({
    id:                 toUUID(page.id),
    name:               title(p(page, "Name")),
    task_description:   text(p(page, "Task Description")),
    status:             status(p(page, "Status")),
    priority:           sel(p(page, "Priority")),
    categoria:          multiSel(p(page, "Categoria")),
    due_date:           dateStr(p(page, "Due Date")),
    file_url:           fileUrl(p(page, "Files & media")),
    team_member_id:     rel(p(page, "Team Member"))[0] ?? null,
    sale_id:            rel(p(page, "🎫 Serviços"))[0] ?? null,
    transaction_id:     rel(p(page, "💸 Transações-"))[0] ?? null,
    social_media_id:    rel(p(page, "Social Media Planner"))[0] ?? null,
    sales_pipeline_id:  rel(p(page, "🎯 Sales Pipeline"))[0] ?? null,
  })));
  console.log(`  ✓ ${pages.length} tasks`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  console.log("Starting Notion → Supabase migration...\n");

  // Order matters: independent tables first, then tables with FK dependencies
  await migrateTeam();
  await migrateServices();
  await migrateClients();
  await migrateFornecedores();
  await migrateClothing();
  await migrateBusinessRules();
  await migrateSalesPipeline();
  await migrateSalesActivities();   // depends on sales_pipeline
  await migrateSocialMedia();       // depends on team
  await migrateSales();             // depends on team, services, clients
  await migrateTransactions();      // depends on sales, fornecedores, clients, team
  await migrateTasks();             // depends on team, sales, transactions, social_media, sales_pipeline

  console.log("\nMigration complete ✓");
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
