"use client";

import { useState } from "react";
import { updateTeamMemberProfileAction } from "@/actions/team";
import type { TeamMember } from "@/lib/notion";

const ROLE_COLORS: Record<string, string> = {
  Admin:         "bg-purple-100 text-purple-700",
  "Super Guide": "bg-blue-100 text-blue-700",
  Guide:         "bg-green-100 text-green-700",
  Chef:          "bg-orange-100 text-orange-700",
  Accountant:    "bg-gray-100 text-gray-600",
};

export function ProfileForm({ member }: { member: TeamMember }) {
  const [name, setName]   = useState(member.name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const initials = member.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    const result = await updateTeamMemberProfileAction(member.id, {
      name: name.trim(),
      phone: phone.trim(),
    });
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  }

  const dirty = name.trim() !== member.name || phone.trim() !== (member.phone ?? "");

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-20 h-20 rounded-full bg-[#667470]/15 flex items-center justify-center text-2xl font-bold text-[#667470]">
          {initials}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${ROLE_COLORS[member.role] ?? "bg-gray-100 text-gray-500"}`}>
          {member.role}
        </span>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Os teus dados</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <Field label="Nome">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={member.email}
              readOnly
              className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"
            />
          </Field>

          <Field label="Telefone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 912 345 678"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
            />
          </Field>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600 text-center font-medium">✓ Dados guardados</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty || !name.trim()}
        className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm hover:bg-[#1a2018] transition-colors active:scale-[0.98] disabled:opacity-40"
      >
        {saving ? "A guardar…" : "Guardar"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
