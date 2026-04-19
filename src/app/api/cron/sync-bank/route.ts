/**
 * Legacy combined sync endpoint — kept for manual testing via curl.
 * The nightly cron now uses the split /fetch + /match endpoints instead.
 *
 * Authorization: Bearer <CRON_SECRET>
 */

import { doSync }      from "@/lib/bankSync";
import { writeSyncLog } from "@/lib/enablebanking";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await doSync();
    // Re-log with trigger "cron" (doSync already logs as "manual")
    await writeSyncLog({ trigger: "cron", ...result }).catch(() => {});
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CronSync] unhandled error:", msg);
    await writeSyncLog({ trigger: "cron", fetched: 0, matched: 0, unmatched: 0, flagged: 0, errors: [], fatalError: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
