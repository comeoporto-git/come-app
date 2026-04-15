import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, saveEBSession } from "@/lib/enablebanking";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    console.error("[EnableBanking callback] error:", error);
    return NextResponse.redirect(
      new URL(`/admin?bank_error=${encodeURIComponent(error ?? "no_code")}`, req.url)
    );
  }

  try {
    const { sessionId, accountIds, institutionName, validUntil } =
      await exchangeCode(code);
    await saveEBSession(sessionId, institutionName, accountIds, validUntil);
    return NextResponse.redirect(new URL("/admin?bank_connected=1", req.url));
  } catch (err) {
    console.error("[EnableBanking callback]", err);
    return NextResponse.redirect(new URL("/admin?bank_error=exchange_failed", req.url));
  }
}
