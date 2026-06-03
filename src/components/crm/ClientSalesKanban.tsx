import Link from "next/link";
import type { ClientSale } from "@/lib/notion";

const COLUMNS: { status: string[]; label: string; color: string }[] = [
  { status: ["Pending"],              label: "Pendente",   color: "bg-yellow-50 border-yellow-200" },
  { status: ["Confirmed"],            label: "Confirmado", color: "bg-blue-50 border-blue-200" },
  { status: ["Invoiced"],             label: "Faturado",   color: "bg-purple-50 border-purple-200" },
  { status: ["Paid"],                 label: "Pago",       color: "bg-green-50 border-green-200" },
  { status: ["Cancelled", "Canceled"],label: "Cancelado",  color: "bg-red-50 border-red-200" },
];

const STATUS_DOT: Record<string, string> = {
  Pending:   "bg-yellow-400",
  Confirmed: "bg-blue-400",
  Invoiced:  "bg-purple-400",
  Paid:      "bg-green-400",
  Cancelled: "bg-red-400",
  Canceled:  "bg-red-400",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

function SaleCard({ sale }: { sale: ClientSale }) {
  return (
    <Link href={`/guide/tours/${sale.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:shadow-md hover:border-gray-200 transition-all group">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-[#32373c] leading-tight group-hover:text-[#667470] transition-colors line-clamp-2">
          {sale.service_name ?? sale.service_type ?? "Serviço"}
        </p>
        <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${STATUS_DOT[sale.status] ?? "bg-gray-300"}`} />
      </div>
      <p className="text-xs text-gray-400">{formatDate(sale.date)}</p>
      {sale.number_of_guests && (
        <p className="text-xs text-gray-500 mt-1">{sale.number_of_guests} pax</p>
      )}
      {sale.names && (
        <p className="text-xs text-gray-400 mt-0.5 truncate">{sale.names.trim()}</p>
      )}
    </Link>
  );
}

export function ClientSalesKanban({ sales }: { sales: ClientSale[] }) {
  if (!sales.length) return null;

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#32373c]">Serviços</h2>
        <span className="text-xs text-gray-400">{sales.length} no total</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {COLUMNS.map(({ status, label, color }) => {
          const col = sales.filter((s) => status.includes(s.status));
          if (!col.length) return null;
          return (
            <div key={label}>
              <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border mb-2 ${color}`}>
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <span className="text-xs text-gray-400">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((s) => <SaleCard key={s.id} sale={s} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
