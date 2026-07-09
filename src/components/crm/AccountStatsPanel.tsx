import type { CRMAccountStats } from "@/lib/notion";

function euros(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function formatMonth(m: string) {
  const [year, month] = m.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("pt-PT", { month: "short", year: "2-digit" });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", { month: "short", year: "numeric" });
}

export function AccountStatsPanel({ stats }: { stats: CRMAccountStats }) {
  if (stats.totalBookings === 0) return null;

  const maxBookings = Math.max(...stats.byMonth.map((m) => m.bookings), 1);
  const recentMonths = stats.byMonth.slice(-18);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-full">
      <h2 className="text-sm font-semibold text-[#32373c] mb-4">Histórico de Vendas</h2>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-50 rounded-xl p-3 overflow-hidden">
          <p className="text-xs text-gray-400">Serviços</p>
          <p className="text-2xl font-bold text-[#32373c] truncate">{stats.totalBookings}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 overflow-hidden">
          <p className="text-xs text-gray-400">Total Pax</p>
          <p className="text-2xl font-bold text-[#32373c] truncate">{stats.totalPax}</p>
          <p className="text-xs text-gray-400 truncate">média {stats.avgGroupSize} pax</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 overflow-hidden">
          <p className="text-xs text-emerald-600">Faturação</p>
          <p className="text-xl font-bold text-emerald-700 truncate">{euros(stats.totalRevenue)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 overflow-hidden">
          <p className="text-xs text-gray-400">Cliente desde</p>
          <p className="text-sm font-bold text-[#32373c] truncate">{formatDate(stats.firstBooking)}</p>
          <p className="text-xs text-gray-400 truncate">último: {formatDate(stats.lastBooking)}</p>
        </div>
      </div>

      {/* Monthly bar chart */}
      {recentMonths.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-500 mb-2">Serviços por mês</p>
          <div className="flex items-end gap-1 h-20">
            {recentMonths.map((m) => (
              <div key={m.month} className="flex-1 h-20 flex flex-col justify-end group relative">
                <div
                  className="w-full bg-[#667470]/70 rounded-t hover:bg-[#667470] transition-colors"
                  style={{ height: `${Math.round((m.bookings / maxBookings) * 100)}%`, minHeight: m.bookings > 0 ? "3px" : "0" }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#32373c] text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                  {formatMonth(m.month)}: {m.bookings} serviço{m.bookings !== 1 ? "s" : ""}{m.revenue > 0 ? ` · ${euros(m.revenue)}` : ""}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-gray-300">
            <span>{recentMonths[0] ? formatMonth(recentMonths[0].month) : ""}</span>
            <span>{recentMonths[recentMonths.length - 1] ? formatMonth(recentMonths[recentMonths.length - 1].month) : ""}</span>
          </div>
        </div>
      )}

      {/* Top services */}
      {stats.topServices.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Serviços mais reservados</p>
          <div className="space-y-1.5">
            {stats.topServices.map((s) => {
              const pct = Math.round((s.count / stats.totalBookings) * 100);
              return (
                <div key={s.name} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-600 truncate">{s.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{s.count}×</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-1.5 bg-[#667470]/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
