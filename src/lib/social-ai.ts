import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

const BRAND_BRIEF_ID = "00000000-0000-0000-0000-000000000001";

// Anthropic images are sent as base64 — skip scoring anything that would
// blow past a sane request size rather than fail the whole sync.
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

type BrandBriefRow = {
  tone: string | null;
  offerings: string | null;
  website_summary: string | null;
  audience: string | null;
  guidelines: string | null;
};

type BusinessRuleRow = { key: string; value: string; description: string | null };

/** Formats the singleton brand brief + relevant business_rules as a context block for AI prompts. */
export async function getBrandBrief(): Promise<string> {
  const [briefResult, rulesResult] = await Promise.all([
    supabase
      .from("social_brand_brief")
      .select("tone, offerings, website_summary, audience, guidelines")
      .eq("id", BRAND_BRIEF_ID)
      .maybeSingle(),
    supabase.from("business_rules").select("key, value, description"),
  ]);
  const brief = briefResult.data as BrandBriefRow | null;
  const rules = rulesResult.data as BusinessRuleRow[] | null;

  const parts: string[] = [];
  // Guidelines first and most prominent — this is where concrete formatting
  // rules (structure, language, hashtags, CTA) tend to live, and it needs to
  // read as instructions, not just background color.
  if (brief?.guidelines) parts.push(`Diretrizes (regras concretas a seguir):\n${brief.guidelines}`);
  if (brief?.tone) parts.push(`Tom de voz: ${brief.tone}`);
  if (brief?.offerings) parts.push(`O que vendemos: ${brief.offerings}`);
  if (brief?.audience) parts.push(`Audiência: ${brief.audience}`);
  if (brief?.website_summary) parts.push(`Sobre o negócio: ${brief.website_summary}`);

  if (rules && rules.length > 0) {
    const rulesText = rules
      .map((r) => `- ${r.key}: ${r.value}${r.description ? ` (${r.description})` : ""}`)
      .join("\n");
    parts.push(`Regras do negócio:\n${rulesText}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "Sem informação de marca definida ainda.";
}

export type PhotoScore = { score: number; reason: string; tags: string[] };

type ImagePayload = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

async function fetchImageAsBase64(url: string): Promise<ImagePayload | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const mediaType: ImagePayload["mediaType"] = contentType.includes("png")
    ? "image/png"
    : contentType.includes("webp")
      ? "image/webp"
      : "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) return null;
  return { data: buf.toString("base64"), mediaType };
}

const SCORE_SYSTEM_PROMPT = `You are a social media photo curator for a Porto food-tours business. Given a photo and the business's brand context, score how well it would work as an Instagram post: composition, lighting, subject appeal, and on-brand fit. This is an assistive ranking signal only — a human always makes the final approve/reject call, so be honest rather than generous.

Return ONLY valid JSON, no markdown fences, no explanation:
{"score": 0-100, "reason": "one short sentence in Portuguese explaining the score", "tags": ["tag1", "tag2"]}

Tags should be short lowercase labels such as "comida", "pessoas", "exterior", "interior", "grupo", "baixa-qualidade", "desfocada".`;

export async function scorePhoto(photo: { blobUrl: string; filename: string | null }): Promise<PhotoScore> {
  const image = await fetchImageAsBase64(photo.blobUrl);
  if (!image) {
    return { score: 0, reason: "Não foi possível analisar esta imagem (demasiado grande ou inacessível).", tags: [] };
  }

  const brandBrief = await getBrandBrief();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `${SCORE_SYSTEM_PROMPT}\n\nContexto da marca:\n${brandBrief}`,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: `Ficheiro: ${photo.filename ?? "sem nome"}. Avalia esta foto para publicação no Instagram.` },
        ],
      },
    ],
  });

  const raw = (response.content[0] as { type: string; text: string }).text.trim();
  try {
    const parsed = JSON.parse(extractJson(raw)) as { score: number; reason: string; tags: string[] };
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      reason: parsed.reason ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return { score: 50, reason: "Avaliação AI indisponível — pontuação neutra atribuída.", tags: [] };
  }
}

function extractJson(raw: string): string {
  const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return clean;
  return clean.slice(start, end + 1);
}

// ── Captions (Phase 2) ──────────────────────────────────────────────────────

export type PostComment = { author_type: "owner" | "ai"; body: string; created_at: string };

export async function getPostCommentThread(postId: string): Promise<PostComment[]> {
  const { data } = await supabase
    .from("social_post_comments")
    .select("author_type, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PostComment[];
}

/**
 * Recent approved/published captions + the owner feedback that shaped them,
 * formatted as few-shot context. This is what makes the brand voice "learn"
 * from past reviews without any fine-tuning — pure in-context retrieval.
 */
export async function getRecentApprovedPostsContext(limit = 8): Promise<string> {
  const { data: posts } = await supabase
    .from("social_posts")
    .select("id, caption")
    .in("status", ["approved", "scheduled", "published"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!posts || posts.length === 0) return "";

  const examples = await Promise.all(
    (posts as { id: string; caption: string | null }[]).map(async (post) => {
      if (!post.caption) return null;
      const thread = await getPostCommentThread(post.id);
      const ownerFeedback = thread
        .filter((c) => c.author_type === "owner")
        .map((c) => `  - ${c.body}`)
        .join("\n");
      return `Legenda: "${post.caption}"${ownerFeedback ? `\nFeedback do dono nesta publicação:\n${ownerFeedback}` : ""}`;
    })
  );

  const filtered = examples.filter((e): e is string => e !== null);
  if (filtered.length === 0) return "";

  return `Exemplos de publicações anteriores aprovadas (usa o mesmo tom e tem em conta o feedback dado):\n\n${filtered.join("\n\n")}`;
}

const CAPTION_SYSTEM_PROMPT = `You are the social media copywriter for a Porto food-tours business. Write an Instagram caption for the given photo, matching the brand's tone and following the brand guidelines below EXACTLY.

The "DIRETRIZES DA MARCA" section below is written by the business owner and is MANDATORY — it overrides every default in this paragraph whenever the two conflict (language(s) used, caption structure, length, hashtags, call-to-action, everything). Only fall back to these defaults for anything the brand guidelines don't cover:
- Write in European Portuguese.
- Keep it concise (2-4 sentences).
- End with 3-6 relevant hashtags.
- Make it feel authentic, not generic marketing copy.

CONSISTENCY IS CRITICAL — captions are generated one at a time across many separate requests, and they must all look like they came from the same playbook:
- If the guidelines offer a choice between multiple valid options (e.g. "use emojis OR a divider line"), always pick the SAME one every time — default to the first option listed — never alternate between them across different captions.
- Once you establish a structure (section order, whether each language block repeats the hook/CTA or shares one, hashtag count), reproduce that exact skeleton every time. Do not improvise a different layout from one caption to the next.
- Do not treat the guidelines as inspiration to riff on — treat them as a fixed template to fill in with content specific to each photo.

Return ONLY the caption text — no explanation, no markdown fences, no surrounding quotes.`;

function buildCaptionSystemPrompt(brandBrief: string, pastPostsContext: string): string {
  return `${CAPTION_SYSTEM_PROMPT}\n\n=== DIRETRIZES DA MARCA (segue estas à risca) ===\n${brandBrief}${pastPostsContext ? `\n\n${pastPostsContext}` : ""}`;
}

// ── Language-coverage safety net ────────────────────────────────────────────
// Prompt wording alone isn't 100% reliable for "always do X" rules — a
// caption generation can silently drop a required language even with an
// explicit instruction not to. This adds a cheap post-hoc check + one retry
// specifically for that failure mode, since dropping a language the brand
// requires in every post is high-stakes (half the audience gets nothing).

type LanguageCheck = { name: string; test: RegExp };

const LANGUAGE_CHECKS: LanguageCheck[] = [
  { name: "português", test: /[ãõéêáàâóôíç]|\b(não|para|com|teu|tua|nossa|reserva|descobre)\b/i },
  { name: "inglês", test: /\b(the|and|your|book|discover|experience|taste|with)\b/i },
];

/** Scans the brand context text itself for signals that every post must cover multiple languages. */
function requiredLanguages(brandContext: string): LanguageCheck[] {
  const text = brandContext.toLowerCase();
  const mentionsBilingual = /bilingue|bilingual/.test(text);
  const mentionsPt = /portugu[eê]s/.test(text);
  const mentionsEn = /ingl[eê]s|english/.test(text);
  return mentionsBilingual || (mentionsPt && mentionsEn) ? LANGUAGE_CHECKS : [];
}

function missingLanguages(caption: string, required: LanguageCheck[]): string[] {
  return required.filter((lang) => !lang.test.test(caption)).map((lang) => lang.name);
}

type CaptionContent =
  | string
  | ({ type: "image"; source: { type: "base64"; media_type: ImagePayload["mediaType"]; data: string } } | { type: "text"; text: string })[];

function withLanguageReminder(content: CaptionContent, missing: string[]): CaptionContent {
  const reminder = `\n\nATENÇÃO: a tua resposta anterior não incluiu texto em ${missing.join(" e ")}. As diretrizes da marca exigem isto em TODAS as publicações, sem exceção. Reescreve a legenda incluindo obrigatoriamente ${missing.join(" e ")} desta vez.`;
  return typeof content === "string" ? content + reminder : [...content, { type: "text", text: reminder }];
}

async function callCaptionModel(system: string, content: CaptionContent): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700, // bilingual / structured captions (per brand guidelines) run longer than a plain single-language caption
    system,
    messages: [{ role: "user", content }],
  });
  return (response.content[0] as { type: string; text: string }).text.trim();
}

/** Generates a caption, then verifies + retries once if a brand-required language is missing. */
async function generateWithLanguageCheck(system: string, content: CaptionContent, brandBrief: string): Promise<string> {
  const required = requiredLanguages(brandBrief);
  const caption = await callCaptionModel(system, content);
  if (required.length === 0) return caption;

  const missing = missingLanguages(caption, required);
  if (missing.length === 0) return caption;

  return callCaptionModel(system, withLanguageReminder(content, missing));
}

export async function generateCaption(
  photo: { blobUrl: string; filename: string | null },
  brandBrief: string,
  pastPostsContext: string
): Promise<string> {
  const system = buildCaptionSystemPrompt(brandBrief, pastPostsContext);
  const image = await fetchImageAsBase64(photo.blobUrl);

  const userContent: CaptionContent = image
    ? [
        { type: "image" as const, source: { type: "base64" as const, media_type: image.mediaType, data: image.data } },
        { type: "text" as const, text: "Escreve uma legenda para esta foto." },
      ]
    : `Ficheiro: ${photo.filename ?? "sem nome"}. Não foi possível carregar a imagem — escreve uma legenda genérica mas na voz da marca, adequada a uma foto de comida ou de um tour gastronómico no Porto.`;

  return generateWithLanguageCheck(system, userContent, brandBrief);
}

// ── Performance analysis (Phase 4) ──────────────────────────────────────────

export type PostPerformance = {
  caption: string | null;
  publishedAt: string | null;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
};

const ANALYSIS_SYSTEM_PROMPT = `You are a social media analyst for a Porto food-tours business. Given recent Instagram post performance data and the brand context, write a short analysis in European Portuguese: which type of content (subject, photo style, caption style) performs best, any patterns you notice, and 2-3 concrete, specific suggestions for future posts. Reference the actual data given rather than generic social media advice. Keep it to a few short paragraphs or a short bulleted list — no markdown headers.`;

export async function analyzePerformance(posts: PostPerformance[], brandBrief: string): Promise<string> {
  if (posts.length === 0) {
    return "Ainda não há publicações com métricas suficientes para uma análise.";
  }

  const postsText = posts
    .map((p, i) => {
      const parts = [
        `${i + 1}. Legenda: "${(p.caption ?? "(sem legenda)").slice(0, 140)}"`,
        p.publishedAt ? `publicado em ${p.publishedAt.slice(0, 10)}` : null,
        `impressões: ${p.impressions ?? "?"}`,
        `alcance: ${p.reach ?? "?"}`,
        `gostos: ${p.likes ?? "?"}`,
        `comentários: ${p.comments ?? "?"}`,
        `guardados: ${p.saves ?? "?"}`,
      ].filter(Boolean);
      return parts.join(", ");
    })
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: `${ANALYSIS_SYSTEM_PROMPT}\n\nContexto da marca:\n${brandBrief}`,
    messages: [{ role: "user", content: `Dados de publicações recentes:\n\n${postsText}\n\nEscreve a tua análise.` }],
  });

  return (response.content[0] as { type: string; text: string }).text.trim();
}

export async function refineCaption(
  currentCaption: string,
  commentThread: PostComment[],
  brandBrief: string,
  pastPostsContext: string
): Promise<string> {
  const system = buildCaptionSystemPrompt(brandBrief, pastPostsContext);
  const threadText = commentThread
    .map((c) => `${c.author_type === "owner" ? "Dono" : "AI"}: ${c.body}`)
    .join("\n");

  const content = `Legenda atual:\n"${currentCaption}"\n\nConversa de revisão:\n${threadText}\n\nReescreve a legenda tendo em conta o feedback mais recente do dono. Devolve apenas a nova legenda.`;

  return generateWithLanguageCheck(system, content, brandBrief);
}
