import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";
import { analyzeComprovativo } from "@/actions/invoice";

// One-time backfill for comprovativos (bank transfer proofs) uploaded before
// transfer-date scanning existed: re-analyzes each file already on Blob and
// fills in transactions.data_transferencia. Time-boxed and resumable — call
// repeatedly (e.g. refresh the page) until `remaining` is 0. Safe to re-run:
// only targets rows where data_transferencia is still null.

export const maxDuration = 60;

function mediaTypeOf(contentType: string | null): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (!contentType) return null;
  if (contentType.includes("pdf"))  return "application/pdf";
  if (contentType.includes("png"))  return "image/png";
  if (contentType.includes("webp")) return "image/webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "image/jpeg";
  return null;
}

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const deadline = Date.now() + 50_000; // leave buffer under the 60s function limit

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, comprovativo_url")
    .not("comprovativo_url", "is", null)
    .is("data_transferencia", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (rows ?? []).filter((r) => !!r.comprovativo_url);

  let processed = 0, fixed = 0, skipped = 0, failed = 0;
  const errors: { id: string; error: string }[] = [];

  for (const row of candidates) {
    if (Date.now() > deadline) break;
    processed++;

    try {
      const fileRes = await fetch(row.comprovativo_url as string);
      if (!fileRes.ok) throw new Error(`Fetch failed: ${fileRes.status}`);
      const mediaType = mediaTypeOf(fileRes.headers.get("content-type"));
      if (!mediaType) throw new Error("Unsupported content-type");

      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const base64 = buffer.toString("base64");

      const { transferDate } = await analyzeComprovativo(base64, mediaType);
      if (!transferDate) {
        skipped++;
      } else {
        const { error: updateError } = await supabase
          .from("transactions")
          .update({ data_transferencia: transferDate })
          .eq("id", row.id);
        if (updateError) throw new Error(updateError.message);
        fixed++;
      }
    } catch (err) {
      failed++;
      errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
    }

    // Stay well under the Anthropic API's rate limits
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return NextResponse.json({
    totalCandidates: candidates.length,
    processed,
    fixed,
    skipped,
    failed,
    remaining: candidates.length - processed,
    errors,
  });
}
