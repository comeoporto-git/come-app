import { googleApiErrorMessage } from "./gmail";
/** Read-only Google Calendar client used for availability (e.g. Bernardo's "OUT" days). */

export type CalendarEvent = {
  id: string;
  title: string;
  /** yyyy-mm-dd of the first day */
  startDate: string;
  /** yyyy-mm-dd of the last day (inclusive) */
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

const TZ = "Europe/Lisbon";

function localDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function minusOneDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Events overlapping [from, to] (yyyy-mm-dd, inclusive). */
export async function listCalendarEvents(token: string, from: string, to: string, calendarId = "primary"): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: `${from}T00:00:00Z`,
    timeMax: `${to}T23:59:59Z`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
    timeZone: TZ,
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(googleApiErrorMessage("Google Calendar", "calendar-json.googleapis.com", res.status, await res.text().catch(() => "")));
  const data = (await res.json()) as {
    items?: { id: string; summary?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[];
  };
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const allDay = !!e.start?.date;
      const startDate = allDay ? e.start!.date! : localDate(e.start?.dateTime ?? "");
      // All-day end dates are exclusive in the Calendar API.
      const endDate = allDay ? minusOneDay(e.end?.date ?? e.start!.date!) : localDate(e.end?.dateTime ?? e.start?.dateTime ?? "");
      return {
        id: e.id,
        title: e.summary ?? "",
        startDate,
        endDate: endDate < startDate ? startDate : endDate,
        allDay,
        startTime: allDay ? null : localTime(e.start!.dateTime!),
        endTime: allDay ? null : localTime(e.end?.dateTime ?? e.start!.dateTime!),
      };
    });
}

/** Events whose title starts with "OUT" / "out" mark days Bernardo is away. */
export function isOutEvent(e: CalendarEvent): boolean {
  return /^\s*out\b/i.test(e.title);
}

export function eventCoversDate(e: CalendarEvent, ymd: string): boolean {
  return e.startDate <= ymd && ymd <= e.endDate;
}
