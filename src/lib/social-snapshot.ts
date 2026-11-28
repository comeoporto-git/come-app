import { supabase } from "@/lib/notion";
import { getBrandBrief } from "@/lib/social-ai";
import { getCategorySuggestion, getCategoryBalance } from "@/lib/social-planning";
import { SOCIAL_CATEGORIES } from "@/lib/social-categories";

/** Social media state (what to post next, schedule, backlog) for COME AI on the Social pages. */
export async function getSocialSnapshot() {
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
      supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "pending").then((r) => ({ data: r.count ?? 0 })),
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

