import { auth } from "@/lib/auth";
import {
  getTourById,
  getChefTransactionsForTour,
  getExpensesAndEarningsForTour,
  getFornecedores,
  getTeamMembers,
  getServiceTypesList,
  getClientsList,
  getTasksForSale,
  getServiceSteps,
  getServiceRestaurants,
  getRegistrationsForSale,
  deleteSale,
} from "@/lib/notion";
import type { Fornecedor, TeamSlotRole, Transaction } from "@/lib/notion";
import { categoriaBadgeClass } from "@/lib/fornecedor-categories";
import { getOpenStatusForDate, isRowClosed, formatDayHours } from "@/lib/restaurantOpenStatus";
import { WEEKDAY_LABELS, EVENT_SERVICE_TYPE } from "@/lib/constants";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { closeTourAction } from "@/actions/transactions";
import { ExpenseList } from "@/components/ExpenseList";
import { AddExpenseButton } from "@/components/AddExpenseButton";
import { TeamPicker } from "@/components/TeamPicker";
import type { ServicePerson } from "@/components/WhoPaidPicker";
import { ServiceInfoEditor } from "@/components/ServiceInfoEditor";
import { MapsLink } from "@/components/MapsLink";
import { DeleteSaleButton } from "@/components/DeleteSaleButton";
import { EarningList } from "@/components/EarningList";
import { TourTaskList } from "@/components/TourTaskList";
import { EventRegistrations } from "@/components/EventRegistrations";
import { SaleEmails } from "@/components/SaleEmails";
import { getSaleEmails } from "@/lib/integration";

function formatDate(iso: string | null, startTime: string | null): string {
  if (!iso) return "—";
  const datePart = new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return startTime ? `${datePart} às ${startTime}` : datePart;
}

// Buckets expense transactions by their fornecedor's category, falling back
// to the tour's team role (Guia/Chef/Motorista/Logistics) when a transaction
// was paid directly to a team member rather than to a fornecedor.
function computeCategoryBreakdown(
  transactions: Transaction[],
  fornecedores: Fornecedor[],
  team: { guideName?: string | null; chefName?: string | null; driverName?: string | null; logisticsName?: string | null },
): { label: string; total: number }[] {
  const categoriaById = new Map(fornecedores.map((f) => [f.id, f.categoria]));
  const teamRoles = [
    team.guideName ? { name: team.guideName, label: "Guia" } : null,
    team.chefName ? { name: team.chefName, label: "Chef" } : null,
    team.driverName ? { name: team.driverName, label: "Motorista" } : null,
    team.logisticsName ? { name: team.logisticsName, label: "Logistics" } : null,
  ]
    .filter(Boolean)
    .map((r) => ({ name: r!.name.trim().toLowerCase(), label: r!.label }));

  const totals = new Map<string, number>();
  for (const t of transactions) {
    const amount = Math.abs(t.totalCost);
    if (amount === 0) continue;

    const categoria = t.fornecedorId ? categoriaById.get(t.fornecedorId) : null;
    const teamMatch = teamRoles.find((r) => r.name === t.supplier.trim().toLowerCase());
    const label = categoria || teamMatch?.label || "Outros";

    totals.set(label, (totals.get(label) ?? 0) + amount);
  }

  return Array.from(totals.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

const TEAM_SLOT_ROLES: ReadonlyArray<TeamSlotRole> = ["Guide", "Chef", "Driver", "Logistics"];

const EXTRA_ROLE_LABEL: Record<TeamSlotRole, string> = {
  Guide: "Guia", Chef: "Chef", Driver: "Driver", Logistics: "Logistics",
};
const EXPENSE_ROLE_LABEL: Record<TeamSlotRole, string> = {
  Guide: "Guia", Chef: "Chef", Driver: "Motorista", Logistics: "Logistics",
};

// ── Shell (renders immediately, only needs auth cookie) ───────────────────────

const ALLOWED_ROLES: ReadonlyArray<string> = ["Guide", "Super Guide", "Admin", "Chef", "Driver", "Logistics"];

export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect("/unauthorized");

  const { id } = await params;
  const role = session.user.role;
  const email = session.user.email ?? "";
  const backHref = role === "Admin" ? "/admin/servicos" : "/guide/services";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Suspense fallback={<PageSkeleton backHref={backHref} />}>
        <TourPageContent id={id} role={role} email={email} backHref={backHref} />
      </Suspense>
    </div>
  );
}

