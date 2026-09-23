"use client";

import { TEAM_PAYMENT_METHOD_ROLE } from "@/lib/constants";
import type { TeamSlotRole } from "@/lib/notion";

/** Everyone on a service, one entry per role they fill (primary slot first). */
export type ServicePerson = { teamId: string; name: string; role: TeamSlotRole };

/** People on the service who could have paid with this "Pelo …" method. */
export function peopleForMethod(method: string, roster: ServicePerson[]): ServicePerson[] {
  const role = TEAM_PAYMENT_METHOD_ROLE[method];
  return role ? roster.filter((p) => p.role === role) : [];
}

// "Quem pagou?" — only shown when the role behind the chosen "Pelo …" method has
// more than one person on this service; otherwise the role's only person is implied.
export function WhoPaidPicker({
  paymentMethod,
  roster,
  value,
  onChange,
  className,
}: {
  paymentMethod: string;
  roster: ServicePerson[];
  value: string;
  onChange: (teamId: string) => void;
  className?: string;
}) {
  const people = peopleForMethod(paymentMethod, roster);
  if (people.length < 2) return null;
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">Quem pagou?</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"}
      >
        {people.map((p) => (
          <option key={p.teamId} value={p.teamId}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
