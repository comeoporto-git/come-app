import { getDb } from "@/lib/db";

// ── AI Invoice Corrections ────────────────────────────────────────────────────

export type AiCorrection = {
  id?: string;
  image_url: string;
  ai_extracted: Record<string, unknown>;
  human_corrected: Record<string, unknown>;
  created_at?: string;
};

export async function saveAiCorrection(correction: AiCorrection): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO ai_corrections (image_url, ai_extracted, human_corrected)
    VALUES (${correction.image_url}, ${JSON.stringify(correction.ai_extracted)}, ${JSON.stringify(correction.human_corrected)})
  `;
}

export async function getRecentCorrections(limit = 5): Promise<AiCorrection[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM ai_corrections
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as AiCorrection[];
}

// ── Supplier Mappings (Learning Loop) ────────────────────────────────────────

export type SupplierMapping = {
  id?: string;
  receipt_text: string;
  correct_name: string;
  confirmed_count: number;
  created_at?: string;
};

export async function saveSupplierMapping(
  receiptText: string,
  correctName: string
): Promise<void> {
  const receipt_text = receiptText.trim().toLowerCase();
  const correct_name = correctName.trim();

  if (!receipt_text || !correct_name || receipt_text === correct_name.toLowerCase()) return;

  const sql = getDb();
  await sql`
    INSERT INTO supplier_mappings (receipt_text, correct_name, confirmed_count)
    VALUES (${receipt_text}, ${correct_name}, 1)
    ON CONFLICT (receipt_text, correct_name)
    DO UPDATE SET confirmed_count = supplier_mappings.confirmed_count + 1
  `;
}

export async function getSupplierMappings(): Promise<SupplierMapping[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM supplier_mappings
    ORDER BY confirmed_count DESC
    LIMIT 50
  `;
  return rows as unknown as SupplierMapping[];
}

// ── System Prompt Builders ────────────────────────────────────────────────────

export async function buildSupplierContext(fornecedorNames: string[]): Promise<string> {
  const mappings = await getSupplierMappings();

  const knownList =
    fornecedorNames.length > 0
      ? `\n\nKNOWN SUPPLIERS (always prefer matching to one of these):\n${fornecedorNames
          .map((n) => `- ${n}`)
          .join("\n")}`
      : "";

  const learnedMappings =
    mappings.length > 0
      ? `\n\nLEARNED SUPPLIER NAME MAPPINGS (receipt text → correct supplier):\n${mappings
          .map((m) => `- "${m.receipt_text}" → "${m.correct_name}"`)
          .join("\n")}`
      : "";

  return knownList + learnedMappings;
}

export async function buildFewShotExamples(): Promise<string> {
  const corrections = await getRecentCorrections(5);
  if (!corrections.length) return "";

  const examples = corrections
    .map(
      (c, i) =>
        `Example ${i + 1} (human-corrected):\nAI extracted: ${JSON.stringify(c.ai_extracted)}\nCorrect answer: ${JSON.stringify(c.human_corrected)}`
    )
    .join("\n\n");

  return `\n\n--- FEW-SHOT EXAMPLES FROM PAST CORRECTIONS ---\n${examples}\n--- END EXAMPLES ---`;
}
