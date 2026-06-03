import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type FoundContact = {
  name: string;
  role: string;
  email?: string;
  linkedin_url?: string;
  phone?: string;
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await params;

  const { data: account } = await supabase
    .from("sales_pipeline")
    .select("name, website, industry, country, linkedin_url")
    .eq("id", accountId)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { data: existingContacts } = await supabase
    .from("crm_contacts")
    .select("name")
    .eq("account_id", accountId);

  const existingNames = (existingContacts ?? []).map((c) => c.name.toLowerCase());

  const prompt = `Find real people who work at "${account.name}"${account.industry ? ` (${account.industry})` : ""}${account.country ? `, ${account.country}` : ""}.
${account.website ? `Website: ${account.website}` : ""}
${account.linkedin_url ? `LinkedIn: ${account.linkedin_url}` : ""}

Focus on decision-makers who would buy or approve corporate events, team-building activities, or private dining experiences:
- Events Manager / Corporate Events
- HR Director / People & Culture
- Executive Assistant / Office Manager
- Marketing Manager / CMO
- CEO / Founder (for small companies)

For each person, find their LinkedIn profile URL if possible.

Return ONLY a JSON array (no markdown fences):
[
  {
    "name": "Full Name",
    "role": "Job Title",
    "email": "email@company.com or empty string",
    "linkedin_url": "https://linkedin.com/in/profile or empty string",
    "phone": ""
  }
]

Return 3–6 people. Only include people you are reasonably confident actually work there.`;

  try {
    let response;
    try {
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
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ error: "No data from AI", raw: text }, { status: 500 });

    const found: FoundContact[] = JSON.parse(jsonMatch[0]);

    const added: FoundContact[] = [];
    for (const c of found) {
      if (!c.name?.trim()) continue;
      if (existingNames.includes(c.name.toLowerCase())) continue;

      await supabase.from("crm_contacts").insert({
        account_id: accountId,
        name: c.name.trim(),
        role: c.role?.trim() || null,
        email: c.email?.trim() || null,
        linkedin_url: c.linkedin_url?.trim() || null,
        phone: c.phone?.trim() || null,
        is_primary: false,
      });
      added.push(c);
    }

    return NextResponse.json({ added, count: added.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
