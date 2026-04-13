import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

const TEAM_DB         = process.env.NOTION_TEAM_DB_ID!;
const TOURS_DB        = process.env.NOTION_SALES_DB_ID!;
const TRANSACTIONS_DB = process.env.NOTION_TRANSACTIONS_DB_ID!;
const FORNECEDORES_DB = process.env.NOTION_FORNECEDORES_DB_ID!;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getProp(page: PageObjectResponse, name: string) {
  return (page.properties as Record<string, unknown>)[name];
}

function text(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  if (p.type === "title")       return (p.title as { plain_text: string }[])[0]?.plain_text ?? "";
  if (p.type === "rich_text")   return (p.rich_text as { plain_text: string }[])[0]?.plain_text ?? "";
  if (p.type === "email")       return (p.email as string) ?? "";
  if (p.type === "phone_number") return (p.phone_number as string) ?? "";
  if (p.type === "select")      return (p.select as { name: string } | null)?.name ?? "";
  return "";
}

function num(prop: unknown): number {
  if (!prop || typeof prop !== "object") return 0;
  return ((prop as Record<string, unknown>).number as number) ?? 0;
}

function bool(prop: unknown): boolean {
  if (!prop || typeof prop !== "object") return false;
  return ((prop as Record<string, unknown>).checkbox as boolean) ?? false;
}

function dateStr(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const d = (prop as Record<string, unknown>).date as { start: string } | null;
  return d?.start ?? null;
}

function multiSelect(prop: unknown): string[] {
  if (!prop || typeof prop !== "object") return [];
  const items = (prop as Record<string, unknown>).multi_select as { name: string }[];
  return items?.map((i) => i.name) ?? [];
}

function relation(prop: unknown): string[] {
  if (!prop || typeof prop !== "object") return [];
  const items = (prop as Record<string, unknown>).relation as { id: string }[];
  return items?.map((i) => i.id) ?? [];
}

// ── Team ─────────────────────────────────────────────────────────────────────

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Guide" | "Accountant";
};

export async function getTeamMembers(): Promise<TeamMember[]> {
  const res = await notion.databases.query({
    database_id: TEAM_DB,
    sorts: [{ property: "Name", direction: "ascending" }],
    page_size: 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[]).map((page) => ({
    id: page.id,
    name: text(getProp(page, "Name")),
    email: text(getProp(page, "email")),
    role: text(getProp(page, "Role")) as TeamMember["role"],
  })).filter((m) => m.name);
}

export async function getTeamMemberByEmail(email: string): Promise<TeamMember | null> {
  const res = await notion.databases.query({
    database_id: TEAM_DB,
    filter: { property: "email", email: { equals: email } },
  });
  if (!res.results.length) return null;
  const page = res.results[0] as PageObjectResponse;
  return {
    id: page.id,
    name: text(getProp(page, "Name")),
    email: text(getProp(page, "email")),
    role: text(getProp(page, "Role")) as TeamMember["role"],
  };
}

// ── Tours (Sales DB) ──────────────────────────────────────────────────────────
//
// Property name mapping (our code → Notion Sales DB):
//   saleId       → "ID"               (Title)
//   service      → "Service"          (Relation → Services DB)
//   date         → "Date"             (Date)
//   client       → "Client"           (Relation → Client DB)
//   numGuests    → "Number of Guests" (Number)
//   names        → "Names"            (Text)
//   notes        → "Notes"            (Text)
//   teamId       → "🧑🏼‍🍳 Team"             (Relation → Team DB)
//   expensesClosed → "Expenses Closed" (Select — empty = open, any value = closed)

export type Tour = {
  id: string;
  saleId: string;
  service: string;
  date: string | null;
  client: string;
  numGuests: number;
  names: string;
  notes: string;
  teamId: string | null;
  expensesClosed: boolean;
};

function mapTour(page: PageObjectResponse): Tour {
  const serviceIds = relation(getProp(page, "Service"));
  const clientIds  = relation(getProp(page, "Client"));
  const teamIds    = relation(getProp(page, "🧑🏼‍🍳 Team"));
  return {
    id:              page.id,
    saleId:          text(getProp(page, "ID")),
    service:         serviceIds[0] ?? "",   // Relation ID; resolved to name in UI layer
    date:            dateStr(getProp(page, "Date")),
    client:          clientIds[0] ?? "",
    numGuests:       num(getProp(page, "Number of Guests")),
    names:           text(getProp(page, "Names")),
    notes:           text(getProp(page, "Notes")),
    teamId:          teamIds[0] ?? null,
    expensesClosed:  text(getProp(page, "Expenses Closed")) === "Closed",
  };
}

export async function getToursForGuide(email: string): Promise<Tour[]> {
  // Team is a Relation — filter by the guide's Notion page ID
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      and: [
        { property: "🧑🏼‍🍳 Team", relation: { contains: member.id } },
        { property: "Date", date: { on_or_after: today.toISOString() } },
        { property: "Expenses Closed", select: { does_not_equal: "Closed" } },
      ],
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[]).map(mapTour);
}

