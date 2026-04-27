import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { unstable_cache } from "next/cache";

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
  role: "Admin" | "Guide" | "Super Guide" | "Accountant" | "Chef" | "Driver";
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

export const getTeamMembers = unstable_cache(
  async (): Promise<TeamMember[]> => {
    try {
      const res = await notion.databases.query({
        database_id: TEAM_DB,
        sorts: [{ property: "Name", direction: "ascending" }],
        page_size: 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return (res.results as PageObjectResponse[]).map(mapTeamMember).filter((m) => m.name);
    } catch { return []; }
  },
  ["team-members"],
  { revalidate: 300, tags: ["team-members"] }, // 5 min — safe to cache, changes rarely
);

export const getTeamMemberByEmail = unstable_cache(
  async (email: string): Promise<TeamMember | null> => {
    const res = await notion.databases.query({
      database_id: TEAM_DB,
      filter: { property: "email", email: { equals: email } },
    });
    if (!res.results.length) return null;
    return mapTeamMember(res.results[0] as PageObjectResponse);
  },
  ["team-member-by-email"],
  { revalidate: 300, tags: ["team-members"] }, // 5 min
);

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
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  const res = await notion.databases.query({
    database_id: TOURS_DB,
    filter: {
      and: [
        { property: "Date", date: { on_or_after: today.toISOString() } },
        { property: "Date", date: { before: in30Days.toISOString() } },
      ],
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const tours = await resolveRelationNames(
    (res.results as PageObjectResponse[]).map(mapTour)
  );

  return tours.filter(
    (t) =>
      t.status !== "Cancelled" && t.status !== "Canceled" &&
      (!t.numGuests || !t.names || !t.phoneNumber || !t.clientName || !t.notes)
  );
}

export async function getPendingServices(): Promise<Tour[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const res = await notion.databases.query({
      database_id: TOURS_DB,
      filter: {
        and: [
          { property: "Date", date: { on_or_after: today.toISOString() } },
          { property: "Date", date: { before: in30Days.toISOString() } },
          { property: "Status", select: { equals: "Pending" } },
        ],
      },
      sorts: [{ property: "Date", direction: "ascending" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return resolveRelationNames(
      (res.results as PageObjectResponse[]).map(mapTour)
    );
  } catch { return []; }
}

/**
 * Maps Equipa multi-select values (Portuguese or English) to
 * the corresponding Tour fields. Returns which roles are required
 * but have no one assigned.
 */
function getMissingStaffRoles(tour: Tour): string[] {
  const missing: string[] = [];
  for (const role of tour.serviceEquipa) {
    const r = role.toLowerCase();
    if ((r.includes("guia") || r.includes("guide")) && !tour.guideId) {
      missing.push(role);
    } else if (r.includes("chef") && !tour.chefId) {
      missing.push(role);
    } else if ((r.includes("driver") || r.includes("condutor")) && !tour.driverId) {
      missing.push(role);
    }
  }
  return missing;
}

export type TourWithMissingStaff = Tour & { missingRoles: string[] };

export async function getServicesWithMissingStaff(): Promise<TourWithMissingStaff[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const res = await notion.databases.query({
      database_id: TOURS_DB,
      filter: {
        and: [
          { property: "Date", date: { on_or_after: today.toISOString() } },
          { property: "Date", date: { before: in30Days.toISOString() } },
        ],
      },
      sorts: [{ property: "Date", direction: "ascending" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const tours = await resolveRelationNames(
      (res.results as PageObjectResponse[]).map(mapTour)
    );

    return tours
      .filter((t) => t.status !== "Cancelled" && t.status !== "Canceled")
      .filter((t) => t.serviceEquipa.length > 0) // only care if service defines required roles
      .map((t) => ({ ...t, missingRoles: getMissingStaffRoles(t) }))
      .filter((t) => t.missingRoles.length > 0);
  } catch { return []; }
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
//   client         → "💼 Client"        (Relation → Client DB)
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
  // Roles required by the linked Service (multi-select "Equipa" field)
  serviceEquipa: string[];
};

function mapTour(page: PageObjectResponse): Tour {
  const serviceIds = relation(getProp(page, "Service"));
  const clientIds  = relation(getProp(page, "💼 Client"));
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
    serviceEquipa:   [],
  };
}

/**
 * Cache individual Notion page retrievals for 5 minutes.
 * Service names, client names, and team member names rarely change, and are
 * fetched on every tour list page load. Caching them eliminates the most
 * expensive repeated API calls in the app.
 */
const getCachedPage = unstable_cache(
  async (pageId: string): Promise<PageObjectResponse> => {
    return (await notion.pages.retrieve({ page_id: pageId })) as PageObjectResponse;
  },
  ["notion-page"],
  { revalidate: 300, tags: ["notion-pages"] }, // 5 min
);

async function resolveRelationNames(tours: Tour[]): Promise<Tour[]> {
  const serviceIds = [...new Set(tours.map((t) => t.service).filter(Boolean) as string[])];
  const otherIds   = [...new Set([
    ...tours.map((t) => t.client),
    ...tours.map((t) => t.guideId),
    ...tours.map((t) => t.chefId),
    ...tours.map((t) => t.driverId),
  ].filter(Boolean) as string[])];

  if (!serviceIds.length && !otherIds.length) return tours;

  const nameMap:          Record<string, string>   = {};
  const serviceTypeMap:   Record<string, string>   = {};
  const serviceEquipaMap: Record<string, string[]> = {};

  await Promise.all([
    // Service pages: grab title + Type + Equipa (cached 5 min)
    ...serviceIds.map(async (id) => {
      try {
        const page = await getCachedPage(id);
        nameMap[id]          = pageTitle(page);
        serviceTypeMap[id]   = text(getProp(page, "Type"));
        serviceEquipaMap[id] = multiSelect(getProp(page, "Equipa"));
      } catch { /* ignore */ }
    }),
    // Client, guide, chef, driver: just the title (cached 5 min)
    ...otherIds.map(async (id) => {
      try {
        const page = await getCachedPage(id);
        nameMap[id] = pageTitle(page);
      } catch { /* ignore */ }
    }),
  ]);

  return tours.map((t) => ({
    ...t,
    serviceName:   nameMap[t.service]          ?? "",
    serviceType:   serviceTypeMap[t.service]   ?? "",
    serviceEquipa: serviceEquipaMap[t.service] ?? [],
    clientName:    nameMap[t.client]           ?? "",
    guideName:     nameMap[t.guideId!]         ?? "",
    chefName:      nameMap[t.chefId!]          ?? "",
    driverName:    nameMap[t.driverId!]        ?? "",
  }));
}

export async function updateTourServiceInfo(
  tourId: string,
  data: {
    numGuests: number | null;
    names: string;
    phoneNumber: string;
    notes: string;
  },
): Promise<void> {
  try {
    await notion.pages.update({
      page_id: tourId,
      properties: {
        "Number of Guests": { number: data.numGuests ?? null },
        Names: { rich_text: data.names ? [{ text: { content: data.names } }] : [] },
        "Phone Number": { rich_text: data.phoneNumber ? [{ text: { content: data.phoneNumber } }] : [] },
        Notes: { rich_text: data.notes ? [{ text: { content: data.notes } }] : [] },
      } as Parameters<typeof notion.pages.update>[0]["properties"],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[updateTourServiceInfo] error:", msg);
    throw new Error(`Notion: ${msg}`);
  }
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
  transferenciaFeita?: boolean;
  comprovantivoUrl?: string;
  paidByName?: string;
  payeeIban?: string;
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
    transferenciaFeita: bool(getProp(page, "Transferência Feita")),
    comprovantivoUrl:   fileUrl(getProp(page, "Comprovativo de Pagamento"), page.id) ?? undefined,
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

/** Single Notion query fetching all transactions for a tour (expenses + earnings). */
async function getRawTransactionsForTour(tourId: string): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: { property: "🎫 Sales", relation: { contains: tourId } },
      sorts: [{ property: "Data", direction: "descending" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[]).map(mapTransaction);
  } catch { return []; }
}

export async function getTransactionsForTour(tourId: string): Promise<Transaction[]> {
  return (await getRawTransactionsForTour(tourId)).filter((t) => !t.supplier.startsWith("IN -"));
}

export async function getEarningsForTour(tourId: string): Promise<Transaction[]> {
  return (await getRawTransactionsForTour(tourId)).filter((t) => t.supplier.startsWith("IN -"));
}

/**
 * Fetch expenses and earnings for a tour in a single Notion query.
 * Use this instead of calling getTransactionsForTour + getEarningsForTour
 * separately — they share the same underlying query.
 */
export async function getExpensesAndEarningsForTour(
  tourId: string,
): Promise<{ expenses: Transaction[]; earnings: Transaction[] }> {
  const all = await getRawTransactionsForTour(tourId);
  return {
    expenses: all.filter((t) => !t.supplier.startsWith("IN -")),
    earnings: all.filter((t) =>  t.supplier.startsWith("IN -")),
  };
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

/**
 * All Notion transactions that already have a bank reference (matched).
 * Returns a map: bankReference → Transaction[] to support multiple Notion
 * records linked to a single bank transaction (e.g. a client pays several
 * services in one wire transfer).
 */
export async function getMatchedTransactionMap(): Promise<Record<string, Transaction[]>> {
  try {
    const map: Record<string, Transaction[]> = {};
    let cursor: string | undefined;
    let pages = 0;
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await notion.databases.query({
        database_id: TRANSACTIONS_DB,
        filter: { property: "ID do Banco", rich_text: { is_not_empty: true } },
        sorts: [{ property: "Data", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      } as any);
      for (const page of res.results as PageObjectResponse[]) {
        const tx = mapTransaction(page);
        if (tx.bankReference && tx.status !== "Unmatched Bank Entry") {
          if (!map[tx.bankReference]) map[tx.bankReference] = [];
          map[tx.bankReference].push(tx);
        }
      }
      cursor = res.next_cursor ?? undefined;
    } while (cursor && ++pages < 20);
    return map;
  } catch (err) {
    console.error("[getMatchedTransactionMap] failed:", err);
    return {};
  }
}

/**
 * Notion earnings ("IN - ...") with no bank reference — for matching against
 * bank credit (CRDT) transactions.
 */
export async function getLinkableEarnings(): Promise<Transaction[]> {
  try {
    const results: Transaction[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await notion.databases.query({
        database_id: TRANSACTIONS_DB,
        filter: { property: "ID do Banco", rich_text: { is_empty: true } },
        sorts: [{ property: "Data", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      } as any);
      results.push(
        ...(res.results as PageObjectResponse[])
          .map(mapTransaction)
          .filter((t) => t.supplier.startsWith("IN -") && t.status !== "Unmatched Bank Entry")
      );
      cursor = res.next_cursor ?? undefined;
    } while (cursor && ++pages < 10);
    return results;
  } catch (err) {
    console.error("[getLinkableEarnings] failed:", err);
    return [];
  }
}

/**
 * Notion expenses that have no bank reference yet and can be linked manually.
 * Fetches all records with an empty ID do Banco field; filters out sync
 * placeholders, cancelled records, and earnings client-side.
 */
export async function getLinkableExpenses(): Promise<Transaction[]> {
  try {
    const results: Transaction[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await notion.databases.query({
        database_id: TRANSACTIONS_DB,
        filter: { property: "ID do Banco", rich_text: { is_empty: true } },
        sorts: [{ property: "Data", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      } as any);
      const EXCLUDED = new Set(["Unmatched Bank Entry", "Cancelled"]);
      results.push(
        ...(res.results as PageObjectResponse[])
          .map(mapTransaction)
          .filter((t) => !EXCLUDED.has(t.status) && !t.supplier.startsWith("IN -"))
      );
      cursor = res.next_cursor ?? undefined;
    } while (cursor && ++pages < 10);
    return results;
  } catch (err) {
    console.error("[getLinkableExpenses] failed:", err);
    return [];
  }
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
      Valor:              { number: -(Math.abs(data.totalCost)) },  // always negative
      "Pago Por":         { select: { name: data.whoPaid } },
      "Método de Pagamento": { select: { name: data.paymentMethod } },
      Status:             { select: { name: data.status } },
      Type:               { select: { name: "Expense" } },
      "Conta de Pagamento": { select: { name: "COME" } },
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
  if (data.totalCost !== undefined)   props.Valor = { number: -(Math.abs(data.totalCost)) }; // always negative
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

/** All "Pelo Guia" expenses where Transferência Feita is not yet checked. */
export async function getGuideExpenses(): Promise<Transaction[]> {
  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: {
        and: [
          {
            or: [
              { property: "Método de Pagamento", select: { equals: "Pelo Guia" } },
              { property: "Método de Pagamento", select: { equals: "Pelo Chef" } },
              { property: "Método de Pagamento", select: { equals: "Pelo Driver" } },
              { property: "Método de Pagamento", select: { equals: "Honorários" } },
            ],
          },
          { property: "Transferência Feita", checkbox: { equals: false } },
        ],
      },
      sorts: [{ property: "Data", direction: "descending" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const transactions = (res.results as PageObjectResponse[]).map(mapTransaction);

    const uniqueTourIds = [...new Set(transactions.map((t) => t.tourId).filter(Boolean))] as string[];

    const [teamMembers, tourPages] = await Promise.all([
      getTeamMembers(),
      Promise.all(uniqueTourIds.map((id) => notion.pages.retrieve({ page_id: id }).catch(() => null))),
    ]);

    // id → { name, iban } and name (lowercase) → iban for Honorários lookup
    const memberById = Object.fromEntries(teamMembers.map((m) => [m.id, { name: m.name, iban: m.iban }]));
    const ibanByName = Object.fromEntries(teamMembers.map((m) => [m.name.toLowerCase(), m.iban]));

    const tourMemberMap: Record<string, { guide?: string; chef?: string; driver?: string }> = {};
    for (let i = 0; i < uniqueTourIds.length; i++) {
      const page = tourPages[i] as PageObjectResponse | null;
      if (!page || !("properties" in page)) continue;
      tourMemberMap[uniqueTourIds[i]] = {
        guide:  relation(getProp(page, "Guia"))[0],
        chef:   relation(getProp(page, "Chef"))[0],
        driver: relation(getProp(page, "Driver 1"))[0],
      };
    }

    return transactions.map((t) => {
      if (t.paymentMethod === "Honorários") {
        return { ...t, paidByName: t.supplier, payeeIban: ibanByName[t.supplier.toLowerCase()] ?? "" };
      }
      if (!t.tourId) return t;
      const members = tourMemberMap[t.tourId];
      if (!members) return t;
      const memberId = t.paymentMethod === "Pelo Chef" ? members.chef
                     : t.paymentMethod === "Pelo Driver" ? members.driver
                     : members.guide;
      const member = memberId ? memberById[memberId] : undefined;
      return { ...t, paidByName: member?.name ?? "", payeeIban: member?.iban ?? "" };
    });
  } catch { return []; }
}

export async function markTransferenciaFeita(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { "Transferência Feita": { checkbox: true } },
  });
}

export async function setComprovativoUrl(pageId: string, url: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Comprovativo de Pagamento": {
        files: [{ type: "external", name: "comprovativo", external: { url } }],
      },
    } as Parameters<typeof notion.pages.update>[0]["properties"],
  });
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

export const getFornecedores = unstable_cache(
  async (): Promise<Fornecedor[]> => {
    const res = await notion.databases.query({
      database_id: FORNECEDORES_DB,
      sorts: [{ property: "Name", direction: "ascending" }],
      page_size: 100,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (res.results as PageObjectResponse[])
      .map((page) => ({ id: page.id, name: text(getProp(page, "Name")) }))
      .filter((f) => f.name);
  },
  ["fornecedores"],
  { revalidate: 300, tags: ["fornecedores"] }, // 5 min — changes rarely
);

// ── Analytics ─────────────────────────────────────────────────────────────────

/** Resolve page titles for an arbitrary list of Notion page IDs. */
export async function resolvePageTitles(ids: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
        map[id] = pageTitle(page);
      } catch { /* ignore missing/archived pages */ }
    })
  );
  return map;
}

/**
 * Fetches ALL past tours for analytics, paginating until exhausted.
 * Resolves only service names (small unique set) — team member names
 * are resolved externally via getTeamMembers() which is cached.
 */
export async function getAnalyticsTours(): Promise<Tour[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allTours: Tour[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pages = 0;

    while (hasMore && pages < 50) { // safety cap: 5 000 tours
      const res = await notion.databases.query({
        database_id: TOURS_DB,
        // No date filter — includes past AND future tours.
        // Sorted descending so future tours (most recent) come first.
        sorts: [{ property: "Date", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      allTours.push(...(res.results as PageObjectResponse[]).map(mapTour));
      hasMore = res.has_more;
      cursor = (res.next_cursor as string | null) ?? undefined;
      pages++;
    }

    // Resolve only service names (typically 5–15 unique services)
    const serviceIds = [...new Set(allTours.map((t) => t.service).filter(Boolean))];
    const serviceNameMap: Record<string, string> = {};
    const serviceTypeMap: Record<string, string> = {};
    await Promise.all(
      serviceIds.map(async (id) => {
        try {
          const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
          serviceNameMap[id] = pageTitle(page);
          serviceTypeMap[id] = text(getProp(page, "Type"));
        } catch { /* ignore */ }
      })
    );

    return allTours.map((t) => ({
      ...t,
      serviceName: serviceNameMap[t.service] ?? "",
      serviceType: serviceTypeMap[t.service] ?? "",
    }));
  } catch { return []; }
}

/**
 * Fetches ALL transactions for analytics, paginating until exhausted.
 * Does not resolve tour names to keep it fast.
 */
export async function getAnalyticsTransactions(): Promise<Transaction[]> {
  try {
    const allTxns: Transaction[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pages = 0;

    while (hasMore && pages < 50) { // safety cap: 5 000 transactions
      const res = await notion.databases.query({
        database_id: TRANSACTIONS_DB,
        sorts: [{ property: "Data", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      allTxns.push(...(res.results as PageObjectResponse[]).map(mapTransaction));
      hasMore = res.has_more;
      cursor = (res.next_cursor as string | null) ?? undefined;
      pages++;
    }

    return allTxns;
  } catch { return []; }
}

