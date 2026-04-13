import { auth } from "@/lib/auth";
import { getTourById, getTransactionsForTour, getFornecedores, getTeamMemberById } from "@/lib/notion";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { closeTourAction } from "@/actions/transactions";
import { ExpenseList } from "@/components/ExpenseList";
import { AddExpenseButton } from "@/components/AddExpenseButton";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}


export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const [tour, transactions, fornecedores] = await Promise.all([
    getTourById(id),
    getTransactionsForTour(id),
    getFornecedores(),
  ]);

  const teamMember = tour?.teamId ? await getTeamMemberById(tour.teamId) : null;

  if (!tour) notFound();

  const totalSpent = transactions.reduce((s, t) => s + t.totalCost, 0);
  const isClosed = tour.expensesClosed;
  const backHref = session.user.role === "Admin" ? "/admin/tours" : "/guide";

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
        {/* Guest Info */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Informação do Grupo</h2>
          </div>
          <div className="px-4 py-3 space-y-2">
            <Row label="Nº de Pax" value={tour.numGuests ? String(tour.numGuests) : "—"} />
            {teamMember && (
              <Row label="Team" value={teamMember.name} />
            )}
            {teamMember?.phone && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Telefone</span>
                <a
                  href={`tel:${teamMember.phone}`}
                  className="text-sm text-[#7852ca] font-medium hover:underline"
                >
                  {teamMember.phone}
                </a>
              </div>
            )}
            {tour.names && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Nomes</p>
                <p className="text-sm text-gray-800 whitespace-pre-line">{tour.names}</p>
              </div>
            )}
            {tour.notes && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Notas</p>
                <p className="text-sm text-gray-800 whitespace-pre-line">{tour.notes}</p>
              </div>
            )}
          </div>
        </section>

        {/* Expenses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Despesas
              <span className="ml-2 text-gray-400 font-normal">
                €{totalSpent.toFixed(2)}
              </span>
            </h2>
            {!isClosed && <AddExpenseButton tourId={id} fornecedores={fornecedores} />}
          </div>
          <ExpenseList transactions={transactions} tourId={id} isClosed={isClosed} fornecedores={fornecedores} />
        </section>

        {/* Close Tour */}
        {!isClosed && (
          <form
            action={async () => {
              "use server";
              await closeTourAction(id);
            }}
          >
            <button
              type="submit"
              className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm hover:bg-[#1e2226] transition-colors active:scale-[0.98] tracking-wide"
            >
              Fechar Tour e Despesas
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  );
}
