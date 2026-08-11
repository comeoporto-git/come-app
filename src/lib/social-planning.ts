import { supabase } from "@/lib/notion";
import { SOCIAL_CATEGORIES, type SocialCategorySlug } from "@/lib/social-categories";

export type CategorySuggestion = {
  category: SocialCategorySlug;
  label: string;
  recentCount: number;
  readyToScheduleCount: number;
};

/**
 * Looks at the last `windowSize` scheduled/published posts to find which
 * category has been posted about least (ties broken by fixed display
 * order), so the owner always has a concrete "post next" answer instead of
 * guessing from memory which topics have been neglected.
 */
export async function getCategorySuggestion(windowSize = 15): Promise<CategorySuggestion> {
  const { data: recentPosts } = await supabase
    .from("social_posts")
    .select("category, published_at, scheduled_for")
    .in("status", ["scheduled", "published"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(windowSize);

  const counts = new Map<string, number>();
  for (const c of SOCIAL_CATEGORIES) counts.set(c.slug, 0);
  for (const post of recentPosts ?? []) {
    if (post.category && counts.has(post.category)) {
      counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
    }
  }

  let least = SOCIAL_CATEGORIES[0];
  let leastCount = Infinity;
  for (const c of SOCIAL_CATEGORIES) {
    const count = counts.get(c.slug) ?? 0;
    if (count < leastCount) {
      leastCount = count;
      least = c;
    }
  }

  const { count: readyToScheduleCount } = await supabase
    .from("social_posts")
    .select("id", { count: "exact", head: true })
    .eq("category", least.slug)
    .in("status", ["in_review", "approved"]);

  return {
    category: least.slug,
    label: least.label,
    recentCount: leastCount,
    readyToScheduleCount: readyToScheduleCount ?? 0,
  };
}

export type CategoryBalanceRow = { slug: SocialCategorySlug; label: string; approvedPhotos: number; drafts: number; scheduled: number; published: number };

/** Full per-category breakdown, used by the dashboard and the AI manager's context. */
export async function getCategoryBalance(): Promise<CategoryBalanceRow[]> {
  const [{ data: photos }, { data: posts }] = await Promise.all([
    supabase.from("social_photos").select("category").eq("review_status", "approved"),
    supabase.from("social_posts").select("category, status"),
  ]);

  const rows: Record<string, CategoryBalanceRow> = {};
  for (const c of SOCIAL_CATEGORIES) {
    rows[c.slug] = { slug: c.slug, label: c.label, approvedPhotos: 0, drafts: 0, scheduled: 0, published: 0 };
  }

  for (const p of photos ?? []) {
    if (p.category && rows[p.category]) rows[p.category].approvedPhotos++;
  }
  for (const post of posts ?? []) {
    if (!post.category || !rows[post.category]) continue;
    if (post.status === "in_review" || post.status === "approved") rows[post.category].drafts++;
    else if (post.status === "scheduled") rows[post.category].scheduled++;
    else if (post.status === "published") rows[post.category].published++;
  }

  return SOCIAL_CATEGORIES.map((c) => rows[c.slug]);
}
