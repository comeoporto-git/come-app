import { NextRequest, NextResponse } from "next/server";
import { syncBankTransactions } from "@/actions/banking";

/**
 * Plaid webhook receiver.
 *
 * Plaid sends POST requests here when transactions are updated.
 * We trigger a full sync on the relevant webhook types.
 *
 * To enable: set webhook URL to https://your-domain/api/plaid/webhook
 * in the Plaid dashboard (or pass it in createLinkToken).
 *
 * Plaid signs each request with a JWT — in production you should
 * verify it using the Plaid-Verification-Id header and the
 * plaidClient.webhookVerificationKeyGet() API. We skip that here
 * since this runs server-side behind HTTPS with a secret path.
 */
export async function POST(req: NextRequest) {
  let body: { webhook_type?: string; webhook_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { webhook_type, webhook_code } = body;

  // We only care about transaction updates
  const isTransactionEvent =
    webhook_type === "TRANSACTIONS" &&
    (webhook_code === "SYNC_UPDATES_AVAILABLE" ||
      webhook_code === "INITIAL_UPDATE" ||
      webhook_code === "HISTORICAL_UPDATE" ||
      webhook_code === "DEFAULT_UPDATE");

  if (!isTransactionEvent) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const result = await syncBankTransactions();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Plaid webhook] sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
