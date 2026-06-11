import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBusinessSnapshot() {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thisYearStart = `${now.getFullYear()}-01-01`;
  const todayStr = now.toISOString().split("T")[0];

  const [
    { data: recentSales },
    { data: thisMonthSales },
    { data: thisYearSales },
    { data: thisMonthTx },
    { data: thisYearTx },
    { data: pipeline },
    { data: team },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("id, date, status, number_of_guests, expenses_closed, services(name, type), clients(name)")
      .order("date", { ascending: false })
      .limit(20),
    supabase
      .from("sales")
      .select("id, date, status, number_of_guests, services(name, type), clients(name)")
      .gte("date", thisMonthStart)
      .lte("date", todayStr),
    supabase
      .from("sales")
      .select("id, date, status, number_of_guests, services(name, type), clients(name)")
      .gte("date", thisYearStart)
      .lte("date", todayStr),
    supabase
      .from("transactions")
      .select("id, supplier, total_cost, date, who_paid, status, accountant_verified, type")
      .gte("date", thisMonthStart)
      .lte("date", todayStr),
    supabase
      .from("transactions")
      .select("id, supplier, total_cost, date, who_paid, status, accountant_verified, type")
      .gte("date", thisYearStart)
      .lte("date", todayStr),
    supabase
      .from("sales_pipeline")
      .select("id, name, stage, industry, country, company_size, last_contacted_at, notes")
      .order("created_at", { ascending: false }),
    supabase
      .from("team")
      .select("id, name, role, email"),
    supabase
      .from("clients")
      .select("id, name")
      .order("name"),
  ]);

  // Aggregate financials
  const monthExpenses = (thisMonthTx ?? [])
    .filter((t) => t.type !== "earning" && (t.total_cost ?? 0) < 0 || t.type === "expense")
    .reduce((s, t) => s + Math.abs(t.total_cost ?? 0), 0);
  const monthEarnings = (thisMonthTx ?? [])
    .filter((t) => t.type === "earning" || (t.total_cost ?? 0) > 0)
    .reduce((s, t) => s + Math.abs(t.total_cost ?? 0), 0);

  // Pipeline summary
  const pipelineByStage: Record<string, number> = {};
  for (const acc of pipeline ?? []) {
    const s = acc.stage ?? "Prospect";
    pipelineByStage[s] = (pipelineByStage[s] ?? 0) + 1;
  }

  return {
    today: todayStr,
    company: "COME Porto — Premium food tours and corporate events company based in Porto, Portugal",
    team: (team ?? []).map((m) => ({ name: m.name, role: m.role })),
    clients: (clients ?? []).map((c) => c.name),
    thisMonth: {
      salesCount: (thisMonthSales ?? []).length,
      totalGuests: (thisMonthSales ?? []).reduce((s, t) => s + (t.number_of_guests ?? 0), 0),
      sales: (thisMonthSales ?? []).map((s) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service: (s.services as any)?.name ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: (s.clients as any)?.name ?? "",
        date: s.date,
        guests: s.number_of_guests,
        status: s.status,
      })),
      expenses: monthExpenses.toFixed(2),
      earnings: monthEarnings.toFixed(2),
      transactions: (thisMonthTx ?? []).map((t) => ({
        supplier: t.supplier,
        amount: t.total_cost,
        date: t.date,
        who_paid: t.who_paid,
        status: t.status,
      })),
    },
    thisYear: {
      salesCount: (thisYearSales ?? []).length,
      totalGuests: (thisYearSales ?? []).reduce((s, t) => s + (t.number_of_guests ?? 0), 0),
    },
    recentSales: (recentSales ?? []).slice(0, 10).map((s) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: (s.services as any)?.name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: (s.clients as any)?.name ?? "",
      date: s.date,
      guests: s.number_of_guests,
      status: s.status,
      expensesClosed: s.expenses_closed === "Closed",
    })),
    crm: {
      totalAccounts: (pipeline ?? []).length,
      byStage: pipelineByStage,
      recentAccounts: (pipeline ?? []).slice(0, 10).map((a) => ({
        name: a.name,
        stage: a.stage,
        industry: a.industry,
        country: a.country,
        lastContacted: a.last_contacted_at,
        notes: a.notes,
      })),
    },
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  if (!messages?.length) {
    return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
  }

  let snapshot: Awaited<ReturnType<typeof getBusinessSnapshot>>;
  try {
    snapshot = await getBusinessSnapshot();
  } catch {
    snapshot = { today: new Date().toISOString().split("T")[0] } as never;
  }

  const systemPrompt = `You are the business assistant for COME Porto, a premium food tours and corporate events company based in Porto, Portugal. You have access to real-time business data shown below.

Answer questions about the company's operations, sales, finances, CRM pipeline, and team. Be concise and precise. Use numbers when available. Respond in the same language the user writes in (Portuguese if they write in Portuguese, English if in English).

Current business data (today: ${snapshot.today}):
${JSON.stringify(snapshot, null, 2)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\nErro: ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
