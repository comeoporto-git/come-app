/**
 * Cron Phase 1 — Fetch bank transactions from Enable Banking and persist to Neon.
 *
 * Triggered by cron-job.org at 02:00 UTC daily.
 * Completes well within the Vercel Hobby 10-second timeout because it only
 * calls the Enable Banking API and writes to Neon — no Notion calls.
 *
 * Authorization: Bearer <CRON_SECRET>
 */

import { doFetch }     from "@/lib/bankSync";
import { writeSyncLog } from "@/lib/enablebanking";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await doFetch();
    await writeSyncLog({
      trigger:  "cron-fetch",
      fetched:  result.fetched,
      matched:  0,
      unmatched: 0,
      flagged:  0,
      errors:   result.errors,
      fatalError: result.fatalError,
    }).catch(() => {});
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CronFetch] unhandled error:", msg);
    await writeSyncLog({ trigger: "cron-fetch", fetched: 0, matched: 0, unmatched: 0, flagged: 0, errors: [], fatalError: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
