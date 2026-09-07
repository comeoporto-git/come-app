import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTeamMembers } from "@/lib/notion";
import type { TeamMember } from "@/lib/notion";

const ROLE_COLORS: Record<TeamMember["role"], string> = {
  Admin:         "bg-purple-100 text-purple-700",
  "Super Guide": "bg-blue-100 text-blue-700",
  Guide:         "bg-green-100 text-green-700",
  Chef:          "bg-orange-100 text-orange-700",
  Driver:        "bg-slate-100 text-slate-700",
  Logistics:     "bg-cyan-100 text-cyan-700",
  Accountant:    "bg-gray-100 text-gray-600",
};

const ROLE_ORDER: TeamMember["role"][] = [
  "Admin",
  "Super Guide",
  "Guide",
  "Chef",
  "Driver",
  "Logistics",
  "Accountant",
];

export default async function TodaEquipaPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const members = await getTeamMembers();

  const grouped = ROLE_ORDER.reduce<Record<string, TeamMember[]>>((acc, role) => {
    const group = members.filter((m) => m.role === role);
    if (group.length > 0) acc[role] = group;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-[#32373c]">Toda a Equipa</h1>
            <p className="text-xs text-gray-400 mt-0.5">{members.length} membros</p>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {ROLE_ORDER.filter((r) => grouped[r]).map((role) => (
              <span
                key={role}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role]}`}
              >
                {grouped[role].length} {role}
              </span>
            ))}
          </div>
        </div>

        {/* Groups */}
        {ROLE_ORDER.filter((r) => grouped[r]).map((role) => (
          <section key={role} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${ROLE_COLORS[role]}`}>
                {role}
              </span>
              <span className="text-xs text-gray-400">{grouped[role].length} membros</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {grouped[role].map((m) => {
                const initials = m.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <li key={m.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#667470]/15 flex items-center justify-center text-xs font-bold text-[#667470] flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#32373c]">{m.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {m.email || <span className="italic text-gray-300">sem email</span>}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right space-y-0.5">
                      {m.phone && (
                        <p className="text-xs text-gray-400">{m.phone}</p>
                      )}
                      {m.iban && (
                        <p className="text-xs text-gray-300 font-mono">{m.iban}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {members.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-gray-400 text-sm">
            Sem membros na equipa
          </div>
        )}
      </main>
    </div>
  );
}
