import { NextResponse } from "next/server";
import { supabase } from "@/lib/notion";
import { auth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  try {
    const { data } = await supabase
      .from("transactions")
      .select("fatura_url")
      .eq("id", id)
      .maybeSingle();

    const url = data?.fatura_url;
    if (!url) return new NextResponse("No file", { status: 404 });

    const fileRes = await fetch(url);
    if (!fileRes.ok) return new NextResponse("File unavailable", { status: 502 });

    const contentType = fileRes.headers.get("content-type") ?? "application/octet-stream";
    return new NextResponse(fileRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
