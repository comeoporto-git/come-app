import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { industry, country, company_size, description } = body as {
    industry?: string;
    country?: string;
    company_size?: string;
    description?: string;
  };

  const prompt = `You are a B2B sales researcher helping COME Porto, a premium food tours and corporate events company based in Porto, Portugal.

Find 6–10 real companies that would be ideal clients for COME Porto's corporate team-building food tours and private events.

Target profile:
- Industry: ${industry || "any (hotels, tech companies, event agencies, corporate offices)"}
- Country: ${country || "Portugal"}
- Company size: ${company_size || "any"}
- Additional notes: ${description || "companies that organise team events, client entertainment, or employee experiences"}

COME Porto sells:
- Private food tours through Porto (2–20 people)
- Corporate team-building dining experiences
- Client entertainment with local food & wine
- Private chef dinners

For each company, find the most relevant decision-maker (events manager, HR director, EA, office manager, marketing manager).

Return a JSON object with this exact structure (no markdown fences, no explanation):
{
  "companies": [
    {
      "name": "Company Name",
      "website": "https://website.com",
      "industry": "Industry",
      "company_size": "11–50",
      "country": "Portugal",
      "description": "One sentence about why they're a good fit and what kind of event they'd buy",
      "contacts": [
        {
          "name": "Contact Name",
          "role": "Events Manager",
          "email": "email@company.com",
          "linkedin_url": "https://linkedin.com/in/profile",
          "phone": ""
        }
      ]
    }
  ]
}

Use your knowledge of real companies. If you don't know exact contact details, omit those fields. Focus on real, verifiable companies.`;

  try {
    let response;
    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305" } as any],
        messages: [{ role: "user", content: prompt }],
      });
    } catch {
      // Web search not available — fall back to knowledge-only
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });
    }

    // Extract the final text content
    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText = block.text;
    }
    const text = rawText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "A IA não devolveu dados estruturados", raw: text }, { status: 500 });
    }
    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
