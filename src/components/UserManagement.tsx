"use client";

import { useState } from "react";
import { updateTeamMemberRoleAction, adminUpdateTeamMemberContactAction, createTeamMemberAction } from "@/actions/team";
import type { TeamMember } from "@/lib/notion";

const ALL_ROLES: TeamMember["role"][] = [
  "Admin",
  "Super Guide",
  "Guide",
  "Chef",
  "Driver",
  "Logistics",
  "Accountant",
];

const ROLE_COLORS: Record<TeamMember["role"], string> = {
  Admin:         "bg-purple-100 text-purple-700",
  "Super Guide": "bg-blue-100 text-blue-700",
  Guide:         "bg-green-100 text-green-700",
  Chef:          "bg-orange-100 text-orange-700",
  Driver:        "bg-slate-100 text-slate-700",
  Logistics:     "bg-cyan-100 text-cyan-700",
  Accountant:    "bg-gray-100 text-gray-600",
};

export function UserManagement({ members: initialMembers }: { members: TeamMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [showAddForm, setShowAddForm] = useState(false);

  function handleMemberUpdated(updated: Partial<TeamMember> & { id: string }) {
    setMembers((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
    );
  }

  function handleMemberAdded(member: TeamMember) {
    setMembers((prev) => [...prev, member]);
    setShowAddForm(false);
  }

  return (
    <div>
      {showAddForm ? (
        <AddMemberForm
          onCancel={() => setShowAddForm(false)}
          onAdded={handleMemberAdded}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-5 py-3 text-sm text-[#667470] font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 border-b border-gray-50"
        >
          <span className="text-lg leading-none">+</span>
          Adicionar membro
        </button>
      )}

      <ul className="divide-y divide-gray-50">
        {members.map((m) => (
          <UserRow key={m.id} member={m} onUpdated={handleMemberUpdated} />
        ))}
      </ul>
    </div>
  );
}

function UserRow({
  member,
  onUpdated,
}: {
  member: TeamMember;
  onUpdated: (updated: Partial<TeamMember> & { id: string }) => void;
}) {
  const [role, setRole] = useState<TeamMember["role"]>(member.role);
  const [savingRole, setSavingRole] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone);
  const [iban, setIban] = useState(member.iban);

  async function handleRoleChange(newRole: TeamMember["role"]) {
    if (newRole === role) { setEditingRole(false); return; }
    setSavingRole(true);
    const result = await updateTeamMemberRoleAction(member.id, newRole);
    if (!result.error) {
      setRole(newRole);
      onUpdated({ id: member.id, role: newRole });
      setEditingRole(false);
    }
    setSavingRole(false);
  }

  async function handleContactSave() {
    setSavingContact(true);
    setContactError(null);
    const result = await adminUpdateTeamMemberContactAction(member.id, { email, phone, iban });
    if (result.error) {
      setContactError(result.error);
    } else {
      onUpdated({ id: member.id, email, phone, iban });
      setEditingContact(false);
    }
    setSavingContact(false);
  }

  function handleContactCancel() {
    setEmail(member.email);
    setPhone(member.phone);
    setIban(member.iban);
    setContactError(null);
    setEditingContact(false);
  }

  const initials = member.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-[#667470]/15 flex items-center justify-center text-xs font-bold text-[#667470] flex-shrink-0">
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#32373c] truncate">{member.name}</p>
          <p className="text-xs text-gray-400 truncate">{email || <span className="italic text-gray-300">sem email</span>}</p>
          {iban && (
            <p className="text-xs text-gray-400 font-mono truncate">{iban}</p>
          )}
        </div>

        {/* Edit contact button */}
        <button
          onClick={() => { setEditingContact(true); setEditingRole(false); }}
          className="text-xs text-gray-300 hover:text-[#667470] transition-colors flex-shrink-0 px-1"
          title="Editar contacto"
        >
          ✏️
        </button>

        {/* Role badge / editor */}
        <div className="flex-shrink-0">
          {editingRole ? (
            <div className="flex items-center gap-2">
              <select
                defaultValue={role}
                disabled={savingRole}
                onChange={(e) => handleRoleChange(e.target.value as TeamMember["role"])}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white disabled:opacity-50"
                autoFocus
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {savingRole && (
                <div className="w-3.5 h-3.5 border-2 border-[#667470]/30 border-t-[#667470] rounded-full animate-spin" />
              )}
              {!savingRole && (
                <button
                  onClick={() => setEditingRole(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setEditingRole(true); setEditingContact(false); }}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-opacity hover:opacity-75 ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-500"}`}
              title="Clica para alterar o role"
            >
              {role}
            </button>
          )}
        </div>
      </div>

      {/* Inline contact editor */}
      {editingContact && (
        <div className="mt-3 ml-12 flex flex-col gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 w-full"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone"
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 w-full"
          />
          <input
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="IBAN"
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 font-mono w-full"
          />
          {contactError && <p className="text-xs text-red-500">{contactError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleContactSave}
              disabled={savingContact}
              className="flex-1 text-xs bg-[#667470] text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50 hover:bg-[#556360] transition-colors"
            >
              {savingContact ? "A guardar…" : "Guardar"}
            </button>
            <button
              onClick={handleContactCancel}
              disabled={savingContact}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddMemberForm({
  onCancel,
  onAdded,
}: {
  onCancel: () => void;
  onAdded: (member: TeamMember) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");
  const [role, setRole] = useState<TeamMember["role"]>("Guide");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createTeamMemberAction({ name, email, phone, iban, role });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onAdded({
      id: Date.now().toString(),
      name, email, phone, iban, role,
      nif: "",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-gray-100 bg-gray-50/60 flex flex-col gap-2.5">
      <p className="text-xs font-semibold text-[#32373c] mb-0.5">Novo membro</p>
      <input
        required
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome *"
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white w-full"
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email *"
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white w-full"
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Telefone"
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white w-full"
      />
      <input
        type="text"
        value={iban}
        onChange={(e) => setIban(e.target.value)}
        placeholder="IBAN"
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white font-mono w-full"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as TeamMember["role"])}
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white w-full"
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 mt-0.5">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 text-xs bg-[#667470] text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50 hover:bg-[#556360] transition-colors"
        >
          {saving ? "A criar…" : "Criar membro"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
