import { supabase } from "@/lib/notion";
import { structured, obj, arr, str, nullable } from "@/lib/claude";

/**
 * The company guide ("Guia da empresa"): how COME answers clients, prices,
 * plans and runs services. Written by the team and by the inbox agent, which
 * learns from every suggestion that is edited or rejected. Read by the inbox
 * agent and by the AI Chat.
 */

export const GUIDE_SECTIONS = ["Respostas", "Preços", "Disponibilidade", "Serviços", "Clientes", "Despesas", "Processos"] as const;

export type GuideEntry = {
  id: string;
  section: string;
  title: string;
  content: string;
  source: "manual" | "learned";
  active: boolean;
  times_applied: number;
  created_at: string;
  updated_at: string;
};

export async function getGuideEntries(includeInactive = false): Promise<GuideEntry[]> {
  let q = supabase.from("company_guide").select("*").order("section").order("created_at");
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as GuideEntry[];
}

/** Guide + business rules as prompt text. */
export async function guidePrompt(): Promise<string> {
  const [entries, { data: rules }] = await Promise.all([
    getGuideEntries(),
    supabase.from("business_rules").select("name, value, notes").order("name"),
  ]);
  const bySection = new Map<string, GuideEntry[]>();
  for (const e of entries) bySection.set(e.section, [...(bySection.get(e.section) ?? []), e]);
  const guide = [...bySection.entries()]
    .map(([s, es]) => `### ${s}\n${es.map((e) => `- [${e.id}] **${e.title}**: ${e.content}`).join("\n")}`)
    .join("\n\n");
  const rulesText = (rules ?? []).map((r) => `- ${r.name} = ${r.value}${r.notes ? ` (${r.notes})` : ""}`).join("\n");
  return `## Regras de negócio\n${rulesText || "- (nenhuma)"}\n\n## Guia da empresa\n${guide || "(vazio)"}`;
}

type Lesson = {
  action: "add" | "update";
  id: string | null;
  section: string;
  title: string;
  content: string;
};

/**
 * After a person edits or rejects a suggestion, work out what general lesson the
 * company guide should learn, and write it. Lessons are rules for next time,
 * never facts about this one client.
 */
export async function learnFromDecision(opts: {
  suggestionId: string;
  kind: string;
  decision: "modified" | "rejected" | "accepted";
  original: unknown;
  final?: unknown;
  feedback?: string | null;
  context?: string;
}): Promise<number> {
  if (opts.decision === "accepted" && !opts.feedback) return 0;
  const entries = await getGuideEntries();
  const guideText = entries.map((e) => `[${e.id}] (${e.section}) ${e.title}: ${e.content}`).join("\n") || "(vazio)";

  const result = await structured<{ lessons: Lesson[] }>({
    effort: "medium",
    system: `És o editor do "Guia da empresa" da COME Porto (food tours e eventos no Porto).
Um administrador acabou de ${opts.decision === "rejected" ? "REJEITAR" : opts.decision === "modified" ? "ALTERAR antes de aceitar" : "ACEITAR"} uma sugestão do assistente AI.
Compara o que o AI propôs com a decisão final e extrai apenas lições GERAIS e reutilizáveis (tom, estrutura das respostas, preços, regras de disponibilidade, como tratar faturas, que informação pedir, etc.).
- Não guardes factos específicos deste cliente (nomes, datas, emails).
- Se a lição já existe no guia, usa action "update" com o id e reescreve o conteúdo completo melhorado.
- Se não há nada de geral a aprender (p.ex. só corrigiu um erro de digitação ou um dado deste cliente), devolve lessons: [].
- Escreve em português, frases curtas e acionáveis. section ∈ ${GUIDE_SECTIONS.join(", ")}.

Guia atual:
${guideText}`,
    content: `Tipo de sugestão: ${opts.kind}
${opts.context ? `Contexto: ${opts.context}\n` : ""}Proposta do AI:
${JSON.stringify(opts.original, null, 2).slice(0, 12000)}

${opts.final !== undefined ? `Versão final aceite pelo administrador:\n${JSON.stringify(opts.final, null, 2).slice(0, 12000)}\n` : ""}${opts.feedback ? `Comentário do administrador: ${opts.feedback}` : ""}`,
    schema: obj({
      lessons: arr(obj({
        action: { type: "string", enum: ["add", "update"] },
        id: nullable(str),
        section: { type: "string", enum: [...GUIDE_SECTIONS] },
        title: str,
        content: str,
      })),
    }),
  });

  let written = 0;
  for (const l of result.lessons.slice(0, 3)) {
    if (l.action === "update" && l.id && entries.some((e) => e.id === l.id)) {
      await supabase.from("company_guide")
        .update({ content: l.content, title: l.title, section: l.section, updated_at: new Date().toISOString() })
        .eq("id", l.id);
      written++;
    } else if (l.title.trim() && l.content.trim()) {
      await supabase.from("company_guide").insert({
        section: l.section,
        title: l.title,
        content: l.content,
        source: "learned",
        source_suggestion_id: opts.suggestionId,
      });
      written++;
    }
  }
  return written;
}
