// Client-safe pure helper — no supabase/server imports.
import { WEEKDAY_LABELS } from "@/lib/constants";

export type RestaurantHour = {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  closed: boolean;
};

export type OpenStatus = {
  weekday: string;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
  label: string;
};

/** Looks up whether a restaurant is open on the given date, from its weekly schedule. */
export function getOpenStatusForDate(hours: RestaurantHour[], date: Date): OpenStatus {
  const dayOfWeek = date.getDay();
  const weekday = WEEKDAY_LABELS[dayOfWeek];
  const row = hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!row || row.closed || !row.openTime || !row.closeTime) {
    return { weekday, closed: true, openTime: null, closeTime: null, label: `Fechado (${weekday})` };
  }
  return {
    weekday,
    closed: false,
    openTime: row.openTime,
    closeTime: row.closeTime,
    label: `Aberto ${row.openTime.slice(0, 5)}–${row.closeTime.slice(0, 5)} (${weekday})`,
  };
}
