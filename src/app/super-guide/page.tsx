import { auth } from "@/lib/auth";
import { getTransactionsNeedingInvoice, getGuideExpenses } from "@/lib/notion";
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

  const [needingInvoice, guideExpenses] = await Promise.all([
    getTransactionsNeedingInvoice(),
    getGuideExpenses(),
  ]);
  const pendingCount = needingInvoice.length;
  const transferenciasCount = guideExpenses.length;

  const cards = [
    { href: "/super-guide/invoices", icon: "🧾", label: "Faturas em Falta",         sub: "Sem fatura associada",         bg: "bg-orange-50",    badge: pendingCount },
    { href: "/admin/em-falta",      icon: "💸", label: "Transferências em Falta",   sub: "Despesas pagas pelos guias",   bg: "bg-red-50",       badge: transferenciasCount },
    { href: "/profile",             icon: "👤", label: "Perfil",                   sub: "Ver e editar os teus dados",   bg: "bg-[#667470]/10", badge: 0 },
    { href: "/admin/gestao-servicos", icon: "⚙️", label: "Gestão de Serviços",      sub: "Equipa, incompletos, pendentes", bg: "bg-blue-50",    badge: 0 },
    { href: "/admin/analytics",     icon: "📈", label: "Analytics",                sub: "Serviços, equipa, despesas",   bg: "bg-emerald-50",   badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-[#667470]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME" width={72} height={28}
            className="object-contain invert"
          />
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70 font-medium">
              {session.user?.name?.split(" ")[0]}
            </span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer relative min-h-[120px]">
                {card.badge > 0 && (
                  <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {card.badge}
                  </span>
                )}
                <div className={`w-12 h-12 rounded-2xl ${card.bg} flex items-center justify-center text-2xl shrink-0`}>
                  {card.icon}
                </div>
                <div>
                  <p className="font-bold text-[#32373c] text-sm leading-tight">{card.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-tight">{card.sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
