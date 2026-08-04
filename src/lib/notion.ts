/**
 * Data access layer — Supabase implementation.
 * Exports are identical to the previous Notion-based version so every
 * import throughout the app continues to work without changes.
 */

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  nif: string;
  iban: string;
  role: "Admin" | "Guide" | "Super Guide" | "Accountant" | "Chef" | "Driver";
};

export type Tour = {
  id: string;
  saleId: string;
  service: string;
  serviceName: string;
  serviceType: string;
  type: string;
  date: string | null;
  client: string;
  clientName: string;
  numGuests: number;
  names: string;
  phoneNumber: string;
  notes: string;
  meetingPoint: string;
  status: string;
  guideId: string | null;
  guideName: string;
  chefId: string | null;
  chefName: string;
  driverId: string | null;
  driverName: string;
  teamId: string | null;
  expensesClosed: boolean;
  serviceEquipa: string[];
  threadIds: string[];
  startTime: string | null;
  endTime: string | null;
  expectedRevenue?: number;
};

export type TourWithMissingStaff = Tour & { missingRoles: string[] };

export type FinalisedSale = Tour & {
  price1: number;
  price23: number;
  price46: number;
  price7: number;
  pricePerPax: number;
};

export type Transaction = {
  id: string;
  supplier: string;
  fornecedorId: string | null;
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
  tourName?: string;
  bankReference: string;
  invoiceImageUrl?: string;
  precisaDeFatura?: "Sim" | "Não" | "Sim tratado" | "AI Scan Falhou" | "";
  transferenciaFeita?: boolean;
  comprovantivoUrl?: string;
  paidByName?: string;
  payeeIban?: string;
  contaPagamento?: string;
  txType?: "Earning" | "Expense";
};

export type Fornecedor = {
  id: string;
  name: string;
  email?: string | null;
  contact?: string | null;
  iban?: string | null;
  contribuinte?: string | null;
  categoria?: string | null;
};

