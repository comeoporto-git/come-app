import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/notion";
import { after } from "next/server";
import { getGuideEntries, GUIDE_SECTIONS, checkGuideIfDue } from "@/lib/companyGuide";
import { GuideClient } from "@/components/inbox/GuideClient";
import { GuideConflicts, type ConflictView } from "@/components/inbox/GuideConflicts";

export const dynamic = "force-dynamic";

export default async function GuiaPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [entries, { data: decisions }, { data: rawConflicts }, { data: rules }] = await Promise.all([
    getGuideEntries(true),
    supabase
      .from("inbox_suggestions")
      .select("status")
      .in("status", ["accepted", "modified", "rejected"]),
    supabase.from("guide_conflicts").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("business_rules").select("name, value, notes").order("name"),
  ]);
  // Look for contradictions in the background if never done, or a week ago.
  after(checkGuideIfDue);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const conflicts: ConflictView[] = (rawConflicts ?? []).map((c) => ({
    id: c.id, summary: c.summary,
    proposed_section: c.proposed_section, proposed_title: c.proposed_title, proposed_content: c.proposed_content,
    entries: ((c.entry_ids as string[]) ?? []).map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e)
      .map((e) => ({ id: e.id, section: e.section, title: e.title, content: e.content })),
  }));
  const stats = { accepted: 0, modified: 0, rejected: 0 };
  for (const d of decisions ?? []) stats[d.status as keyof typeof stats]++;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Guia da Empresa</h1>
        <p className="text-[13px] text-white/60 mt-1">
          O único sítio com as instruções da AI: como a COME responde, propõe preços, gere serviços e fala nas redes sociais.
          A Caixa de Entrada, o COME AI, as legendas e o chat do Social seguem este guia. O AI melhora-o com as tuas decisões e
          assinala aqui as regras que se contradizem.
        </p>
        <p className="text-[12px] text-white/50 mt-2">
          Decisões até agora: {stats.accepted} aceites · {stats.modified} alteradas · {stats.rejected} rejeitadas
        </p>
      </div>
      <GuideConflicts conflicts={conflicts} />
      <GuideClient entries={entries} sections={[...GUIDE_SECTIONS]} />
      <section id="regras-de-negocio" className="bg-white rounded-2xl p-4 mt-4 scroll-mt-20">
        <h2 className="text-[14px] font-bold">Regras de negócio</h2>
        <p className="text-[12px] text-gray-500 mb-2">Valores que a app usa (limites por dia, dias de operação…) e que a AI também segue. Para mudar, pede ao COME AI.</p>
        <ul className="divide-y divide-gray-100">
          {(rules ?? []).map((r) => (
            <li key={r.name} className="py-2">
              <p className="text-[13px] font-semibold">{r.name} <span className="font-normal text-gray-600">= {r.value}</span></p>
              {r.notes && <p className="text-[12px] text-gray-500">{r.notes}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
