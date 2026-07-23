/**
 * One-off cleanup for duplicate bank_transactions rows created by the
 * account-reconnect bug: Enable Banking issues a brand-new ephemeral account
 * uid every time a consent is reconnected, even for the same physical
 * account. Before the institution-namespaced synthetic-ID fix, that uid fed
 * into the transaction's synthetic ID, so re-fetching after a reconnect
 * re-imported already-stored transactions under a new ID instead of hitting
 * the ON CONFLICT dedup.
 *
 * Groups synthetic-ID rows by full content (date, amount, currency,
 * direction, institution, merchant, remittance), then further splits each
 * group by account_uid. A content-identical group spanning more than one
 * account_uid — with every uid contributing the same number of rows — is the
 * signature of a wholesale re-import across a reconnect, so all but one
 * uid's rows are removed (preferring a uid that has a Notion-matched row;
 * otherwise the most recently synced one). Content-identical rows that all
 * share a single account_uid are left untouched — the synthetic-ID batch
 * counter creates those on purpose for legitimate same-day/same-amount
 * repeats (e.g. several identical bank fees). Groups where account_uids
 * contribute mismatched counts are ambiguous and also left untouched.
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

const maxId = (rows: Row[]) => Math.max(...rows.map((r) => r.id));

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
  const ambiguous: { key: string; accountUids: string[]; counts: number[] }[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const byUid = new Map<string, Row[]>();
    for (const r of group) {
      const arr = byUid.get(r.account_uid);
      if (arr) arr.push(r); else byUid.set(r.account_uid, [r]);
    }
    if (byUid.size < 2) continue; // same account only — legitimate repeats, skip

    const uidGroups = [...byUid.values()];
    const sizes = new Set(uidGroups.map((g) => g.length));
    if (sizes.size > 1) {
      // Mismatched counts across accounts — can't safely reconstruct 1:1
      // correspondence, leave for manual review.
      ambiguous.push({
        key: contentKey(group[0]),
        accountUids: uidGroups.map((g) => g[0].account_uid),
        counts: uidGroups.map((g) => g.length),
      });
      continue;
    }

    const keepGroup =
      uidGroups.find((g) => g.some((r) => matchedRefs.has(r.transaction_id))) ??
      uidGroups.reduce((a, b) => (maxId(a) >= maxId(b) ? a : b));

    const keepIds = new Set(keepGroup.map((r) => r.id));
    for (const r of group) {
      if (!keepIds.has(r.id)) {
        toDelete.push({ id: r.id, transaction_id: r.transaction_id, account_uid: r.account_uid });
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
    ambiguousGroups: ambiguous,
  });
}
