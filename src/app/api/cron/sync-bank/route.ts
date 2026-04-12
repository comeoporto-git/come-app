import { syncBankTransactions } from "@/actions/banking";
import { NextResponse } from "next/server";

// Vercel Cron — runs nightly at 02:00 UTC (configured in vercel.json)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncBankTransactions();
  return NextResponse.json(result);
}
