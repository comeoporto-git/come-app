import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getServiceCatalog } from "@/lib/notion";
import Link from "next/link";
import Image from "next/image";

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}min`;
}

export default async function GuideProdutosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const services = await getServiceCatalog();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/guide" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Produtos & Serviços</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {services.map((s) => (
            <Link key={s.id} href={`/guide/produtos/${s.id}`}>
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
