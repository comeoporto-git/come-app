/**
 * Core bank-sync logic, split into two phases so each can run within the
 * Vercel Hobby 10-second function timeout when triggered by an external cron.
 *
 * Phase 1 – doFetch: call Enable Banking API → upsert rows to Neon.
 * Phase 2 – doMatch: read Neon rows → match against Notion (candidates fetched
 *           ONCE outside the loop, not N times as in the old implementation).
 */

import {
  getEBSessions,
  getAccountTransactions,
  upsertBankTransactions,
  updateEBLastFetched,
  removeEBSession,
  writeSyncLog,
  remittanceText,
  syntheticId,
  getStoredTransactions,
  EnableBankingSessionClosedError,
  type EBTransaction,
} from "@/lib/enablebanking";
import {
  getTransactionsForMatching,
  getPeloGuiaTransactionsForMatching,
  getUnmatchedBankTransactions,
  getMatchedTransactionMap,
  updateTransaction,
} from "@/lib/notion";

// ── Tolerances (same as banking.ts) ──────────────────────────────────────────

const CARD_MATCH_WINDOW_MS          = 3 * 24 * 60 * 60 * 1000;
const REIMBURSEMENT_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE              = 0.02; // 2 cents

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Phase 1 – Fetch ───────────────────────────────────────────────────────────

export type FetchResult = {
  fetched: number;
  errors:  string[];
  fatalError?: string;
};

/**
 * Pull transactions from Enable Banking API and persist them in Neon.
 * Does NOT touch Notion at all.
 */
