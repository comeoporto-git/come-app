import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getUnmatchedBankTransactions, getFlaggedTransactions, getGuideExpenses, getServicesWithMissingInfo, getPendingServices } from "@/lib/notion";
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

  const [unmatched, flagged, guideExpenses, incompleteServices, pendingServices] = await Promise.all([
    getUnmatchedBankTransactions(),
    getFlaggedTransactions(),
    getGuideExpenses(),
    getServicesWithMissingInfo(),
    getPendingServices(),
  ]);

  const reconciliationCount = unmatched.length + flagged.length;
  const toursAlertCount = incompleteServices.length + pendingServices.length;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
            unoptimized
          />
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Admin</span>
            <Link href="/profile" className="text-xs text-white/40 hover:text-white transition-colors">Perfil</Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">
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

        {/* Gestão de Tours */}
        <Link href="/admin/gestao-tours">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-[#667470]/10 flex items-center justify-center text-3xl shrink-0">🗓️</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#32373c] text-base">Gestão de Tours</p>
              <p className="text-sm text-gray-400 mt-0.5">Serviços, Incompletos, Pendentes</p>
            </div>
            {toursAlertCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                {toursAlertCount}
              </span>
            )}
          </div>
        </Link>

        {/* Contabilidade */}
        <Link href="/admin/contabilidade">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-3xl shrink-0">📊</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#32373c] text-base">Contabilidade</p>
              <p className="text-sm text-gray-400 mt-0.5">Banco, Faturas, Transferências, Reconciliação</p>
            </div>
            {(reconciliationCount + guideExpenses.length) > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                {reconciliationCount + guideExpenses.length}
              </span>
            )}
          </div>
        </Link>

        {/* Utilizadores */}
        <Link href="/admin/users">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-3xl shrink-0">👥</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#32373c] text-base">Utilizadores</p>
              <p className="text-sm text-gray-400 mt-0.5">Gerir equipa e permissões</p>
            </div>
          </div>
        </Link>
      </main>
    </div>
  );
}
