"use client";

import { useState } from "react";
import { updateTeamMemberRoleAction } from "@/actions/team";
import type { TeamMember } from "@/lib/notion";

const ALL_ROLES: TeamMember["role"][] = [
  "Admin",
  "Super Guide",
  "Guide",
  "Chef",
  "Accountant",
];

const ROLE_COLORS: Record<TeamMember["role"], string> = {
  Admin:       "bg-purple-100 text-purple-700",
  "Super Guide": "bg-blue-100 text-blue-700",
  Guide:       "bg-green-100 text-green-700",
  Chef:        "bg-orange-100 text-orange-700",
  Accountant:  "bg-gray-100 text-gray-600",
};

export function UserManagement({ members }: { members: TeamMember[] }) {
  return (
    <ul className="divide-y divide-gray-50">
      {members.map((m) => (
        <UserRow key={m.id} member={m} />
      ))}
    </ul>
  );
}

function UserRow({ member }: { member: TeamMember }) {
  const [role, setRole] = useState<TeamMember["role"]>(member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function handleRoleChange(newRole: TeamMember["role"]) {
    if (newRole === role) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    const result = await updateTeamMemberRoleAction(member.id, newRole);
    if (result.error) {
      setError(result.error);
    } else {
      setRole(newRole);
      setEditing(false);
    }
    setSaving(false);
  }

  const initials = member.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <li className="px-5 py-3.5 flex items-center gap-3">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-[#667470]/15 flex items-center justify-center text-xs font-bold text-[#667470] flex-shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#32373c] truncate">{member.name}</p>
        <p className="text-xs text-gray-400 truncate">{member.email}</p>
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>

      {/* Role badge / editor */}
      <div className="flex-shrink-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <select
              defaultValue={role}
              disabled={saving}
              onChange={(e) => handleRoleChange(e.target.value as TeamMember["role"])}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white disabled:opacity-50"
              autoFocus
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {saving && (
              <div className="w-3.5 h-3.5 border-2 border-[#667470]/30 border-t-[#667470] rounded-full animate-spin" />
            )}
            {!saving && (
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-opacity hover:opacity-75 ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-500"}`}
            title="Clica para alterar o role"
          >
            {role}
          </button>
        )}
      </div>
    </li>
  );
}