export async function doFetch(opts?: { fullSync?: boolean }): Promise<FetchResult> {
  const fullSync = opts?.fullSync ?? false;

  let sessions;
  try {
    sessions = await getEBSessions();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[doFetch] getEBSessions failed:", msg);
    return { fetched: 0, errors: [], fatalError: msg };
  }

  if (!sessions?.length) {
    return {
      fetched: 0,
      errors: [],
      fatalError: "Nenhuma sessão bancária encontrada. Liga a conta primeiro.",
    };
  }

  let fetched = 0;
  const errors: string[] = [];

  for (const session of sessions) {
    const from = fullSync
      ? formatDate(new Date(Date.now() - 89 * 86_400_000))
      : session.last_fetched_at
        ? formatDate(new Date(new Date(session.last_fetched_at).getTime() - 86_400_000))
        : formatDate(new Date(Date.now() - 30 * 86_400_000));
    const to = formatDate(new Date());

    let sessionClosed = false;

    for (const accountId of session.accountIds) {
      const txns: EBTransaction[] = [];
      try {
        const page = await getAccountTransactions(accountId, from, to);
        txns.push(...page);
      } catch (err) {
        if (err instanceof EnableBankingSessionClosedError) {
          sessionClosed = true;
          console.error(`[doFetch] session closed for ${session.institution_name} (${session.session_id}), removing`);
          errors.push(`Sessão do ${session.institution_name} expirou — reconecta a conta em Banco.`);
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[doFetch] failed to fetch account ${accountId}:`, msg);
        errors.push(msg);
      }

      fetched += txns.length;

      try {
        await upsertBankTransactions(txns, accountId, session.institution_name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[doFetch] upsert failed:", msg);
        errors.push(`DB upsert failed: ${msg}`);
      }
    }

    if (sessionClosed) {
      try {
        await removeEBSession(session.session_id);
      } catch (e) {
        errors.push(`removeEBSession: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    try {
      await updateEBLastFetched(session.session_id);
    } catch (e) {
      errors.push(`updateEBLastFetched: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { fetched, errors };
}

// ── Phase 2 – Match ───────────────────────────────────────────────────────────

export type MatchResult = {
  matched:   number;
  unmatched: number;
  flagged:   number;
  errors:    string[];
};

/**
 * Read stored bank transactions from Neon, fetch Notion candidate lists ONCE,
 * then run two-pass matching for every unprocessed debit.
 *
 * Critical fix vs. old matchTransaction(): Notion is queried ONCE per run,
 * not once per transaction.
 */
export async function doMatch(): Promise<MatchResult> {
  let matched = 0, unmatched = 0, flagged = 0;
  const errors: string[] = [];

  // ── Load candidates ────────────────────────────────────────────────────────
  // knownRefs: bank refs that already have an Unmatched entry in Notion (legacy).
  // We no longer create new unmatched placeholders, but keep this check so that
  // any previously-created "Unmatched Bank Entry" records aren't double-processed.
  let existingUnmatched: Awaited<ReturnType<typeof getUnmatchedBankTransactions>> = [];
  try { existingUnmatched = await getUnmatchedBankTransactions(); } catch (e) {
    errors.push(`getUnmatchedBankTransactions: ${e instanceof Error ? e.message : String(e)}`);
  }
  const knownRefs = new Set(
    existingUnmatched.map((t) => t.bankReference).filter(Boolean) as string[]
  );

  // Already-matched bank refs from Notion (so we skip them)
  let matchedMap: Awaited<ReturnType<typeof getMatchedTransactionMap>> = {};
  try { matchedMap = await getMatchedTransactionMap(); } catch (e) {
    errors.push(`getMatchedTransactionMap: ${e instanceof Error ? e.message : String(e)}`);
  }
  const matchedRefs = new Set(Object.keys(matchedMap));

  // Notion expense candidates — fetched ONCE
  let comeExpenses: Awaited<ReturnType<typeof getTransactionsForMatching>> = [];
  try { comeExpenses = await getTransactionsForMatching(); } catch (e) {
    errors.push(`getTransactionsForMatching: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Pelo Guia reimbursement candidates — fetched ONCE
  let guiaExpenses: Awaited<ReturnType<typeof getPeloGuiaTransactionsForMatching>> = [];
  try { guiaExpenses = await getPeloGuiaTransactionsForMatching(); } catch (e) {
    errors.push(`getPeloGuiaTransactionsForMatching: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Load stored bank debits ────────────────────────────────────────────────
  let bankTxns: Awaited<ReturnType<typeof getStoredTransactions>> = [];
  try { bankTxns = await getStoredTransactions(0); } catch (e) {
    errors.push(`getStoredTransactions: ${e instanceof Error ? e.message : String(e)}`);
    return { matched, unmatched, flagged, errors };
  }

  const debits = bankTxns.filter((t) => t.credit_debit === "DBIT");

  // ── Two-pass matching ──────────────────────────────────────────────────────
  for (const txn of debits) {
    const bankRef = txn.transaction_id;
    if (matchedRefs.has(bankRef)) continue; // already in Notion with a bankReference
    if (knownRefs.has(bankRef))  continue; // already has an unmatched placeholder

    const bankDate   = new Date(txn.transaction_date).getTime();
    const bankAmount = Math.abs(txn.amount);
    const merchantName = txn.merchant_name ?? txn.remittance_info ?? "Desconhecido";

    // Pass 1 — Cartão COME expenses (±3 days)
    let matched1 = false;
    for (const expense of comeExpenses) {
      if (!expense.date || !expense.totalCost || expense.bankReference) continue;
      const dateDiff   = Math.abs(new Date(expense.date).getTime() - bankDate);
      const amountDiff = Math.abs(expense.totalCost - bankAmount);
      if (dateDiff <= CARD_MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
        try {
          await updateTransaction(expense.id, { status: "Paid", bankReference: bankRef });
          matched++;
          matched1 = true;
          // Mark so we don't double-match the same expense
          expense.bankReference = bankRef;
        } catch (err) {
          errors.push(`updateTransaction (COME) ${bankRef}: ${err instanceof Error ? err.message : String(err)}`);
        }
        break;
      }
    }
    if (matched1) continue;

    // Pass 2 — Pelo Guia reimbursements (±7 days)
    let matched2 = false;
    for (const expense of guiaExpenses) {
      if (!expense.date || !expense.totalCost) continue;
      const dateDiff   = Math.abs(new Date(expense.date).getTime() - bankDate);
      const amountDiff = Math.abs(expense.totalCost - bankAmount);
      if (dateDiff <= REIMBURSEMENT_MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
        try {
          await updateTransaction(expense.id, { bankReference: bankRef });
          matched++;
          matched2 = true;
          expense.bankReference = bankRef; // prevent double-match
        } catch (err) {
          errors.push(`updateTransaction (Guia) ${bankRef}: ${err instanceof Error ? err.message : String(err)}`);
        }
        break;
      }
    }
    if (matched2) continue;

    // No match — record in the counter only; do NOT create Notion transactions.
    // Unmatched bank entries are visible in the bank ledger (Neon) but the team
    // is responsible for adding transactions manually in the app.
    unmatched++;
  }

  // ── Flag entries whose bank payments are missing ───────────────────────────
  try {
    flagged += await flagMissingBankEntries(comeExpenses, guiaExpenses);
  } catch { /* non-critical */ }

  return { matched, unmatched, flagged, errors };
}

// ── Flag helper ───────────────────────────────────────────────────────────────

async function flagMissingBankEntries(
  comeExpenses: Awaited<ReturnType<typeof getTransactionsForMatching>>,
  guiaExpenses: Awaited<ReturnType<typeof getPeloGuiaTransactionsForMatching>>,
): Promise<number> {
  const cardCutoff  = new Date(Date.now() - CARD_MATCH_WINDOW_MS);
  const reimbCutoff = new Date(Date.now() - REIMBURSEMENT_MATCH_WINDOW_MS);
  let count = 0;

  for (const expense of comeExpenses) {
    if (!expense.date) continue;
    if (
      expense.status === "Paid" &&
      !expense.bankReference &&
      new Date(expense.date) < cardCutoff
    ) {
      await updateTransaction(expense.id, { status: "Flag: Missing Bank Entry" });
      count++;
    }
  }

  for (const expense of guiaExpenses) {
    if (!expense.date) continue;
    if (new Date(expense.date) < reimbCutoff) {
      await updateTransaction(expense.id, { status: "Flag: Missing Reimbursement" });
      count++;
    }
  }

  return count;
}

// ── Combined (manual sync from UI) ────────────────────────────────────────────

export type SyncResult = {
  fetched:    number;
  matched:    number;
  unmatched:  number;
  flagged:    number;
  errors:     string[];
  fatalError?: string;
};

/**
 * Run both phases sequentially. Used by the manual "Sync" button in the UI
 * (no timeout concern there since it's a long-running server action).
 */
export async function doSync(opts?: { fullSync?: boolean }): Promise<SyncResult> {
  const fetchRes = await doFetch(opts);
  if (fetchRes.fatalError) {
    return { fetched: fetchRes.fetched, matched: 0, unmatched: 0, flagged: 0, errors: fetchRes.errors, fatalError: fetchRes.fatalError };
  }

  const matchRes = await doMatch();

  const result: SyncResult = {
    fetched:   fetchRes.fetched,
    matched:   matchRes.matched,
    unmatched: matchRes.unmatched,
    flagged:   matchRes.flagged,
    errors:    [...fetchRes.errors, ...matchRes.errors],
  };

  writeSyncLog({ trigger: "manual", ...result }).catch(() => {});
  return result;
}
