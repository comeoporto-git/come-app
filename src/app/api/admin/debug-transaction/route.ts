import { NextResponse } from "next/server";
import { supabase } from "@/lib/notion";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tourId = searchParams.get("tourId");
  if (!tourId) {
    return NextResponse.json({ error: "Pass ?tourId=<id from the tour URL>" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("id, notion_id, fatura_url, comprovativo_url, status, metodo_pagamento, valor")
    .eq("sale_id", tourId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tourId, count: data.length, transactions: data }, { status: 200 });
}
