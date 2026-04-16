import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEBSessions, getAccountTransactions } from "@/lib/enablebanking";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = getDb();
  const dbSessions = await getEBSessions();

  // Count rows in bank_transactions
  let txnCount = 0;
  let tableExists = false;
  try {
    const rows = await sql`SELECT COUNT(*) as count FROM bank_transactions`;
    txnCount = Number(rows[0].count);
    tableExists = true;
  } catch (err) {
    tableExists = false;
  }

  // Try a small live fetch to see if rate limit has cleared
  const liveTest: Record<string, unknown> = {};
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  for (const s of dbSessions) {
    for (const accountId of s.accountIds) {
      try {
        const txns = await getAccountTransactions(accountId, yesterday, today);
        liveTest[accountId] = { ok: true, count: txns.length };
      } catch (err) {
        liveTest[accountId] = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  return NextResponse.json({
    dbSessions: dbSessions.map((s) => ({
      session_id: s.session_id,
      institution: s.institution_name,
      accountIds: s.accountIds,
      last_fetched_at: s.last_fetched_at,
    })),
    tableExists,
    txnCount,
    liveTest,
  });
}
