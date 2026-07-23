/**
 * One-off cleanup for duplicate bank_transactions rows created by the
 * account-reconnect bug: before the stable-account-id fix, every
 * Enable Banking reconnect issued a new ephemeral account uid, which fed
 * into the synthetic transaction ID, so re-fetched (already-imported)
 * transactions were inserted again as "new" unmatched rows under the new
 * uid.
 *
 * Only flags a row as a duplicate when it is UNMATCHED and its full content
 * (date, amount, currency, direction, institution, merchant, remittance)
 * exactly matches an already-MATCHED row from a DIFFERENT account_uid.
 * That combination is the actual reconnect-duplicate signature. Rows that
 * repeat under the *same* account_uid are left alone — the synthetic-ID
 * generator already appends a counter suffix for those on purpose, to
 * support legitimate same-day/same-amount repeats (e.g. several identical
 * bank fees), and deleting them would destroy real transactions.
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
  account_uid: string;
  merchant_name: string | null;
  remittance_info: string | null;
};

function contentKey(r: Row): string {
  return [
    r.transaction_date,
    r.amount,
    r.currency,
    r.credit_debit,
    r.institution_name,
    r.merchant_name ?? "",
    r.remittance_info ?? "",
  ].join("|");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const sql = getDb();

  const rows = (await sql`
    SELECT id, transaction_id, transaction_date, amount, currency, credit_debit,
           institution_name, account_uid, merchant_name, remittance_info
    FROM bank_transactions
    WHERE transaction_id LIKE 'synth-%'
    ORDER BY id ASC
  `) as unknown as Row[];

  const matchedMap = await getMatchedTransactionMap();
  const matchedRefs = new Set(Object.keys(matchedMap));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = contentKey(r);
    const arr = groups.get(key);
    if (arr) arr.push(r); else groups.set(key, [r]);
  }

  const toDelete: { id: number; transaction_id: string; account_uid: string }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const matched = group.filter((r) => matchedRefs.has(r.transaction_id));
    if (matched.length === 0) continue; // ambiguous repeats with no matched anchor — leave for manual review

    const unmatched = group.filter((r) => !matchedRefs.has(r.transaction_id));
    for (const u of unmatched) {
      const isCrossAccountDuplicateOfMatched = matched.some((m) => m.account_uid !== u.account_uid);
      if (isCrossAccountDuplicateOfMatched) {
        toDelete.push({ id: u.id, transaction_id: u.transaction_id, account_uid: u.account_uid });
      }
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