export async function getAllUpcomingTours(): Promise<Tour[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      // Admin sees all upcoming tours regardless of expenses status
      property: "Date",
      date: { on_or_after: today.toISOString() },
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[]).map(mapTour);
}

export async function getTourById(id: string): Promise<Tour | null> {
  try {
    const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
    return mapTour(page);
  } catch { return null; }
}

export async function closeTour(tourId: string): Promise<void> {
  await notion.pages.update({
    page_id: tourId,
    properties: { "Expenses Closed": { select: { name: "Closed" } } },
  });
}

// ── Transactions ──────────────────────────────────────────────────────────────
//
// Property name mapping (our code → your Notion DB):
//   supplier display  → Title field (set to fornecedor name for readability)
//   fornecedorId      → "👭 Fornecedores"   (Relation)
//   date              → "Data"               (Date)
//   invoiceId         → "ID Fatura"          (Text)
//   taxFree           → "Valor Sem IVA"      (Number)
//   iva6              → "IVA 6%"             (Number)
//   iva13             → "IVA 13%"            (Number)
//   iva23             → "IVA 23%"            (Number)
//   totalCost         → "Valor"              (Number)
//   whoPaid           → "Pago Por"           (Text)
//   paymentMethod     → "Método de Pagamento" (Select)
//   status            → "Status"             (Select)
//   accountantVerified→ "Validado pela Contabilidade" (Checkbox)
//   tourId            → "🎫 Sales"              (Relation)
//   bankReference     → "ID do Banco"        (Text)

export type Transaction = {
  id: string;
  supplier: string;       // display name (from title or fornecedor name)
  fornecedorId: string | null; // Notion page ID of the related Fornecedor
  date: string | null;
  invoiceId: string;
  taxFree: number;
  iva6: number;
  iva13: number;
  iva23: number;
  totalCost: number;
  whoPaid: string;
  paymentMethod: string;
  status: string;
  accountantVerified: boolean;
  tourId: string | null;
  bankReference: string;
};

function mapTransaction(page: PageObjectResponse): Transaction {
  const fornecedorIds = relation(getProp(page, "👭 Fornecedores"));
  const tourIds       = relation(getProp(page, "🎫 Sales"));

  // Supplier display: prefer the title field, fall back to fornecedor relation ID
  const titleText = text(getProp(page, "ID")) || "";

  return {
    id:                 page.id,
    supplier:           titleText,
    fornecedorId:       fornecedorIds[0] ?? null,
    date:               dateStr(getProp(page, "Data")),
    invoiceId:          text(getProp(page, "ID Fatura")),
    taxFree:            num(getProp(page, "Valor Sem IVA")),
    iva6:               num(getProp(page, "IVA 6%")),
    iva13:              num(getProp(page, "IVA 13%")),
    iva23:              num(getProp(page, "IVA 23%")),
    totalCost:          num(getProp(page, "Valor")),
    whoPaid:            text(getProp(page, "Pago Por")),
    paymentMethod:      text(getProp(page, "Método de Pagamento")),
    status:             text(getProp(page, "Status")),
    accountantVerified: bool(getProp(page, "Validado pela Contabilidade")),
    tourId:             tourIds[0] ?? null,
    bankReference:      text(getProp(page, "ID do Banco")),
  };
}