// ── Row mappers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTeamRow(row: any): TeamMember {
  return {
    id:    row.id,
    name:  row.name    ?? "",
    email: row.email   ?? "",
    phone: row.contact ?? "",
    nif:   row.numero_contribuinte ?? "",
    iban:  row.iban    ?? "",
    role:  (row.role ?? "Guide") as TeamMember["role"],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSaleRow(row: any): Tour {
  return {
    id:            row.id,
    saleId:        row.notion_id    ?? "",
    service:       row.service_id   ?? "",
    serviceName:   row.services?.name ?? "",
    serviceType:   row.services?.type ?? "",
    type:          row.type          ?? "",
    date:          row.date ? String(row.date).split("T")[0] : null,
    client:        row.client_id     ?? "",
    clientName:    row.clients?.name ?? "",
    numGuests:     row.number_of_guests ?? 0,
    names:         row.names         ?? "",
    phoneNumber:   row.phone_number  ?? "",
    notes:         row.notes         ?? "",
    meetingPoint:  row.meeting_point ?? "",
    status:        row.status        ?? "",
    guideId:       row.guide_id      ?? null,
    guideName:     row.guide?.name   ?? "",
    chefId:        row.chef_id       ?? null,
    chefName:      row.chef?.name    ?? "",
    driverId:      row.driver_id     ?? null,
    driverName:    row.driver?.name  ?? "",
    teamId:        row.guide_id      ?? null,
    expensesClosed: row.expenses_closed === "Closed",
    serviceEquipa: row.services?.equipa ?? [],
    threadIds: row.thread_ids
      ? String(row.thread_ids).split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime:   row.end_time   ? String(row.end_time).slice(0, 5)   : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransactionRow(row: any): Transaction {
  return {
    id:                 row.id,
    supplier:           row.notion_id     ?? "",
    fornecedorId:       row.fornecedor_id ?? null,
    date:               row.data ? String(row.data).split("T")[0] : null,
    invoiceId:          row.id_fatura     ?? "",
    taxFree:            row.valor_sem_iva ?? 0,
    iva6:               row.iva_6         ?? 0,
    iva13:              row.iva_13        ?? 0,
    iva23:              row.iva_23        ?? 0,
    totalCost:          row.valor         ?? 0,
    whoPaid:            row.pago_por      ?? "",
    paymentMethod:      row.metodo_pagamento ?? "",
    status:             row.status        ?? "",
    accountantVerified: row.validado_contabilidade ?? false,
    tourId:             row.sale_id       ?? null,
    tourName:           row.sales?.notion_id ?? "",
    bankReference:      row.id_banco      ?? "",
    invoiceImageUrl:    row.fatura_url    ?? undefined,
    precisaDeFatura:    (row.precisa_fatura ?? "") as Transaction["precisaDeFatura"],
    transferenciaFeita: row.transferencia_feita ?? false,
    comprovantivoUrl:   row.comprovativo_url    ?? undefined,
    contaPagamento:     row.conta_pagamento     ?? undefined,
    txType:             (row.type as "Earning" | "Expense" | undefined) ?? undefined,
  };
}

// Reusable SELECT fragments
const SALE_SELECT = `
  *,
  clients(name),
  services(name, type, equipa),
  guide:team!sales_guide_id_fkey(name),
  chef:team!sales_chef_id_fkey(name),
  driver:team!sales_driver_id_fkey(name)
`.trim();

const TX_SELECT = `*, type, sales!transactions_sale_id_fkey(notion_id)`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function today0(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function in30Days(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function getMissingStaffRoles(tour: Tour): string[] {
  const missing: string[] = [];
  for (const role of tour.serviceEquipa) {
    const r = role.toLowerCase();
    if ((r.includes("guia") || r.includes("guide")) && !tour.guideId) missing.push(role);
    else if (r.includes("chef") && !tour.chefId) missing.push(role);
    else if ((r.includes("driver") || r.includes("condutor")) && !tour.driverId) missing.push(role);
  }
  return missing;
}

// ── Team ──────────────────────────────────────────────────────────────────────

export const getTeamMembers = unstable_cache(
  async (): Promise<TeamMember[]> => {
    try {
      const { data } = await supabase.from("team").select("*").order("name");
      return (data ?? []).map(mapTeamRow).filter((m) => m.name);
    } catch { return []; }
  },
  ["team-members"],
  { revalidate: 300, tags: ["team-members"] },
);

export const getTeamMemberByEmail = unstable_cache(
  async (email: string): Promise<TeamMember | null> => {
    const { data } = await supabase.from("team").select("*").eq("email", email).maybeSingle();
    return data ? mapTeamRow(data) : null;
  },
  ["team-member-by-email"],
  { revalidate: 300, tags: ["team-members"] },
);

export async function getTeamMemberById(id: string): Promise<TeamMember | null> {
  try {
    const { data } = await supabase.from("team").select("*").eq("id", id).maybeSingle();
    return data ? mapTeamRow(data) : null;
  } catch { return null; }
}

export async function updateTeamMemberProfile(
  memberId: string,
  data: { name: string; phone: string; nif: string; iban: string },
): Promise<void> {
  await supabase.from("team").update({
    name:                data.name         || null,
    contact:             data.phone        || null,
    numero_contribuinte: data.nif          || null,
    iban:                data.iban         || null,
  }).eq("id", memberId);
}

export async function updateTeamMemberRole(
  memberId: string,
  role: TeamMember["role"],
): Promise<void> {
  await supabase.from("team").update({ role }).eq("id", memberId);
}

export async function adminUpdateTeamMemberContact(
  memberId: string,
  data: { email: string; phone: string; iban: string },
): Promise<void> {
  await supabase.from("team").update({
    email:   data.email || null,
    contact: data.phone || null,
    iban:    data.iban  || null,
  }).eq("id", memberId);
}

export async function createTeamMember(
  data: { name: string; email: string; phone: string; iban: string; role: TeamMember["role"] },
): Promise<void> {
  await supabase.from("team").insert({
    name:    data.name,
    email:   data.email  || null,
    contact: data.phone  || null,
    iban:    data.iban   || null,
    role:    data.role,
  });
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function createService(data: {
  name: string;
  type?: string;
  equipa?: string[];
  pax_2_3?: number | null;
  pax_4_6?: number | null;
  pax_7_plus?: number | null;
  valor_chef_2_3?: number | null;
  valor_chef_4_6?: number | null;
  valor_chef_7_10?: number | null;
  valor_copa?: number | null;
  valor_driver?: number | null;
  processo?: string;
}): Promise<void> {
  const { error } = await supabase.from("services").insert({
    id:              crypto.randomUUID(),
    name:            data.name,
    type:            data.type            || null,
    equipa:          data.equipa?.length  ? data.equipa : null,
    pax_2_3:         data.pax_2_3         ?? null,
    pax_4_6:         data.pax_4_6         ?? null,
    pax_7_plus:      data.pax_7_plus      ?? null,
    valor_chef_2_3:  data.valor_chef_2_3  ?? null,
    valor_chef_4_6:  data.valor_chef_4_6  ?? null,
    valor_chef_7_10: data.valor_chef_7_10 ?? null,
    valor_copa:      data.valor_copa      ?? null,
    valor_driver:    data.valor_driver    ?? null,
    processo:        data.processo        || null,
  });
  if (error) throw new Error(`createService: ${error.message}`);
}

export async function getServiceTypesList(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from("services").select("id, name").order("name");
  return (data ?? []).map((r) => ({ id: r.id, name: r.name }));
}

export async function getClientsList(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from("clients").select("id, name").order("name");
  return (data ?? []).map((r) => ({ id: r.id, name: r.name }));
}

export async function createNewClient(name: string): Promise<string> {
  const { data, error } = await supabase.from("clients")
    .insert({ name: name.trim() })
    .select("id").single();
  if (error) throw new Error(`createNewClient: ${error.message}`);
  return data.id;
}

export async function createSale(data: {
  serviceId: string;
  date: string;
  status?: string;
  notionId?: string;
  clientId?: string;
  guideId?: string;
  chefId?: string;
  numGuests?: number | null;
  meetingPoint?: string;
  notes?: string;
  phoneNumber?: string;
  names?: string;
  startTime?: string;
  endTime?: string;
}): Promise<void> {
  const { error: saleError } = await supabase.from("sales").insert({
    id:               crypto.randomUUID(),
    service_id:       data.serviceId,
    date:             data.date,
    status:           data.status       || "Pending",
    notion_id:        data.notionId     || null,
    client_id:        data.clientId     || null,
    guide_id:         data.guideId      || null,
    chef_id:          data.chefId       || null,
    number_of_guests: data.numGuests    ?? null,
    meeting_point:    data.meetingPoint || null,
    notes:            data.notes        || null,
    phone_number:     data.phoneNumber  || null,
    names:            data.names        || null,
    start_time:       data.startTime    || null,
    end_time:         data.endTime      || null,
  });
  if (saleError) throw new Error(`createSale: ${saleError.message}`);
}

export async function deleteSale(id: string): Promise<void> {
  // Delete transactions first (no cascade defined in schema)
  const { error: txError } = await supabase.from("transactions").delete().eq("sale_id", id);
  if (txError) throw new Error(`deleteSale transactions: ${txError.message}`);

  const { error } = await supabase.from("sales").delete().eq("id", id);
  if (error) throw new Error(`deleteSale: ${error.message}`);
}

// ── Tours (Sales table) ───────────────────────────────────────────────────────

export async function getServicesWithMissingInfo(): Promise<Tour[]> {
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .gte("date", today0())
    .lt("date", in30Days())
    .order("date");
  return (data ?? [])
    .map(mapSaleRow)
    .filter((t) =>
      t.status !== "Cancelled" &&
      (!t.numGuests || !t.names || !t.phoneNumber || !t.clientName || !t.notes)
    );
}

export async function getPendingServices(): Promise<Tour[]> {
  try {
    const { data } = await supabase.from("sales")
      .select(SALE_SELECT)
      .gte("date", today0())
      .lt("date", in30Days())
      .eq("status", "Pending")
      .order("date");
    return (data ?? []).map(mapSaleRow);
  } catch { return []; }
}

export async function getServicesWithMissingStaff(): Promise<TourWithMissingStaff[]> {
  try {
    const { data } = await supabase.from("sales")
      .select(SALE_SELECT)
      .gte("date", today0())
      .lt("date", in30Days())
      .order("date");
    return (data ?? [])
      .map(mapSaleRow)
      .filter((t) => t.status !== "Cancelled")
      .filter((t) => t.serviceEquipa.length > 0)
      .map((t) => ({ ...t, missingRoles: getMissingStaffRoles(t) }))
      .filter((t) => t.missingRoles.length > 0);
  } catch { return []; }
}

export async function getToursForGuide(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .eq("guide_id", member.id)
    .gte("date", today0())
    .or("expenses_closed.is.null,expenses_closed.neq.Closed")
    .order("date");
  return (data ?? []).map(mapSaleRow);
}

export async function getPastToursForGuide(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .eq("guide_id", member.id)
    .lt("date", today0())
    .order("date", { ascending: false })
    .limit(30);
  return (data ?? []).map(mapSaleRow);
}

export async function getToursForChef(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .eq("chef_id", member.id)
    .gte("date", today0())
    .or("expenses_closed.is.null,expenses_closed.neq.Closed")
    .order("date");
  return (data ?? []).map(mapSaleRow);
}

export async function getPastToursForChef(email: string): Promise<Tour[]> {
  const member = await getTeamMemberByEmail(email);
  if (!member) return [];
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .eq("chef_id", member.id)
    .lt("date", today0())
    .order("date", { ascending: false })
    .limit(30);
  return (data ?? []).map(mapSaleRow);
}

export async function getAllUpcomingTours(): Promise<Tour[]> {
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .gte("date", today0())
    .order("date");
  return (data ?? []).map(mapSaleRow);
}

export async function getAllPastTours(): Promise<Tour[]> {
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT)
    .lt("date", today0())
    .order("date", { ascending: false })
    .limit(50);
  return (data ?? []).map(mapSaleRow);
}

export async function getTourById(id: string): Promise<Tour | null> {
  try {
    const { data } = await supabase.from("sales").select(SALE_SELECT).eq("id", id).maybeSingle();
    return data ? mapSaleRow(data) : null;
  } catch { return null; }
}

export async function closeTour(tourId: string): Promise<void> {
  await supabase.from("sales").update({ expenses_closed: "Closed" }).eq("id", tourId);
}

export async function updateSaleStatus(saleId: string, status: string): Promise<void> {
  await supabase.from("sales").update({ status }).eq("id", saleId);
}

export async function updateTourServiceInfo(
  tourId: string,
  data: {
    numGuests: number | null;
    names: string;
    phoneNumber: string;
    notes: string;
    meetingPoint: string;
    status?: string;
    type?: string;
    notionId?: string;
    serviceId?: string;
    clientId?: string;
    date?: string;
    startTime?: string | null;
    endTime?: string | null;
  },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    number_of_guests: data.numGuests    ?? null,
    names:            data.names        || null,
    phone_number:     data.phoneNumber  || null,
    notes:            data.notes        || null,
    meeting_point:    data.meetingPoint || null,
  };
  if (data.status    !== undefined) updates.status      = data.status    || null;
  if (data.type      !== undefined) updates.type        = data.type      || null;
  if (data.notionId  !== undefined) updates.notion_id   = data.notionId  || null;
  if (data.serviceId !== undefined) updates.service_id  = data.serviceId || null;
  if (data.clientId  !== undefined) updates.client_id   = data.clientId  || null;
  if (data.date      !== undefined) updates.date        = data.date      || null;
  if (data.startTime !== undefined) updates.start_time  = data.startTime || null;
  if (data.endTime   !== undefined) updates.end_time    = data.endTime   || null;

  const { error } = await supabase.from("sales").update(updates).eq("id", tourId);
  if (error) throw new Error(`updateTourServiceInfo: ${error.message}`);
}

export async function updateTourTeam(
  tourId: string,
  guideId: string | null,
  chefId: string | null,
  driverId: string | null,
): Promise<void> {
  const { error } = await supabase.from("sales").update({
    guide_id:  guideId  ?? null,
    chef_id:   chefId   ?? null,
    driver_id: driverId ?? null,
  }).eq("id", tourId);
  if (error) throw new Error(`updateTourTeam: ${error.message}`);
}

const SALE_SELECT_WITH_PRICES = `
  *,
  clients(name),
  services(name, type, equipa, pax_2_3, pax_4_6, pax_7_plus),
  guide:team!sales_guide_id_fkey(name),
  chef:team!sales_chef_id_fkey(name),
  driver:team!sales_driver_id_fkey(name)
`.trim();

export async function getFinalisedSales(): Promise<FinalisedSale[]> {
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT_WITH_PRICES)
    .eq("status", "Finalised")
    .order("date", { ascending: false });

  return (data ?? []).map((row) => {
    const tour = mapSaleRow(row);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc  = (row as any).services ?? {};
    const p1   = (svc.pax_2_3 ?? 0) * 2;
    const p23  = svc.pax_2_3  ?? 0;
    const p46  = svc.pax_4_6  ?? 0;
    const p7   = svc.pax_7_plus ?? 0;
    const pricePerPax = tour.numGuests >= 7 ? p7
                      : tour.numGuests >= 4 ? p46
                      : tour.numGuests >= 2 ? p23 : p1;
    return { ...tour, price1: p1, price23: p23, price46: p46, price7: p7, pricePerPax };
  });
}

export async function getInvoicedSales(): Promise<FinalisedSale[]> {
  const { data } = await supabase.from("sales")
    .select(SALE_SELECT_WITH_PRICES)
    .eq("status", "Invoiced")
    .order("date", { ascending: false });

  return (data ?? []).map((row) => {
    const tour = mapSaleRow(row);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc  = (row as any).services ?? {};
    const p1   = (svc.pax_2_3 ?? 0) * 2;
    const p23  = svc.pax_2_3  ?? 0;
    const p46  = svc.pax_4_6  ?? 0;
    const p7   = svc.pax_7_plus ?? 0;
    const pricePerPax = tour.numGuests >= 7 ? p7
                      : tour.numGuests >= 4 ? p46
                      : tour.numGuests >= 2 ? p23 : p1;
    return { ...tour, price1: p1, price23: p23, price46: p46, price7: p7, pricePerPax };
  });
}

export async function getFinalisedSalesCount(): Promise<number> {
  try {
    const { count } = await supabase.from("sales")
      .select("id", { count: "exact", head: true })
      .eq("status", "Finalised");
    return count ?? 0;
  } catch { return 0; }
}

export async function getAnalyticsTours(): Promise<Tour[]> {
  try {
    const all: Tour[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase.from("sales")
        .select(SALE_SELECT_WITH_PRICES)
        .order("date", { ascending: false })
        .range(from, from + PAGE - 1);
      if (!data?.length) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all.push(...data.map((row: any) => {
        const tour = mapSaleRow(row);
        const svc  = row.services ?? {};
        const p1   = (svc.pax_2_3 ?? 0) * 2;
        const p23  = svc.pax_2_3  ?? 0;
        const p46  = svc.pax_4_6  ?? 0;
        const p7   = svc.pax_7_plus ?? 0;
        const pricePerPax = tour.numGuests >= 7 ? p7
                          : tour.numGuests >= 4 ? p46
                          : tour.numGuests >= 2 ? p23 : p1;
        return { ...tour, expectedRevenue: pricePerPax * tour.numGuests };
      }));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  } catch { return []; }
}

// ── Transactions ──────────────────────────────────────────────────────────────

async function getRawTransactionsForTour(tourId: string): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .eq("sale_id", tourId)
      .or("status.is.null,status.neq.Archived")
      .order("data", { ascending: false });
    return (data ?? []).map(mapTransactionRow);
  } catch { return []; }
}

export async function getTransactionsForTour(tourId: string): Promise<Transaction[]> {
  return (await getRawTransactionsForTour(tourId)).filter((t) => !t.supplier.startsWith("IN -"));
}

export async function getEarningsForTour(tourId: string): Promise<Transaction[]> {
  return (await getRawTransactionsForTour(tourId)).filter((t) => t.supplier.startsWith("IN -"));
}

export async function getExpensesAndEarningsForTour(
  tourId: string,
): Promise<{ expenses: Transaction[]; earnings: Transaction[] }> {
  const all = await getRawTransactionsForTour(tourId);
  return {
    expenses: all.filter((t) => !t.supplier.startsWith("IN -")),
    earnings: all.filter((t) =>  t.supplier.startsWith("IN -")),
  };
}

export async function getChefTransactionsForTour(tourId: string): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .eq("sale_id", tourId)
      .in("metodo_pagamento", ["Pelo Chef", "Chef Fee"])
      .order("data", { ascending: false });
    return (data ?? []).map(mapTransactionRow);
  } catch { return []; }
}

