/**
 * One-off cleanup for duplicate bank_transactions rows created by synthetic
 * transaction IDs that changed "scheme" across code changes:
 *  1. Enable Banking issues a brand-new ephemeral account uid on every
 *     reconnect (even for the same physical account), and the synthetic ID
 *     used to be namespaced by that uid.
 *  2. That was later switched to be namespaced by institution name instead —
 *     which fixed new duplicates going forward, but the same historical
 *     transaction re-fetched under the OLD account still hashes to a
 *     different ID than under the NEW institution-based scheme, so it gets
 *     re-imported once more instead of hitting ON CONFLICT.
 *
 * Rather than chase whatever produced a given prefix, this groups
 * synthetic-ID rows by full content (date, amount, currency, direction,
 * institution, merchant, remittance) and further splits each group by ID
 * "scheme" — the slug right after `synth-` (e.g. `e377c9d6`, `83ca3542`,
 * `crditoag`). A content-identical group spanning more than one scheme —
 * with every scheme contributing the same number of rows — is a wholesale
 * re-import of the same transaction(s) under a different scheme, so all but
 * one scheme's rows are removed (preferring a scheme with a Notion-matched
 * row; otherwise the most recently synced one). Content-identical rows that
 * all share a single scheme are left untouched — the synthetic-ID batch
 * counter creates those on purpose for legitimate same-day/same-amount
 * repeats (e.g. several identical bank fees), always under one scheme.
 * Groups where schemes contribute mismatched counts are ambiguous and also
 * left untouched.
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

/** The slug right after `synth-`, e.g. "synth-crditoag-4ac2b5ff" → "crditoag". */
function idScheme(transactionId: string): string {
  const m = transactionId.match(/^synth-([^-]+)-/);
  return m ? m[1] : transactionId;
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
           institution_name, merchant_name, remittance_info
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

  const toDelete: { id: number; transaction_id: string }[] = [];
  const ambiguous: { key: string; schemes: string[]; counts: number[] }[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const byScheme = new Map<string, Row[]>();
    for (const r of group) {
      const scheme = idScheme(r.transaction_id);
      const arr = byScheme.get(scheme);
      if (arr) arr.push(r); else byScheme.set(scheme, [r]);
    }
    if (byScheme.size < 2) continue; // same scheme only — legitimate repeats, skip

    const schemeGroups = [...byScheme.values()];
    const sizes = new Set(schemeGroups.map((g) => g.length));
    if (sizes.size > 1) {
      // Mismatched counts across schemes — can't safely reconstruct 1:1
      // correspondence, leave for manual review.
      ambiguous.push({
        key: contentKey(group[0]),
        schemes: schemeGroups.map((g) => idScheme(g[0].transaction_id)),
        counts: schemeGroups.map((g) => g.length),
      });
      continue;
    }

    const keepGroup =
      schemeGroups.find((g) => g.some((r) => matchedRefs.has(r.transaction_id))) ??
      schemeGroups.reduce((a, b) => (maxId(a) >= maxId(b) ? a : b));

    const keepIds = new Set(keepGroup.map((r) => r.id));
    for (const r of group) {
      if (!keepIds.has(r.id)) {
        toDelete.push({ id: r.id, transaction_id: r.transaction_id });
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