export async function getTransactionsForTour(tourId: string): Promise<Transaction[]> {
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: { property: "🎫 Sales", relation: { contains: tourId } },
    sorts: [{ property: "Data", direction: "descending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[]).map(mapTransaction);
}

export async function getTransactionsForMatching(): Promise<Transaction[]> {
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: {
      and: [
        { property: "Método de Pagamento", select: { equals: "Cartão Comum" } },
        {
          or: [
            { property: "Status", select: { equals: "Paid" } },
            { property: "Status", select: { equals: "Pending Receipt" } },
          ],
        },
      ],
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[]).map(mapTransaction);
}

export async function getAccountantTransactions(): Promise<Transaction[]> {
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: {
      or: [
        { property: "Status", select: { equals: "Paid" } },
        { property: "Status", select: { equals: "Reimbursed" } },
      ],
    },
    sorts: [{ property: "Data", direction: "descending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[]).map(mapTransaction);
}

export async function createTransaction(
  data: Omit<Transaction, "id" | "accountantVerified">
): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: TRANSACTIONS_DB },
    properties: {
      // Title field ("ID") — use supplier name for readability in Notion
      ID: { title: [{ text: { content: data.supplier || "Despesa" } }] },
      // Supplier as Relation to Fornecedores
      ...(data.fornecedorId
        ? { "👭 Fornecedores": { relation: [{ id: data.fornecedorId }] } }
        : {}),
      Data:               data.date ? { date: { start: data.date } } : { date: null },
      "ID Fatura":        { rich_text: [{ text: { content: data.invoiceId } }] },
      "Valor Sem IVA":    { number: data.taxFree },
      "IVA 6%":           { number: data.iva6 },
      "IVA 13%":          { number: data.iva13 },
      "IVA 23%":          { number: data.iva23 },
      Valor:              { number: data.totalCost },
      "Pago Por":         { select: { name: data.whoPaid } },
      "Método de Pagamento": { select: { name: data.paymentMethod } },
      Status:             { select: { name: data.status } },
      ...(data.tourId
        ? { "🎫 Sales": { relation: [{ id: data.tourId }] } }
        : {}),
      ...(data.bankReference
        ? { "ID do Banco": { rich_text: [{ text: { content: data.bankReference } }] } }
        : {}),
    },
  });
  return page.id;
}

export async function updateTransaction(
  pageId: string,
  data: Partial<Omit<Transaction, "id">>
): Promise<void> {
  const props: Record<string, unknown> = {};
  if (data.supplier !== undefined)
    props.ID = { title: [{ text: { content: data.supplier } }] };
  if (data.fornecedorId !== undefined)
    props["👭 Fornecedores"] = { relation: data.fornecedorId ? [{ id: data.fornecedorId }] : [] };
  if (data.date !== undefined)
    props.Data = { date: data.date ? { start: data.date } : null };
  if (data.invoiceId !== undefined)
    props["ID Fatura"] = { rich_text: [{ text: { content: data.invoiceId } }] };
  if (data.taxFree !== undefined)     props["Valor Sem IVA"] = { number: data.taxFree };
  if (data.iva6 !== undefined)        props["IVA 6%"] = { number: data.iva6 };
  if (data.iva13 !== undefined)       props["IVA 13%"] = { number: data.iva13 };
  if (data.iva23 !== undefined)       props["IVA 23%"] = { number: data.iva23 };
  if (data.totalCost !== undefined)   props.Valor = { number: data.totalCost };
  if (data.whoPaid !== undefined)
    props["Pago Por"] = { select: { name: data.whoPaid } };
  if (data.paymentMethod !== undefined)
    props["Método de Pagamento"] = { select: { name: data.paymentMethod } };
  if (data.status !== undefined)
    props.Status = { select: { name: data.status } };
  if (data.accountantVerified !== undefined)
    props["Validado pela Contabilidade"] = { checkbox: data.accountantVerified };
  if (data.tourId !== undefined)
    props["🎫 Sales"] = { relation: data.tourId ? [{ id: data.tourId }] : [] };
  if (data.bankReference !== undefined)
    props["ID do Banco"] = { rich_text: [{ text: { content: data.bankReference } }] };

  await notion.pages.update({
    page_id: pageId,
    properties: props as Parameters<typeof notion.pages.update>[0]["properties"],
  });
}

export async function verifyTransaction(pageId: string, verified: boolean): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { "Validado pela Contabilidade": { checkbox: verified } },
  });
}

// ── Fornecedores ──────────────────────────────────────────────────────────────

export type Fornecedor = {
  id: string;
  name: string;
};

export async function getFornecedores(): Promise<Fornecedor[]> {
  const res = await notion.databases.query({
    database_id: FORNECEDORES_DB,
    sorts: [{ property: "Name", direction: "ascending" }],
    page_size: 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[])
    .map((page) => ({ id: page.id, name: text(getProp(page, "Name")) }))
    .filter((f) => f.name);
}
