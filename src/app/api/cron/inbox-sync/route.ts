/**
 * Reads new emails and prepares suggestions (replies, sales, expenses) for
 * approval in /admin/inbox. Sends nothing.
 *
 * Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from "next/server";
import { syncInbox } from "@/lib/inboxAgent";
import { getInboxOwnerUserId } from "@/lib/google-token";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = await getInboxOwnerUserId();
  if (!userId) return NextResponse.json({ error: "Gmail not connected yet" }, { status: 400 });
  try {
    const result = await syncInbox({ userId, maxAnalyses: 8 });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[inbox-sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
