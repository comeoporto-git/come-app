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
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const SALE_SELECT = `id, date, status, number_of_guests, expenses_closed, start_time, end_time,
    services(name, type, equipa),
    clients(name),
    guide:guide_id(name),
    chef:chef_id(name)`;

  const [
    { data: upcomingSales },
    { data: thisMonthSales },
    { data: thisYearSales },
    { data: thisMonthTx },
    { data: thisYearTx },
    { data: pipeline },
    { data: team },
    { data: services },
  ] = await Promise.all([
    // All bookings from today + 90 days (for availability queries)
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("date", todayStr)
      .lte("date", in90Days)
      .neq("status", "Cancelado")
      .order("date", { ascending: true }),
    // This month (past + today) for financial/ops stats
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("date", thisMonthStart)
      .lte("date", todayStr),
    // YTD count
    supabase
      .from("sales")
      .select("id, date, number_of_guests")
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
      .from("services")
      .select("id, name, type, equipa")
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapSale(s: any) {
    return {
      service: s.services?.name ?? "",
      serviceType: s.services?.type ?? "",
      requiredRoles: s.services?.equipa ?? [],
      client: s.clients?.name ?? "",
      date: s.date,
      guests: s.number_of_guests,
      status: s.status,
      startTime: s.start_time ?? null,
      endTime: s.end_time ?? null,
      guide: s.guide?.name ?? null,
      chef: s.chef?.name ?? null,
    };
  }

  return {
    today: todayStr,
    upcomingWindowEnd: in90Days,
    company: "COME Porto — Premium food tours and corporate events company based in Porto, Portugal",
    team: (team ?? []).map((m) => ({ name: m.name, role: m.role })),
    services: (services ?? []).map((sv) => ({
      name: sv.name,
      type: sv.type,
      requiredRoles: sv.equipa ?? [],
    })),
    upcoming: {
      salesCount: (upcomingSales ?? []).length,
      bookings: (upcomingSales ?? []).map(mapSale),
    },
    thisMonth: {
      salesCount: (thisMonthSales ?? []).length,
      totalGuests: (thisMonthSales ?? []).reduce((s, t) => s + (t.number_of_guests ?? 0), 0),
      sales: (thisMonthSales ?? []).map(mapSale),
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

  const systemPrompt = `You are the business assistant for COME Porto, a premium food tours and corporate events company based in Porto, Portugal.

You have access to real-time business data including ALL upcoming bookings for the next 90 days (in snapshot.upcoming.bookings). Use this data to answer questions precisely.

## Availability rules
- **Maximum 2 services per day** — this is a hard business rule. If a date already has 2 active bookings (status != Cancelado), it is FULL and no more services can be added.
- To check availability for a specific date: count all entries in snapshot.upcoming.bookings where `date` matches. If count >= 2 → NOT available. If count < 2 → available (subject to guide/chef assignment).
- Always state clearly how many bookings already exist on that date and whether the limit has been reached.
- The team list (snapshot.team) shows all available staff and their roles.

## General rules
- Be concise and precise. Use the actual data, never guess.
- When the data doesn't cover something (e.g., external calendars, Calendly, real-time guide availability), say so clearly.
- Respond in the same language the user writes in (Portuguese if they write Portuguese, English if English).

Current business data (today: ${snapshot.today}, upcoming window until: ${snapshot.upcomingWindowEnd}):
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
