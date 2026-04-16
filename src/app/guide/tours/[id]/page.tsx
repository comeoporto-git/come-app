import { auth } from "@/lib/auth";
import {
  getTourById,
  getTransactionsForTour,
  getChefTransactionsForTour,
  getEarningsForTour,
  getFornecedores,
  getTeamMembers,
  getTeamMemberByEmail,
} from "@/lib/notion";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { closeTourAction } from "@/actions/transactions";
import { ExpenseList } from "@/components/ExpenseList";
import { AddExpenseButton } from "@/components/AddExpenseButton";
import { TeamPicker } from "@/components/TeamPicker";

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

export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const role = session.user.role;
  const isChef = role === "Chef";
  const canEditTeam = role === "Super Guide" || role === "Admin";
  const canSeeFinancials = role === "Super Guide" || role === "Admin";

  const [tour, transactions, earnings, fornecedores, teamMembers, chefMember] = await Promise.all([
    getTourById(id),
    isChef ? getChefTransactionsForTour(id) : getTransactionsForTour(id),
    canSeeFinancials ? getEarningsForTour(id) : Promise.resolve([]),
    getFornecedores(),
    getTeamMembers(),
    isChef ? getTeamMemberByEmail(session.user.email ?? "") : Promise.resolve(null),
  ]);

  if (!tour) notFound();

  const totalSpent   = transactions.reduce((s, t) => s + t.totalCost, 0);
  const faturacao    = earnings.reduce((s, t) => s + t.totalCost, 0);
  const lucro        = faturacao - totalSpent;
  const margem       = faturacao > 0 ? (lucro / faturacao) * 100 : null;
  const isClosed = tour.expensesClosed;
  const backHref = role === "Admin" ? "/admin/tours" : "/guide/services";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-gray-700">
            ←
          </Link>
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

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Group Info */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Informação do Grupo</h2>
          </div>
          <div className="px-4 py-3 space-y-3">
            {/* Estado */}
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
            {(role === "Super Guide" || role === "Admin") && (
              <InfoField label="Cliente" value={tour.clientName || "—"} />
            )}
            <InfoField label="Nº de Pax" value={tour.numGuests ? String(tour.numGuests) : "—"} />
            <InfoField label="Nomes"    value={tour.names || "—"} />

            {/* Contacto */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Contacto</p>
              {tour.phoneNumber ? (
                <a href={`tel:${tour.phoneNumber}`} className="text-sm text-[#667470] font-medium hover:underline">
                  {tour.phoneNumber}
                </a>
              ) : (
                <p className="text-sm text-gray-800 font-medium">—</p>
              )}
            </div>

            <InfoField label="Notas" value={tour.notes || "—"} />
          </div>
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
        {canSeeFinancials && earnings.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Faturação
              <span className="ml-2 text-gray-400 font-normal">€{faturacao.toFixed(2)}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {earnings.map((e) => (
                <li key={e.id} className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-800 truncate">
                      {e.supplier.replace(/^IN\s*-\s*/, "")}
                    </p>
                    {e.invoiceId && (
                      <p className="text-xs text-emerald-600 mt-0.5">{e.invoiceId}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-emerald-700 shrink-0">
                    +€{e.totalCost.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
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
              />
            )}
          </div>
          <ExpenseList transactions={transactions} tourId={id} isClosed={isClosed} fornecedores={fornecedores} />
        </section>

        {/* Close Tour — only guides, super guides, admins */}
        {!isClosed && !isChef && (
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
      </main>
    </div>
  );
}

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
