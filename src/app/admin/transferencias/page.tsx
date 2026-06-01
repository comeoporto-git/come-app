import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getGuideExpenses } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { GuideExpensesList } from "@/components/GuideExpensesList";

export default async function TransferenciasPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const guideExpenses = await getGuideExpenses();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/em-falta" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
              src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME" width={72} height={28} className="object-contain invert"
            />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Transferências em Falta</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

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
            <GuideExpensesList expenses={guideExpenses} />
          )}
        </section>
      </main>
    </div>
  );
}
