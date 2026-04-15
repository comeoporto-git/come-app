"use server";

import { plaidClient, getPlaidItems, updateCursor, removePlaidItem } from "@/lib/plaid";
import {
  getTransactionsForMatching,
  createTransaction,
  updateTransaction,
  archiveTransaction,
} from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { Transaction as PlaidTransaction } from "plaid";
import { auth } from "@/lib/auth";

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // ±3 days
const AMOUNT_TOLERANCE = 0.02; // 2 cents rounding tolerance

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

      // Process new + modified bank transactions (Plaid: positive = debit/outflow)
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

  // Flag invoices with no bank entry after 3 days
  flagged += await flagMissingBankEntries();

  revalidatePath("/admin");
  revalidatePath("/admin/reconciliation");
  revalidatePath("/accountant");
  return { matched, unmatched, flagged };
}

// ── Matching logic ────────────────────────────────────────────────────────────

async function matchTransaction(
  bankTxn: PlaidTransaction
): Promise<"matched" | "unmatched"> {
  const bankDate = new Date(bankTxn.date);
  const bankAmount = Math.abs(bankTxn.amount);
  const bankRef = bankTxn.transaction_id;

  const invoices = await getTransactionsForMatching();

  for (const invoice of invoices) {
    if (!invoice.date || !invoice.totalCost) continue;

    const invoiceDate = new Date(invoice.date);
    const dateDiff = Math.abs(bankDate.getTime() - invoiceDate.getTime());
    const amountDiff = Math.abs(invoice.totalCost - bankAmount);

    if (dateDiff <= MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
      await updateTransaction(invoice.id, { status: "Paid", bankReference: bankRef });
      return "matched";
    }
  }

  // No invoice match — create placeholder
  await createTransaction({
    supplier: bankTxn.merchant_name ?? bankTxn.name ?? "Desconhecido",
    fornecedorId: null,
    date: bankTxn.date,
    invoiceId: "",
    taxFree: bankAmount,
    iva6: 0,
    iva13: 0,
    iva23: 0,
    totalCost: bankAmount,
    whoPaid: "Company",
    paymentMethod: "Cartão COME",
    status: "Unmatched Bank Entry",
    tourId: null,
    bankReference: bankRef,
  });
  return "unmatched";
}

// ── Flag missing bank entries ─────────────────────────────────────────────────

async function flagMissingBankEntries(): Promise<number> {
  const invoices = await getTransactionsForMatching();
  const cutoff = new Date(Date.now() - MATCH_WINDOW_MS);
  let count = 0;

  for (const invoice of invoices) {
    if (!invoice.date) continue;
    const invoiceDate = new Date(invoice.date);

    if (
      invoice.paymentMethod === "Cartão COME" &&
      invoice.status === "Paid" &&
      !invoice.bankReference &&
      invoiceDate < cutoff
    ) {
      await updateTransaction(invoice.id, { status: "Flag: Missing Bank Entry" });
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

/** Clear a "Flag: Missing Bank Entry" — set back to Paid (bank processed differently) */
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
  // Mark the invoice as matched
  await updateTransaction(invoiceId, { status: "Paid", bankReference });
  // Archive the unmatched placeholder
  await archiveTransaction(bankTransactionId);
  revalidatePath("/admin/reconciliation");
}
