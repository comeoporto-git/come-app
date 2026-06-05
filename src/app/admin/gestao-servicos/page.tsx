import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getServicesWithMissingInfo, getPendingServices, getServicesWithMissingStaff } from "@/lib/notion";
import type { Tour, TourWithMissingStaff } from "@/lib/notion";
import Link from "next/link";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
}

function roleColor(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("guia") || r.includes("guide")) return "bg-[#667470]/10 text-[#667470] border-[#667470]/20";
  if (r.includes("chef"))                         return "bg-red-50 text-red-600 border-red-100";
  if (r.includes("driver") || r.includes("condutor")) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-gray-50 text-gray-600 border-gray-100";
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
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  const [incompleteServices, pendingServices, missingStaffServices] = await Promise.all([
    getServicesWithMissingInfo(),
    getPendingServices(),
    getServicesWithMissingStaff(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">

          {/* Left: Quick actions */}
          <div className="flex flex-col gap-3">
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

            {role === "Admin" && (
              <Link href="/admin/gestao-servicos/novo">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
                  <div className="w-12 h-12 rounded-2xl bg-[#667470]/10 flex items-center justify-center text-2xl shrink-0">➕</div>
                  <div>
                    <p className="font-bold text-[#32373c]">Novo Serviço</p>
                    <p className="text-sm text-gray-400">Criar um novo tipo de serviço</p>
                  </div>
                  <span className="ml-auto text-gray-300 text-lg">→</span>
                </div>
              </Link>
            )}
          </div>

          {/* Right: Alert sections */}
          <div className="space-y-6">
        {/* Equipa em Falta */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Equipa em Falta</h2>
              <p className="text-xs text-gray-400 mt-0.5">Próximos 30 dias · funções por atribuir</p>
            </div>
            {missingStaffServices.length > 0 && (
              <span className="text-xs bg-orange-500 text-white font-bold px-2.5 py-1 rounded-full">
                {missingStaffServices.length}
              </span>
            )}
          </div>
          {missingStaffServices.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-gray-400">✅ Toda a equipa atribuída para os próximos 30 dias</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {missingStaffServices.map((t: TourWithMissingStaff) => (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/guide/tours/${t.id}`} className="text-sm font-semibold text-[#32373c] hover:underline">
                      {t.saleId}
                    </Link>
                    {t.serviceName && <span className="text-xs text-gray-400">{t.serviceName}</span>}
                    {t.clientName && <span className="text-xs font-medium text-[#32373c]">{t.clientName}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(t.date)}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.missingRoles.map((role) => (
                      <span key={role} className={`text-xs border px-1.5 py-0.5 rounded-md font-medium ${roleColor(role)}`}>
                        {role}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* Serviços Incompletos */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Serviços Incompletos</h2>
              <p className="text-xs text-gray-400 mt-0.5">Próximos 30 dias · campos em falta</p>
            </div>
            {incompleteServices.length > 0 && (
              <span className="text-xs bg-red-500 text-white font-bold px-2.5 py-1 rounded-full">
                {incompleteServices.length}
              </span>
            )}
          </div>
          {incompleteServices.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-gray-400">✅ Tudo em ordem para os próximos 30 dias</div>
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
                      {t.clientName && <span className="text-xs font-medium text-[#32373c]">{t.clientName}</span>}
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
              <p className="text-xs text-gray-400 mt-0.5">Próximos 30 dias · estado Pending</p>
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

        </div>
      </main>
    </div>
  );
}
