import { NextResponse } from "next/server";
import { supabase } from "@/lib/notion";
import { auth } from "@/lib/auth";

function sanitizeFilename(name: string | null): string {
  const base = (name ?? "foto").replace(/["\r\n]/g, "").trim();
  return base.length > 0 ? base : "foto.jpg";
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  try {
    const { data } = await supabase.from("social_photos").select("blob_url, filename").eq("id", id).maybeSingle();
    if (!data?.blob_url) return new NextResponse("Not found", { status: 404 });

    const fileRes = await fetch(data.blob_url);
    if (!fileRes.ok) return new NextResponse("File unavailable", { status: 502 });

    const contentType = fileRes.headers.get("content-type") ?? "image/jpeg";
    const filename = sanitizeFilename(data.filename);

    return new NextResponse(fileRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
