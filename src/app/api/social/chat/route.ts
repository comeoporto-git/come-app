import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";
import { getBrandBrief } from "@/lib/social-ai";
import { getCategorySuggestion, getCategoryBalance } from "@/lib/social-planning";
import { SOCIAL_CATEGORIES } from "@/lib/social-categories";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getSocialSnapshot() {
  const [brandBrief, suggestion, categoryBalance, { data: upcoming }, { data: recentPublished }, { data: pendingPhotos }] =
    await Promise.all([
      getBrandBrief(),
      getCategorySuggestion(),
      getCategoryBalance(),
      supabase
        .from("social_posts")
        .select("caption, category, scheduled_for")
        .eq("status", "scheduled")
        .order("scheduled_for", { ascending: true })
        .limit(20),
      supabase
        .from("social_posts")
        .select("caption, category, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(15),
      supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    ]);

  return {
    today: new Date().toISOString().split("T")[0],
    contentCategories: SOCIAL_CATEGORIES.map((c) => c.label),
    postNextSuggestion: suggestion,
    categoryBalance,
    pendingPhotosAwaitingReview: pendingPhotos ?? 0,
    upcomingScheduled: (upcoming ?? []).map((p) => ({
      date: p.scheduled_for,
      category: p.category,
      captionPreview: p.caption?.slice(0, 100) ?? null,
    })),
    recentlyPublished: (recentPublished ?? []).map((p) => ({
      date: p.published_at,
      category: p.category,
      captionPreview: p.caption?.slice(0, 100) ?? null,
    })),
    brandBrief,
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  if (!messages?.length) {
    return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
  }

  let snapshot: Awaited<ReturnType<typeof getSocialSnapshot>>;
  try {
    snapshot = await getSocialSnapshot();
  } catch {
    snapshot = { today: new Date().toISOString().split("T")[0] } as never;
  }

  const systemPrompt = `You are a senior social media manager (10+ years running Instagram for hospitality/tourism brands) helping the owner of COME o Porto — a food-tours and cooking-classes business in Porto, Portugal — get their content operation up and running from scratch.

The app already handles the mechanics: syncing photos from Google Drive, AI photo scoring, AI-drafted bilingual captions, a scheduling calendar, and Instagram analytics. Your job is the strategic layer on top of that — the thinking a senior human social media manager would bring, not the plumbing.

Their content is organized into these fixed categories: ${(snapshot.contentCategories ?? []).join(", ") || "Tours, Aulas de Culinária, Eventos, Chefs, Guias, Pratos, Decoração, Vinhos"}.

How to be useful:
- Be proactive, specific, and strategic. Ground every recommendation in the real data below (category balance, what's scheduled, what's recently published, the current "post next" suggestion, pending review backlog) — never give generic social-media-101 advice detached from their actual numbers.
- When asked "what should I post next" or similar, give a direct, specific answer citing the category and why (under-represented, nothing scheduled, backlog ready) — the postNextSuggestion field already computed this, use it as your starting point but add your own judgment.
- When asked to "help get things up and running" or for a plan, propose a concrete first-2-weeks posting cadence across categories, tell them what to shoot/gather next for categories with low backlog, and point at specific next actions in the app (e.g. "aprova mais fotos de Vinhos em Fotos", "agenda a publicação de amanhã no Calendário").
- You cannot take actions yourself (no publishing, no editing posts, no scheduling) — you only advise. Always point to exactly where in the app to go to do the thing you're suggesting.
- Respond in the same language the user writes in (Portuguese if they write Portuguese, English if English).

Current state (today: ${snapshot.today}):
${JSON.stringify(snapshot, null, 2)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        for await (const chunk of response) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\nErro: ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
