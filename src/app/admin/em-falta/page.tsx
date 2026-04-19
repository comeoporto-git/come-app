import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getGuideExpenses } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";

export default async function EmFaltaPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const guideExpenses = await getGuideExpenses();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/contabilidade" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME" width={72} height={28} className="object-contain invert" unoptimized />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Em Falta</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4">

        {/* Faturas em Falta */}
        <Link href="/admin/invoices">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-2xl shrink-0">🧾</div>
            <div>
              <p className="font-bold text-[#32373c]">Faturas em Falta</p>
              <p className="text-sm text-gray-400">Despesas sem fatura associada</p>
            </div>
            <span className="ml-auto text-gray-300 text-lg">→</span>
          </div>
        </Link>

        {/* Transferências em Falta */}
        <Link href="/admin/transferencias">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-2xl shrink-0">💸</div>
            <div className="flex-1">
              <p className="font-bold text-[#32373c]">Transferências em Falta</p>
              <p className="text-sm text-gray-400">Despesas pagas pelo guia · aguardam reembolso</p>
            </div>
            {guideExpenses.length > 0 && (
              <span className="text-xs bg-red-500 text-white font-bold px-2.5 py-1 rounded-full flex-shrink-0">
                {guideExpenses.length}
              </span>
            )}
            <span className="text-gray-300 text-lg flex-shrink-0">→</span>
          </div>
        </Link>

        </div>
      </main>
    </div>
  );
}
