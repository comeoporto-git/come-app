import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getServicesWithMissingInfo, getPendingServices } from "@/lib/notion";
import type { Tour } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/lib/auth";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
}

function getMissingFields(tour: Tour): string[] {
  const missing: string[] = [];
  if (!tour.clientName)  missing.push("Cliente");
  if (!tour.numGuests)   missing.push("Nº Pax");
  if (!tour.names)       missing.push("Nomes");
  if (!tour.phoneNumber) missing.push("Contacto");
  if (!tour.notes)       missing.push("Notas");
  return missing;
}

export default async function GestaoToursPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [incompleteServices, pendingServices] = await Promise.all([
    getServicesWithMissingInfo(),
    getPendingServices(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Image
              src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME" width={72} height={28}
              className="object-contain invert" unoptimized
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Gestão de Serviços</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Serviços button */}
        <Link href="/admin/servicos">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-2xl bg-[#667470]/10 flex items-center justify-center text-2xl shrink-0">🗓️</div>
            <div>
              <p className="font-bold text-[#32373c]">Serviços</p>
              <p className="text-sm text-gray-400">Ver todos os serviços</p>
            </div>
            <span className="ml-auto text-gray-300 text-lg">→</span>
          </div>
        </Link>

        <div className="pt-2" />

        <div className="space-y-6">
        {/* Serviços Incompletos */}
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
            <div className="px-5 py-6 text-center text-sm text-gray-400">✅ Tudo em ordem para os próximos 7 dias</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {incompleteServices.map((t) => {
                const missing = getMissingFields(t);
                return (
                  <li key={t.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/guide/tours/${t.id}`} className="text-sm font-semibold text-[#32373c] hover:underline">
                        {t.saleId}
                      </Link>
                      {t.serviceName && <span className="text-xs text-gray-400">{t.serviceName}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(t.date)}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {missing.map((f) => (
                        <span key={f} className="text-xs bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-md font-medium">{f}</span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Serviços Pendentes */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Serviços Pendentes</h2>
              <p className="text-xs text-gray-400 mt-0.5">Próximos 15 dias · estado Pending</p>
            </div>
            {pendingServices.length > 0 && (
              <span className="text-xs bg-yellow-500 text-white font-bold px-2.5 py-1 rounded-full">
                {pendingServices.length}
              </span>
            )}
          </div>
          {pendingServices.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-gray-400">✅ Sem serviços pendentes nos próximos 15 dias</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {pendingServices.map((t) => (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/guide/tours/${t.id}`} className="text-sm font-semibold text-[#32373c] hover:underline">
                      {t.saleId}
                    </Link>
                    {t.serviceName && <span className="text-xs text-gray-400">{t.serviceName}</span>}
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Pending</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(t.date)}</p>
                  {t.numGuests > 0 && <p className="text-xs text-gray-400">{t.numGuests} pax</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>

      </main>
    </div>
  );
}
