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
  if (brief?.tone) parts.push(`Tom de voz: ${brief.tone}`);
  if (brief?.offerings) parts.push(`O que vendemos: ${brief.offerings}`);
  if (brief?.audience) parts.push(`Audiência: ${brief.audience}`);
  if (brief?.website_summary) parts.push(`Sobre o negócio: ${brief.website_summary}`);
  if (brief?.guidelines) parts.push(`Diretrizes: ${brief.guidelines}`);

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
