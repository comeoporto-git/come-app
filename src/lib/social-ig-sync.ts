import { supabase } from "@/lib/notion";
import { fetchRecentMedia, fetchMediaInsights } from "@/lib/instagram";

const IG_CONNECTION_ID = "00000000-0000-0000-0000-000000000003";

export type IgSyncResult =
  | { status: "ok"; matched: number; insightsFetched: number }
  | { status: "not_connected" }
  | { status: "error"; message: string };

function normalizePermalink(url: string | null): string | null {
  if (!url) return null;
  return url.trim().replace(/\/+$/, "");
}

/**
 * Matches published posts (that have a pasted IG permalink but no resolved
 * media id yet) against the account's recent media, then pulls insights for
 * every published post that has a media id.
 */
export async function syncInstagramInsights(): Promise<IgSyncResult> {
  const { data: connection } = await supabase
    .from("social_ig_connection")
    .select("ig_business_account_id, page_access_token")
    .eq("id", IG_CONNECTION_ID)
    .maybeSingle();

  if (!connection?.page_access_token || !connection?.ig_business_account_id) {
    return { status: "not_connected" };
  }
  const token = connection.page_access_token;
  const igBusinessAccountId = connection.ig_business_account_id;

  try {
    const recentMedia = await fetchRecentMedia(token, igBusinessAccountId, 50);
    const byPermalink = new Map(recentMedia.map((m) => [normalizePermalink(m.permalink), m.id]));

    const { data: unmatchedPosts } = await supabase
      .from("social_posts")
      .select("id, ig_permalink")
      .eq("status", "published")
      .is("ig_media_id", null)
      .not("ig_permalink", "is", null);

    let matched = 0;
    for (const post of unmatchedPosts ?? []) {
      const mediaId = byPermalink.get(normalizePermalink(post.ig_permalink));
      if (mediaId) {
        await supabase.from("social_posts").update({ ig_media_id: mediaId }).eq("id", post.id);
        matched++;
      }
    }

    const { data: publishedPosts } = await supabase
      .from("social_posts")
      .select("id, ig_media_id")
      .eq("status", "published")
      .not("ig_media_id", "is", null);

    let insightsFetched = 0;
    for (const post of publishedPosts ?? []) {
      if (!post.ig_media_id) continue;
      try {
        const metrics = await fetchMediaInsights(token, post.ig_media_id);
        const engagement =
          (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.saves ?? 0) + (metrics.shares ?? 0);
        const engagementRate = metrics.reach && metrics.reach > 0 ? engagement / metrics.reach : null;

        await supabase.from("social_ig_insights").insert({
          post_id: post.id,
          ig_media_id: post.ig_media_id,
          impressions: metrics.impressions,
          reach: metrics.reach,
          likes: metrics.likes,
          comments: metrics.comments,
          saves: metrics.saves,
          shares: metrics.shares,
          engagement_rate: engagementRate,
          raw_metrics: metrics.raw,
        });
        insightsFetched++;
      } catch (err) {
        console.error(`[social-ig-sync] insights failed for media ${post.ig_media_id}:`, err);
      }
    }

    return { status: "ok", matched, insightsFetched };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
}
