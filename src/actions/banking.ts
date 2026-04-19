"use server";

import {
  removeEBSession,
  revokeSession,
} from "@/lib/enablebanking";
import {
  getUnmatchedBankTransactions,
  getMatchedTransactionMap,
  getLinkableExpenses,
  getLinkableEarnings,
  updateTransaction,
  archiveTransaction,
} from "@/lib/notion";
import { getStoredTransactions } from "@/lib/enablebanking";
import { doSync } from "@/lib/bankSync";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

// Cartão COME card purchases settle within 3 days
const CARD_MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE     = 0.02; // 2 cents

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

  const result = await doSync(opts);

  try {
    revalidatePath("/admin");
    revalidatePath("/admin/reconciliation");
    revalidatePath("/accountant");
    revalidatePath("/admin/bank-transactions");
  } catch { /* non-critical */ }

  return result;
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

/**
 * Link a raw bank transaction (by its transaction_id from Neon) to a Notion
 * expense. Automatically archives any "Unmatched Bank Entry" placeholder that
 * was created for this bank transaction during auto-matching.
 */
export async function linkBankTransactionAction(
  bankTxnId: string,        // transaction_id from Neon bank_transactions table
  notionExpenseId: string,  // Notion page ID of the expense to link
  placeholderNotionId?: string, // Notion ID of the "Unmatched Bank Entry" placeholder, if known
): Promise<void> {
  await requireAdmin();
  // Link the bank reference to the chosen Notion expense
  await updateTransaction(notionExpenseId, { status: "Paid", bankReference: bankTxnId });
  // Archive the unmatched placeholder if one exists
  if (placeholderNotionId) {
    await archiveTransaction(placeholderNotionId);
  }
  revalidatePath("/admin/reconciliation");
}

/**
 * Run matching on ALL unmatched bank transactions against ALL unmatched Notion
 * records. Debits matched against expenses; credits matched against earnings
 * ("IN - ..."). Uses same tolerance as the nightly sync.
 * Returns { matched, skipped, errors }.
 */
export async function runManualMatchAction(): Promise<{
  matched: number; skipped: number; errors: string[];
}> {
  await requireAdmin();

  const [bankTxns, matchedMap, existingUnmatched, expenses, earnings] = await Promise.all([
    getStoredTransactions(0),
    getMatchedTransactionMap(),
    getUnmatchedBankTransactions(),
    getLinkableExpenses(),
    getLinkableEarnings(),
  ]);

  const knownRefs    = new Set(Object.keys(matchedMap));
  const placeholderByRef: Record<string, string> = {};
  for (const t of existingUnmatched) {
    if (t.bankReference) placeholderByRef[t.bankReference] = t.id;
  }

  // Mutable candidate arrays to prevent double-matching
  const expCandidates = [...expenses];
  const earCandidates = [...earnings];

  let matched = 0; let skipped = 0;
  const errors: string[] = [];

  for (const txn of bankTxns) {
    if (knownRefs.has(txn.transaction_id)) { skipped++; continue; }

    const amount    = Math.abs(txn.amount);
    const txnDate   = new Date(txn.transaction_date).getTime();
    const windowMs  = CARD_MATCH_WINDOW_MS; // 3 days for both directions
    const candidates = txn.credit_debit === "DBIT" ? expCandidates : earCandidates;

    const idx = candidates.findIndex((e) => {
      if (!e.date || !e.totalCost) return false;
      if (Math.abs(Math.abs(e.totalCost) - amount) > AMOUNT_TOLERANCE) return false;
      return Math.abs(new Date(e.date).getTime() - txnDate) <= windowMs;
    });

    if (idx >= 0) {
      const expense = candidates[idx];
      try {
        await updateTransaction(expense.id, { status: "Paid", bankReference: txn.transaction_id });
        if (placeholderByRef[txn.transaction_id]) {
          await archiveTransaction(placeholderByRef[txn.transaction_id]);
        }
        knownRefs.add(txn.transaction_id);
        candidates.splice(idx, 1);
        matched++;
      } catch (err) {
        errors.push(`${txn.transaction_id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  revalidatePath("/admin/reconciliation");
  return { matched, skipped, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

