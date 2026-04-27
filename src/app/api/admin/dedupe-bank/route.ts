import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * One-time cleanup: delete duplicate bank_transactions rows where two rows
 * share (transaction_date::date, amount, credit_debit) regardless of account_uid.
 * Keeps the row with the lower id (earliest inserted).
 */
export async function GET() {
  try {
    const sql = getDb();

    const result = await sql`
      DELETE FROM bank_transactions
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY transaction_date::date, amount, credit_debit
                   ORDER BY id ASC
                 ) AS rn
          FROM bank_transactions
        ) ranked
        WHERE rn > 1
      )
      RETURNING id
    `;

    return NextResponse.json({ ok: true, deleted: result.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
