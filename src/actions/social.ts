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
} from "@/lib/social-ai";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";

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
