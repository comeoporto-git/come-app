import { auth } from "@/lib/auth";
import { exchangePublicToken } from "@/lib/plaid";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { public_token, institution_name } = await req.json();
  await exchangePublicToken(public_token, institution_name ?? "Crédito Agrícola");
  return NextResponse.json({ ok: true });
}
