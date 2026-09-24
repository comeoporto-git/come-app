import type { Tour, TeamSlotRole } from "@/lib/notion";

/** Primary slot name plus any extra members in the same role (e.g. a second chef), joined for display. */
export function roleNames(tour: Pick<Tour, "extraTeam">, role: TeamSlotRole, primary?: string | null): string {
  const names = [primary, ...tour.extraTeam.filter((m) => m.role === role).map((m) => m.name)]
    .filter((n): n is string => !!n && n !== "—");
  return Array.from(new Set(names)).join(", ");
}