export async function getEarningsForSales(saleIds: string[]): Promise<Record<string, Transaction>> {
  if (!saleIds.length) return {};
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .in("sale_id", saleIds)
      .like("notion_id", "IN -%");
    const result: Record<string, Transaction> = {};
    for (const row of data ?? []) {
      const t = mapTransactionRow(row);
      if (t.tourId) result[t.tourId] = t;
    }
    return result;
  } catch { return {}; }
}

export async function getTransactionsForMatching(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions")
    .select(TX_SELECT)
    .eq("metodo_pagamento", "Cartão COME")
    .neq("status", "Archived")
    .limit(100);
  return (data ?? []).map(mapTransactionRow).filter((t) => !t.supplier.startsWith("IN -"));
}

export async function getAccountantTransactions(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions")
    .select(TX_SELECT)
    .neq("status", "Archived")
    .order("data", { ascending: false })
    .limit(100);
  return (data ?? []).map(mapTransactionRow).filter((t) => !t.supplier.startsWith("IN -"));
}

export async function getAllTransactionsAdmin(from: string, to: string): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions")
    .select(TX_SELECT)
    .neq("status", "Archived")
    .gte("data", from)
    .lte("data", to)
    .order("data", { ascending: false });
  return (data ?? []).map(mapTransactionRow);
}

