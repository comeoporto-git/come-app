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
- iva6: IVA tax amount at 6% (the tax itself, not the base — i.e., base6 × 0.06)
- iva13: IVA tax amount at 13% (base13 × 0.13)
- iva23: IVA tax amount at 23% (base23 × 0.23)
- totalCost: grand total paid ("Total pagar", "Total liq.", "TOTAL")

Rules:
1. If a rate is not present in the document, set base and IVA for that rate to 0
2. taxFree = base6 + base13 + base23
3. totalCost = taxFree + iva6 + iva13 + iva23
4. Return ONLY a JSON object with these exact keys, no markdown fences, no explanation
5. If you cannot read a value clearly, use 0 for numbers and "" for strings
6. For supplier: always prefer an exact match from the KNOWN SUPPLIERS list over raw receipt text`;

export async function analyzeInvoice(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  fornecedorNames: string[] = []
): Promise<InvoiceData> {
  const [fewShot, supplierContext] = await Promise.all([
    buildFewShotExamples(),
    buildSupplierContext(fornecedorNames),
  ]);

  const systemPrompt = BASE_SYSTEM_PROMPT + supplierContext + fewShot;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Extract the invoice data from this Portuguese receipt and return only JSON.",
          },
        ],
      },
    ],
  });

  const raw = (response.content[0] as { type: string; text: string }).text.trim();
  const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(clean) as InvoiceData;
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
