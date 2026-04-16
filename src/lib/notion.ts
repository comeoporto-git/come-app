import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

const TEAM_DB         = process.env.NOTION_TEAM_DB_ID!;
const TOURS_DB        = process.env.NOTION_SALES_DB_ID!;
const TRANSACTIONS_DB = process.env.NOTION_TRANSACTIONS_DB_ID!;
const FORNECEDORES_DB = process.env.NOTION_FORNECEDORES_DB_ID!;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SERVICES_DB = '32117fedf54b803baf90c2957bde0762';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getProp(page: PageObjectResponse, name: string) {
  return (page.properties as Record<string, unknown>)[name];
}

/** Reads the title of any Notion page regardless of what the title column is named. */
function pageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    const p = prop as Record<string, unknown>;
    if (p.type === "title") {
      return (p.title as { plain_text: string }[])[0]?.plain_text ?? "";
    }
  }
  return "";
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

function fileUrl(prop: unknown, pageId?: string): string | null {
  if (!prop || typeof prop !== "object") return null;
  const files = (prop as Record<string, unknown>).files as Array<{
    type: string; external?: { url: string }; file?: { url: string };
  }>;
  if (!files?.length) return null;
  const f = files[0];
  // External (Vercel Blob) URLs are permanent — use directly.
  if (f.type === "external" && f.external?.url) return f.external.url;
  // Notion-hosted files have expiring signed URLs — proxy through our API.
  if (f.type === "file" && pageId) return `/api/invoice-image/${pageId}`;
  return f.file?.url ?? null;
}

// ── Team ─────────────────────────────────────────────────────────────────────

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  nif: string;
  iban: string;
  role: "Admin" | "Guide" | "Super Guide" | "Accountant" | "Chef";
};