export async function getTransactionsNeedingInvoice(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions")
    .select(TX_SELECT)
    .or("precisa_fatura.eq.Sim,status.eq.Pending Payment,status.eq.Pending Receipt")
    .order("data", { ascending: false })
    .limit(100);
  return (data ?? [])
    .map(mapTransactionRow)
    .filter((t) =>
      t.precisaDeFatura !== "Não" &&
      (t.precisaDeFatura === "Sim" ||
        (!t.supplier.startsWith("IN -") &&
          (t.status === "Pending Payment" || t.status === "Pending Receipt") &&
          !t.invoiceId && !t.invoiceImageUrl))
    );
}

export async function getAiScanFailedTransactions(): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .eq("precisa_fatura", "AI Scan Falhou")
      .order("data", { ascending: false })
      .limit(100);
    return (data ?? []).map(mapTransactionRow);
  } catch { return []; }
}

export async function getPeloGuiaTransactionsForMatching(): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .eq("metodo_pagamento", "Pelo Guia")
      .eq("status", "Paid")
      .order("data", { ascending: false })
      .limit(200);
    return (data ?? []).map(mapTransactionRow).filter((t) => !t.bankReference);
  } catch { return []; }
}

export async function getMatchedTransactions(): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .not("id_banco", "is", null)
      .neq("id_banco", "")
      .order("data", { ascending: false })
      .limit(200);
    return (data ?? []).map(mapTransactionRow);
  } catch { return []; }
}

export async function getMatchedTransactionMap(): Promise<Record<string, Transaction[]>> {
  try {
    const map: Record<string, Transaction[]> = {};
    let from = 0;
    const PAGE = 100;
    while (true) {
      const { data } = await supabase.from("transactions")
        .select(TX_SELECT)
        .not("id_banco", "is", null)
        .neq("id_banco", "")
        .order("data", { ascending: false })
        .order("id",   { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data?.length) break;
      for (const row of data) {
        const tx = mapTransactionRow(row);
        if (tx.bankReference && tx.status !== "Unmatched Bank Entry") {
          if (!map[tx.bankReference]) map[tx.bankReference] = [];
          map[tx.bankReference].push(tx);
        }
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return map;
  } catch (err) {
    console.error("[getMatchedTransactionMap] failed:", err);
    return {};
  }
}

export async function getUnmatchedBankTransactions(): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .eq("status", "Unmatched Bank Entry")
      .order("data", { ascending: false })
      .limit(100);
    return (data ?? []).map(mapTransactionRow);
  } catch { return []; }
}

export async function getFlaggedTransactions(): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(TX_SELECT)
      .in("status", ["Flag: Missing Bank Entry", "Flag: Missing Reimbursement"])
      .order("data", { ascending: false })
      .limit(100);
    return (data ?? []).map(mapTransactionRow);
  } catch { return []; }
}

