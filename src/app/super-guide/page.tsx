import { auth } from "@/lib/auth";
import { getTransactionsNeedingInvoice } from "@/lib/notion";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";

export default async function SuperGuideDashboard() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    redirect("/");
  }

  // Fetch pending invoice count for the badge
  const needingInvoice = await getTransactionsNeedingInvoice();
  const pendingCount = needingInvoice.length;

  return (
    <div className="min-h-screen bg-[#667470]">
      {/* Header */}
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
            unoptimized
          />
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70 font-medium">
              {session.user?.name?.split(" ")[0]}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-xs text-white/40 hover:text-white transition-colors">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10 space-y-4">
        {/* Serviços */}
        <Link href="/guide/services">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-[#667470]/10 flex items-center justify-center text-3xl shrink-0">
              🗓️
            </div>
            <div>
              <p className="font-bold text-[#32373c] text-base">Serviços</p>
              <p className="text-sm text-gray-400 mt-0.5">Ver os teus serviços agendados</p>
            </div>
          </div>
        </Link>

        {/* Faturas em Falta */}
        <Link href="/super-guide/invoices">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-3xl shrink-0">
              🧾
            </div>
            <div className="flex-1">
              <p className="font-bold text-[#32373c] text-base">Faturas em Falta</p>
              <p className="text-sm text-gray-400 mt-0.5">Despesas sem fatura associada</p>
            </div>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                {pendingCount}
              </span>
            )}
          </div>
        </Link>
        {/* Perfil */}
        <Link href="/profile">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-[#667470]/10 flex items-center justify-center text-3xl shrink-0">
              👤
            </div>
            <div>
              <p className="font-bold text-[#32373c] text-base">Perfil</p>
              <p className="text-sm text-gray-400 mt-0.5">Ver e editar os teus dados</p>
            </div>
          </div>
        </Link>
      </main>
    </div>
  );
}
