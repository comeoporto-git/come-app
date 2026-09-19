// Client-safe pure helper — no supabase/server imports.
export type CatalogEntry = { id: string; name: string; type: string; durationMinutes: number | null };

// Pinned first, in this order; everything else follows alphabetically, with "Outros" always last.
const TYPE_PRIORITY = ["Tour", "Cooking Class"];

export function groupByType<T extends CatalogEntry>(services: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const s of services) {
    const key = s.type || "Outros";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "Outros") return 1;
    if (b === "Outros") return -1;
    const aPriority = TYPE_PRIORITY.indexOf(a);
    const bPriority = TYPE_PRIORITY.indexOf(b);
    if (aPriority !== -1 || bPriority !== -1) {
      if (aPriority === -1) return 1;
      if (bPriority === -1) return -1;
      return aPriority - bPriority;
    }
    return a.localeCompare(b, "pt-PT");
  });
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}min`;
}
