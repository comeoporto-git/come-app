import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCRMContactEmails, getRecentInboxEmails } from "@/lib/integration";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email");
  const emails = email
    ? await getCRMContactEmails(email)
    : await getRecentInboxEmails(20);

  return NextResponse.json({ emails });
}
