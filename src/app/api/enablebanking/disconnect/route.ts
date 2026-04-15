import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeSession, removeEBSession } from "@/lib/enablebanking";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { sessionId } = await req.json();
  try {
    await revokeSession(sessionId);
  } catch {
    // Proceed even if Plaid-style revocation fails (token expired etc.)
  }
  await removeEBSession(sessionId);
  return NextResponse.json({ ok: true });
}