function mapTeamMember(page: PageObjectResponse): TeamMember {
  return {
    id:   page.id,
    name: text(getProp(page, "Name")),
    email: text(getProp(page, "email")),
    phone: text(getProp(page, "Contact")),
    nif:  text(getProp(page, "NIF")),
    iban: text(getProp(page, "IBAN")),
    role: text(getProp(page, "Role")) as TeamMember["role"],
  };
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  try {
    const res = await notion.databases.query({
      database_id: TEAM_DB,
      sorts: [{ property: "Name", direction: "ascending" }],
      page_size: 100,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[]).map(mapTeamMember).filter((m) => m.name);
  } catch { return []; }
}

export async function getTeamMemberByEmail(email: string): Promise<TeamMember | null> {
  const res = await notion.databases.query({
    database_id: TEAM_DB,
    filter: { property: "email", email: { equals: email } },
  });
  if (!res.results.length) return null;
  return mapTeamMember(res.results[0] as PageObjectResponse);
}

export async function getTeamMemberById(id: string): Promise<TeamMember | null> {
  try {
    const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
    return mapTeamMember(page);
  } catch { return null; }
}

export async function updateTeamMemberProfile(
  memberId: string,
  data: { name: string; phone: string; nif: string; iban: string },
): Promise<void> {
  // Core fields (always exist)
  await notion.pages.update({
    page_id: memberId,
    properties: {
      Name:    { title: [{ text: { content: data.name } }] },
      Contact: { phone_number: data.phone || null },
    } as Parameters<typeof notion.pages.update>[0]["properties"],
  });
  // Optional fields — wrapped separately so missing columns don't block the save
  try {
    await notion.pages.update({
      page_id: memberId,
      properties: {
        NIF:  { rich_text: [{ text: { content: data.nif  } }] },
        IBAN: { rich_text: [{ text: { content: data.iban } }] },
      } as Parameters<typeof notion.pages.update>[0]["properties"],
    });
  } catch { /* columns may not exist in this workspace yet */ }
}

export async function getServicesWithMissingInfo(): Promise<Tour[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      and: [
        { property: "Date", date: { on_or_after: today.toISOString() } },
        { property: "Date", date: { before: nextWeek.toISOString() } },
      ],
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const tours = await resolveRelationNames(
    (res.results as PageObjectResponse[]).map(mapTour)
  );

  return tours.filter(
    (t) => !t.numGuests || !t.names || !t.phoneNumber || !t.clientName
  );
}

export async function updateTeamMemberRole(
  memberId: string,
  role: TeamMember["role"],
): Promise<void> {
  await notion.pages.update({
    page_id: memberId,
    properties: {
      Role: { select: { name: role } },
    } as Parameters<typeof notion.pages.update>[0]["properties"],
  });
}

// ── Tours (Sales DB) ──────────────────────────────────────────────────────────
//
// Property name mapping (our code → Notion Sales DB):
//   saleId         → "ID"               (Title)
//   service        → "Service"          (Relation → Services DB)
//   date           → "Date"             (Date)
//   client         → "Client"           (Relation → Client DB)
//   numGuests      → "Number of Guests" (Number)
//   names          → "Names"            (Text)
//   notes          → "Notes"            (Text)
//   guideId        → "Guia"             (Relation → Team DB)
//   chefId         → "Chef"             (Relation → Team DB)
//   driverId       → "Driver 1"         (Relation → Team DB)
//   expensesClosed → "Expenses Closed"  (Select — empty = open, any value = closed)

export type Tour = {
  id: string;
  saleId: string;
  service: string;
  serviceName: string;
  serviceType: string;   // "Type" field from the linked Services DB page
  type: string;
  date: string | null;
  client: string;
  clientName: string;
  numGuests: number;
  names: string;
  phoneNumber: string;
  notes: string;
  status: string;
  // Team
  guideId: string | null;
  guideName: string;
  chefId: string | null;
  chefName: string;
  driverId: string | null;
  driverName: string;
  // kept for backward-compat with guide-filter queries
  teamId: string | null;
  expensesClosed: boolean;
};

function mapTour(page: PageObjectResponse): Tour {
  const serviceIds = relation(getProp(page, "Service"));
  const clientIds  = relation(getProp(page, "Client"));
  const guideIds   = relation(getProp(page, "Guia"));
  const chefIds    = relation(getProp(page, "Chef"));
  const driverIds  = relation(getProp(page, "Driver 1"));
  return {
    id:              page.id,
    saleId:          text(getProp(page, "ID")),
    service:         serviceIds[0] ?? "",
    serviceName:     "",
    serviceType:     "",
    type:            text(getProp(page, "Type")),
    date:            dateStr(getProp(page, "Date")),
    client:          clientIds[0] ?? "",
    clientName:      "",
    numGuests:       num(getProp(page, "Number of Guests")),
    names:           text(getProp(page, "Names")),
    phoneNumber:     text(getProp(page, "Phone Number")),
    notes:           text(getProp(page, "Notes")),
    status:          text(getProp(page, "Status")),
    guideId:         guideIds[0]  ?? null,
    guideName:       "",
    chefId:          chefIds[0]   ?? null,
    chefName:        "",
    driverId:        driverIds[0] ?? null,
    driverName:      "",
    teamId:          guideIds[0]  ?? null, // backward-compat
    expensesClosed:  text(getProp(page, "Expenses Closed")) === "Closed",
  };
}

async function resolveRelationNames(tours: Tour[]): Promise<Tour[]> {
  const serviceIds = [...new Set(tours.map((t) => t.service).filter(Boolean) as string[])];
  const otherIds   = [...new Set([
    ...tours.map((t) => t.client),
    ...tours.map((t) => t.guideId),
    ...tours.map((t) => t.chefId),
    ...tours.map((t) => t.driverId),
  ].filter(Boolean) as string[])];

  if (!serviceIds.length && !otherIds.length) return tours;

  const nameMap:        Record<string, string> = {};
  const serviceTypeMap: Record<string, string> = {};

  await Promise.all([
    // Service pages: grab title + Type
    ...serviceIds.map(async (id) => {
      try {
        const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
        nameMap[id]        = pageTitle(page);
        serviceTypeMap[id] = text(getProp(page, "Type"));
      } catch { /* ignore */ }
    }),
    // Everything else (client, guide, chef, driver): use title regardless of column name
    ...otherIds.map(async (id) => {
      try {
        const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
        nameMap[id] = pageTitle(page);
      } catch { /* ignore */ }
    }),
  ]);

  return tours.map((t) => ({
    ...t,
    serviceName:  nameMap[t.service]        ?? "",
    serviceType:  serviceTypeMap[t.service] ?? "",
    clientName:   nameMap[t.client]         ?? "",
    guideName:    nameMap[t.guideId!]       ?? "",
    chefName:     nameMap[t.chefId!]        ?? "",
    driverName:   nameMap[t.driverId!]      ?? "",
  }));
}

export async function updateTourTeam(
  tourId: string,
  guideId: string | null,
  chefId: string | null,
  driverId: string | null,
): Promise<void> {
  // Update Guia + Chef as relations (they are Relation fields in Notion)
  try {
    await notion.pages.update({
      page_id: tourId,
      properties: {
        Guia: { relation: guideId ? [{ id: guideId }] : [] },
        Chef: { relation: chefId  ? [{ id: chefId  }] : [] },
      } as Parameters<typeof notion.pages.update>[0]["properties"],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[updateTourTeam] Guia/Chef error:", msg);
    throw new Error(`Notion: ${msg}`);
  }

  // Update Driver 1 as a Relation
  try {
    await notion.pages.update({
      page_id: tourId,
      properties: {
        "Driver 1": { relation: driverId ? [{ id: driverId }] : [] },
      } as Parameters<typeof notion.pages.update>[0]["properties"],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[updateTourTeam] Driver 1 error:", msg);
    throw new Error(`Notion (Driver 1): ${msg}`);
  }
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
        { property: "Guia", relation: { contains: member.id } },
        { property: "Date", date: { on_or_after: today.toISOString() } },
        { property: "Expenses Closed", select: { does_not_equal: "Closed" } },
      ],
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return resolveRelationNames((res.results as PageObjectResponse[]).map(mapTour));
}

export async function getPastToursForGuide(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      and: [
        { property: "Guia", relation: { contains: member.id } },
        { property: "Date", date: { before: today.toISOString() } },
      ],
    },
    sorts: [{ property: "Date", direction: "descending" }],
    page_size: 30,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return resolveRelationNames((res.results as PageObjectResponse[]).map(mapTour));
}

export async function getToursForChef(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      and: [
        { property: "Chef", relation: { contains: member.id } },
        { property: "Date", date: { on_or_after: today.toISOString() } },
        { property: "Expenses Closed", select: { does_not_equal: "Closed" } },
      ],
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return resolveRelationNames((res.results as PageObjectResponse[]).map(mapTour));
}

export async function getPastToursForChef(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      and: [
        { property: "Chef", relation: { contains: member.id } },
        { property: "Date", date: { before: today.toISOString() } },
      ],
    },
    sorts: [{ property: "Date", direction: "descending" }],
    page_size: 30,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return resolveRelationNames((res.results as PageObjectResponse[]).map(mapTour));
}

export async function getChefTransactionsForTour(tourId: string): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: {
        and: [
          { property: "🎫 Sales", relation: { contains: tourId } },
          {
            or: [
              { property: "Método de Pagamento", select: { equals: "Pelo Chef" } },
              { property: "Método de Pagamento", select: { equals: "Chef Fee" } },
            ],
          },
        ],
      },
      sorts: [{ property: "Data", direction: "descending" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[]).map(mapTransaction);
  } catch { return []; }
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
  return resolveRelationNames((res.results as PageObjectResponse[]).map(mapTour));
}

export async function getAllPastTours(): Promise<Tour[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      property: "Date",
      date: { before: today.toISOString() },
    },
    sorts: [{ property: "Date", direction: "descending" }],
    page_size: 50,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return resolveRelationNames((res.results as PageObjectResponse[]).map(mapTour));
}

