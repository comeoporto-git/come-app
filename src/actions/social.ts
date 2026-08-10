"use server";

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { syncDrivePhotos, scoreUnscoredPhotos, type SyncResult } from "@/lib/social-drive-sync";
import {
  scorePhoto,
  generateCaption,
  refineCaption,
  getBrandBrief,
  getRecentApprovedPostsContext,
  getPostCommentThread,
  analyzePerformance,
  type PostPerformance,
} from "@/lib/social-ai";
import { syncInstagramInsights, type IgSyncResult } from "@/lib/social-ig-sync";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";
const BRAND_BRIEF_ID = "00000000-0000-0000-0000-000000000001";
const IG_CONNECTION_ID = "00000000-0000-0000-0000-000000000003";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Unauthorized");
  return session;
}

export async function connectDriveFolder(folderId: string, folderName: string): Promise<void> {
  const session = await requireAdmin();
  await supabase
    .from("social_drive_connection")
    .update({
      folder_id: folderId.trim(),
      folder_name: folderName.trim() || null,
      connected_by_team_id: session.user.notionId,
    })
    .eq("id", DRIVE_CONNECTION_ID);

  revalidatePath("/admin/social");
  revalidatePath("/admin/social/connect");
  revalidatePath("/admin/social/photos");
}

export async function syncDriveNow(): Promise<SyncResult> {
  const session = await requireAdmin();
  const result = await syncDrivePhotos(session.user.googleAccessToken, session.user.id);
  revalidatePath("/admin/social/photos");
  revalidatePath("/admin/social");
  return result;
}

