/**
 * One-off cleanup for duplicate bank_transactions rows created by the
 * account-reconnect bug: before the stable-account-id fix, every
 * Enable Banking reconnect issued a new ephemeral account uid, which fed
 * into the synthetic transaction ID, so re-fetched (already-imported)
 * transactions were inserted again as "new" unmatched rows.
 *
 * Groups synthetic-ID rows by (date, amount, currency, direction,
 * institution) and removes the extras, preferring to keep whichever row in
 * the group is already linked to a Notion invoice.
 *
 * GET ?dryRun=1 to preview without deleting.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMatchedTransactionMap } from "@/lib/notion";

type Row = {
  id: number;
  transaction_id: string;
  transaction_date: string;
  amount: string;
  currency: string;
  credit_debit: string;
  institution_name: string;
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const sql = getDb();

  const rows = (await sql`
    SELECT id, transaction_id, transaction_date, amount, currency, credit_debit, institution_name
    FROM bank_transactions
    WHERE transaction_id LIKE 'synth-%'
    ORDER BY id ASC
  `) as unknown as Row[];

  const matchedMap = await getMatchedTransactionMap();
  const matchedRefs = new Set(Object.keys(matchedMap));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = [r.transaction_date, r.amount, r.currency, r.credit_debit, r.institution_name].join("|");
    const arr = groups.get(key);
    if (arr) arr.push(r); else groups.set(key, [r]);
  }

  const toDelete: { id: number; transaction_id: string }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const matched = group.filter((r) => matchedRefs.has(r.transaction_id));
    const keepIds = new Set((matched.length > 0 ? matched : [group[0]]).map((r) => r.id));
    for (const r of group) {
      if (!keepIds.has(r.id)) toDelete.push({ id: r.id, transaction_id: r.transaction_id });
    }
  }

  if (!dryRun) {
    for (const d of toDelete) {
      await sql`DELETE FROM bank_transactions WHERE id = ${d.id}`;
    }
  }

  return NextResponse.json({
    dryRun,
    groupsChecked: groups.size,
    deleted: toDelete.length,
    deletedRows: toDelete,
  });
}