export async function getTourById(id: string): Promise<Tour | null> {
  try {
    const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
    const tour = mapTour(page);
    const [resolved] = await resolveRelationNames([tour]);
    return resolved;
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
  tourName?: string;      // resolved from the Sales relation (saleId)
  bankReference: string;
  invoiceImageUrl?: string;
  precisaDeFatura?: "Sim" | "Não" | "Sim tratado" | "";
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
    tourName:           "",
    bankReference:      text(getProp(page, "ID do Banco")),
    invoiceImageUrl:    fileUrl(getProp(page, "Fatura"), page.id) ?? undefined,
    precisaDeFatura:    text(getProp(page, "Precisa de Fatura")) as Transaction["precisaDeFatura"],
  };
}

async function resolveTourNamesForTransactions(transactions: Transaction[]): Promise<Transaction[]> {
  const uniqueTourIds = [...new Set(transactions.map((t) => t.tourId).filter(Boolean))] as string[];
  if (!uniqueTourIds.length) return transactions;
  const tourNameMap: Record<string, string> = {};
  await Promise.all(
    uniqueTourIds.map(async (id) => {
      try {
        const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
        tourNameMap[id] = text(getProp(page, "ID"));
      } catch { /* ignore */ }
    })
  );
  return transactions.map((t) => ({
    ...t,
    tourName: t.tourId ? (tourNameMap[t.tourId] ?? "") : "",
  }));
}

export async function getTransactionsForTour(tourId: string): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: { property: "🎫 Sales", relation: { contains: tourId } },
      sorts: [{ property: "Data", direction: "descending" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[])
      .map(mapTransaction)
      .filter((t) => !t.supplier.startsWith("IN -"));
  } catch { return []; }
}

