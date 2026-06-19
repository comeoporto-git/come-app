import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGuideExpenses, getFornecedores } from "@/lib/notion";
import { GuideExpensesList } from "@/components/GuideExpensesList";

export default async function TransferenciasPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [guideExpenses, fornecedores] = await Promise.all([getGuideExpenses(), getFornecedores()]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Transferências em Falta</h2>
              <p className="text-xs text-gray-400 mt-0.5">Reembolsos pendentes e pagamentos por fazer</p>
            </div>
            {guideExpenses.length > 0 && (
              <span className="text-xs bg-red-500 text-white font-bold px-2.5 py-1 rounded-full">
                {guideExpenses.length}
              </span>
            )}
          </div>
          {guideExpenses.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              ✅ Sem transferências pendentes
            </div>
          ) : (
            <GuideExpensesList expenses={guideExpenses} fornecedores={fornecedores} />
          )}
        </section>
      </main>
    </div>
  );
}