async function fetchAllLinkable(): Promise<{ expenses: Transaction[]; earnings: Transaction[] }> {
  const expenses: Transaction[] = [];
  const earnings: Transaction[] = [];
  const EXCLUDED = new Set(["Unmatched Bank Entry", "Cancelled"]);
  try {
    let from = 0;
    const PAGE = 100;
    while (true) {
      const { data } = await supabase.from("transactions")
        .select(TX_SELECT)
        .or("id_banco.is.null,id_banco.eq.")
        .order("data", { ascending: false })
        .order("id",   { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data?.length) break;
      for (const row of data) {
        const t = mapTransactionRow(row);
        if (EXCLUDED.has(t.status)) continue;
        if (t.supplier.startsWith("IN -")) earnings.push(t);
        else expenses.push(t);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  } catch (err) { console.error("[fetchAllLinkable] failed:", err); }
  return { expenses, earnings };
}

export async function getLinkableEarnings(): Promise<Transaction[]> {
  return (await fetchAllLinkable()).earnings;
}

export async function getLinkableExpenses(): Promise<Transaction[]> {
  return (await fetchAllLinkable()).expenses;
}

export async function getLinkableTransactions(): Promise<{ expenses: Transaction[]; earnings: Transaction[] }> {
  return fetchAllLinkable();
}

export async function getTransactionsTreated(): Promise<Transaction[]> {
  const { data } = await supabase.from("transactions")
    .select(TX_SELECT)
    .eq("precisa_fatura", "Sim tratado")
    .order("data", { ascending: false })
    .limit(100);
  return (data ?? []).map(mapTransactionRow);
}

export async function getAnalyticsTransactions(): Promise<Transaction[]> {
  try {
    const all: Transaction[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase.from("transactions")
        .select(TX_SELECT)
        .or("status.is.null,status.neq.Archived")
        .order("data", { ascending: false })
        .range(from, from + PAGE - 1);
      if (!data?.length) break;
      all.push(...data.map(mapTransactionRow));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  } catch { return []; }
}

export async function getGuideExpenses(): Promise<Transaction[]> {
  try {
    const { data } = await supabase.from("transactions")
      .select(`*, sales!transactions_sale_id_fkey(notion_id, guide_id, chef_id, driver_id)`)
      .eq("transferencia_feita", false)
      .neq("status", "Archived")
      .or("type.is.null,type.neq.Earning")
      .or("notion_id.is.null,notion_id.not.ilike.OUT - %")
      .or([
        "metodo_pagamento.eq.Pelo Guia",
        "metodo_pagamento.eq.Pelo Chef",
        "metodo_pagamento.eq.Pelo Driver",
        "metodo_pagamento.eq.Honorários",
        "status.eq.Pending Payment",
      ].join(","))
      .order("data", { ascending: false });

    if (!data?.length) return [];

    const { data: teamRows } = await supabase.from("team").select("id, name, iban");
    const memberById = Object.fromEntries((teamRows ?? []).map((m) => [m.id, m]));
    const ibanByName = Object.fromEntries((teamRows ?? []).map((m) => [m.name.toLowerCase(), m.iban ?? ""]));

    return data.map((row) => {
      const t = mapTransactionRow(row);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sale = (row as any).sales;
      const tourName = sale?.notion_id ?? "";

      if (t.paymentMethod === "Honorários" || (t.status === "Pending Payment" && t.whoPaid === "Company")) {
        return { ...t, tourName, paidByName: t.supplier, payeeIban: ibanByName[t.supplier.toLowerCase()] ?? "" };
      }
      if (!sale) return { ...t, tourName };
      const memberId = t.paymentMethod === "Pelo Chef"   ? sale.chef_id
                     : t.paymentMethod === "Pelo Driver" ? sale.driver_id
                     : sale.guide_id;
      const member = memberId ? memberById[memberId] : undefined;
      return { ...t, tourName, paidByName: member?.name ?? "", payeeIban: member?.iban ?? "" };
    });
  } catch { return []; }
}

export async function createTransaction(
  data: Omit<Transaction, "id" | "accountantVerified">
): Promise<string> {
  const { data: row, error } = await supabase.from("transactions").insert({
    notion_id:        data.supplier       || "Despesa",
    fornecedor_id:    data.fornecedorId   ?? null,
    data:             data.date           ?? null,
    id_fatura:        data.invoiceId      || null,
    valor_sem_iva:    data.taxFree,
    iva_6:            data.iva6,
    iva_13:           data.iva13,
    iva_23:           data.iva23,
    valor:            data.supplier?.startsWith("IN -") ? Math.abs(data.totalCost) : -(Math.abs(data.totalCost)),
    pago_por:         data.whoPaid        || null,
    metodo_pagamento: data.paymentMethod  || null,
    status:           data.status         || null,
    type:             data.supplier?.startsWith("IN -") ? "Earning" : "Expense",
    conta_pagamento:  data.contaPagamento || "COME",
    sale_id:          data.tourId         ?? null,
    fatura_url:       data.invoiceImageUrl ?? null,
    id_banco:         data.bankReference  || null,
    precisa_fatura:   data.precisaDeFatura || null,
  }).select("id").single();
  if (error) throw new Error(`createTransaction: ${error.message}`);
  return row.id;
}

export async function updateTransaction(
  pageId: string,
  data: Partial<Omit<Transaction, "id">>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  if (data.supplier          !== undefined) updates.notion_id           = data.supplier;
  if (data.fornecedorId      !== undefined) updates.fornecedor_id       = data.fornecedorId ?? null;
  if (data.date              !== undefined) updates.data                = data.date ?? null;
  if (data.invoiceId         !== undefined) updates.id_fatura           = data.invoiceId;
  if (data.taxFree           !== undefined) updates.valor_sem_iva       = data.taxFree;
  if (data.iva6              !== undefined) updates.iva_6               = data.iva6;
  if (data.iva13             !== undefined) updates.iva_13              = data.iva13;
  if (data.iva23             !== undefined) updates.iva_23              = data.iva23;
  if (data.totalCost         !== undefined) {
    const isEarning = data.supplier !== undefined && data.supplier.startsWith("IN -");
    updates.valor = isEarning ? Math.abs(data.totalCost) : -(Math.abs(data.totalCost));
  }
  if (data.whoPaid           !== undefined) updates.pago_por            = data.whoPaid;
  if (data.paymentMethod     !== undefined) updates.metodo_pagamento    = data.paymentMethod;
  if (data.status            !== undefined) updates.status              = data.status;
  if (data.accountantVerified !== undefined) updates.validado_contabilidade = data.accountantVerified;
  if (data.tourId            !== undefined) updates.sale_id             = data.tourId ?? null;
  if (data.bankReference     !== undefined) updates.id_banco            = data.bankReference;
  if (data.invoiceImageUrl)                 updates.fatura_url          = data.invoiceImageUrl;
  if (data.precisaDeFatura   !== undefined) updates.precisa_fatura      = data.precisaDeFatura || null;
  if (data.contaPagamento    !== undefined) updates.conta_pagamento     = data.contaPagamento || null;
  await supabase.from("transactions").update(updates).eq("id", pageId);
}

export type PartnerBalance = {
  name: string;
  earnings: number;
  expenses: number;
  balance: number;
};

const PARTNERS = ["António", "Bernardo", "Manel"] as const;
const PARTNER_SPLIT_DATE = "2025-10-01";

export async function getPartnerBalances(): Promise<{ before: PartnerBalance[]; after: PartnerBalance[] }> {
  const { data } = await supabase
    .from("transactions")
    .select("conta_pagamento, type, valor, data")
    .in("conta_pagamento", PARTNERS as unknown as string[])
    .or("status.is.null,status.neq.Archived");

  const empty = (): Record<string, PartnerBalance> =>
    Object.fromEntries(PARTNERS.map((name) => [name, { name, earnings: 0, expenses: 0, balance: 0 }]));

  const before = empty();
  const after = empty();

  for (const row of data ?? []) {
    const name = row.conta_pagamento as string | null;
    if (!name || !(name in before)) continue;
    const bucket = row.data && row.data < PARTNER_SPLIT_DATE ? before : after;
    const valor = Number(row.valor) || 0;
    if (row.type === "Earning") bucket[name].earnings += valor;
    else if (row.type === "Expense") bucket[name].expenses += Math.abs(valor);
    bucket[name].balance += valor;
  }

  return {
    before: PARTNERS.map((n) => before[n]),
    after: PARTNERS.map((n) => after[n]),
  };
}

export async function verifyTransaction(pageId: string, verified: boolean): Promise<void> {
  await supabase.from("transactions").update({ validado_contabilidade: verified }).eq("id", pageId);
}

export async function archiveTransaction(pageId: string): Promise<void> {
  await supabase.from("transactions").delete().eq("id", pageId);
}

export async function markTransferenciaFeita(pageId: string): Promise<void> {
  await supabase.from("transactions").update({
    transferencia_feita: true,
    status: "Paid",
  }).eq("id", pageId);
}

export async function setComprovativoUrl(pageId: string, url: string): Promise<void> {
  await supabase.from("transactions").update({ comprovativo_url: url }).eq("id", pageId);
}

// ── Fornecedores ──────────────────────────────────────────────────────────────

export const getFornecedores = unstable_cache(
  async (): Promise<Fornecedor[]> => {
    const { data } = await supabase.from("fornecedores").select("id, name").order("name");
    return (data ?? []).filter((f) => f.name);
  },
  ["fornecedores"],
  { revalidate: 300, tags: ["fornecedores"] },
);

export async function getTransactionsByFornecedor(fornecedorId: string): Promise<Transaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("fornecedor_id", fornecedorId)
    .order("data", { ascending: false });
  return (data ?? []).map(mapTransactionRow);
}

export async function getFornecedorStats(): Promise<Map<string, { count: number; total: number }>> {
  const { data } = await supabase
    .from("transactions")
    .select("fornecedor_id, valor")
    .not("fornecedor_id", "is", null);
  const map = new Map<string, { count: number; total: number }>();
  for (const row of data ?? []) {
    const id = row.fornecedor_id as string;
    const prev = map.get(id) ?? { count: 0, total: 0 };
    map.set(id, { count: prev.count + 1, total: prev.total + (row.valor ?? 0) });
  }
  return map;
}

export async function createFornecedor(name: string): Promise<Fornecedor> {
  const { data, error } = await supabase.from("fornecedores")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (error) throw new Error(`createFornecedor: ${error.message}`);
  return data;
}

export async function getFornecedorById(id: string): Promise<Fornecedor | null> {
  const { data } = await supabase
    .from("fornecedores")
    .select("id, name, email, contact, iban, contribuinte, categoria")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function updateFornecedor(
  id: string,
  data: { name?: string; email?: string; contact?: string; iban?: string; contribuinte?: string; categoria?: string },
): Promise<void> {
  const updates = {
    name:         data.name?.trim()         || undefined,
    email:        data.email?.trim()        || null,
    contact:      data.contact?.trim()      || null,
    iban:         data.iban?.trim()         || null,
    contribuinte: data.contribuinte?.trim() || null,
    categoria:    data.categoria?.trim()    || null,
  };
  const { error } = await supabase.from("fornecedores").update(updates).eq("id", id);
  if (error) throw new Error(`updateFornecedor: ${error.message}`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export async function resolvePageTitles(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const map: Record<string, string> = {};
  await Promise.all(
    (["team", "clients", "services", "fornecedores"] as const).map(async (table) => {
      const { data } = await supabase.from(table).select("id, name").in("id", ids);
      for (const row of data ?? []) map[row.id] = row.name;
    })
  );
  return map;
}

// ── CRM Types ─────────────────────────────────────────────────────────────────

export type CRMAccount = {
  id: string;
  name: string;
  pessoa: string | null;
  email: string | null;
  phone_number: string | null;
  website: string | null;
  stage: string;
  category: string | null;
  phone: string | null;
  nif: string | null;
  nome_fiscal: string | null;
  morada_fiscal: string | null;
  revenue?: number;
  company_size: string | null;
  country: string | null;
  industry: string | null;
  linkedin_url: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  enriched_at: string | null;
  enrichment_data: Record<string, unknown> | null;
  created_at: string;
  contacts?: CRMContact[];
};

export type CRMContact = {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  linkedin_url: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
};

export type CRMActivity = {
  id: string;
  activitie: string;
  description: string | null;
  thread_link: string | null;
  date: string | null;
  scheduled_at: string | null;
  type: string;
  status: string;
  sales_pipeline_id: string;
  contact_id: string | null;
  contact_name: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
};

export type CRMWeeklyAction = {
  id: string;
  week_of: string;
  account_id: string;
  account_name: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  action_type: string;
  subject: string | null;
  suggested_script: string | null;
  priority: number;
  status: string;
  created_at: string;
};

// ── CRM Data Functions ────────────────────────────────────────────────────────

export async function getCRMAccounts(stage?: string): Promise<CRMAccount[]> {
  let query = supabase
    .from("sales_pipeline")
    .select(`*, team:assigned_to(name)`)
    .order("created_at", { ascending: false });
  if (stage) query = query.eq("stage", stage);
  const { data, error } = await query;
  if (error) throw new Error(`getCRMAccounts: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    assigned_name: (row.team as { name: string } | null)?.name ?? null,
  }));
}

export async function getCRMAccountById(id: string): Promise<CRMAccount | null> {
  const { data, error } = await supabase
    .from("sales_pipeline")
    .select(`*, team:assigned_to(name)`)
    .eq("id", id)
    .single();
  if (error) return null;
  const contacts = await getCRMContacts(id);
  return {
    ...data,
    assigned_name: (data.team as { name: string } | null)?.name ?? null,
    contacts,
  };
}

export async function getCRMContacts(accountId: string): Promise<CRMContact[]> {
  const { data, error } = await supabase
    .from("crm_contacts")
    .select("*")
    .eq("account_id", accountId)
    .order("is_primary", { ascending: false })
    .order("created_at");
  if (error) throw new Error(`getCRMContacts: ${error.message}`);
  return data ?? [];
}

export async function getAllCRMContacts(): Promise<(CRMContact & { account_name: string })[]> {
  const { data, error } = await supabase
    .from("crm_contacts")
    .select(`*, sales_pipeline:account_id(name)`)
    .order("name");
  if (error) throw new Error(`getAllCRMContacts: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    account_name: (row.sales_pipeline as { name: string } | null)?.name ?? "",
  }));
}

export async function getCRMActivities(accountId: string): Promise<CRMActivity[]> {
  const { data, error } = await supabase
    .from("sales_activities")
    .select(`*, crm_contacts:contact_id(name), team:assigned_to(name)`)
    .eq("sales_pipeline_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getCRMActivities: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    contact_name: (row.crm_contacts as { name: string } | null)?.name ?? null,
    assigned_name: (row.team as { name: string } | null)?.name ?? null,
  }));
}

export async function getWeeklyActions(weekOf: string): Promise<CRMWeeklyAction[]> {
  const { data, error } = await supabase
    .from("crm_weekly_actions")
    .select(`*, sales_pipeline:account_id(name), crm_contacts:contact_id(name, email, phone)`)
    .eq("week_of", weekOf)
    .order("priority");
  if (error) throw new Error(`getWeeklyActions: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    account_name: (row.sales_pipeline as { name: string } | null)?.name ?? "",
    contact_name: (row.crm_contacts as { name: string } | null)?.name ?? null,
    contact_email: (row.crm_contacts as { email: string } | null)?.email ?? null,
    contact_phone: (row.crm_contacts as { phone: string } | null)?.phone ?? null,
  }));
}

// ── CRM Client Sales ─────────────────────────────────────────────────────────

export type ClientSale = {
  id: string;
  date: string | null;
  status: string;
  number_of_guests: number | null;
  names: string | null;
  service_name: string | null;
  service_type: string | null;
};

export async function getClientSales(clientId: string): Promise<ClientSale[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("id, date, status, number_of_guests, names, services(name, type)")
    .eq("client_id", clientId)
    .order("date", { ascending: false });
  if (error) throw new Error(`getClientSales: ${error.message}`);
  return (data ?? []).map((row) => {
    const svc = (Array.isArray(row.services) ? row.services[0] : row.services) as { name: string; type: string } | null;
    return {
      id: row.id,
      date: row.date,
      status: row.status ?? "Unknown",
      number_of_guests: row.number_of_guests,
      names: row.names,
      service_name: svc?.name ?? null,
      service_type: svc?.type ?? null,
    };
  });
}

// ── CRM Analytics ────────────────────────────────────────────────────────────

export type CRMAccountStats = {
  totalBookings: number;
  totalPax: number;
  avgGroupSize: number;
  totalRevenue: number;
  firstBooking: string | null;
  lastBooking: string | null;
  topServices: Array<{ name: string; count: number }>;
  byMonth: Array<{ month: string; bookings: number; pax: number; revenue: number }>;
};

export type CRMTopClient = {
  id: string;
  name: string;
  category: string | null;
  bookings: number;
  totalPax: number;
  revenue: number;
};

export async function getCRMAccountStats(accountId: string): Promise<CRMAccountStats> {
  const [bookingRows, revenueRows, serviceRows, monthRows] = await Promise.all([
    // Totals
    supabase.from("sales").select("number_of_guests, date").eq("client_id", accountId)
      .neq("status", "Cancelled").not("date", "is", null),
    // Revenue (positive transactions linked to this client's sales)
    supabase.rpc("get_client_revenue", { p_client_id: accountId }).maybeSingle(),
    // Top services
    supabase.from("sales").select("services(name)").eq("client_id", accountId)
      .neq("status", "Cancelled").not("service_id", "is", null),
    // Monthly breakdown via raw query is tricky via Supabase client — fetch all sales and group in JS
    supabase.from("sales").select("date, number_of_guests, id").eq("client_id", accountId)
      .neq("status", "Cancelled").not("date", "is", null).order("date"),
  ]);

  const sales = bookingRows.data ?? [];
  const totalBookings = sales.length;
  const totalPax = sales.reduce((sum, s) => sum + (s.number_of_guests ?? 0), 0);
  const avgGroupSize = totalBookings > 0 ? Math.round(totalPax / totalBookings) : 0;
  const dates = sales.map((s) => s.date as string).filter(Boolean).sort();
  const firstBooking = dates[0] ?? null;
  const lastBooking = dates[dates.length - 1] ?? null;

  // Revenue: query transactions directly
  const { data: txData } = await supabase
    .from("transactions")
    .select("valor, sale_id")
    .gt("valor", 0)
    .not("sale_id", "is", null);

  // Get sale IDs for this client
  const saleIds = new Set((monthRows.data ?? []).map((s) => s.id as string));
  const totalRevenue = (txData ?? [])
    .filter((t) => saleIds.has(t.sale_id))
    .reduce((sum, t) => sum + (t.valor ?? 0), 0);

  // Per-month revenue
  const monthRevenueMap: Record<string, number> = {};
  for (const tx of (txData ?? [])) {
    if (!saleIds.has(tx.sale_id)) continue;
    // Find the sale date for this transaction
    const sale = (monthRows.data ?? []).find((s) => s.id === tx.sale_id);
    if (!sale?.date) continue;
    const month = (sale.date as string).slice(0, 7);
    monthRevenueMap[month] = (monthRevenueMap[month] ?? 0) + (tx.valor ?? 0);
  }

  // Group by month
  const monthMap: Record<string, { bookings: number; pax: number }> = {};
  for (const s of monthRows.data ?? []) {
    const month = (s.date as string).slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { bookings: 0, pax: 0 };
    monthMap[month].bookings++;
    monthMap[month].pax += s.number_of_guests ?? 0;
  }
  const byMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, revenue: monthRevenueMap[month] ?? 0 }));

  // Top services
  const serviceCount: Record<string, number> = {};
  for (const s of (serviceRows.data ?? [])) {
    const svc = s.services as unknown;
    const name = Array.isArray(svc)
      ? (svc[0] as { name: string } | undefined)?.name
      : (svc as { name: string } | null)?.name;
    if (name) serviceCount[name] = (serviceCount[name] ?? 0) + 1;
  }
  const topServices = Object.entries(serviceCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  void revenueRows; // unused RPC fallback

  return { totalBookings, totalPax, avgGroupSize, totalRevenue, firstBooking, lastBooking, topServices, byMonth };
}

export async function getCRMTopClients(limit = 10): Promise<CRMTopClient[]> {
  // Get all client-stage accounts with their sales counts
  const { data: accounts } = await supabase
    .from("sales_pipeline")
    .select("id, name, category")
    .order("name");

  if (!accounts?.length) return [];

  // Fetch sales summary for all client accounts in bulk
  const { data: salesData } = await supabase
    .from("sales")
    .select("client_id, number_of_guests, id")
    .neq("status", "Cancelled")
    .not("client_id", "is", null);

  const { data: txData } = await supabase
    .from("transactions")
    .select("valor, sale_id")
    .gt("valor", 0)
    .not("sale_id", "is", null);

  const saleRevenueMap: Record<string, number> = {};
  for (const tx of txData ?? []) {
    saleRevenueMap[tx.sale_id] = (saleRevenueMap[tx.sale_id] ?? 0) + (tx.valor ?? 0);
  }

  const result: CRMTopClient[] = accounts.map((acc) => {
    const accSales = (salesData ?? []).filter((s) => s.client_id === acc.id);
    const bookings = accSales.length;
    const totalPax = accSales.reduce((sum, s) => sum + (s.number_of_guests ?? 0), 0);
    const revenue = accSales.reduce((sum, s) => sum + (saleRevenueMap[s.id] ?? 0), 0);
    return { id: acc.id, name: acc.name, category: acc.category, bookings, totalPax, revenue };
  }).filter((a) => a.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, limit);

  return result;
}

export async function getLatestWeeklyActionsWeek(): Promise<string | null> {
  const { data } = await supabase
    .from("crm_weekly_actions")
    .select("week_of")
    .order("week_of", { ascending: false })
    .limit(1)
    .single();
  return data?.week_of ?? null;
}

// ── Dashboard helpers ─────────────────────────────────────────────────────────

export type DashboardMonthlyStats = {
  serviceCount: number;
  totalPax: number;
  revenue: number;
  lastMonthRevenue: number;
  lastMonthServiceCount: number;
};

export async function getDashboardMonthlyStats(): Promise<DashboardMonthlyStats> {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth() + 1;
  const thisMonthStart = `${yr}-${String(mo).padStart(2, "0")}-01`;
  const prevMo = mo === 1 ? 12 : mo - 1;
  const prevYr = mo === 1 ? yr - 1 : yr;
  const lastMonthStart = `${prevYr}-${String(prevMo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextYr = mo === 12 ? yr + 1 : yr;
  const nextMonthStart = `${nextYr}-${String(nextMo).padStart(2, "0")}-01`;

  const [salesThis, salesLast, txThis, txLast] = await Promise.all([
    supabase.from("sales").select("number_of_guests")
      .gte("date", thisMonthStart).lt("date", nextMonthStart)
      .neq("status", "Cancelled"),
    supabase.from("sales").select("id")
      .gte("date", lastMonthStart).lt("date", thisMonthStart)
      .neq("status", "Cancelled"),
    supabase.from("transactions").select("valor, sales!transactions_sale_id_fkey(status)")
      .gte("data", thisMonthStart).lt("data", nextMonthStart).like("notion_id", "IN -%").gt("valor", 0),
    supabase.from("transactions").select("valor, sales!transactions_sale_id_fkey(status)")
      .gte("data", lastMonthStart).lt("data", thisMonthStart).like("notion_id", "IN -%").gt("valor", 0),
  ]);

  const notCancelled = (r: { valor: any; sales: any }) =>
    !r.sales || (r.sales as { status: any }).status !== "Cancelled";

  return {
    serviceCount: salesThis.data?.length ?? 0,
    totalPax: (salesThis.data ?? []).reduce((s, r) => s + (r.number_of_guests ?? 0), 0),
    revenue: (txThis.data ?? []).filter(notCancelled).reduce((s, r) => s + (r.valor ?? 0), 0),
    lastMonthRevenue: (txLast.data ?? []).filter(notCancelled).reduce((s, r) => s + (r.valor ?? 0), 0),
    lastMonthServiceCount: salesLast.data?.length ?? 0,
  };
}

export type StaleProspect = {
  id: string;
  name: string;
  stage: string;
  last_contacted_at: string | null;
  category: string | null;
};

export async function getStaleProspects(daysThreshold = 30): Promise<StaleProspect[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysThreshold);
  const { data } = await supabase
    .from("sales_pipeline")
    .select("id, name, stage, last_contacted_at, category")
    .not("stage", "in", '("Client","Lost")')
    .or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff.toISOString()}`)
    .order("last_contacted_at", { ascending: true, nullsFirst: true })
    .limit(8);
  return (data ?? []) as StaleProspect[];
}

export type CRMMonthlyActivity = {
  emailCount: number;
  callCount: number;
  totalActivities: number;
  newContacts: number;
  newProspects: number;
};

export async function getCRMMonthlyActivity(): Promise<CRMMonthlyActivity> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [activities, contacts, prospects] = await Promise.all([
    supabase.from("sales_activities").select("type").gte("created_at", monthStart),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase.from("sales_pipeline").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
  ]);

  const acts = activities.data ?? [];
  return {
    emailCount: acts.filter((a) => a.type === "email").length,
    callCount: acts.filter((a) => a.type === "call").length,
    totalActivities: acts.length,
    newContacts: contacts.count ?? 0,
    newProspects: prospects.count ?? 0,
  };
}
