import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFinalisedSales, getEarningsForSales } from "@/lib/notion";
import { FaturasClientesList } from "@/components/FaturasClientesList";

export default async function FaturasClientesPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const sales = await getFinalisedSales();
  const earningsBySale = await getEarningsForSales(sales.map((s) => s.id));

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-6">
        {sales.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            <p className="text-lg">Sem faturas a emitir</p>
            <p className="text-sm mt-1">Nenhum serviço com estado "Finalised"</p>
          </div>
        ) : (
          <FaturasClientesList sales={sales} earningsBySale={earningsBySale} />
        )}
      </main>
    </div>
  );
}
