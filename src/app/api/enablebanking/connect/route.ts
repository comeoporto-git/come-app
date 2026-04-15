import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAuthUrl } from "@/lib/enablebanking";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const url = await createAuthUrl("Crédito Agrícola", "PT");
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[EnableBanking connect]", err);
    return NextResponse.json({ error: "Failed to create auth URL" }, { status: 500 });
  }
}
