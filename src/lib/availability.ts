import { supabase } from "@/lib/notion";
import { listCalendarEvents, isOutEvent, eventCoversDate, type CalendarEvent } from "@/lib/google-calendar";

/**
 * Availability for a date, from the app (sales already booked + business rules)
 * and the Google Calendar (events starting with "OUT" = Bernardo away).
 * Used by the inbox agent to answer "is X available on Y?" and by the AI Chat.
 */

export type DayAvailability = {
  date: string;
  weekday: string;
  operates: boolean;
  bookings: { saleId: string; service: string; guests: number; startTime: string | null; guide: string; status: string }[];
  totalBookings: number;
  maxPerDay: number | null;
  serviceBookings: number;
  serviceMaxPerDay: number | null;
  bernardoOut: boolean;
  calendarEvents: string[];
  freeGuides: string[];
  available: boolean;
  reasons: string[];
};

const WEEKDAYS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/\s+/g, " ").trim();

type Rule = { name: string; value: string };

function maxPerDay(rules: Rule[]): number | null {
  const r = rules.find((x) => /max\w*[\s_]+services?[\s_]+per[\s_]+day/i.test(x.name));
  const n = r ? parseInt(r.value, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function serviceMaxPerDay(rules: Rule[], serviceName: string): number | null {
  const target = norm(serviceName);
  if (!target) return null;
  for (const r of rules) {
    const m = r.name.match(/^ma[a-z]*\s+(.+?)\s+per\s+day$/i);
    if (!m || /^services?$/i.test(m[1])) continue;
    const ruleService = norm(m[1]);
    if (target === ruleService || target.includes(ruleService) || ruleService.includes(target)) {
      const n = parseInt(r.value, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** "Monday to Saturday" → {1..6}. Null when there is no such rule. */
function operatingDays(rules: Rule[]): Set<number> | null {
  const r = rules.find((x) => /days we operate|dias de funcionamento|operating days/i.test(x.name));
  if (!r) return null;
  const v = r.value.toLowerCase();
  const range = v.match(/(\w+)\s+(?:to|a|-|até)\s+(\w+)/);
  if (range) {
    const idx = (w: string) => {
      const en = WEEKDAYS_EN.findIndex((d) => d.startsWith(w.slice(0, 3)));
      return en >= 0 ? en : WEEKDAYS_PT.findIndex((d) => norm(d).startsWith(norm(w).slice(0, 3)));
    };
    const a = idx(range[1]), b = idx(range[2]);
    if (a >= 0 && b >= 0) {
      const set = new Set<number>();
      for (let i = a; ; i = (i + 1) % 7) {
        set.add(i);
        if (i === b) break;
      }
      return set;
    }
  }
  return null;
}

function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export async function getAvailability(opts: {
  dates: string[];
  serviceId?: string | null;
  serviceName?: string | null;
  /** Google token with calendar.readonly; without it the calendar is skipped. */
  calendarToken?: string | null;
  calendarId?: string;
}): Promise<{ days: DayAvailability[]; calendarChecked: boolean; calendarError?: string }> {
  const dates = [...new Set(opts.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!dates.length) return { days: [], calendarChecked: false };

  const [{ data: rulesRows }, { data: sales }, { data: team }, svc] = await Promise.all([
    supabase.from("business_rules").select("name, value"),
    supabase
      .from("sales")
      .select("id, date, status, number_of_guests, start_time, service_id, guide_id, services(name), guide:team!sales_guide_id_fkey(name), sale_team_members(team_id, role)")
      .in("date", dates)
      .neq("status", "Cancelled"),
    supabase.from("team").select("id, name, role").in("role", ["Guide", "Super Guide"]),
    opts.serviceId && !opts.serviceName
      ? supabase.from("services").select("name").eq("id", opts.serviceId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rules = (rulesRows ?? []) as Rule[];
  const serviceName = opts.serviceName ?? (svc.data as { name?: string } | null)?.name ?? "";

  let events: CalendarEvent[] = [];
  let calendarChecked = false;
  let calendarError: string | undefined;
  if (opts.calendarToken) {
    try {
      events = await listCalendarEvents(opts.calendarToken, dates[0], dates[dates.length - 1], opts.calendarId ?? "primary");
      calendarChecked = true;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
    }
  }

  const maxDay = maxPerDay(rules);
  const maxSvc = serviceName ? serviceMaxPerDay(rules, serviceName) : null;
  const opDays = operatingDays(rules);
  const guides = (team ?? []) as { id: string; name: string; role: string }[];
  const bernardo = guides.find((g) => /bernardo/i.test(g.name));

  const days = dates.map((date): DayAvailability => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const daySales = ((sales ?? []) as any[]).filter((s) => String(s.date).slice(0, 10) === date);
    const bookedGuideIds = new Set<string>();
    for (const s of daySales) {
      if (s.guide_id) bookedGuideIds.add(s.guide_id);
      for (const m of s.sale_team_members ?? []) if (m.role === "Guide") bookedGuideIds.add(m.team_id);
    }
    const dayEvents = events.filter((e) => eventCoversDate(e, date));
    const bernardoOut = dayEvents.some(isOutEvent);
    const freeGuides = guides
      .filter((g) => !bookedGuideIds.has(g.id))
      .filter((g) => !(bernardoOut && bernardo && g.id === bernardo.id))
      .map((g) => g.name.trim());
    const serviceBookings = opts.serviceId ? daySales.filter((s) => s.service_id === opts.serviceId).length : 0;
    const wd = weekdayOf(date);
    const operates = opDays ? opDays.has(wd) : true;

    const reasons: string[] = [];
    if (!operates) reasons.push(`Não operamos à ${WEEKDAYS_PT[wd]}`);
    if (maxDay !== null && daySales.length >= maxDay) reasons.push(`Já há ${daySales.length} serviços (máximo ${maxDay} por dia)`);
    if (maxSvc !== null && serviceBookings >= maxSvc) reasons.push(`Já há ${serviceBookings} "${serviceName}" (máximo ${maxSvc} por dia)`);
    if (freeGuides.length === 0) reasons.push("Nenhum guia livre");
    if (bernardoOut) reasons.push(freeGuides.length ? "Bernardo fora (OUT) — usar outro guia" : "Bernardo fora (OUT)");

    const blocking = !operates || (maxDay !== null && daySales.length >= maxDay) || (maxSvc !== null && serviceBookings >= maxSvc) || freeGuides.length === 0;

    return {
      date,
      weekday: WEEKDAYS_PT[wd],
      operates,
      bookings: daySales.map((s) => ({
        saleId: s.id,
        service: s.services?.name ?? "",
        guests: s.number_of_guests ?? 0,
        startTime: s.start_time ? String(s.start_time).slice(0, 5) : null,
        guide: s.guide?.name ?? "",
        status: s.status ?? "",
      })),
      totalBookings: daySales.length,
      maxPerDay: maxDay,
      serviceBookings,
      serviceMaxPerDay: maxSvc,
      bernardoOut,
      calendarEvents: dayEvents.map((e) => (e.allDay ? e.title : `${e.startTime}-${e.endTime} ${e.title}`)),
      freeGuides,
      available: !blocking,
      reasons,
    };
  });

  return { days, calendarChecked, calendarError };
}
