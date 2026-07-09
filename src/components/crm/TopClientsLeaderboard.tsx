import Link from "next/link";
import type { CRMTopClient } from "@/lib/notion";

function euros(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

const CATEGORY_COLORS: Record<string, string> = {
  DMC:       "bg-blue-100 text-blue-700",
  Events:    "bg-orange-100 text-orange-700",
  Hotel:     "bg-teal-100 text-teal-700",
  Corporate: "bg-indigo-100 text-indigo-700",
  Other:     "bg-gray-100 text-gray-500",
};

export function TopClientsLeaderboard({ clients }: { clients: CRMTopClient[] }) {
  if (!clients.length) return null;

  const maxBookings = clients[0].bookings;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#32373c]">Top Travel Agents & Clientes</h2>
        <span className="text-xs text-gray-400">{clients.length} com vendas</span>
      </div>
      <div className="space-y-3">
        {clients.map((c, i) => (
          <Link key={c.id} href={`/admin/crm/accounts/${c.id}`} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 group">
            <div className="flex items-center gap-3 min-w-0">
              {/* Rank */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-yellow-100 text-yellow-600" : i === 1 ? "bg-gray-100 text-gray-500" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-gray-50 text-gray-400"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm font-medium text-[#32373c] truncate group-hover:text-[#667470] transition-colors">{c.name}</span>
                  {c.category && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${CATEGORY_COLORS[c.category] ?? CATEGORY_COLORS.Other}`}>{c.category}</span>
                  )}
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div
                    className="h-1.5 bg-[#667470]/70 rounded-full group-hover:bg-[#667470] transition-colors"
                    style={{ width: `${Math.round((c.bookings / maxBookings) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pl-9 sm:pl-0 sm:ml-auto shrink-0">
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-[#32373c]">{c.bookings}</p>
                <p className="text-xs text-gray-400">{c.totalPax} pax</p>
              </div>
              {c.revenue > 0 && (
                <div className="text-right shrink-0 w-20">
                  <p className="text-xs font-medium text-emerald-600">{euros(c.revenue)}</p>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
