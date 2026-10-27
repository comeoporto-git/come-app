import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { put } from "@vercel/blob";

// One-time backfill for invoices/receipts imported from the original Notion
// migration: fatura_url/comprovativo_url are Notion-hosted S3 presigned URLs
// that expired long ago. Re-fetches each file fresh from Notion (transactions.id
// IS the Notion page id) and re-uploads to Vercel Blob for a permanent URL.
// Time-boxed and resumable — call repeatedly (e.g. refresh the page) until
// `remaining` is 0. Safe to re-run: skips anything already on Blob.
//
// Also recovers files the migration never copied: migrated rows (Notion page
// ids, i.e. not app-generated v4 UUIDs) with an empty fatura_url/comprovativo_url
// are checked against Notion too. Those that Notion has no file for stay empty,
// so this pass is paged with `?offset=` (use `nextOffset` from the response).

export const maxDuration = 60;

function p(page: PageObjectResponse, name: string) {
  return page.properties[name];
}

function fileUrl(v: unknown): string | null {
  if (!v || typeof v !== "object" || !("files" in v)) return null;
  const files = (v as { files: unknown[] }).files;
  if (!Array.isArray(files) || files.length === 0) return null;
  const f = files[0] as { type: string; external?: { url: string }; file?: { url: string } };
  return f.type === "external" ? (f.external?.url ?? null) : (f.file?.url ?? null);
}

function extOf(contentType: string | null): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("pdf")) return "pdf";
  return "jpg";
}

async function reuploadToBlob(staleUrl: string): Promise<string | null> {
  const res = await fetch(staleUrl);
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type");
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `invoices/backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(contentType)}`;
  const blob = await put(filename, buffer, { access: "public", contentType: contentType ?? undefined });
  return blob.url;
}

const isNotionPageId = (id: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-4/i.test(id);
const onBlob = (url: string | null) => !!url && url.includes("blob.vercel-storage.com");

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!process.env.NOTION_TOKEN) {
    return NextResponse.json({ error: "NOTION_TOKEN not configured" }, { status: 500 });
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const deadline = Date.now() + 50_000; // leave buffer under the 60s function limit

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, fatura_url, comprovativo_url")
    .order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (rows ?? [])
    .filter((r) => isNotionPageId(r.id) && (!onBlob(r.fatura_url) || !onBlob(r.comprovativo_url)))
    .slice(offset);

  let processed = 0, fixed = 0, skipped = 0, failed = 0;
  const errors: { id: string; error: string }[] = [];

  for (const row of candidates) {
    if (Date.now() > deadline) break;
    processed++;

    try {
      const page = (await notion.pages.retrieve({ page_id: row.id })) as PageObjectResponse;
      const freshFatura = fileUrl(p(page, "Fatura"));
      const freshComprovativo = fileUrl(p(page, "Comprovativo de Pagamento"));

      const updates: { fatura_url?: string; comprovativo_url?: string } = {};

      if (!onBlob(row.fatura_url) && freshFatura) {
        const newUrl = await reuploadToBlob(freshFatura);
        if (newUrl) updates.fatura_url = newUrl;
      }
      if (!onBlob(row.comprovativo_url) && freshComprovativo) {
        const newUrl = await reuploadToBlob(freshComprovativo);
        if (newUrl) updates.comprovativo_url = newUrl;
      }

      if (Object.keys(updates).length === 0) {
        skipped++;
      } else {
        const { error: updateError } = await supabase.from("transactions").update(updates).eq("id", row.id);
        if (updateError) throw new Error(updateError.message);
        fixed++;
      }
    } catch (err) {
      failed++;
      errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
    }

    // Stay well under Notion's ~3 req/s rate limit
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return NextResponse.json({
    totalCandidates: offset + candidates.length,
    nextOffset: offset + processed,
    processed,
    fixed,
    skipped,
    failed,
    remaining: candidates.length - processed,
    errors,
  });
}
