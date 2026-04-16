import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getEBSessions } from "@/lib/enablebanking";
import { getUnmatchedBankTransactions, getFlaggedTransactions, getServicesWithMissingInfo } from "@/lib/notion";
import type { Tour } from "@/lib/notion";
import { EnableBankingConnectButton } from "@/components/EnableBankingConnectButton";
import { DisconnectEnableBankingButton } from "@/components/DisconnectEnableBankingButton";
import { BankSyncButton } from "@/components/BankSyncButton";
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

  const [ebSessions, unmatched, flagged, incompleteServices] = await Promise.all([
    getEBSessions(),
    getUnmatchedBankTransactions(),
    getFlaggedTransactions(),
    getServicesWithMissingInfo(),
  ]);

  const reconciliationCount = unmatched.length + flagged.length;

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

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

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

        {/* Bank Connections */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Contas Bancárias</h2>
              <p className="text-xs text-gray-400 mt-0.5">Open Banking via Enable Banking · PSD2</p>
            </div>
            <EnableBankingConnectButton />
          </div>

          {ebSessions.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400">
              <div className="text-3xl mb-2">🏦</div>
              <p className="text-sm">Nenhuma conta ligada ainda</p>
              <p className="text-xs mt-1">Clica em &quot;+ Ligar Conta&quot; para conectar o Crédito Agrícola</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {ebSessions.map((s) => (
                <li key={s.session_id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm flex-shrink-0">
                    🏦
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#32373c]">{s.institution_name}</p>
                    <p className="text-xs text-gray-400">
                      {s.last_fetched_at
                        ? `Último sync: ${new Date(s.last_fetched_at).toLocaleDateString("pt-PT")}`
                        : "Aguarda primeira sincronização"}
                      {s.valid_until && (
                        <span className="ml-2">
                          · Válido até {new Date(s.valid_until).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                      Ligado
                    </span>
                    <DisconnectEnableBankingButton
                      sessionId={s.session_id}
                      name={s.institution_name}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Manual Sync */}
        {ebSessions.length > 0 && (
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

        {/* Incomplete services */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Serviços Incompletos</h2>
              <p className="text-xs text-gray-400 mt-0.5">Próximos 7 dias · campos em falta</p>
            </div>
            {incompleteServices.length > 0 && (
              <span className="text-xs bg-red-500 text-white font-bold px-2.5 py-1 rounded-full">
                {incompleteServices.length}
              </span>
            )}
          </div>
          {incompleteServices.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-gray-400">
              ✅ Tudo em ordem para os próximos 7 dias
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {incompleteServices.map((t) => (
                <IncompleteServiceRow key={t.id} tour={t} />
              ))}
            </ul>
          )}
        </section>

        {/* Quick links */}
        <section className="grid grid-cols-2 gap-3">
          {[
            { label: "Serviços", href: "/admin/tours", icon: "🗓️" },
            { label: "Faturas em Falta", href: "/super-guide", icon: "🧾" },
            { label: "Contabilidade", href: "/accountant", icon: "📊" },
            {
              label: "Reconciliação",
              href: "/admin/reconciliation",
              icon: "⚖️",
              badge: reconciliationCount > 0 ? reconciliationCount : undefined,
            },
            { label: "Utilizadores", href: "/admin/users", icon: "👥" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-[#667470]/30 transition-colors"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="text-sm font-semibold text-[#32373c]">{link.label}</span>
              {"badge" in link && link.badge !== undefined && (
                <span className="ml-auto text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">
                  {link.badge}
                </span>
              )}
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

function getMissingFields(tour: Tour): string[] {
  const missing: string[] = [];
  if (!tour.clientName)  missing.push("Cliente");
  if (!tour.numGuests)   missing.push("Nº Pax");
  if (!tour.names)       missing.push("Nomes");
  if (!tour.phoneNumber) missing.push("Contacto");
  return missing;
}

function IncompleteServiceRow({ tour }: { tour: Tour }) {
  const missing = getMissingFields(tour);
  const date = tour.date
    ? new Date(tour.date).toLocaleDateString("pt-PT", {
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
        timeZone: "Europe/Lisbon",
      })
    : "—";

  return (
    <li className="px-5 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/guide/tours/${tour.id}`}
            className="text-sm font-semibold text-[#32373c] hover:underline"
          >
            {tour.saleId}
          </Link>
          {tour.serviceName && (
            <span className="text-xs text-gray-400 truncate">{tour.serviceName}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{date}</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {missing.map((f) => (
            <span
              key={f}
              className="text-xs bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-md font-medium"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
