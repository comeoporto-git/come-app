/**
 * Reads new emails and prepares replies, sales, expenses and tasks for the
 * team in /admin/inbox. Sends nothing to anyone.
 *
 * Called every 2 minutes by the database (pg_cron → inbox_sync_tick) with the
 * token in inbox_settings.cron_token, or manually with Bearer <CRON_SECRET>.
 * Answers at once and does the work in the background, one run at a time.
 */

import { NextResponse, after } from "next/server";
import { runInboxSync } from "@/lib/inboxSyncRunner";
import { supabase } from "@/lib/notion";

export const maxDuration = 300;

async function authorized(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`) return true;
  const { data } = await supabase.from("inbox_settings").select("cron_token").eq("id", 1).maybeSingle();
  return !!data?.cron_token && header === `Bearer ${data.cron_token}`;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  after(() => runInboxSync({ maxAnalyses: 6 }));
  return NextResponse.json({ started: true });
}
