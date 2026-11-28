import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/notion";
import { getGuideEntries, GUIDE_SECTIONS } from "@/lib/companyGuide";
import { GuideClient } from "@/components/inbox/GuideClient";

export const dynamic = "force-dynamic";

export default async function GuiaPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [entries, { data: decisions }] = await Promise.all([
    getGuideEntries(true),
    supabase
      .from("inbox_suggestions")
      .select("status")
      .in("status", ["accepted", "modified", "rejected"]),
  ]);
  const stats = { accepted: 0, modified: 0, rejected: 0 };
  for (const d of decisions ?? []) stats[d.status as keyof typeof stats]++;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Guia da Empresa</h1>
        <p className="text-[13px] text-white/60 mt-1">
          Como a COME responde, propõe preços e gere serviços. O AI escreve e melhora este guia sempre que alteras ou rejeitas uma
          sugestão; a Caixa de Entrada e o AI Chat usam-no para decidir o que fazer.
        </p>
        <p className="text-[12px] text-white/50 mt-2">
          Decisões até agora: {stats.accepted} aceites · {stats.modified} alteradas · {stats.rejected} rejeitadas
        </p>
      </div>
      <GuideClient entries={entries} sections={[...GUIDE_SECTIONS]} />
    </main>
  );
}
