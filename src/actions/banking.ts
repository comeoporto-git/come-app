"use server";

import { plaidClient, getPlaidItems, updateCursor } from "@/lib/plaid";
import {
  getTransactionsForMatching,
  createTransaction,
  updateTransaction,
} from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // ±3 days
const AMOUNT_TOLERANCE = 0.02; // 2 cents rounding tolerance

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

      // Process new + modified bank transactions
      const bankTxns = [...added, ...modified].filter(
        (t: PlaidTransaction) => t.amount > 0 // outflows only (Plaid: positive = debit)
      );

      for (const bankTxn of bankTxns) {
        const result = await matchTransaction(bankTxn);
        if (result === "matched") matched++;
        else if (result === "unmatched") unmatched++;
        else if (result === "flagged") flagged++;
      }
    }

    await updateCursor(item.item_id, cursor!);
  }

  // Flag invoices with no bank entry after 3 days
  flagged += await flagMissingBankEntries();

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

  // Get all pending Notion invoices paid by company card
  const invoices = await getTransactionsForMatching();

  for (const invoice of invoices) {
    if (!invoice.date || !invoice.totalCost) continue;

    const invoiceDate = new Date(invoice.date);
    const dateDiff = Math.abs(bankDate.getTime() - invoiceDate.getTime());
    const amountDiff = Math.abs(invoice.totalCost - bankAmount);

    if (dateDiff <= MATCH_WINDOW_MS && amountDiff <= AMOUNT_TOLERANCE) {
      // ✅ Scenario 1: Match found
      await updateTransaction(invoice.id, {
        status: "Paid",
        bankReference: bankRef,
      });
      return "matched";
    }
  }

  // ❌ Scenario 2: Bank transaction exists but no invoice — create placeholder
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

    // Scenario 3: Cartão Comum invoice older than 3 days with no bank match
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
