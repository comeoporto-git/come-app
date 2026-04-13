import { auth } from "@/lib/auth";
import { getAccountantTransactions } from "@/lib/notion";
import { redirect } from "next/navigation";
import { VerifyButton } from "@/components/VerifyButton";
import { ExportCSVButton } from "@/components/ExportCSVButton";
import { signOut } from "@/lib/auth";

function fmt(n: number) {
  return `€${n.toFixed(2)}`;
}

export default async function AccountantPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Accountant" && session.user.role !== "Admin") redirect("/");

  const transactions = await getAccountantTransactions();

  const total = transactions.reduce((s, t) => s + t.totalCost, 0);

  return (
    <div className="min-h-screen bg-gray-50 text-[#32373c]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Portal Contabilidade</h1>
            <p className="text-xs text-gray-400">{transactions.length} transações · Total: {fmt(total)}</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportCSVButton transactions={transactions} />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-xs text-gray-400 hover:text-red-500 transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Desktop table */}
        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Fatura", "Data", "Fornecedor", "Nº Fatura", "Base S/ IVA", "IVA 6%", "IVA 13%", "IVA 23%", "Total", "Status", "Pag.", "Verificado"].map(
                  (h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <tr key={tx.id} className={tx.accountantVerified ? "bg-green-50/30" : ""}>
                  <td className="px-3 py-2.5">
                    {tx.invoiceImageUrl ? (
                      <a href={tx.invoiceImageUrl} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tx.invoiceImageUrl}
                          alt="Fatura"
                          className="w-10 h-10 object-cover rounded-lg border border-gray-200 hover:scale-105 transition-transform"
                        />
                      </a>
                    ) : (
                      <span className="text-gray-200 text-lg">📄</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[#32373c] whitespace-nowrap">{tx.date ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-[#32373c]">{tx.supplier}</td>
                  <td className="px-3 py-2.5 text-[#32373c]">{tx.invoiceId || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-[#32373c]">{fmt(tx.taxFree)}</td>
                  <td className="px-3 py-2.5 text-right text-[#32373c]">{tx.iva6 ? fmt(tx.iva6) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-[#32373c]">{tx.iva13 ? fmt(tx.iva13) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-[#32373c]">{tx.iva23 ? fmt(tx.iva23) : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-[#32373c]">{fmt(tx.totalCost)}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        tx.status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#32373c] text-xs">{tx.paymentMethod}</td>
                  <td className="px-3 py-2.5">
                    <VerifyButton
                      transactionId={tx.id}
                      verified={tx.accountantVerified}
                      disabled={false}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 ${
                tx.accountantVerified ? "border-green-200" : ""
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {tx.invoiceImageUrl && (
                    <a href={tx.invoiceImageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tx.invoiceImageUrl} alt="Fatura" className="w-12 h-12 object-cover rounded-xl border border-gray-200" />
                    </a>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{tx.supplier}</p>
                    <p className="text-xs text-gray-400">{tx.date ?? "—"}</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900 shrink-0">{fmt(tx.totalCost)}</p>
              </div>
              <div className="flex gap-2 flex-wrap text-xs text-gray-400">
                {tx.iva6 > 0 && <span>6%: {fmt(tx.iva6)}</span>}
                {tx.iva13 > 0 && <span>13%: {fmt(tx.iva13)}</span>}
                {tx.iva23 > 0 && <span>23%: {fmt(tx.iva23)}</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {tx.status}
                </span>
                <VerifyButton transactionId={tx.id} verified={tx.accountantVerified} disabled={false} />
              </div>
            </div>
          ))}
        </div>

        {transactions.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">📊</div>
            <p>Sem transações para verificar</p>
          </div>
        )}
      </main>
    </div>
  );
}
