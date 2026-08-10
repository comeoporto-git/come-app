"use server";

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { syncDrivePhotos, scoreUnscoredPhotos, type SyncResult } from "@/lib/social-drive-sync";
import { scorePhoto } from "@/lib/social-ai";

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

  revalidatePath("/admin/social/photos");
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
