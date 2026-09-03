"use server";

import Anthropic from "@anthropic-ai/sdk";
import {
  buildFewShotExamples,
  buildSupplierContext,
  saveAiCorrection,
  saveSupplierMapping,
} from "@/lib/supabase";
import { revalidatePath } from "next/cache";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type InvoiceData = {
  supplier: string;
  date: string; // ISO yyyy-mm-dd
  invoiceId: string;
  /** Base amount (incidência) subject to 6% IVA */
  base6: number;
  /** Base amount (incidência) subject to 13% IVA */
  base13: number;
  /** Base amount (incidência) subject to 23% IVA */
  base23: number;
  /** Total pre-tax base = base6 + base13 + base23 */
  taxFree: number;
  iva6: number;
  iva13: number;
  iva23: number;
  totalCost: number;
};

const BASE_SYSTEM_PROMPT = `You are a Portuguese fiscal document parser. Your ONLY job is to extract structured data from Portuguese receipts and invoices and return valid JSON.

Portuguese IVA (VAT) rates are: 6% (reduced – food, books), 13% (intermediate – restaurant food), 23% (standard – most goods/services).

Extract these fields:
- supplier: business name — match to the KNOWN SUPPLIERS list when possible, and use LEARNED MAPPINGS to correct abbreviations or typos
- date: date of purchase in ISO format (yyyy-mm-dd)
- invoiceId: invoice/receipt number (look for "Nº Fatura", "Recibo Nº", "Documento Nº", "Fatura-Recibo N")
- base6: base amount (incidência/base tributável) subject to 6% IVA — find the row with "6%" or "6.00%" in the tax breakdown table and read the "Base", "Incid.", "Incidência" or "Valor" column
- base13: base amount subject to 13% IVA (same — read from the 13% row)
- base23: base amount subject to 23% IVA (same — read from the 23% row)
- taxFree: total pre-tax base = base6 + base13 + base23 (or "Total Incidências" if shown)
- iva6: IVA tax amount at 6% — if the tax breakdown table has a separate printed IVA-amount column for the 6% row (distinct from the base/incidência column), use that printed value; otherwise compute base6 × 0.06
- iva13: IVA tax amount at 13% — same rule: prefer the printed IVA-column value for the 13% row over computing base13 × 0.13
- iva23: IVA tax amount at 23% — same rule: prefer the printed IVA-column value for the 23% row over computing base23 × 0.23
- totalCost: grand total paid ("Total pagar", "Total liq.", "TOTAL")

Rules:
1. If a rate is not present in the document, set base and IVA for that rate to 0
2. taxFree = base6 + base13 + base23
3. totalCost = taxFree + iva6 + iva13 + iva23
4. Some documents (e.g. insurance premiums, "Imposto do Selo" receipts, and other IVA-exempt services under art. 9 CIVA) show NO 6%/13%/23% breakdown at all because they are exempt from IVA, not taxed at 0%. In that case set base6=base13=base23=0 AND iva6=iva13=iva23=0, but taxFree MUST still equal the full totalCost (the whole amount is "isento de IVA") — never leave taxFree at 0 for a non-zero invoice.
5. Return ONLY a JSON object with these exact keys, no markdown fences, no explanation
6. If you cannot read a value clearly, use 0 for numbers and "" for strings
7. For supplier: always prefer an exact match from the KNOWN SUPPLIERS list over raw receipt text`;

export async function analyzeInvoice(
  fileBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf",
  fornecedorNames: string[] = []
): Promise<InvoiceData> {
  const [fewShot, supplierContext] = await Promise.all([
    buildFewShotExamples(),
    buildSupplierContext(fornecedorNames),
  ]);

  const systemPrompt = BASE_SYSTEM_PROMPT + supplierContext + fewShot;

  const contentBlock = mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: fileBase64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: fileBase64 } };

  const userMessage = {
    role: "user" as const,
    content: [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contentBlock as any,
      {
        type: "text" as const,
        text: "Extract the invoice data from this Portuguese receipt and return only JSON.",
      },
    ],
  };

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [userMessage],
  });

  // The system prompt grows with dynamic few-shot examples; if the model ran
  // out of budget mid-JSON, retry once with more room instead of parsing a
  // truncated response.
  if (response.stop_reason === "max_tokens") {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [userMessage],
    });
  }

  const raw = (response.content[0] as { type: string; text: string }).text.trim();

  try {
    return JSON.parse(extractJson(raw)) as InvoiceData;
  } catch {
    // Give the model one chance to repair its own malformed JSON before
    // surfacing a failure to the user.
    const repair = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Return ONLY a corrected, valid JSON object — no markdown fences, no explanation.",
      messages: [
        userMessage,
        { role: "assistant", content: raw },
        { role: "user", content: "That was not valid JSON. Return the same data as a single valid JSON object." },
      ],
    });
    const repaired = (repair.content[0] as { type: string; text: string }).text.trim();
    return JSON.parse(extractJson(repaired)) as InvoiceData;
  }
}

function extractJson(raw: string): string {
  const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return clean;
  return clean.slice(start, end + 1);
}

/**
 * Called when the guide corrects AI output.
 * Saves the full correction + any supplier name mapping learned.
 */
export async function submitAiCorrection(
  imageUrl: string,
  aiExtracted: InvoiceData,
  humanCorrected: InvoiceData
): Promise<void> {
  const saves: Promise<unknown>[] = [
    saveAiCorrection({
      image_url: imageUrl,
      ai_extracted: aiExtracted as unknown as Record<string, unknown>,
      human_corrected: humanCorrected as unknown as Record<string, unknown>,
    }),
  ];

  // If the guide changed the supplier name, learn the mapping
  if (
    aiExtracted.supplier &&
    humanCorrected.supplier &&
    aiExtracted.supplier.toLowerCase() !== humanCorrected.supplier.toLowerCase()
  ) {
    saves.push(saveSupplierMapping(aiExtracted.supplier, humanCorrected.supplier));
  }

  await Promise.all(saves);
  revalidatePath("/guide");
}
