import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getUnmatchedBankTransactions, getFlaggedTransactions, getGuideExpenses } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";

export default async function ContabilidadePage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [unmatched, flagged, guideExpenses] = await Promise.all([
    getUnmatchedBankTransactions(),
    getFlaggedTransactions(),
    getGuideExpenses(),
  ]);

  const reconciliationCount = unmatched.length + flagged.length;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME" width={72} height={28} className="object-contain invert" />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Contabilidade</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Nav cards */}
        <div className="flex flex-col gap-4">
          {/* Banco */}
          <Link href="/admin/banco">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-2xl shrink-0">🏦</div>
              <div>
                <p className="font-bold text-[#32373c]">Banco</p>
                <p className="text-sm text-gray-400">Contas bancárias e sincronização</p>
              </div>
              <span className="ml-auto text-gray-300 text-lg">→</span>
            </div>
          </Link>

          {/* Em Falta */}
          <Link href="/admin/em-falta">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-2xl shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#32373c]">Em Falta</p>
                <p className="text-sm text-gray-400">Faturas e transferências pendentes</p>
              </div>
              {guideExpenses.length > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                  {guideExpenses.length}
                </span>
              )}
            </div>
          </Link>

          {/* Reconciliação Bancária */}
          <Link href="/admin/reconciliation">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl shrink-0">⚖️</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#32373c]">Reconciliação Bancária</p>
                <p className="text-sm text-gray-400">Transações por reconciliar</p>
              </div>
              {reconciliationCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                  {reconciliationCount}
                </span>
              )}
            </div>
          </Link>

          {/* Todas as Transações */}
          <Link href="/admin/transacoes">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-2xl shrink-0">🗒️</div>
              <div>
                <p className="font-bold text-[#32373c]">Todas as Transações</p>
                <p className="text-sm text-gray-400">Ver e editar despesas e receitas</p>
              </div>
              <span className="ml-auto text-gray-300 text-lg">→</span>
            </div>
          </Link>

          {/* Contabilidade */}
          <Link href="/accountant">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-2xl shrink-0">📊</div>
              <div>
                <p className="font-bold text-[#32373c]">Contabilidade</p>
                <p className="text-sm text-gray-400">Relatórios e verificação de despesas</p>
              </div>
              <span className="ml-auto text-gray-300 text-lg">→</span>
            </div>
          </Link>
        </div>


      </main>
    </div>
  );
}
