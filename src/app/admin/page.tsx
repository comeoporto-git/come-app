import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getPlaidItems } from "@/lib/plaid";
import { PlaidConnectButton } from "@/components/PlaidConnectButton";
import { BankSyncButton } from "@/components/BankSyncButton";
import Image from "next/image";

export default async function AdminPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const items = await getPlaidItems();

  return (
    <div className="min-h-screen bg-[#EDE6DA] text-[#32373c]">
      <header className="bg-[#6B8878] sticky top-0 z-10">
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
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Bank Connections */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Contas Bancárias</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sincronização PSD2 via Plaid</p>
            </div>
            <PlaidConnectButton />
          </div>

          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400">
              <div className="text-3xl mb-2">🏦</div>
              <p className="text-sm">Nenhuma conta ligada ainda</p>
              <p className="text-xs mt-1">Clica em &quot;Ligar Conta&quot; para conectar o Crédito Agrícola</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {items.map((item) => (
                <li key={item.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-sm">🏦</div>
                    <div>
                      <p className="text-sm font-medium text-[#32373c]">{item.institution_name}</p>
                      <p className="text-xs text-gray-400">{item.cursor ? "Sincronizado" : "Aguarda primeira sincronização"}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Ligado</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Manual Sync */}
        {items.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Sincronização Manual</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Sincroniza automaticamente todas as noites. Clica para forçar agora.
              </p>
            </div>
            <BankSyncButton />
          </section>
        )}

        {/* Quick links */}
        <section className="grid grid-cols-2 gap-3">
          {[
            { label: "Tours", href: "/admin/tours", icon: "🗓️" },
            { label: "Contabilidade", href: "/accountant", icon: "📊" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-[#6B8878]/30 transition-colors"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="text-sm font-semibold text-[#32373c]">{link.label}</span>
            </a>
          ))}
        </section>
      </main>
    </div>
  );
}
