/**
 * Cron Phase 2 — Match stored bank transactions against Notion records.
 *
 * Triggered by cron-job.org at 02:05 UTC daily (5 minutes after /fetch).
 * Reads from Neon (fast), queries Notion candidate lists ONCE, then runs
 * two-pass matching — all within the Vercel Hobby 10-second timeout.
 *
 * Authorization: Bearer <CRON_SECRET>
 */

import { doMatch }     from "@/lib/bankSync";
import { writeSyncLog } from "@/lib/enablebanking";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await doMatch();
    await writeSyncLog({
      trigger:   "cron-match",
      fetched:   0,
      matched:   result.matched,
      unmatched: result.unmatched,
      flagged:   result.flagged,
      errors:    result.errors,
    }).catch(() => {});
    try {
      revalidatePath("/admin");
      revalidatePath("/admin/reconciliation");
      revalidatePath("/admin/bank-transactions");
      revalidatePath("/accountant");
    } catch { /* non-critical */ }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CronMatch] unhandled error:", msg);
    await writeSyncLog({ trigger: "cron-match", fetched: 0, matched: 0, unmatched: 0, flagged: 0, errors: [], fatalError: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
