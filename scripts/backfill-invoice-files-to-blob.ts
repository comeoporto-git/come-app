/**
 * One-time backfill: invoices/receipts imported from the original Notion
 * migration have `fatura_url`/`comprovativo_url` pointing at Notion-hosted S3
 * presigned URLs, which expire ~1 hour after Notion generates them. Those are
 * long dead. This re-fetches each file fresh from Notion (transactions.id IS
 * the Notion page id — see migrate-from-notion.ts) and re-uploads it to
 * Vercel Blob, which gives a permanent URL, matching how new uploads already
 * work (see src/app/api/upload/route.ts).
 *
 * Safe to re-run: only touches rows whose URL isn't already a blob.vercel-
 * storage.com URL.
 *
 * Run with:
 *   npx tsx scripts/backfill-invoice-files-to-blob.ts
 *
 * Requires in .env.local:
 *   NOTION_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   BLOB_READ_WRITE_TOKEN
 */

import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { createClient } from "@supabase/supabase-js";
import { put } from "@vercel/blob";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const notion = new Client({ auth: process.env.NOTION_TOKEN! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function p(page: PageObjectResponse, name: string) {
  return page.properties[name];
}

const fileUrl = (v: unknown): string | null => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const files = (v as any)?.files ?? [];
  if (files.length === 0) return null;
  const f = files[0];
  return f.type === "external" ? (f.external?.url ?? null) : (f.file?.url ?? null);
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extOf(contentType: string | null): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("pdf")) return "pdf";
  return "jpg";
}

async function reuploadToBlob(staleUrl: string, label: string): Promise<string | null> {
  const res = await fetch(staleUrl);
  if (!res.ok) {
    console.warn(`    ⚠ ${label}: fetch from Notion S3 failed (${res.status}) — may already be expired again`);
    return null;
  }
  const contentType = res.headers.get("content-type");
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `invoices/backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(contentType)}`;
  const blob = await put(filename, buffer, { access: "public", contentType: contentType ?? undefined });
  return blob.url;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, fatura_url, comprovativo_url")
    .or("fatura_url.not.is.null,comprovativo_url.not.is.null");

  if (error) throw new Error(`query: ${error.message}`);

  const candidates = (rows ?? []).filter(
    (r) =>
      (r.fatura_url && !r.fatura_url.includes("blob.vercel-storage.com")) ||
      (r.comprovativo_url && !r.comprovativo_url.includes("blob.vercel-storage.com")),
  );

  console.log(`Found ${candidates.length} transaction(s) with a non-Blob invoice/receipt URL.\n`);

  let fixed = 0, failed = 0, skipped = 0;

  for (const row of candidates) {
    try {
      const page = (await notion.pages.retrieve({ page_id: row.id })) as PageObjectResponse;

      const freshFatura = fileUrl(p(page, "Fatura"));
      const freshComprovativo = fileUrl(p(page, "Comprovativo de Pagamento"));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};

      if (row.fatura_url && !row.fatura_url.includes("blob.vercel-storage.com")) {
        if (freshFatura) {
          const newUrl = await reuploadToBlob(freshFatura, `${row.id} fatura`);
          if (newUrl) updates.fatura_url = newUrl;
        } else {
          console.warn(`  ⚠ ${row.id}: no "Fatura" file on the Notion page anymore — skipping`);
        }
      }

      if (row.comprovativo_url && !row.comprovativo_url.includes("blob.vercel-storage.com")) {
        if (freshComprovativo) {
          const newUrl = await reuploadToBlob(freshComprovativo, `${row.id} comprovativo`);
          if (newUrl) updates.comprovativo_url = newUrl;
        } else {
          console.warn(`  ⚠ ${row.id}: no "Comprovativo" file on the Notion page anymore — skipping`);
        }
      }

      if (Object.keys(updates).length === 0) {
        skipped++;
      } else {
        const { error: updateError } = await supabase.from("transactions").update(updates).eq("id", row.id);
        if (updateError) throw new Error(updateError.message);
        console.log(`  ✓ ${row.id}: ${Object.keys(updates).join(", ")}`);
        fixed++;
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${row.id}: ${msg}`);
    }

    // Stay well under Notion's ~3 req/s rate limit
    await sleep(350);
  }

  console.log(`\nDone. Fixed: ${fixed}, skipped (nothing to do): ${skipped}, failed: ${failed}`);
}

main().catch((err) => {
  console.error("[backfill-invoice-files-to-blob] Fatal:", err);
  process.exit(1);
});
