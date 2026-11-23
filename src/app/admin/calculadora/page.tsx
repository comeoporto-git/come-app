import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPricedServices, getTransportOptions } from "@/lib/pricingData";
import { PriceCalculator } from "@/components/pricing/PriceCalculator";

export default async function CalculadoraPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin") redirect("/");

  const [services, transport] = await Promise.all([getPricedServices(), getTransportOptions()]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="text-lg font-bold text-white">Calculadora de preços</h1>
            <p className="text-sm text-white/60">Escolhe o serviço e o número de pessoas. Copia a tabela para colar num email.</p>
          </div>
          <Link href="/admin/precos" className="text-sm text-white/80 hover:text-white font-medium">Tabela de preços →</Link>
        </div>
        <PriceCalculator
          services={services.map((s) => ({ id: s.id, name: s.name, type: s.type, transportHours: s.transportHours, availableUntil: s.availableUntil, tiers: s.tiers }))}
          transport={transport}
        />
      </main>
    </div>
  );
}
