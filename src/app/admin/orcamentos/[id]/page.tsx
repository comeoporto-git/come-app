import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import {
  getClientOptions,
  getEventSaleOptions,
  getEventServices,
  getQuote,
  getSupplierItems,
} from "@/lib/eventQuotesData";
import { getFornecedores } from "@/lib/notion";
import { QuoteBuilder } from "@/components/quotes/QuoteBuilder";

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin") redirect("/");

  const { id } = await params;
  const [quote, items, services, clients, sales, fornecedores] = await Promise.all([
    getQuote(id),
    getSupplierItems(),
    getEventServices(),
    getClientOptions(),
    getEventSaleOptions(),
    getFornecedores(),
  ]);
  if (!quote) notFound();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-7xl mx-auto px-4 py-6 pb-28 lg:pb-8">
        <QuoteBuilder
          key={quote.updatedAt}
          quote={quote}
          items={items.filter((i) => i.active)}
          services={services}
          clients={clients}
          sales={sales}
          fornecedores={fornecedores.map((f) => ({ id: f.id, name: f.name }))}
        />
      </main>
    </div>
  );
}
