import { put } from "@vercel/blob";
import { supabase } from "@/lib/notion";
import { getDriveToken, listDriveImagesRecursive, downloadDriveFile } from "@/lib/google-drive";
import { scorePhoto } from "@/lib/social-ai";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";

// Vision-scoring is sequential (one Anthropic call per photo), so cap how
// many run in a single sync to keep the manual "Sync now" click responsive.
// Anything left over gets picked up on the next sync or a manual rescore.
const SCORE_BATCH_LIMIT = 25;

export type SyncResult =
  | { status: "ok"; added: number; scanned: number; scored: number }
  | { status: "no_connection" }
  | { status: "no_token" }
  | { status: "no_scope" }
  | { status: "api_disabled" }
  | { status: "error"; message?: string };

type DriveConnectionRow = {
  id: string;
  folder_id: string | null;
  last_modified_cursor: string | null;
};

export async function syncDrivePhotos(
  sessionToken: string | undefined,
  userId: string
): Promise<SyncResult> {
  const { data: connection } = await supabase
    .from("social_drive_connection")
    .select("id, folder_id, last_modified_cursor")
    .eq("id", DRIVE_CONNECTION_ID)
    .maybeSingle();

  const row = connection as DriveConnectionRow | null;
  if (!row?.folder_id) return { status: "no_connection" };

  const tokenResult = await getDriveToken(sessionToken, userId);
  if (tokenResult.status !== "ok") {
    await supabase
      .from("social_drive_connection")
      .update({ last_sync_error: `token:${tokenResult.status}` })
      .eq("id", DRIVE_CONNECTION_ID);
    return tokenResult;
  }

  try {
    const images = await listDriveImagesRecursive(
      tokenResult.token,
      row.folder_id,
      row.last_modified_cursor ?? undefined
    );

    let added = 0;
    let maxModified = row.last_modified_cursor ? new Date(row.last_modified_cursor) : new Date(0);

    for (const image of images) {
      const modified = new Date(image.modifiedTime);
      if (modified > maxModified) maxModified = modified;

      const { data: existing } = await supabase
        .from("social_photos")
        .select("id")
        .eq("drive_file_id", image.id)
        .maybeSingle();
      if (existing) continue;

      try {
        const { bytes, contentType } = await downloadDriveFile(tokenResult.token, image.id);
        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
        const blob = await put(`social/photos/${image.id}.${ext}`, Buffer.from(bytes), {
          access: "public",
          contentType,
        });

        await supabase.from("social_photos").insert({
          drive_file_id: image.id,
          filename: image.name,
          parent_folder_name: image.parentFolderName,
          blob_url: blob.url,
          drive_modified_time: image.modifiedTime,
          review_status: "pending",
        });
        added++;
      } catch (err) {
        console.error(`[social-drive-sync] failed to cache "${image.name}":`, err);
      }
    }

    await supabase
      .from("social_drive_connection")
      .update({
        last_synced_at: new Date().toISOString(),
        last_modified_cursor: maxModified.toISOString(),
        last_sync_error: null,
      })
      .eq("id", DRIVE_CONNECTION_ID);

    const scored = await scoreUnscoredPhotos(SCORE_BATCH_LIMIT);
    await reconcileMissingPhotos(tokenResult.token, row.folder_id);

    return { status: "ok", added, scanned: images.length, scored };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("social_drive_connection")
      .update({ last_sync_error: message })
      .eq("id", DRIVE_CONNECTION_ID);
    return { status: "error", message };
  }
}

type PhotoMissingCheckRow = { id: string; drive_file_id: string; missing_since: string | null };

/**
 * Full (non-incremental) crawl to detect photos whose Drive file no longer
 * exists in the synced tree — deleted, or moved elsewhere. Flags them with
 * missing_since rather than deleting the local record, since a caption or
 * schedule may already be built on top of it; clears the flag again if a
 * previously-missing file reappears on a later sync.
 */
async function reconcileMissingPhotos(token: string, folderId: string): Promise<void> {
  const allImages = await listDriveImagesRecursive(token, folderId);
  const liveIds = new Set(allImages.map((img) => img.id));

  const { data } = await supabase.from("social_photos").select("id, drive_file_id, missing_since");
  const rows = (data ?? []) as PhotoMissingCheckRow[];

  for (const row of rows) {
    const isLive = liveIds.has(row.drive_file_id);
    if (!isLive && !row.missing_since) {
      await supabase.from("social_photos").update({ missing_since: new Date().toISOString() }).eq("id", row.id);
    } else if (isLive && row.missing_since) {
      await supabase.from("social_photos").update({ missing_since: null }).eq("id", row.id);
    }
  }
}

type UnscoredPhotoRow = { id: string; blob_url: string; filename: string | null };

/** Scores up to `limit` pending photos that don't have an AI score yet. */
export async function scoreUnscoredPhotos(limit: number): Promise<number> {
  const { data } = await supabase
    .from("social_photos")
    .select("id, blob_url, filename")
    .eq("review_status", "pending")
    .is("ai_score", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const photos = (data ?? []) as UnscoredPhotoRow[];
  let scored = 0;

  for (const photo of photos) {
    try {
      const result = await scorePhoto({ blobUrl: photo.blob_url, filename: photo.filename });
      await supabase
        .from("social_photos")
        .update({
          ai_score: result.score,
          ai_score_reason: result.reason,
          ai_tags: result.tags,
          category: result.category,
          ai_scored_at: new Date().toISOString(),
        })
        .eq("id", photo.id);
      scored++;
    } catch (err) {
      console.error(`[social-drive-sync] scoring failed for photo ${photo.id}:`, err);
    }
  }

  return scored;
}
