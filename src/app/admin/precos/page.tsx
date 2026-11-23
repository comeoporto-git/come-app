import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPricedServices, getTransportOptions } from "@/lib/pricingData";
import { PriceList } from "@/components/pricing/PriceList";

export default async function TabelaPrecosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin") redirect("/");

  const [services, transport, params] = await Promise.all([getPricedServices(), getTransportOptions(), searchParams]);

  const years = [...new Set(services.flatMap((s) => s.tiers.map((t) => t.year)))].sort((a, b) => b - a);
  const asked = Number(Array.isArray(params.ano) ? params.ano[0] : params.ano);
  const nextYear = new Date().getFullYear() + 1;
  const year = years.includes(asked) ? asked : years.includes(nextYear) ? nextYear : years[0] ?? nextYear;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6 print:hidden">
          <div>
            <h1 className="text-lg font-bold text-white">Tabela de preços</h1>
            <p className="text-sm text-white/60">Todos os preços por ano. Gera um PDF para partilhar com clientes.</p>
          </div>
          <Link href="/admin/calculadora" className="text-sm text-white/80 hover:text-white font-medium">Calculadora →</Link>
        </div>
        <PriceList
          year={year}
          years={years}
          services={services
            .filter((s) => s.tiers.some((t) => t.year === year) && (s.availableUntil === null || s.availableUntil >= year))
            .map((s) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              description: s.description,
              durationMinutes: s.durationMinutes,
              transportHours: s.transportHours,
              tiers: s.tiers.filter((t) => t.year === year).sort((a, b) => a.minPax - b.minPax),
            }))}
          transport={transport}
        />
      </main>
    </div>
  );
}
