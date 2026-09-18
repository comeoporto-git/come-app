import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getServiceCatalog } from "@/lib/notion";
import Link from "next/link";

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}min`;
}

export default async function ProdutosServicosPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  const services = await getServiceCatalog();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-white">Produtos & Serviços</h1>
            <p className="text-sm text-white/60">Catálogo de tipos de serviço, preços, passos e restaurantes sugeridos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <Link key={s.id} href={`/admin/produtos/${s.id}`}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer h-full">
                <p className="font-bold text-[#32373c]">{s.name}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {s.type && (
                    <span className="text-xs bg-[#667470]/10 text-[#667470] px-2 py-0.5 rounded-full font-medium">{s.type}</span>
                  )}
                  <span className="text-xs text-gray-400">{formatDuration(s.durationMinutes)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {services.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-8 text-center text-sm text-gray-400">
            Nenhum serviço configurado ainda.
          </div>
        )}
      </main>
    </div>
  );
}
