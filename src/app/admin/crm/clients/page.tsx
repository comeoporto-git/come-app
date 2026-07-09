import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCRMAccounts, getCRMTopClients } from "@/lib/notion";
import { TopClientsLeaderboard } from "@/components/crm/TopClientsLeaderboard";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";
import Link from "next/link";

const CATEGORY_COLORS: Record<string, string> = {
  DMC:       "bg-blue-100 text-blue-700",
  Events:    "bg-orange-100 text-orange-700",
  Hotel:     "bg-teal-100 text-teal-700",
  Corporate: "bg-indigo-100 text-indigo-700",
  Other:     "bg-gray-100 text-gray-500",
};

export default async function CRMClientsPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [clientAccounts, topClients] = await Promise.all([
    getCRMAccounts("Client"),
    getCRMTopClients(100),
  ]);

  // Merge booking stats into client accounts
  const statsMap = new Map(topClients.map((c) => [c.id, c]));
  const withStats = clientAccounts.map((acc) => ({
    ...acc,
    bookings: statsMap.get(acc.id)?.bookings ?? 0,
    totalPax: statsMap.get(acc.id)?.totalPax ?? 0,
    revenue:  statsMap.get(acc.id)?.revenue  ?? 0,
  }));

  // Sort: clients with bookings first (by revenue), then alphabetically
  withStats.sort((a, b) => {
    if (a.bookings > 0 && b.bookings === 0) return -1;
    if (a.bookings === 0 && b.bookings > 0) return  1;
    return (b.revenue - a.revenue) || a.name.localeCompare(b.name);
  });

  const withBookings    = withStats.filter((c) => c.bookings > 0);
  const withoutBookings = withStats.filter((c) => c.bookings === 0);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Clientes" }]} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 text-center overflow-hidden">
            <p className="text-lg sm:text-2xl font-bold text-[#32373c] truncate">{clientAccounts.length}</p>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-1">Total clientes</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 text-center overflow-hidden">
            <p className="text-lg sm:text-2xl font-bold text-[#32373c] truncate">{withBookings.length}</p>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-1">Com serviços registados</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 text-center overflow-hidden">
            <p className="text-lg sm:text-2xl font-bold text-[#32373c] truncate">
              {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
                .format(withStats.reduce((s, c) => s + c.revenue, 0))}
            </p>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-1">Receita total registada</p>
          </div>
        </div>

        {/* Ranking por bookings */}
        <TopClientsLeaderboard clients={topClients} />

        {/* Todos os clientes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Todos os Clientes</h2>
              <p className="text-xs text-gray-400 mt-0.5">{clientAccounts.length} contas com stage Cliente</p>
            </div>
          </div>

          {withStats.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Sem clientes ainda</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {withStats.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/crm/accounts/${c.id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#667470]/10 flex items-center justify-center text-sm font-bold text-[#667470] shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#32373c] truncate">{c.name}</p>
                        {c.category && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[c.category] ?? CATEGORY_COLORS.Other}`}>
                            {c.category}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {c.country ?? ""}
                        {c.assigned_name ? ` · ${c.assigned_name}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-12 sm:pl-0 sm:ml-auto shrink-0">
                    <div className="text-right shrink-0">
                      {c.bookings > 0 ? (
                        <>
                          <p className="text-sm font-bold text-[#32373c]">{c.bookings} serviços</p>
                          <p className="text-xs text-gray-400">{c.totalPax} pax</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-300">sem serviços</p>
                      )}
                    </div>
                    {c.revenue > 0 && (
                      <div className="text-right shrink-0 w-20">
                        <p className="text-xs font-medium text-emerald-600">
                          {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c.revenue)}
                        </p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {withoutBookings.length > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">{withoutBookings.length} cliente{withoutBookings.length !== 1 ? "s" : ""} sem serviços registados no sistema</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
