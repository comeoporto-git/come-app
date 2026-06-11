import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBusinessSnapshot() {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const thisYearStart  = `${now.getFullYear()}-01-01`;
  const thisYearEnd    = `${now.getFullYear()}-12-31`;
  const lastYearStart  = `${now.getFullYear() - 1}-01-01`;
  const lastYearEnd    = `${now.getFullYear() - 1}-12-31`;
  const todayStr       = now.toISOString().split("T")[0];
  const in90Days       = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Join earning transactions per sale so revenue comes from actual earnings, not pricing estimates
  const SALE_SELECT = `id, date, status, number_of_guests, expenses_closed, start_time, end_time,
    services(name, type, equipa),
    clients(name),
    guide:guide_id(name),
    transactions!transactions_sale_id_fkey(id, valor, type)`;

  const [
    { data: upcomingSales },
    { data: thisMonthSales },
    { data: thisYearSales },
    { data: lastYearSales },
    { data: thisMonthTx },
    { data: thisYearTx },
    { data: lastYearTx },
    { data: pipeline },
    { data: team },
    { data: services },
    { data: rulesRows },
  ] = await Promise.all([
    // All bookings from today + 90 days (for availability queries)
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("date", todayStr)
      .lte("date", in90Days)
      .neq("status", "Cancelled")
      .order("date", { ascending: true }),
    // Full current month sales (past + future) for revenue projection
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("date", thisMonthStart)
      .lte("date", thisMonthEnd)
      .neq("status", "Cancelled"),
    // Full current year sales
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("date", thisYearStart)
      .lte("date", thisYearEnd)
      .neq("status", "Cancelled")
      .order("date", { ascending: true }),
    // Full last year sales
    supabase
      .from("sales")
      .select(SALE_SELECT)
      .gte("date", lastYearStart)
      .lte("date", lastYearEnd)
      .neq("status", "Cancelled")
      .order("date", { ascending: true }),
    // Full month transactions (earnings already recorded)
    supabase
      .from("transactions")
      .select("id, supplier, valor, date, who_paid, status, accountant_verified, type")
      .gte("date", thisMonthStart)
      .lte("date", thisMonthEnd),
    // Current year transactions
    supabase
      .from("transactions")
      .select("id, supplier, valor, date, who_paid, status, accountant_verified, type")
      .gte("date", thisYearStart)
      .lte("date", thisYearEnd),
    // Last year transactions
    supabase
      .from("transactions")
      .select("id, supplier, valor, date, who_paid, status, accountant_verified, type")
      .gte("date", lastYearStart)
      .lte("date", lastYearEnd),
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
    supabase
      .from("business_rules")
      .select("name, value, notes")
      .order("name"),
  ]);

  // type is stored as "Earning" or "Expense" (capital); valor is positive for earnings, negative for expenses
  const monthEarnings = (thisMonthTx ?? [])
    .filter((t) => t.type === "Earning")
    .reduce((s, t) => s + Math.abs(t.valor ?? 0), 0);
  const monthExpenses = (thisMonthTx ?? [])
    .filter((t) => t.type === "Expense")
    .reduce((s, t) => s + Math.abs(t.valor ?? 0), 0);

  // Pipeline summary
  const pipelineByStage: Record<string, number> = {};
  for (const acc of pipeline ?? []) {
    const s = acc.stage ?? "Prospect";
    pipelineByStage[s] = (pipelineByStage[s] ?? 0) + 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapSale(s: any) {
    // Revenue = sum of Earning transactions linked to this sale
    const txs: Array<{ valor: number; type: string }> = s.transactions ?? [];
    const revenue = txs
      .filter((t) => t.type === "Earning")
      .reduce((sum, t) => sum + Math.abs(t.valor ?? 0), 0);
    return {
      service: s.services?.name ?? "",
      client: s.clients?.name ?? "",
      date: s.date,
      guests: s.number_of_guests ?? 0,
      status: s.status,
      startTime: s.start_time ?? null,
      endTime: s.end_time ?? null,
      guide: s.guide?.name ?? null,
      revenue: revenue > 0 ? revenue : null,
    };
  }

  // Convert rules array to a plain object for easy AI consumption
  const rules: Record<string, string> = {};
  for (const r of rulesRows ?? []) rules[r.name] = r.value;

  return {
    today: todayStr,
    upcomingWindowEnd: in90Days,
    company: "COME Porto — Premium food tours and corporate events company based in Porto, Portugal",
    businessRules: rulesRows?.map((r) => ({ name: r.name, value: r.value, notes: r.notes })) ?? [],
    _rules: rules,
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
      // Revenue from Earning transactions linked to services this month
      projectedRevenue: (thisMonthSales ?? [])
        .map(mapSale)
        .reduce((s, t) => s + (t.revenue ?? 0), 0)
        .toFixed(2),
      // Recorded earnings = Earning transactions already entered this month
      recordedEarnings: monthEarnings.toFixed(2),
      recordedExpenses: monthExpenses.toFixed(2),
      sales: (thisMonthSales ?? []).map(mapSale),
      earningTransactions: (thisMonthTx ?? [])
        .filter((t) => t.type === "Earning")
        .map((t) => ({ supplier: t.supplier, amount: t.valor, date: t.date })),
      expenseTransactions: (thisMonthTx ?? [])
        .filter((t) => t.type === "Expense")
        .map((t) => ({ supplier: t.supplier, amount: Math.abs(t.valor ?? 0), date: t.date, who_paid: t.who_paid })),
    },
    thisYear: {
      year: now.getFullYear(),
      salesCount: (thisYearSales ?? []).length,
      totalGuests: (thisYearSales ?? []).reduce((s, t) => s + (t.number_of_guests ?? 0), 0),
      projectedRevenue: (thisYearSales ?? [])
        .map(mapSale)
        .reduce((s, t) => s + (t.revenue ?? 0), 0)
        .toFixed(2),
      recordedEarnings: (thisYearTx ?? [])
        .filter((t) => t.type === "Earning")
        .reduce((s, t) => s + Math.abs(t.valor ?? 0), 0)
        .toFixed(2),
      recordedExpenses: (thisYearTx ?? [])
        .filter((t) => t.type === "Expense")
        .reduce((s, t) => s + Math.abs(t.valor ?? 0), 0)
        .toFixed(2),
      // Full list so AI can filter by guide, month, service, etc.
      sales: (thisYearSales ?? []).map(mapSale),
    },
    lastYear: {
      year: now.getFullYear() - 1,
      salesCount: (lastYearSales ?? []).length,
      totalGuests: (lastYearSales ?? []).reduce((s, t) => s + (t.number_of_guests ?? 0), 0),
      recordedEarnings: (lastYearTx ?? [])
        .filter((t) => t.type === "Earning")
        .reduce((s, t) => s + Math.abs(t.valor ?? 0), 0)
        .toFixed(2),
      recordedExpenses: (lastYearTx ?? [])
        .filter((t) => t.type === "Expense")
        .reduce((s, t) => s + Math.abs(t.valor ?? 0), 0)
        .toFixed(2),
      sales: (lastYearSales ?? []).map(mapSale),
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

  const rules = snapshot._rules as Record<string, string>;
  const maxPerDay = parseInt(rules["max_services_per_day"] ?? "2", 10);
  const staleProspectDays = rules["prospect_stale_days"] ?? "30";

  // Build rules block dynamically from DB
  const rulesBlock = snapshot.businessRules.length > 0
    ? snapshot.businessRules
        .map((r) => `- **${r.name}** = ${r.value}${r.notes ? ` — ${r.notes}` : ""}`)
        .join("\n")
    : "- No rules configured in DB yet.";

  const systemPrompt = `You are the business assistant for COME Porto, a premium food tours and corporate events company based in Porto, Portugal.

You have access to complete business data: all sales from last year (snapshot.lastYear.sales), all sales from this year (snapshot.thisYear.sales), all upcoming bookings for the next 90 days (snapshot.upcoming.bookings), and financial transactions. Use this data to answer any historical or future question precisely — never say you don't have access to historical data.

## Business rules (from database — these are authoritative)
${rulesBlock}

## Availability check — STRICT PROTOCOL (follow exactly, in this order)
When asked about availability for a date + service:
1. Filter snapshot.upcoming.bookings for that exact date.
2. Count the results (N).
3. Check service-specific rules first (e.g. "Maximum Cooking Class at Chefs House per day = 1" means max 1 of that service).
4. Then check the general limit: max_services_per_day = ${maxPerDay} (total across all services).
5. **Decide BEFORE writing your answer**: if N >= limit → NOT available. If N < limit → available.
6. **State the conclusion in your very first sentence** — do NOT lead with "yes" and then correct yourself. Example: "Não há disponibilidade no dia X — já temos N serviços marcados (limite: ${maxPerDay})."
7. List the existing bookings on that day as supporting evidence after the conclusion.

## Other rules
- **Stale prospects**: a CRM prospect is stale if last_contacted_at is more than ${staleProspectDays} days ago.
- The team list (snapshot.team) shows all available staff and their roles.

## Revenue / Faturação
- **thisMonth.projectedRevenue**: sum of Earning transactions linked to all services this month. Use this to answer "quanto vamos faturar este mês / em junho".
- **thisMonth.recordedEarnings**: same Earning transactions aggregated at the month level (cross-check).
- Each sale in thisMonth.sales has a \`revenue\` field (€) = sum of its own Earning transactions.
- If revenue is null for a sale, no earnings have been registered for it yet.
- When answering revenue questions, use projectedRevenue as the total and list per-service breakdown from sales[].revenue.

## General
- Be concise and precise. Use the actual data, never guess.
- When the data doesn't cover something (e.g., external calendars, real-time guide availability), say so clearly.
- Respond in the same language the user writes in (Portuguese if they write Portuguese, English if English).

Current business data (today: ${snapshot.today}, data covers: ${snapshot.lastYear.year} full year + ${snapshot.thisYear.year} full year + upcoming window until ${snapshot.upcomingWindowEnd}):
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
