"use server";

import {
  getEBSessions,
  getAccountTransactions,
  upsertBankTransactions,
  updateEBLastFetched,
  removeEBSession,
  revokeSession,
  writeSyncLog,
  remittanceText,
  syntheticId,
  type EBTransaction,
} from "@/lib/enablebanking";
import {
  getTransactionsForMatching,
  getPeloGuiaTransactionsForMatching,
  getUnmatchedBankTransactions,
  createTransaction,
  updateTransaction,
  archiveTransaction,
} from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

// Cartão COME card purchases settle within 3 days
const CARD_MATCH_WINDOW_MS          = 3 * 24 * 60 * 60 * 1000;
// Pelo Guia reimbursements via wire transfer — allow a full week
const REIMBURSEMENT_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE              = 0.02; // 2 cents

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Forbidden");
}

// ── Core sync ─────────────────────────────────────────────────────────────────

export async function syncBankTransactions(opts?: { fullSync?: boolean }): Promise<{
  matched: number;
  unmatched: number;
  flagged: number;
  fetched: number;
  errors: string[];
  fatalError?: string;
}> {
  try { await requireAdmin(); } catch { return { matched: 0, unmatched: 0, flagged: 0, fetched: 0, errors: ["Forbidden"] }; }
  const fullSync = opts?.fullSync ?? false;

  let sessions;
  try {
    sessions = await getEBSessions();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[BankSync] getEBSessions failed:", msg);
    const result = { matched: 0, unmatched: 0, flagged: 0, fetched: 0, errors: [], fatalError: msg };
    writeSyncLog({ trigger: fullSync ? "full" : "manual", ...result }).catch(() => {});
    return result;
  }
  if (!sessions?.length) {
    const result = { matched: 0, unmatched: 0, flagged: 0, fetched: 0, errors: [], fatalError: "Nenhuma sessão bancária encontrada. Liga a conta primeiro." };
    writeSyncLog({ trigger: fullSync ? "full" : "manual", ...result }).catch(() => {});
    return result;
  }
  let matched = 0, unmatched = 0, flagged = 0, fetched = 0;
  const errors: string[] = [];

  // Build a set of already-known bank references to avoid duplicates
  let existingUnmatched: Awaited<ReturnType<typeof getUnmatchedBankTransactions>> = [];
  try {
    existingUnmatched = await getUnmatchedBankTransactions();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[BankSync] getUnmatchedBankTransactions failed:", msg);
  }
  const knownRefs = new Set(
    existingUnmatched.map((t) => t.bankReference).filter(Boolean) as string[]
  );

  for (const session of sessions) {
    // Full sync: always fetch the maximum 90-day window, regardless of last sync.
    // Normal sync: resume from last_fetched_at minus 1 day (overlap), or 30 days if never synced.
    const from = fullSync
      ? formatDate(new Date(Date.now() - 89 * 86_400_000))
      : session.last_fetched_at
        ? formatDate(new Date(new Date(session.last_fetched_at).getTime() - 86_400_000))
        : formatDate(new Date(Date.now() - 30 * 86_400_000));
    const to = formatDate(new Date());

    for (const accountId of session.accountIds) {
      // PSD2 guarantees banks provide at most 90 days of history.
      // Crédito Agrícola rejects any date_from older than ~90 days (WRONG_TRANSACTIONS_PERIOD).
      // One 89-day request is the maximum supported — no chunking needed or useful.
      const txns: EBTransaction[] = [];
      try {
        const page = await getAccountTransactions(accountId, from, to);
        txns.push(...page);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[BankSync] failed to fetch account ${accountId}:`, msg);
        errors.push(msg);
      }

      fetched += txns.length;

      // Persist all transactions to DB (avoids re-fetching & rate limits)
      try {
        await upsertBankTransactions(txns, accountId, session.institution_name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[BankSync] failed to upsert transactions:`, msg);
        errors.push(`DB upsert failed: ${msg}`);
      }

      // Only process debits (money leaving the account)
      const debits = txns.filter((t) => t.credit_debit_indicator === "DBIT");

      for (const txn of debits) {
        const txId = txn.transaction_id ?? syntheticId(txn, accountId);
        if (knownRefs.has(txId)) continue; // already processed
        try {
          const result = await matchTransaction(txn, accountId);
          if (result === "matched") matched++;
          else if (result === "unmatched") {
            unmatched++;
            knownRefs.add(txId);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[BankSync] matchTransaction failed for ${txId}:`, msg);
          errors.push(`Match failed (${txId}): ${msg}`);
        }
      }
    }

    try { await updateEBLastFetched(session.session_id); } catch (e) {
      errors.push(`updateEBLastFetched: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try { flagged += await flagMissingBankEntries(); } catch { /* non-critical */ }

  try {
    revalidatePath("/admin");
    revalidatePath("/admin/reconciliation");
    revalidatePath("/accountant");
    revalidatePath("/admin/bank-transactions");
  } catch { /* non-critical */ }

  const result = { matched, unmatched, flagged, fetched, errors };
  writeSyncLog({ trigger: fullSync ? "full" : "manual", ...result }).catch(() => {});
  return result;
}

// ── Two-pass matching ─────────────────────────────────────────────────────────

async function matchTransaction(
  txn: EBTransaction,
  accountId: string,
): Promise<"matched" | "unmatched"> {
  const txDate     = txn.transaction_date ?? txn.booking_date ?? new Date().toISOString().slice(0, 10);
  const bankDate   = new Date(txDate);
  const bankAmount = Math.abs(parseFloat(txn.transaction_amount.amount));
  const bankRef    = txn.transaction_id ?? syntheticId(txn, accountId);

  // Merchant name: for debits, the creditor is the payee
  const remit = remittanceText(txn);
  const merchantName = txn.creditor?.name ?? (remit || "Desconhecido");

  // ── Pass 1: Cartão COME expenses (card purchase, ±3 days) ────────────────
  const comeExpenses = await getTransactionsForMatching();
  for (const expense of comeExpenses) {
    if (!expense.date || !expense.totalCost || expense.bankReference) continue;
    const dateDiff   = Math.abs(new Date(expense.date).getTime() - bankDate.getTime());
    const amountDiff = Math.abs(expense.totalCost - bankAmount);
    if (dateDiff <= CARD_MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
      await updateTransaction(expense.id, { status: "Paid", bankReference: bankRef });
      return "matched";
    }
  }

  // ── Pass 2: Pelo Guia reimbursements (wire transfer, ±7 days) ────────────
  const guiaExpenses = await getPeloGuiaTransactionsForMatching();
  for (const expense of guiaExpenses) {
    if (!expense.date || !expense.totalCost) continue;
    const dateDiff   = Math.abs(new Date(expense.date).getTime() - bankDate.getTime());
    const amountDiff = Math.abs(expense.totalCost - bankAmount);
    if (dateDiff <= REIMBURSEMENT_MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
      await updateTransaction(expense.id, { bankReference: bankRef });
      return "matched";
    }
  }

  // ── No match — create unmatched placeholder ───────────────────────────────
  // NOTE: "Unmatched Bank Entry" must exist as a Status option in the Notion
  // Transactions database. Add it manually in Notion if it's missing.
  await createTransaction({
    supplier:      merchantName,
    fornecedorId:  null,
    date:          txDate,
    invoiceId:     "",
    taxFree:       bankAmount,
    iva6:          0,
    iva13:         0,
    iva23:         0,
    totalCost:     bankAmount,
    whoPaid:       "Company",
    paymentMethod: "Cartão COME",
    status:        "Unmatched Bank Entry",
    tourId:        null,
    bankReference: bankRef ?? "",
  });
  return "unmatched";
}

// ── Flag missing entries ──────────────────────────────────────────────────────

async function flagMissingBankEntries(): Promise<number> {
  const [comeExpenses, guiaExpenses] = await Promise.all([
    getTransactionsForMatching(),
    getPeloGuiaTransactionsForMatching(),
  ]);

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

// ── Disconnect bank ───────────────────────────────────────────────────────────

export async function disconnectBankAction(sessionId: string): Promise<void> {
  await requireAdmin();
  try { await revokeSession(sessionId); } catch { /* ignore if expired */ }
  await removeEBSession(sessionId);
  revalidatePath("/admin");
}

// ── Reconciliation actions ────────────────────────────────────────────────────

export async function dismissUnmatchedAction(transactionId: string): Promise<void> {
  await requireAdmin();
  await archiveTransaction(transactionId);
  revalidatePath("/admin/reconciliation");
}

export async function clearFlagAction(transactionId: string): Promise<void> {
  await requireAdmin();
  await updateTransaction(transactionId, { status: "Paid" });
  revalidatePath("/admin/reconciliation");
}

export async function manualMatchAction(
  bankTransactionId: string,
  invoiceId: string,
  bankReference: string,
): Promise<void> {
  await requireAdmin();
  await updateTransaction(invoiceId, { status: "Paid", bankReference });
  await archiveTransaction(bankTransactionId);
  revalidatePath("/admin/reconciliation");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

