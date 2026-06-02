/**
 * Batch AI-scan all IN- transactions that have an invoice file.
 * Run with: npx tsx scripts/scan-earnings.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually if not loaded already
const envLocalPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SYSTEM_PROMPT = `You are a Portuguese fiscal document parser. Your ONLY job is to extract structured data from Portuguese receipts and invoices and return valid JSON.

Portuguese IVA (VAT) rates are: 6% (reduced – food, books), 13% (intermediate – restaurant food), 23% (standard – most goods/services).

Extract these fields:
- supplier: business name
- date: date of purchase in ISO format (yyyy-mm-dd)
- invoiceId: invoice/receipt number (look for "Nº Fatura", "Recibo Nº", "Documento Nº", "Fatura-Recibo N")
- base6: base amount (incidência/base tributável) subject to 6% IVA
- base13: base amount subject to 13% IVA
- base23: base amount subject to 23% IVA
- taxFree: total pre-tax base = base6 + base13 + base23
- iva6: IVA tax amount at 6% (base6 × 0.06)
- iva13: IVA tax amount at 13% (base13 × 0.13)
- iva23: IVA tax amount at 23% (base23 × 0.23)
- totalCost: grand total paid

Rules:
1. If a rate is not present in the document, set base and IVA for that rate to 0
2. taxFree = base6 + base13 + base23
3. totalCost = taxFree + iva6 + iva13 + iva23
4. Return ONLY a JSON object with these exact keys, no markdown fences, no explanation
5. If you cannot read a value clearly, use 0 for numbers and "" for strings`;

function detectMediaType(
  url: string,
  contentType: string,
): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf" {
  const lower = url.toLowerCase();
  if (contentType.includes("pdf") || lower.includes(".pdf")) return "application/pdf";
  if (contentType.includes("png") || lower.includes(".png")) return "image/png";
  if (contentType.includes("webp") || lower.includes(".webp")) return "image/webp";
  if (contentType.includes("gif") || lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

type InvoiceData = {
  supplier: string;
  date: string;
  invoiceId: string;
  base6: number; base13: number; base23: number;
  taxFree: number;
  iva6: number; iva13: number; iva23: number;
  totalCost: number;
};

async function getFreshFileUrl(pageId: string): Promise<string | null> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!res.ok) return null;
  const page = await res.json() as { properties: Record<string, { type: string; files: Array<{ file: { url: string } }> }> };
  const faturaFiles = page.properties["Fatura"]?.files ?? [];
  return faturaFiles[0]?.file?.url ?? null;
}

async function analyzeInvoice(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf",
): Promise<InvoiceData> {
  const contentBlock = mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: base64 } };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: BASE_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: [contentBlock as any, { type: "text", text: "Extract the invoice data from this Portuguese receipt and return only JSON." }],
    }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text.trim();
  const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(clean) as InvoiceData;
}

async function main() {
  console.log("Querying IN- transactions with invoice files...");

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, notion_id, fatura_url, id_fatura, iva_6, iva_13, iva_23, valor_sem_iva")
    .like("notion_id", "IN -%")
    .not("fatura_url", "is", null)
    .neq("status", "Archived");

  if (error) { console.error("DB error:", error.message); process.exit(1); }

  console.log(`Found ${rows.length} transactions to scan.\n`);

  let ok = 0, failed = 0;

  for (const row of rows) {
    const label = `[${row.notion_id}] (${row.id})`;
    process.stdout.write(`  ${label} ... `);

    try {
      let fileUrl = row.fatura_url as string;
      // Notion S3 URLs expire; refresh via Notion API
      if (fileUrl.includes("prod-files-secure.s3")) {
        const fresh = await getFreshFileUrl(row.id);
        if (!fresh) throw new Error("No file found in Notion page");
        fileUrl = fresh;
      }
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status} fetching file`);

      const contentType = fileRes.headers.get("content-type") ?? "";
      const mediaType = detectMediaType(row.fatura_url, contentType);

      const buffer = await fileRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      const invoice = await analyzeInvoice(base64, mediaType);

      const updates: Record<string, unknown> = {
        valor_sem_iva: invoice.taxFree,
        iva_6: invoice.iva6,
        iva_13: invoice.iva13,
        iva_23: invoice.iva23,
      };
      if (invoice.invoiceId) updates.id_fatura = invoice.invoiceId;

      const { error: upErr } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", row.id);

      if (upErr) throw new Error(`Update failed: ${upErr.message}`);

      console.log(`OK  taxFree=${invoice.taxFree} iva6=${invoice.iva6} iva13=${invoice.iva13} iva23=${invoice.iva23} invoiceId=${invoice.invoiceId || "(none)"}`);
      ok++;
    } catch (err) {
      console.log(`FAIL  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} updated, ${failed} failed.`);
}

main();
