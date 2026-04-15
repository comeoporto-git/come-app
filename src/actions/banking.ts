"use server";

import { plaidClient, getPlaidItems, updateCursor, removePlaidItem } from "@/lib/plaid";
import {
  getTransactionsForMatching,
  getPeloGuiaTransactionsForMatching,
  createTransaction,
  updateTransaction,
  archiveTransaction,
} from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { Transaction as PlaidTransaction } from "plaid";
import { auth } from "@/lib/auth";

// Cartão COME card purchases settle within 3 days
const CARD_MATCH_WINDOW_MS        = 3 * 24 * 60 * 60 * 1000;
// Pelo Guia reimbursements are wire transfers — allow a full week
const REIMBURSEMENT_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE            = 0.02; // 2 cents for rounding

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Forbidden");
}

// ── Core sync + matching ──────────────────────────────────────────────────────

export async function syncBankTransactions(): Promise<{
  matched: number;
  unmatched: number;
  flagged: number;
}> {
  const items = await getPlaidItems();
  let matched = 0, unmatched = 0, flagged = 0;

  for (const item of items) {
    let cursor = item.cursor ?? undefined;
    let hasMore = true;

    while (hasMore) {
      const res = await plaidClient.transactionsSync({
        access_token: item.access_token,
        cursor,
      });

      const { added, modified, next_cursor, has_more } = res.data;
      hasMore = has_more;
      cursor = next_cursor;

      // Plaid: positive amount = debit/outflow from the account
      const bankTxns = [...added, ...modified].filter(
        (t: PlaidTransaction) => t.amount > 0
      );

      for (const bankTxn of bankTxns) {
        const result = await matchTransaction(bankTxn);
        if (result === "matched") matched++;
        else if (result === "unmatched") unmatched++;
      }
    }

    await updateCursor(item.item_id, cursor!);
  }

  flagged += await flagMissingBankEntries();

  revalidatePath("/admin");
  revalidatePath("/admin/reconciliation");
  revalidatePath("/accountant");
  return { matched, unmatched, flagged };
}

// ── Two-pass matching ─────────────────────────────────────────────────────────

async function matchTransaction(
  bankTxn: PlaidTransaction
): Promise<"matched" | "unmatched"> {
  const bankDate   = new Date(bankTxn.date);
  const bankAmount = Math.abs(bankTxn.amount);
  const bankRef    = bankTxn.transaction_id;

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

  // ── Pass 2: Pelo Guia expenses (wire transfer reimbursement, ±7 days) ────
  const guiaExpenses = await getPeloGuiaTransactionsForMatching();
  for (const expense of guiaExpenses) {
    if (!expense.date || !expense.totalCost) continue;

    const dateDiff   = Math.abs(new Date(expense.date).getTime() - bankDate.getTime());
    const amountDiff = Math.abs(expense.totalCost - bankAmount);

    if (dateDiff <= REIMBURSEMENT_MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
      // Keep status as "Paid" (guide already paid) — just record the bank reference
      await updateTransaction(expense.id, { bankReference: bankRef });
      return "matched";
    }
  }

  // ── No match — create an unmatched placeholder for reconciliation ─────────
  await createTransaction({
    supplier:      bankTxn.merchant_name ?? bankTxn.name ?? "Desconhecido",
    fornecedorId:  null,
    date:          bankTxn.date,
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
    bankReference: bankRef,
  });
  return "unmatched";
}

// ── Flag missing bank entries ─────────────────────────────────────────────────

async function flagMissingBankEntries(): Promise<number> {
  const [comeExpenses, guiaExpenses] = await Promise.all([
    getTransactionsForMatching(),
    getPeloGuiaTransactionsForMatching(),
  ]);

  const cardCutoff = new Date(Date.now() - CARD_MATCH_WINDOW_MS);
  const reimbCutoff = new Date(Date.now() - REIMBURSEMENT_MATCH_WINDOW_MS);
  let count = 0;

  // Flag old Cartão COME invoices with no bank debit
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

  // Flag old Pelo Guia expenses with no reimbursement transfer
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

export async function disconnectBankAction(itemId: string): Promise<void> {
  await requireAdmin();
  await removePlaidItem(itemId);
  revalidatePath("/admin");
}

// ── Reconciliation actions ────────────────────────────────────────────────────

/** Dismiss an "Unmatched Bank Entry" — it was not a company expense */
export async function dismissUnmatchedAction(transactionId: string): Promise<void> {
  await requireAdmin();
  await archiveTransaction(transactionId);
  revalidatePath("/admin/reconciliation");
}

/** Clear a flag — set back to Paid */
export async function clearFlagAction(transactionId: string): Promise<void> {
  await requireAdmin();
  await updateTransaction(transactionId, { status: "Paid" });
  revalidatePath("/admin/reconciliation");
}

/** Manually match an unmatched bank entry to an existing Notion invoice */
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
