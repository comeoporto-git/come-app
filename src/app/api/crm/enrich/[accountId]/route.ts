import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await params;

  const { data: account, error } = await supabase
    .from("sales_pipeline")
    .select("name, website, industry, country, company_size, linkedin_url")
    .eq("id", accountId)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const knownInfo = [
    account.website ? `website: ${account.website}` : null,
    account.industry ? `industry: ${account.industry}` : null,
    account.country ? `country: ${account.country}` : null,
    account.company_size ? `size: ${account.company_size}` : null,
  ].filter(Boolean).join(", ");

  const prompt = `Research the company "${account.name}"${knownInfo ? ` (${knownInfo})` : ""} and return everything you know about them.

Return a JSON object (no markdown fences) with these fields:
{
  "industry": "sector/industry of the company",
  "company_size": "estimated headcount range (Solo/2–10/11–50/51–200/200+)",
  "country": "headquarters country",
  "description": "2-3 sentences about the company, what they do, and why they'd be a good client for corporate food tours",
  "linkedin_url": "LinkedIn company page URL if known",
  "website": "official website if known",
  "key_contacts": [
    {
      "name": "Person Name",
      "role": "Job Title",
      "linkedin_url": "LinkedIn profile URL if known",
      "email": "email if known"
    }
  ],
  "why_fit": "1-2 sentences on why this company would buy corporate events from COME Porto",
  "recent_news": "any recent relevant news about the company (funding, expansion, new office, etc.)"
}

Only include fields you're confident about. Leave empty strings for unknown fields.`;

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

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text = block.text;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "No structured data from AI" }, { status: 500 });
    }
    const enrichment = JSON.parse(jsonMatch[0]);

    // Merge non-null fields back into the account
    const updates: Record<string, unknown> = {
      enrichment_data: enrichment,
      enriched_at: new Date().toISOString(),
    };
    if (!account.industry && enrichment.industry) updates.industry = enrichment.industry;
    if (!account.country && enrichment.country) updates.country = enrichment.country;
    if (!account.company_size && enrichment.company_size) updates.company_size = enrichment.company_size;
    if (!account.linkedin_url && enrichment.linkedin_url) updates.linkedin_url = enrichment.linkedin_url;
    if (!account.website && enrichment.website) updates.website = enrichment.website;

    await supabase.from("sales_pipeline").update(updates).eq("id", accountId);

    // Add any discovered key contacts
    if (Array.isArray(enrichment.key_contacts)) {
      for (const c of enrichment.key_contacts) {
        if (!c.name) continue;
        const { data: existing } = await supabase
          .from("crm_contacts")
          .select("id")
          .eq("account_id", accountId)
          .ilike("name", c.name)
          .maybeSingle();
        if (!existing) {
          await supabase.from("crm_contacts").insert({
            account_id: accountId,
            name: c.name,
            role: c.role || null,
            linkedin_url: c.linkedin_url || null,
            email: c.email || null,
          });
        }
      }
    }

    return NextResponse.json({ message: "Conta enriquecida com sucesso", enrichment });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
