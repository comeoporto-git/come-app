// Client-safe pure helper — no supabase/server imports.
import { WEEKDAY_LABELS } from "@/lib/constants";

export type RestaurantHour = {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  openTime2: string | null;
  closeTime2: string | null;
  closed: boolean;
};

export type OpenStatus = {
  weekday: string;
  closed: boolean;
  label: string;
};

/** True when a day's row has no usable time range (closed or missing first range). */
export function isRowClosed(row: RestaurantHour | undefined): boolean {
  return !row || row.closed || !row.openTime || !row.closeTime;
}

/** Formats a day's time range(s), e.g. "12:30–15:30, 19:30–00:00". Empty string if closed. */
export function formatDayHours(row: RestaurantHour | undefined): string {
  if (isRowClosed(row)) return "";
  const ranges = [`${row!.openTime!.slice(0, 5)}–${row!.closeTime!.slice(0, 5)}`];
  if (row!.openTime2 && row!.closeTime2) {
    ranges.push(`${row!.openTime2.slice(0, 5)}–${row!.closeTime2.slice(0, 5)}`);
  }
  return ranges.join(", ");
}

/** Looks up whether a restaurant is open on the given date, from its weekly schedule. */
export function getOpenStatusForDate(hours: RestaurantHour[], date: Date): OpenStatus {
  const dayOfWeek = date.getDay();
  const weekday = WEEKDAY_LABELS[dayOfWeek];
  const row = hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (isRowClosed(row)) {
    return { weekday, closed: true, label: `Fechado (${weekday})` };
  }
  return { weekday, closed: false, label: `Aberto ${formatDayHours(row)} (${weekday})` };
}
