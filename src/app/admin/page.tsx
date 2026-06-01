import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getUnmatchedBankTransactions, getFlaggedTransactions, getGuideExpenses, getServicesWithMissingInfo, getPendingServices, getFornecedores } from "@/lib/notion";
import { AddStandaloneExpenseButton } from "@/components/AddStandaloneExpenseButton";
import Image from "next/image";
import Link from "next/link";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ bank_connected?: string; bank_error?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;

  const [unmatched, flagged, guideExpenses, incompleteServices, pendingServices, fornecedores] = await Promise.all([
    getUnmatchedBankTransactions(),
    getFlaggedTransactions(),
    getGuideExpenses(),
    getServicesWithMissingInfo(),
    getPendingServices(),
    getFornecedores(),
  ]);

  const reconciliationCount = unmatched.length + flagged.length;
  const toursAlertCount = incompleteServices.length + pendingServices.length;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
           
          />
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Admin</span>
            <Link href="/profile" className="text-xs text-white/40 hover:text-white transition-colors">Perfil</Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {/* Status banners */}
        {params.bank_connected && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 text-sm text-green-700 font-medium">
            ✅ Conta bancária ligada com sucesso!
          </div>
        )}
        {params.bank_error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-sm text-red-600">
            ❌ Erro ao ligar conta: {params.bank_error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Gestão de Serviços */}
          <Link href="/admin/gestao-servicos">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer relative min-h-[120px]">
              {toursAlertCount > 0 && (
                <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{toursAlertCount}</span>
              )}
              <div className="w-12 h-12 rounded-2xl bg-[#667470]/10 flex items-center justify-center text-2xl shrink-0">🗓️</div>
              <div>
                <p className="font-bold text-[#32373c] text-sm leading-tight">Gestão de Serviços</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">Serviços, Incompletos, Pendentes</p>
              </div>
            </div>
          </Link>

          {/* Contabilidade */}
          <Link href="/admin/contabilidade">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer relative min-h-[120px]">
              {(reconciliationCount + guideExpenses.length) > 0 && (
                <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{reconciliationCount + guideExpenses.length}</span>
              )}
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl shrink-0">📊</div>
              <div>
                <p className="font-bold text-[#32373c] text-sm leading-tight">Contabilidade</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">Banco, Faturas, Transferências</p>
              </div>
            </div>
          </Link>

          {/* Utilizadores */}
          <Link href="/admin/users">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer relative min-h-[120px]">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-2xl shrink-0">👥</div>
              <div>
                <p className="font-bold text-[#32373c] text-sm leading-tight">Utilizadores</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">Gerir equipa e permissões</p>
              </div>
            </div>
          </Link>

          {/* Analytics */}
          <Link href="/admin/analytics">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer relative min-h-[120px]">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl shrink-0">📈</div>
              <div>
                <p className="font-bold text-[#32373c] text-sm leading-tight">Analytics</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">Serviços, equipa, despesas</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Despesas sem Serviço */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Despesas sem Serviço</h2>
              <p className="text-xs text-gray-400 mt-0.5">Custos não associados a um serviço específico</p>
            </div>
            <AddStandaloneExpenseButton fornecedores={fornecedores} />
          </div>
        </section>
      </main>
    </div>
  );
}
