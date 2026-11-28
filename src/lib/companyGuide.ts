import { supabase } from "@/lib/notion";
import { structured, obj, arr, str, nullable } from "@/lib/claude";

/**
 * The company guide ("Guia da empresa") — the ONE place for every instruction
 * the AI follows: how COME answers clients, prices, plans and runs services,
 * and the brand voice for social media. Written by the team and learned from
 * decisions. Read by the inbox agent, COME AI, the social captions/photo
 * scoring and the social chat. Contradictions between rules are flagged in
 * guide_conflicts for a person to decide.
 */

export const GUIDE_SECTIONS = ["Respostas", "Preços", "Disponibilidade", "Serviços", "Clientes", "Despesas", "Processos", "Marca e redes sociais"] as const;

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

/** Ids of guide entries in a conflict still waiting for a decision. */
async function conflictedIds(): Promise<Set<string>> {
  const { data } = await supabase.from("guide_conflicts").select("entry_ids").eq("status", "pending");
  return new Set((data ?? []).flatMap((c) => (c.entry_ids as string[]) ?? []));
}

/** Guide + business rules as prompt text. `sections` limits the guide (e.g. social only needs the brand). */
export async function guidePrompt(opts: { sections?: string[] } = {}): Promise<string> {
  const [all, { data: rules }, conflicted] = await Promise.all([
    getGuideEntries(),
    supabase.from("business_rules").select("name, value, notes").order("name"),
    conflictedIds(),
  ]);
  const entries = opts.sections ? all.filter((e) => opts.sections!.includes(e.section)) : all;
  const bySection = new Map<string, GuideEntry[]>();
  for (const e of entries) bySection.set(e.section, [...(bySection.get(e.section) ?? []), e]);
  const guide = [...bySection.entries()]
    .map(([s, es]) => `### ${s}\n${es.map((e) => `- [${e.id}] **${e.title}**${conflicted.has(e.id) ? " (EM CONFLITO com outra regra — a aguardar decisão; na dúvida pergunta)" : ""}: ${e.content}`).join("\n")}`)
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
  // A new lesson may contradict an older rule: flag it for a person to decide.
  if (written) await detectGuideConflicts().catch((e) => console.error("[guide] conflict check failed:", e));
  return written;
}


// ── Conflicts ─────────────────────────────────────────────────────────────────

type FoundConflict = {
  entry_ids: string[];
  summary: string;
  proposed_section: string;
  proposed_title: string;
  proposed_content: string;
};

/**
 * Reads the whole guide (and the business rules) and flags rules that
 * contradict each other. New conflicts are stored as pending for a person to
 * decide on the Guia page; nothing in the guide is changed here.
 */
export async function detectGuideConflicts(): Promise<number> {
  const entries = await getGuideEntries();
  if (entries.length < 2) return 0;
  const { data: rules } = await supabase.from("business_rules").select("name, value, notes");
  const { data: open } = await supabase.from("guide_conflicts").select("entry_ids, status").in("status", ["pending", "dismissed"]);
  const known = new Set((open ?? []).map((c) => [...((c.entry_ids as string[]) ?? [])].sort().join(",")));

  const res = await structured<{ conflicts: FoundConflict[] }>({
    effort: "medium",
    system: `És o editor do "Guia da empresa" da COME Porto — o único sítio com as instruções que a AI segue.
Encontra regras que se CONTRADIZEM (dizem coisas incompatíveis sobre o mesmo assunto: valores, horários, preços, mínimos, tom, emojis, línguas, procedimentos). Não contam: regras complementares, uma mais detalhada que a outra sem contradição, ou exceções explícitas.
Para cada contradição: entry_ids = ids das regras envolvidas (só ids do guia, entre parênteses retos); summary = 1-2 frases em português a explicar o conflito; proposta = uma regra única que resolve o conflito (secção, título e conteúdo completos), escolhendo a versão mais recente/específica quando for claro. Se não houver contradições, conflicts: [].`,
    content: `## Guia (id | secção | título | conteúdo | atualizado)
${entries.map((e) => `[${e.id}] | ${e.section} | ${e.title} | ${e.content} | ${e.updated_at?.slice(0, 10)}`).join("\n")}

## Regras de negócio (valores usados pela app)
${(rules ?? []).map((r) => `- ${r.name} = ${r.value}${r.notes ? ` (${r.notes})` : ""}`).join("\n") || "(nenhuma)"}`,
    schema: obj({
      conflicts: arr(obj({
        entry_ids: arr(str),
        summary: str,
        proposed_section: { type: "string", enum: [...GUIDE_SECTIONS] },
        proposed_title: str,
        proposed_content: str,
      })),
    }),
  });

  await supabase.from("inbox_settings").update({ guide_checked_at: new Date().toISOString() }).eq("id", 1);
  const valid = new Set(entries.map((e) => e.id));
  let n = 0;
  for (const c of res.conflicts ?? []) {
    const ids = [...new Set(c.entry_ids.filter((id) => valid.has(id)))].sort();
    if (ids.length < 2 || known.has(ids.join(","))) continue;
    known.add(ids.join(","));
    await supabase.from("guide_conflicts").insert({
      entry_ids: ids, summary: c.summary,
      proposed_section: c.proposed_section, proposed_title: c.proposed_title, proposed_content: c.proposed_content,
    });
    n++;
  }
  return n;
}

/**
 * Resolves a conflict: "proposal" writes the proposed rule into the first entry
 * and turns the others off; "keep" keeps one entry and turns the others off;
 * "dismiss" says they don't really conflict.
 */
export async function resolveGuideConflict(id: string, decision: { kind: "proposal" | "keep" | "dismiss"; keepId?: string; content?: string }, by: string) {
  const { data: c } = await supabase.from("guide_conflicts").select("*").eq("id", id).maybeSingle();
  if (!c || c.status !== "pending") throw new Error("Este conflito já foi tratado.");
  const ids = (c.entry_ids as string[]) ?? [];
  const now = new Date().toISOString();
  let resolution = "Ignorado (não é conflito)";
  if (decision.kind === "proposal") {
    const [first, ...rest] = ids;
    await supabase.from("company_guide").update({
      section: c.proposed_section, title: c.proposed_title, content: decision.content?.trim() || c.proposed_content, active: true, updated_at: now,
    }).eq("id", first);
    if (rest.length) await supabase.from("company_guide").update({ active: false, updated_at: now }).in("id", rest);
    resolution = "Aplicada a regra proposta";
  } else if (decision.kind === "keep") {
    if (!decision.keepId || !ids.includes(decision.keepId)) throw new Error("Escolhe uma das regras do conflito.");
    const others = ids.filter((x) => x !== decision.keepId);
    await supabase.from("company_guide").update({ active: false, updated_at: now }).in("id", others);
    resolution = `Mantida a regra ${decision.keepId}`;
  }
  await supabase.from("guide_conflicts").update({
    status: decision.kind === "dismiss" ? "dismissed" : "resolved", resolution, decided_by: by, decided_at: now,
  }).eq("id", id);
}

/** Runs the conflict check if it never ran or the last one is a week old. */
export async function checkGuideIfDue(): Promise<void> {
  try {
    const { data } = await supabase.from("inbox_settings").select("guide_checked_at").eq("id", 1).maybeSingle();
    const last = data?.guide_checked_at ? new Date(data.guide_checked_at as string).getTime() : 0;
    if (Date.now() - last > 7 * 86400_000) await detectGuideConflicts();
  } catch (e) {
    console.error("[guide] conflict check failed:", e);
  }
}
