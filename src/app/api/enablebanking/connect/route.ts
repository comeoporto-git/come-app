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
    const detail = err instanceof Error ? err.message : String(err);
    const redirectUrl = new URL("/admin", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
    redirectUrl.searchParams.set("bank_error", detail);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
