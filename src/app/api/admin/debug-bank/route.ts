import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEBSessions } from "@/lib/enablebanking";

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
  let recentTxns: unknown[] = [];
  try {
    const rows = await sql`SELECT COUNT(*) as count FROM bank_transactions`;
    txnCount = Number(rows[0].count);
    tableExists = true;
    recentTxns = await sql`
      SELECT transaction_id, transaction_date, credit_debit, amount, merchant_name
      FROM bank_transactions ORDER BY transaction_date DESC LIMIT 5
    `;
  } catch {
    tableExists = false;
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
    recentTxns,
    note: "Live API test removed — was consuming daily rate limit quota",
  });
}
