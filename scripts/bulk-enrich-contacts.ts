import postgres from "postgres";
import Anthropic from "@anthropic-ai/sdk";

const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function enrichContacts(account: {
  id: string; name: string; website: string | null; industry: string | null;
  country: string | null; linkedin_url: string | null;
}) {
  const prompt = `Find real people who work at "${account.name}"${account.industry ? ` (${account.industry})` : ""}${account.country ? `, ${account.country}` : ""}.
${account.website ? `Website: ${account.website}` : ""}
${account.linkedin_url ? `LinkedIn: ${account.linkedin_url}` : ""}

Focus on decision-makers who would buy or approve corporate events, team-building, or private dining:
- Events Manager / Corporate Events Coordinator
- HR Director / People & Culture
- Executive Assistant / Office Manager
- Marketing Manager
- CEO / Founder (small companies)

Return ONLY a JSON array (no markdown):
[{"name":"Full Name","role":"Job Title","email":"or empty","linkedin_url":"https://linkedin.com/in/... or empty","phone":""}]

Return 2–5 people. Only include people you are reasonably confident work there.`;

  try {
    let response;
    try {
      // Try with web search first
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305" } as any],
        messages: [{ role: "user", content: prompt }],
      });
    } catch {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    // Strip markdown code fences if present
    const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) { console.error("  no JSON array found in:\n", text.slice(0, 300)); return []; }
    return JSON.parse(match[0]) as Array<{ name: string; role: string; email: string; linkedin_url: string; phone: string }>;
  } catch {
    return [];
  }
}

async function main() {
  // Get all CRM accounts with no contacts yet
  const accounts = await sql`
    SELECT sp.id, sp.name, sp.website, sp.industry, sp.country, sp.linkedin_url
    FROM sales_pipeline sp
    WHERE NOT EXISTS (SELECT 1 FROM crm_contacts c WHERE c.account_id = sp.id)
    ORDER BY sp.name
  `;

  console.log(`Found ${accounts.length} accounts with no contacts\n`);

  for (const acc of accounts as unknown as Array<{ id: string; name: string; website: string | null; industry: string | null; country: string | null; linkedin_url: string | null }>) {
    process.stdout.write(`  ${acc.name}… `);
    const contacts = await enrichContacts(acc);
    const valid = contacts.filter((c) => c.name?.trim());

    if (!valid.length) {
      console.log("no results");
      continue;
    }

    for (let i = 0; i < valid.length; i++) {
      const c = valid[i];
      await sql`
        INSERT INTO crm_contacts (account_id, name, role, email, linkedin_url, phone, is_primary)
        VALUES (
          ${acc.id}, ${c.name.trim()},
          ${c.role?.trim() || null}, ${c.email?.trim() || null},
          ${c.linkedin_url?.trim() || null}, ${c.phone?.trim() || null},
          ${i === 0}
        )
      `;
    }
    console.log(`${valid.length} contacts added (${valid.map((c) => c.name).join(", ")})`);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  await sql.end();
  console.log("\nDone");
}
main().catch(console.error);
