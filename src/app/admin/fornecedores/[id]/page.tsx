import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getFornecedores, getTransactionsByFornecedor } from "@/lib/notion";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  "Paid":             "bg-green-100 text-green-700",
  "Pending Payment":  "bg-yellow-100 text-yellow-700",
  "Pending Receipt":  "bg-orange-100 text-orange-700",
  "Archived":         "bg-gray-100 text-gray-500",
};

export default async function FornecedorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { id } = await params;

  const [fornecedores, transactions] = await Promise.all([
    getFornecedores(),
    getTransactionsByFornecedor(id),
  ]);

  const fornecedor = fornecedores.find((f) => f.id === id);
  if (!fornecedor) notFound();

  const total = transactions.reduce((sum, t) => sum + t.totalCost, 0);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <Link
            href="/admin/fornecedores"
            className="text-xs text-gray-400 hover:text-[#667470] transition-colors mb-2 inline-flex items-center gap-1"
          >
            ← Fornecedores
          </Link>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-base font-bold text-[#32373c]">{fornecedor.name}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {transactions.length} {transactions.length === 1 ? "transação" : "transações"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-base font-bold text-[#32373c]">{total.toFixed(2)} €</p>
            </div>
          </div>
        </div>

        {/* Transactions */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#32373c]">Transações</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              Sem transações para este fornecedor
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {transactions.map((t) => (
                <li key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-[#32373c]">
                        {t.date ?? "—"}
                      </p>
                      {t.tourName && (
                        <span className="text-xs text-gray-400 truncate max-w-[180px]">
                          {t.tourName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {t.whoPaid && (
                        <span className="text-xs text-gray-400">{t.whoPaid}</span>
                      )}
                      {t.paymentMethod && (
                        <span className="text-xs text-gray-300">· {t.paymentMethod}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {t.status && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t.status}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-[#32373c] min-w-[70px] text-right">
                      {t.totalCost.toFixed(2)} €
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
