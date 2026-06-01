import { auth } from "@/lib/auth";
import {
  getTourById,
  getChefTransactionsForTour,
  getExpensesAndEarningsForTour,
  getFornecedores,
  getTeamMembers,
  deleteSale,
} from "@/lib/notion";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { closeTourAction } from "@/actions/transactions";
import { ExpenseList } from "@/components/ExpenseList";
import { AddExpenseButton } from "@/components/AddExpenseButton";
import { TeamPicker } from "@/components/TeamPicker";
import { ServiceInfoEditor } from "@/components/ServiceInfoEditor";
import { MapsLink } from "@/components/MapsLink";
import { DeleteSaleButton } from "@/components/DeleteSaleButton";
import { EarningList } from "@/components/EarningList";
import { SaleEmails } from "@/components/SaleEmails";
import { getSaleEmails } from "@/lib/integration";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
}

// ── Shell (renders immediately, only needs auth cookie) ───────────────────────

export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

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

  const [tour, txResult, fornecedores, teamMembers, emails] = await Promise.all([
    getTourById(id),
    isChef
      ? getChefTransactionsForTour(id).then((t) => ({ expenses: t, earnings: [] }))
      : getExpensesAndEarningsForTour(id),  // single Notion query instead of two
    getFornecedores(),
    getTeamMembers(),
    canSeeFinancials ? getSaleEmails(id) : Promise.resolve([]),
  ]);

  const transactions = canSeeFinancials ? txResult.expenses : txResult.expenses;
  const earnings     = canSeeFinancials ? txResult.earnings : [];
  // Derive chefMember/guideMember from the already-fetched team list — no extra Notion call needed
  const chefMember   = isChef ? (teamMembers.find((m) => m.email === email) ?? null) : null;
  const guideMember  = role === "Guide" ? (teamMembers.find((m) => m.email === email) ?? null) : null;

  if (!tour) notFound();

  const totalSpent = transactions.reduce((s, t) => s + t.totalCost, 0); // negative values
  const faturacao  = earnings.reduce((s, t) => s + t.totalCost, 0);
  const lucro      = faturacao + totalSpent; // totalSpent is negative, so this subtracts
  const margem     = faturacao > 0 ? (lucro / faturacao) * 100 : null;
  const isClosed   = tour.expensesClosed;

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-gray-700">←</Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">{tour.saleId}</h1>
            <p className="text-xs text-gray-500">{formatDate(tour.date)}</p>
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
              <div className="px-4 py-3 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Informação do Serviço</h2>
              </div>
              <div className="px-4 py-3 space-y-3">
                {canEditTeam ? (
                  <ServiceInfoEditor
                    tourId={id}
                    status={tour.status}
                    serviceType={tour.serviceType}
                    serviceName={tour.serviceName}
                    clientName={tour.clientName}
                    numGuests={tour.numGuests}
                    names={tour.names}
                    phoneNumber={tour.phoneNumber}
                    notes={tour.notes}
                    meetingPoint={tour.meetingPoint}
                  />
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Estado</p>
                      {tour.status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          tour.status === "Confirmed" ? "bg-green-100 text-green-700" :
                          tour.status === "Pending"   ? "bg-yellow-100 text-yellow-700" :
                          (tour.status === "Cancelled" || tour.status === "Canceled") ? "bg-red-100 text-red-700" :
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
                  </>
                )}
              </div>
            </section>

            {/* Emails — Super Guide / Admin only */}
            {canSeeFinancials && <SaleEmails emails={emails} threadIds={tour.threadIds} />}

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
                  </div>
                )}
              </div>
            </section>
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
                    userRole={role}
                    chefName={chefMember?.name}
                    guideName={guideMember?.name}
                    tourTeam={[
                      tour.guideName ? { name: tour.guideName, role: "Guia" } : null,
                      tour.chefName  ? { name: tour.chefName,  role: "Chef" } : null,
                      tour.driverName ? { name: tour.driverName, role: "Motorista" } : null,
                    ].filter(Boolean) as { name: string; role: string }[]}
                  />
                )}
              </div>
              <ExpenseList transactions={transactions} tourId={id} isClosed={isClosed} fornecedores={fornecedores} guideName={tour.guideName} chefName={tour.chefName} driverName={tour.driverName} userRole={role} />
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
