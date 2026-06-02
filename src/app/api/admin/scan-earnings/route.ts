import { NextResponse } from "next/server";
import { supabase } from "@/lib/notion";
import { updateTransaction } from "@/lib/notion";
import { analyzeInvoice } from "@/actions/invoice";
import { auth } from "@/lib/auth";

type ScanResult = {
  id: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  iva6?: number;
  iva13?: number;
  iva23?: number;
  taxFree?: number;
  invoiceId?: string;
};

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

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, fatura_url, id_fatura, iva_6, iva_13, iva_23, valor_sem_iva")
    .like("notion_id", "IN -%")
    .not("fatura_url", "is", null)
    .neq("status", "Archived");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: ScanResult[] = [];

  for (const row of rows ?? []) {
    const fatura_url = row.fatura_url as string;

    try {
      const fileRes = await fetch(fatura_url);
      if (!fileRes.ok) throw new Error(`Fetch failed: HTTP ${fileRes.status}`);

      const contentType = fileRes.headers.get("content-type") ?? "";
      const mediaType = detectMediaType(fatura_url, contentType);

      const buffer = await fileRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      const invoice = await analyzeInvoice(base64, mediaType);

      await updateTransaction(row.id, {
        taxFree: invoice.taxFree,
        iva6: invoice.iva6,
        iva13: invoice.iva13,
        iva23: invoice.iva23,
        ...(invoice.invoiceId ? { invoiceId: invoice.invoiceId } : {}),
      });

      results.push({
        id: row.id,
        status: "ok",
        iva6: invoice.iva6,
        iva13: invoice.iva13,
        iva23: invoice.iva23,
        taxFree: invoice.taxFree,
        invoiceId: invoice.invoiceId || undefined,
      });
    } catch (err) {
      results.push({
        id: row.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ total: rows?.length ?? 0, ok, failed, results });
}
