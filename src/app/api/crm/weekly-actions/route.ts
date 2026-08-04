import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getMondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekOf = getMondayOfThisWeek();

  // Gather pipeline context
  const { data: accounts } = await supabase
    .from("sales_pipeline")
    .select(`
      id, name, stage, industry, company_size, country, last_contacted_at, notes,
      crm_contacts(id, name, email, phone, role, is_primary)
    `)
    .not("stage", "in", '("Client","Lost")')
    .order("last_contacted_at", { ascending: true, nullsFirst: true });

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ error: "Sem contas no pipeline", count: 0 });
  }

  // Gather recent activities
  const accountIds = accounts.map((a) => a.id);
  const { data: recentActivities } = await supabase
    .from("sales_activities")
    .select("sales_pipeline_id, type, date, activitie, status")
    .in("sales_pipeline_id", accountIds)
    .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
    .order("date", { ascending: false });

  const activityMap: Record<string, typeof recentActivities> = {};
  for (const act of recentActivities ?? []) {
    if (!activityMap[act.sales_pipeline_id]) activityMap[act.sales_pipeline_id] = [];
    activityMap[act.sales_pipeline_id]!.push(act);
  }

  const today = new Date().toISOString().split("T")[0];
  const accountContext = accounts.map((a) => {
    const contacts = (a.crm_contacts as Array<{ id: string; name: string; email: string | null; phone: string | null; role: string | null; is_primary: boolean }>) ?? [];
    const primaryContact = contacts.find((c) => c.is_primary) ?? contacts[0];
    const lastActivity = activityMap[a.id]?.[0];
    const daysSince = a.last_contacted_at
      ? Math.floor((Date.now() - new Date(a.last_contacted_at).getTime()) / 86400000)
      : null;
    return {
      id: a.id,
      name: a.name,
      stage: a.stage,
      industry: a.industry,
      company_size: a.company_size,
      country: a.country,
      days_since_contact: daysSince,
      primary_contact: primaryContact ? { id: primaryContact.id, name: primaryContact.name, email: primaryContact.email, phone: primaryContact.phone, role: primaryContact.role } : null,
      last_activity: lastActivity ? `${lastActivity.type} on ${lastActivity.date}: ${lastActivity.activitie}` : "none",
      notes: a.notes,
    };
  });

  const prompt = `You are a sales coach for COME Porto, a premium corporate food tours & events company in Porto, Portugal.

Today is ${today}. Generate a prioritised weekly action list (calls + emails) for the sales team.

PIPELINE:
${JSON.stringify(accountContext, null, 2)}

SCORING RULES:
- Leads and Qualified stage: high priority (score 1–4)
- Prospect stage with no contact in 14+ days: medium priority (score 5–8)
- Prospect stage recently contacted: lower priority (score 9–15)
- Proposals outstanding: URGENT (score 1–2)
- Never contacted (null days): priority 3

Generate 10–15 actions total, mixing calls and emails. IMPORTANT: include at most ONE action per account this week — either a call OR an email for that account, never both. Pick whichever channel fits best:
- Pick call if there's a phone number and it's a warm lead
- Pick email for first contacts or when email is available
- Write a short, personalised subject and opening script in Portuguese (or English if the company is clearly international)
- The script should be friendly, direct, and reference their industry/size

Return ONLY a JSON array (no markdown fences):
[
  {
    "account_id": "<uuid>",
    "contact_id": "<uuid or null>",
    "action_type": "call" or "email",
    "subject": "Short subject line or call objective",
    "suggested_script": "3–5 sentence opening message or call script",
    "priority": <1–15>
  }
]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content.find((b) => b.type === "text")?.text ?? "";
    const text = rawText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "No structured data from AI", raw: text }, { status: 500 });
    }

    const actions = JSON.parse(jsonMatch[0]) as Array<{
      account_id: string;
      contact_id: string | null;
      action_type: string;
      subject: string;
      suggested_script: string;
      priority: number;
    }>;

    // Clear existing actions for this week before inserting
    await supabase.from("crm_weekly_actions").delete().eq("week_of", weekOf);

    // Keep at most one action per account: the highest-priority (lowest number) one
    const byAccount = new Map<string, (typeof actions)[number]>();
    for (const a of actions) {
      if (!accounts.find((acc) => acc.id === a.account_id)) continue;
      const existing = byAccount.get(a.account_id);
      if (!existing || a.priority < existing.priority) {
        byAccount.set(a.account_id, a);
      }
    }

    const toInsert = Array.from(byAccount.values())
      .map((a) => ({
        week_of: weekOf,
        account_id: a.account_id,
        contact_id: a.contact_id || null,
        action_type: a.action_type,
        subject: a.subject,
        suggested_script: a.suggested_script,
        priority: a.priority,
        status: "pending",
      }));

    if (toInsert.length > 0) {
      await supabase.from("crm_weekly_actions").insert(toInsert);
    }

    return NextResponse.json({ count: toInsert.length, week_of: weekOf });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
