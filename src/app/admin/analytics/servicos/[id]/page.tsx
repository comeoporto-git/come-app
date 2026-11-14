import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getAnalyticsTours, getAnalyticsTransactions, getFornecedores } from "@/lib/notion";
import { ServiceDeepDive } from "@/components/ServiceDeepDive";

export default async function ServiceDeepDivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin") redirect("/");

  const { id } = await params;

  const [tours, transactions, fornecedores] = await Promise.all([
    getAnalyticsTours(),
    getAnalyticsTransactions(),
    getFornecedores(),
  ]);

  const services = serviceList(tours);
  if (!services.some((s) => s.id === id)) notFound();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c] overflow-x-hidden">
      <main className="w-full max-w-6xl mx-auto px-4 py-6 overflow-x-hidden">
        <ServiceDeepDive
          serviceId={id}
          services={services}
          tours={tours}
          transactions={transactions}
          fornecedores={fornecedores}
          basePath="/admin/analytics"
        />
      </main>
    </div>
  );
}

function serviceList(tours: { service: string; serviceName: string }[]) {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const t of tours) {
    if (!t.service) continue;
    const s = map.get(t.service) ?? { id: t.service, name: t.serviceName || "Sem nome", count: 0 };
    s.count++;
    map.set(t.service, s);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