export async function getTransactionsForMatching(): Promise<Transaction[]> {
  // Fetch Cartão COME transactions; filter non-IN- entries in code
  // to avoid errors from select options that may not exist yet in Notion
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: { property: "Método de Pagamento", select: { equals: "Cartão COME" } },
    page_size: 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[])
    .map(mapTransaction)
    .filter((t) => !t.supplier.startsWith("IN -"));
}

export async function getAccountantTransactions(): Promise<Transaction[]> {
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    sorts: [{ property: "Data", direction: "descending" }],
    page_size: 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return (res.results as PageObjectResponse[])
    .map(mapTransaction)
    .filter((t) => !t.supplier.startsWith("IN -"));
}

export async function getTransactionsNeedingInvoice(): Promise<Transaction[]> {
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: { property: "Precisa de Fatura", select: { equals: "Sim" } },
    sorts: [{ property: "Data", direction: "descending" }],
    page_size: 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const transactions = (res.results as PageObjectResponse[]).map(mapTransaction);
  return resolveTourNamesForTransactions(transactions);
}

export async function getPeloGuiaTransactionsForMatching(): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: {
        and: [
          { property: "Método de Pagamento", select: { equals: "Pelo Guia" } },
          { property: "Status", select: { equals: "Paid" } },
        ],
      },
      sorts: [{ property: "Data", direction: "descending" }],
      page_size: 200,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[])
      .map(mapTransaction)
      .filter((t) => !t.bankReference); // exclude already-reimbursed ones
  } catch { return []; }
}

/** All transactions that have been matched to a bank debit (have a bankReference) */
export async function getMatchedTransactions(): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: { property: "ID do Banco", rich_text: { is_not_empty: true } },
      sorts: [{ property: "Data", direction: "descending" }],
      page_size: 200,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[]).map(mapTransaction);
  } catch { return []; }
}

export async function getUnmatchedBankTransactions(): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: { property: "Status", select: { equals: "Unmatched Bank Entry" } },
      sorts: [{ property: "Data", direction: "descending" }],
      page_size: 100,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[]).map(mapTransaction);
  } catch { return []; }
}

export async function getFlaggedTransactions(): Promise<Transaction[]> {
  try {
    // Fetch both "Flag: Missing Bank Entry" (Cartão COME) and
    // "Flag: Missing Reimbursement" (Pelo Guia) in one query
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: {
        or: [
          { property: "Status", select: { equals: "Flag: Missing Bank Entry" } },
          { property: "Status", select: { equals: "Flag: Missing Reimbursement" } },
        ],
      },
      sorts: [{ property: "Data", direction: "descending" }],
      page_size: 100,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[]).map(mapTransaction);
  } catch { return []; }
}

export async function getTransactionsTreated(): Promise<Transaction[]> {
  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: { property: "Precisa de Fatura", select: { equals: "Sim tratado" } },
    sorts: [{ property: "Data", direction: "descending" }],
    page_size: 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const transactions = (res.results as PageObjectResponse[]).map(mapTransaction);
  return resolveTourNamesForTransactions(transactions);
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
      ...(data.invoiceImageUrl
        ? { "Fatura": { files: [{ type: "external", name: "invoice", external: { url: data.invoiceImageUrl } }] } }
        : {}),
      ...(data.bankReference
        ? { "ID do Banco": { rich_text: [{ text: { content: data.bankReference } }] } }
        : {}),
      ...(data.precisaDeFatura
        ? { "Precisa de Fatura": { select: { name: data.precisaDeFatura } } }
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
  if (data.invoiceImageUrl)
    props["Fatura"] = { files: [{ type: "external", name: "invoice", external: { url: data.invoiceImageUrl } }] };
  if (data.precisaDeFatura !== undefined)
    props["Precisa de Fatura"] = data.precisaDeFatura
      ? { select: { name: data.precisaDeFatura } }
      : { select: null };

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

export async function archiveTransaction(pageId: string): Promise<void> {
  await notion.pages.update({ page_id: pageId, archived: true });
}

// ── Fornecedores ──────────────────────────────────────────────────────────────

export type Fornecedor = {
  id: string;
  name: string;
};

export async function createFornecedor(name: string): Promise<Fornecedor> {
  const page = await notion.pages.create({
    parent: { database_id: FORNECEDORES_DB },
    properties: {
      Name: { title: [{ text: { content: name.trim() } }] },
    },
  });
  return { id: page.id, name: name.trim() };
}

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