export async function reviewPhoto(photoId: string, status: "approved" | "rejected" | "pending"): Promise<void> {
  const session = await requireAdmin();
  await supabase
    .from("social_photos")
    .update({
      review_status: status,
      reviewed_by: session.user.notionId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", photoId);

  if (status === "approved") {
    // Best-effort: an approved photo should show up with a suggested
    // caption in the Copy section, but a slow/failed AI call shouldn't
    // block the approve action itself.
    await promoteToPost(photoId).catch((err) => {
      console.error(`[social] promoteToPost failed for photo ${photoId}:`, err);
    });
  }

  revalidatePath("/admin/social/photos");
  revalidatePath("/admin/social/posts");
  revalidatePath("/admin/social");
}

/** Idempotent: creates a draft post with an AI-generated caption for an approved photo, or returns the existing one. */
export async function promoteToPost(photoId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("social_posts")
    .select("id")
    .eq("photo_id", photoId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: photo } = await supabase
    .from("social_photos")
    .select("id, blob_url, filename")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return null;

  const [brandBrief, pastPostsContext] = await Promise.all([getBrandBrief(), getRecentApprovedPostsContext()]);
  const caption = await generateCaption({ blobUrl: photo.blob_url, filename: photo.filename }, brandBrief, pastPostsContext);

  const { data: inserted } = await supabase
    .from("social_posts")
    .insert({ photo_id: photoId, caption, status: "in_review" })
    .select("id")
    .single();

  return inserted?.id ?? null;
}

/** Throws away the current caption and generates a fresh one from scratch — e.g. after editing the Brand Brief or Diretrizes. Unlike addPostComment, this ignores the existing caption entirely rather than revising it. */
export async function regenerateCaption(postId: string): Promise<void> {
  await requireAdmin();

  const { data: post } = await supabase.from("social_posts").select("photo_id").eq("id", postId).maybeSingle();
  if (!post?.photo_id) return;

  const { data: photo } = await supabase
    .from("social_photos")
    .select("blob_url, filename")
    .eq("id", post.photo_id)
    .maybeSingle();
  if (!photo) return;

  const [brandBrief, pastPostsContext] = await Promise.all([getBrandBrief(), getRecentApprovedPostsContext()]);
  const caption = await generateCaption({ blobUrl: photo.blob_url, filename: photo.filename }, brandBrief, pastPostsContext);

  await supabase
    .from("social_posts")
    .update({ caption, status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", postId);

  await supabase.from("social_post_comments").insert({
    post_id: postId,
    author_type: "ai",
    body: "Legenda gerada novamente do zero (Regenerar), não uma revisão do comentário anterior.",
    caption_snapshot: caption,
  });

  revalidatePath(`/admin/social/posts/${postId}`);
  revalidatePath("/admin/social/posts");
}

/** Records the owner's feedback and asks AI to rewrite the caption accordingly. */
export async function addPostComment(postId: string, body: string): Promise<void> {
  const session = await requireAdmin();
  const trimmed = body.trim();
  if (!trimmed) return;

  const { data: post } = await supabase.from("social_posts").select("caption").eq("id", postId).single();
  const currentCaption = post?.caption ?? "";

  await supabase.from("social_post_comments").insert({
    post_id: postId,
    author_type: "owner",
    author_team_id: session.user.notionId,
    body: trimmed,
    caption_snapshot: currentCaption,
  });

  const [brandBrief, pastPostsContext, thread] = await Promise.all([
    getBrandBrief(),
    getRecentApprovedPostsContext(),
    getPostCommentThread(postId),
  ]);
  const newCaption = await refineCaption(currentCaption, thread, brandBrief, pastPostsContext);

  await supabase
    .from("social_posts")
    .update({ caption: newCaption, status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", postId);

  await supabase.from("social_post_comments").insert({
    post_id: postId,
    author_type: "ai",
    body: "Legenda atualizada com base no teu comentário.",
    caption_snapshot: newCaption,
  });

  revalidatePath(`/admin/social/posts/${postId}`);
  revalidatePath("/admin/social/posts");
}

export async function setPostCopyStatus(postId: string, status: "in_review" | "approved"): Promise<void> {
  await requireAdmin();
  await supabase.from("social_posts").update({ status, updated_at: new Date().toISOString() }).eq("id", postId);
  revalidatePath(`/admin/social/posts/${postId}`);
  revalidatePath("/admin/social/posts");
}

/** scheduledForIso: local datetime-local input value (e.g. "2026-08-20T10:00"), stored as-is in UTC-naive form. */
export async function schedulePost(postId: string, scheduledForIso: string): Promise<void> {
  await requireAdmin();
  const date = new Date(scheduledForIso);
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida");

  await supabase
    .from("social_posts")
    .update({ status: "scheduled", scheduled_for: date.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", postId);

  revalidatePath(`/admin/social/posts/${postId}`);
  revalidatePath("/admin/social/posts");
  revalidatePath("/admin/social/calendar");
  revalidatePath("/admin/social");
}

/** Back out of a schedule — returns the post to "approved" so it can be rescheduled or left for later. */
export async function unschedulePost(postId: string): Promise<void> {
  await requireAdmin();
  await supabase
    .from("social_posts")
    .update({ status: "approved", scheduled_for: null, updated_at: new Date().toISOString() })
    .eq("id", postId);

  revalidatePath(`/admin/social/posts/${postId}`);
  revalidatePath("/admin/social/posts");
  revalidatePath("/admin/social/calendar");
  revalidatePath("/admin/social");
}

/** The app never auto-publishes — this just records that the owner posted manually and where. */
export async function markPostPublished(postId: string, permalink: string): Promise<void> {
  await requireAdmin();
  await supabase
    .from("social_posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      ig_permalink: permalink.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  revalidatePath(`/admin/social/posts/${postId}`);
  revalidatePath("/admin/social/posts");
  revalidatePath("/admin/social/calendar");
  revalidatePath("/admin/social");
}

export async function rescorePhoto(photoId: string): Promise<void> {
  await requireAdmin();
  const { data: photo } = await supabase
    .from("social_photos")
    .select("id, blob_url, filename")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return;

  const result = await scorePhoto({ blobUrl: photo.blob_url, filename: photo.filename });
  await supabase
    .from("social_photos")
    .update({
      ai_score: result.score,
      ai_score_reason: result.reason,
      ai_tags: result.tags,
      ai_scored_at: new Date().toISOString(),
    })
    .eq("id", photoId);

  revalidatePath("/admin/social/photos");
}

export async function rescoreUnscoredNow(): Promise<number> {
  await requireAdmin();
  const scored = await scoreUnscoredPhotos(25);
  revalidatePath("/admin/social/photos");
  return scored;
}

// ── Brand brief (Phase 4) ────────────────────────────────────────────────────

export async function saveBrandBrief(fields: {
  tone: string;
  offerings: string;
  websiteSummary: string;
  audience: string;
  guidelines: string;
}): Promise<void> {
  const session = await requireAdmin();
  await supabase
    .from("social_brand_brief")
    .update({
      tone: fields.tone.trim() || null,
      offerings: fields.offerings.trim() || null,
      website_summary: fields.websiteSummary.trim() || null,
      audience: fields.audience.trim() || null,
      guidelines: fields.guidelines.trim() || null,
      updated_by: session.user.notionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", BRAND_BRIEF_ID);

  revalidatePath("/admin/social/brand-brief");
}

// ── Instagram analytics (Phase 4) ───────────────────────────────────────────

export async function connectInstagram(fields: {
  pageAccessToken: string;
  igBusinessAccountId: string;
  fbPageId: string;
}): Promise<void> {
  const session = await requireAdmin();
  await supabase
    .from("social_ig_connection")
    .update({
      page_access_token: fields.pageAccessToken.trim(),
      ig_business_account_id: fields.igBusinessAccountId.trim(),
      fb_page_id: fields.fbPageId.trim(),
      connected_by_team_id: session.user.notionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", IG_CONNECTION_ID);

  revalidatePath("/admin/social/analytics");
}

export async function disconnectInstagram(): Promise<void> {
  await requireAdmin();
  await supabase
    .from("social_ig_connection")
    .update({ page_access_token: null, ig_business_account_id: null, fb_page_id: null })
    .eq("id", IG_CONNECTION_ID);

  revalidatePath("/admin/social/analytics");
}

export async function syncInstagramNow(): Promise<IgSyncResult> {
  await requireAdmin();
  const result = await syncInstagramInsights();
  revalidatePath("/admin/social/analytics");
  return result;
}

export async function generateAnalysis(): Promise<string> {
  await requireAdmin();

  const { data: rows } = await supabase
    .from("social_posts")
    .select("caption, published_at, social_ig_insights(impressions, reach, likes, comments, saves, fetched_at)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(30);

  const posts: PostPerformance[] = ((rows ?? []) as unknown as {
    caption: string | null;
    published_at: string | null;
    social_ig_insights: { impressions: number | null; reach: number | null; likes: number | null; comments: number | null; saves: number | null; fetched_at: string }[];
  }[]).map((row) => {
    // social_ig_insights holds one snapshot per sync — use the most recent.
    const latest = [...row.social_ig_insights].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0];
    return {
      caption: row.caption,
      publishedAt: row.published_at,
      impressions: latest?.impressions ?? null,
      reach: latest?.reach ?? null,
      likes: latest?.likes ?? null,
      comments: latest?.comments ?? null,
      saves: latest?.saves ?? null,
    };
  });

  const brandBrief = await getBrandBrief();
  const summary = await analyzePerformance(posts, brandBrief);

  await supabase.from("social_ai_analysis").insert({
    period_start: posts.length > 0 ? posts[posts.length - 1].publishedAt?.slice(0, 10) : null,
    period_end: posts.length > 0 ? posts[0].publishedAt?.slice(0, 10) : null,
    summary,
  });

  revalidatePath("/admin/social/analytics");
  return summary;
}