// ── Skeleton shown while Notion data loads ────────────────────────────────────

function PageSkeleton({ backHref }: { backHref: string }) {
  return (
    <>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-gray-700">←</Link>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-48 animate-pulse" />
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-28 animate-pulse" />
          </div>
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-32 animate-pulse" />
          </div>
        </div>
      </main>
    </>
  );
}

// ── Full page content (async — fetches all Notion data) ───────────────────────

async function TourPageContent({
  id,
  role,
  email,
  backHref,
}: {
  id: string;
  role: string;
  email: string;
  backHref: string;
}) {
  const isChef = role === "Chef";
  const canEditTeam = role === "Super Guide" || role === "Admin";
  const canSeeFinancials = role === "Super Guide" || role === "Admin";

  const [tour, txResult, fornecedores, teamMembers, emails, servicesList, clientsList, tasks] = await Promise.all([
    getTourById(id),
    isChef
      ? getChefTransactionsForTour(id).then((t) => ({ expenses: t, earnings: [] }))
      : getExpensesAndEarningsForTour(id),
    getFornecedores(),
    getTeamMembers(),
    canSeeFinancials ? getSaleEmails(id) : Promise.resolve([]),
    canEditTeam ? getServiceTypesList() : Promise.resolve([]),
    canEditTeam ? getClientsList()      : Promise.resolve([]),
    getTasksForSale(id, role),
  ]);

  const transactions = canSeeFinancials ? txResult.expenses : txResult.expenses;
  const earnings     = canSeeFinancials ? txResult.earnings : [];
  if (!tour) notFound();

  // The role this person fills on THIS service decides which expense form they get
  // (e.g. a Guide booked as a second Chef logs "Pelo Chef" / "Chef Fee"). Falls back
  // to their account role when they aren't assigned, and never changes Admin/Super Guide.
  const me = TEAM_SLOT_ROLES.includes(role as TeamSlotRole)
    ? (teamMembers.find((m) => m.email === email) ?? null)
    : null;
  const myServiceRoles: TeamSlotRole[] = me ? [
    ...(tour.guideId === me.id ? ["Guide" as const] : []),
    ...(tour.chefId === me.id ? ["Chef" as const] : []),
    ...(tour.driverId === me.id ? ["Driver" as const] : []),
    ...(tour.logisticsId === me.id ? ["Logistics" as const] : []),
    ...tour.extraTeam.filter((m) => m.teamId === me.id).map((m) => m.role),
  ] : [];
  const expenseRole = myServiceRoles.length === 0 || myServiceRoles.includes(role as TeamSlotRole)
    ? role
    : myServiceRoles[0];
  const myName = me?.name;
  const memberNames = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));
  // Everyone on the service by role, primary slot first — feeds "Quem pagou?" for Admin/Super Guide.
  const roster: ServicePerson[] = [
    ...([
      [tour.guideId, tour.guideName, "Guide"],
      [tour.chefId, tour.chefName, "Chef"],
      [tour.driverId, tour.driverName, "Driver"],
      [tour.logisticsId, tour.logisticsName, "Logistics"],
    ] as [string | null, string, TeamSlotRole][])
      .filter(([teamId]) => !!teamId)
      .map(([teamId, name, role]) => ({ teamId: teamId!, name: name || memberNames[teamId!] || "—", role })),
    ...tour.extraTeam.map((m) => ({ teamId: m.teamId, name: m.name || memberNames[m.teamId] || "—", role: m.role })),
  ];
  const extraTeamForExpenses = tour.extraTeam
    .filter((m) => m.name)
    .map((m) => ({ name: m.name, role: EXPENSE_ROLE_LABEL[m.role] }));

  const steps = tour.service ? await getServiceSteps(tour.service) : [];
  const restaurants = tour.service ? await getServiceRestaurants(tour.service) : [];
  // Event registrations are Admin only.
  const showRegistrations = role === "Admin" && tour.serviceType === EVENT_SERVICE_TYPE;
  const registrations = showRegistrations ? await getRegistrationsForSale(id) : [];
  const tourDate = tour.date ? new Date(`${tour.date}T12:00:00`) : null;

  const totalSpent = transactions.reduce((s, t) => s + t.totalCost, 0); // negative values
  const faturacao  = earnings.reduce((s, t) => s + t.totalCost, 0);
  const lucro      = faturacao + totalSpent; // totalSpent is negative, so this subtracts
  const margem     = faturacao > 0 ? (lucro / faturacao) * 100 : null;
  const isClosed   = tour.expensesClosed;

  const categoryBreakdown = role === "Admin"
    ? computeCategoryBreakdown(transactions, fornecedores, tour)
    : [];
  const maxCategoryTotal = Math.max(0, ...categoryBreakdown.map((c) => c.total));

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-gray-700">←</Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">{tour.saleId}</h1>
            <p className="text-xs text-gray-500">{formatDate(tour.date, tour.startTime)}</p>
          </div>
          {isClosed && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
              Fechado
            </span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

          {/* Left column: Service Info + Emails + Team */}
          <div className="space-y-5">
            {/* Service Info */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {canEditTeam ? (
                <ServiceInfoEditor
                  tourId={id}
                  status={tour.status}
                  serviceType={tour.serviceType}
                  serviceName={tour.serviceName}
                  serviceId={tour.service}
                  clientName={tour.clientName}
                  clientId={tour.client}
                  numGuests={tour.numGuests}
                  names={tour.names}
                  phoneNumber={tour.phoneNumber}
                  notes={tour.notes}
                  meetingPoint={tour.meetingPoint}
                  notionId={tour.saleId}
                  date={tour.date}
                  startTime={tour.startTime}
                  endTime={tour.endTime}
                  services={servicesList}
                  clients={clientsList}
                />
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700">Informação do Serviço</h2>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Estado</p>
                      {tour.status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          tour.status === "Confirmed" ? "bg-green-100 text-green-700" :
                          tour.status === "Pending"   ? "bg-yellow-100 text-yellow-700" :
                          tour.status === "Cancelled" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>{tour.status}</span>
                      ) : (
                        <p className="text-sm text-gray-800 font-medium">—</p>
                      )}
                    </div>
                    {tour.serviceType && <InfoField label="Tipo" value={tour.serviceType} />}
                    <InfoField label="Serviço" value={tour.serviceName || "—"} />
                    <InfoField label="Nº de Pax" value={tour.numGuests ? String(tour.numGuests) : "—"} />
                    <InfoField label="Nomes"    value={tour.names || "—"} />
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Contacto</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-800 font-medium flex-1">{tour.phoneNumber || "—"}</p>
                        {tour.phoneNumber && (
                          <a
                            href={`tel:${tour.phoneNumber}`}
                            className="text-[#667470] hover:text-[#32373c] transition-colors p-1 flex-shrink-0"
                            aria-label={`Call ${tour.phoneNumber}`}
                            title={`Call ${tour.phoneNumber}`}
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Ponto de Encontro</p>
                      {tour.meetingPoint ? <MapsLink location={tour.meetingPoint} /> : <p className="text-sm text-gray-800 font-medium">—</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Notas</p>
                      <p className="text-sm font-bold text-red-600 whitespace-pre-line">{tour.notes || "—"}</p>
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* Team */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Equipa</h2>
              </div>
              <div className="px-4 py-3">
                {canEditTeam ? (
                  <TeamPicker
                    tourId={id}
                    guideId={tour.guideId}
                    guideName={tour.guideName}
                    guidePhone={teamMembers.find(m => m.id === tour.guideId)?.phone}
                    chefId={tour.chefId}
                    chefName={tour.chefName}
                    chefPhone={teamMembers.find(m => m.id === tour.chefId)?.phone}
                    driverId={tour.driverId}
                    driverName={tour.driverName}
                    driverPhone={teamMembers.find(m => m.id === tour.driverId)?.phone}
                    logisticsId={tour.logisticsId}
                    logisticsName={tour.logisticsName}
                    logisticsPhone={teamMembers.find(m => m.id === tour.logisticsId)?.phone}
                    extraTeam={tour.extraTeam}
                    teamMembers={teamMembers}
                  />
                ) : (
                  <div className="space-y-3">
                    <TeamMemberField
                      label="Guia"
                      name={tour.guideName || "—"}
                      phone={teamMembers.find(m => m.id === tour.guideId)?.phone}
                    />
                    <TeamMemberField
                      label="Chef"
                      name={tour.chefName || "—"}
                      phone={teamMembers.find(m => m.id === tour.chefId)?.phone}
                    />
                    <TeamMemberField
                      label="Driver"
                      name={tour.driverName || "—"}
                      phone={teamMembers.find(m => m.id === tour.driverId)?.phone}
                    />
                    <TeamMemberField
                      label="Logistics"
                      name={tour.logisticsName || "—"}
                      phone={teamMembers.find(m => m.id === tour.logisticsId)?.phone}
                    />
                    {tour.extraTeam.map((m) => (
                      <TeamMemberField
                        key={`${m.role}-${m.teamId}`}
                        label={EXTRA_ROLE_LABEL[m.role]}
                        name={m.name || "—"}
                        phone={teamMembers.find(t => t.id === m.teamId)?.phone}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Tasks */}
            <TourTaskList tourId={id} tasks={tasks} canManage={canEditTeam} />

            {/* Registrations — event services only, Admin only */}
            {showRegistrations && (
              <EventRegistrations
                tourId={id}
                saleRef={tour.saleId}
                registrations={registrations}
                numGuests={tour.numGuests}
              />
            )}

            {/* Steps — from the service catalog, visible to everyone */}
            {steps.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-700">Passos do Serviço</h2>
                </div>
                <ol className="divide-y divide-gray-50">
                  {steps.map((step, i) => (
                    <li key={step.id} className="px-4 py-3 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-[#667470]/10 text-[#667470] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                        {step.description && <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-line">{step.description}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Suggested restaurants — from the service catalog, visible to everyone */}
            {restaurants.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-700">Restaurantes Sugeridos</h2>
                </div>
                <ul className="divide-y divide-gray-50">
                  {restaurants.map((r) => {
                    const status = tourDate ? getOpenStatusForDate(r.hours, tourDate) : null;
                    return (
                      <li key={r.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{r.name}</p>
                            {r.address && <p className="text-xs text-gray-400 mt-0.5">{r.address}</p>}
                          </div>
                          {status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${status.closed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {status.closed ? "Fechado" : "Aberto"}
                            </span>
                          )}
                        </div>
                        {status && <p className="text-xs text-gray-400 mt-1">{status.label} — dia do tour</p>}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {WEEKDAY_LABELS.map((label, i) => {
                            const row = r.hours.find((h) => h.dayOfWeek === i);
                            const closed = isRowClosed(row);
                            const isTourDay = tourDate?.getDay() === i;
                            return (
                              <span
                                key={i}
                                title={closed ? `${label}: fechado` : `${label}: ${formatDayHours(row)}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${closed ? "bg-gray-50 text-gray-300" : "bg-emerald-50 text-emerald-700"} ${isTourDay ? "ring-2 ring-[#667470]" : ""}`}
                              >
                                {label.slice(0, 3)}
                              </span>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Emails — Super Guide / Admin only */}
            {canSeeFinancials && <SaleEmails emails={emails} threadIds={tour.threadIds} />}
          </div>

          {/* Right column: KPIs + Earnings + Expenses + Actions */}
          <div className="space-y-5">
            {/* Financial KPIs — Super Guide / Admin only */}
            {canSeeFinancials && (
              <section className="grid grid-cols-2 gap-3">
                <KpiCard label="Faturação" value={`€${faturacao.toFixed(2)}`} color="text-emerald-600" />
                <KpiCard label="Custos"    value={`€${totalSpent.toFixed(2)}`} color="text-red-500" />
                <KpiCard
                  label="Lucro"
                  value={`€${lucro.toFixed(2)}`}
                  color={lucro >= 0 ? "text-emerald-600" : "text-red-500"}
                />
                <KpiCard
                  label="Margem de Lucro"
                  value={margem !== null ? `${margem.toFixed(1)}%` : "—"}
                  color={margem !== null && margem >= 0 ? "text-emerald-600" : "text-red-500"}
                />
              </section>
            )}

            {/* Custos por Categoria — Admin only */}
            {role === "Admin" && categoryBreakdown.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-700">Custos por Categoria</h2>
                </div>
                <ul className="divide-y divide-gray-50">
                  {categoryBreakdown.map(({ label, total }) => (
                    <li key={label} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoriaBadgeClass(label)}`}
                        >
                          {label}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                          €{total.toFixed(2)}
                          {totalSpent !== 0 && (
                            <span className="text-xs font-normal text-gray-400 ml-1">
                              {((total / Math.abs(totalSpent)) * 100).toFixed(0)}%
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#667470]"
                          style={{ width: `${maxCategoryTotal > 0 ? (total / maxCategoryTotal) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Earning transactions — Super Guide / Admin only */}
            {canSeeFinancials && (
              <EarningList
                earnings={earnings}
                tourId={id}
                isAdmin={role === "Admin"}
                tourDate={tour.date}
                tourReference={tour.saleId}
              />
            )}

            {/* Expenses */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  Despesas
                  <span className="ml-2 text-gray-400 font-normal">
                    €{totalSpent.toFixed(2)}
                  </span>
                </h2>
                {!isClosed && (
                  <AddExpenseButton
                    tourId={id}
                    fornecedores={fornecedores}
                    userRole={expenseRole}
                    chefName={myName}
                    guideName={myName}
                    driverName={myName}
                    logisticsName={myName}
                    roster={roster}
                    tourTeam={[
                      tour.guideName ? { name: tour.guideName, role: "Guia" } : null,
                      tour.chefName  ? { name: tour.chefName,  role: "Chef" } : null,
                      tour.driverName ? { name: tour.driverName, role: "Motorista" } : null,
                      tour.logisticsName ? { name: tour.logisticsName, role: "Logistics" } : null,
                      ...extraTeamForExpenses,
                    ].filter(Boolean) as { name: string; role: string }[]}
                  />
                )}
              </div>
              <ExpenseList transactions={transactions} tourId={id} isClosed={isClosed} fornecedores={fornecedores} guideName={tour.guideName} chefName={tour.chefName} driverName={tour.driverName} logisticsName={tour.logisticsName} memberNames={memberNames} extraTeam={extraTeamForExpenses} roster={roster} userRole={role} />
            </section>

            {/* Close Tour — only admins */}
            {!isClosed && role === "Admin" && (
              <form
                action={async () => {
                  "use server";
                  await closeTourAction(id);
                }}
              >
                <button
                  type="submit"
                  className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm hover:bg-[#1a2018] transition-colors active:scale-[0.98] tracking-wide"
                >
                  Fechar Serviço e Despesas
                </button>
              </form>
            )}

            {/* Delete Sale — only admins */}
            {role === "Admin" && (
              <DeleteSaleButton
                action={async () => {
                  "use server";
                  await deleteSale(id);
                  redirect("/admin/servicos");
                }}
              />
            )}
          </div>

        </div>
      </main>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-800 font-medium whitespace-pre-line">{value}</p>
    </div>
  );
}

function TeamMemberField({
  label,
  name,
  phone,
}: {
  label: string;
  name: string;
  phone?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-800 font-medium flex-1">{name}</p>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="text-[#667470] hover:text-[#32373c] transition-colors p-1 flex-shrink-0"
            aria-label={`Call ${name}`}
            title={`Call ${name}`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
