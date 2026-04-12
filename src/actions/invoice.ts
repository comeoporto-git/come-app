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
- invoiceId: invoice/receipt number (look for "Nº Fatura", "Recibo Nº", "Documento Nº")
- taxFree: base amount before tax (sum of all tax-free bases)
- iva6: IVA amount at 6% rate (not the base, the actual tax amount)
- iva13: IVA amount at 13% rate
- iva23: IVA amount at 23% rate
- totalCost: grand total paid

Rules:
1. If a rate is not present, set it to 0
2. totalCost = taxFree + iva6 + iva13 + iva23
3. Return ONLY a JSON object with these exact keys, no markdown fences, no explanation
4. If you cannot read a value clearly, use 0 for numbers and "" for strings
5. For supplier: always prefer an exact match from the KNOWN SUPPLIERS list over raw receipt text`;

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
