import { auth } from "@/lib/auth";
import { createLinkToken } from "@/lib/plaid";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const linkToken = await createLinkToken(session.user.notionId);
  return NextResponse.json({ link_token: linkToken });
}
