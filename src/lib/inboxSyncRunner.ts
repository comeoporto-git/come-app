import { headers } from "next/headers";
import { supabase } from "@/lib/notion";
import { syncInbox, type SyncResult } from "@/lib/inboxAgent";
import { getInboxOwnerUserId } from "@/lib/google-token";

/** A run that started less than this long ago is still going (or died); don't start another. */
const LOCK_MS = 5 * 60 * 1000;

/**
 * Runs one inbox sync unless another is already running. Used by the
 * every-2-minutes database job and by the "Ler novos emails" button.
 */
export async function runInboxSync(opts: { userId?: string; maxAnalyses: number }): Promise<SyncResult | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_MS).toISOString();
  // Take the lock only if it is free (or stale) — one atomic update.
  const { data: locked } = await supabase
    .from("inbox_settings")
    .update({ sync_started_at: now.toISOString() })
    .eq("id", 1)
    .or(`sync_started_at.is.null,sync_started_at.lt.${staleBefore}`)
    .select("id");
  if (!locked?.length) return null;

  try {
    const userId = opts.userId ?? (await getInboxOwnerUserId());
    if (!userId) return null;
    return await syncInbox({ userId, maxAnalyses: opts.maxAnalyses });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[inbox-sync]", msg);
    await supabase.from("inbox_settings").update({ last_sync_error: msg.slice(0, 500), last_synced_at: new Date().toISOString() }).eq("id", 1);
    return null;
  } finally {
    await supabase.from("inbox_settings").update({ sync_started_at: null }).eq("id", 1);
  }
}

/**
 * Remembers the app's public address (from the request) so the database job
 * can call /api/cron/inbox-sync every 2 minutes. Ignores local addresses.
 */
export async function rememberAppUrl(): Promise<void> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || host.startsWith("localhost") || host.startsWith("127.")) return;
  const url = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  await supabase.from("inbox_settings").update({ app_url: url }).eq("id", 1);
}
