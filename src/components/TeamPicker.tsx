"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTourTeamAction } from "@/actions/transactions";
import type { TeamMember } from "@/lib/notion";

export function TeamPicker({
  tourId,
  guideId,
  guideName,
  chefId,
  chefName,
  driverId,
  driverName,
  teamMembers,
}: {
  tourId: string;
  guideId: string | null;
  guideName: string;
  chefId: string | null;
  chefName: string;
  driverId: string | null;
  driverName: string;
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedGuide, setSelectedGuide]   = useState(guideId  ?? "");
  const [selectedChef, setSelectedChef]     = useState(chefId   ?? "");
  const [selectedDriver, setSelectedDriver] = useState(driverId ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await updateTourTeamAction(
        tourId,
        selectedGuide  || null,
        selectedChef   || null,
        selectedDriver || null,
      );
      router.refresh();
      setEditing(false);
    } catch {
      // silent — page will still show stale data until next refresh
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setSelectedGuide(guideId   ?? "");
    setSelectedChef(chefId     ?? "");
    setSelectedDriver(driverId ?? "");
    setEditing(false);
  }

  const nameFor = (id: string) =>
    teamMembers.find((m) => m.id === id)?.name ?? "—";

  if (!editing) {
    return (
      <div className="space-y-3">
        <TeamRow label="Guia"   value={guideName  || "—"} />
        <TeamRow label="Chef"   value={chefName   || "—"} />
        <TeamRow label="Driver" value={driverName || "—"} />
        <button
          onClick={() => setEditing(true)}
          className="mt-1 text-xs text-[#667470] font-semibold hover:underline"
        >
          Editar Equipa
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TeamSelect
        label="Guia"
        value={selectedGuide}
        onChange={setSelectedGuide}
        members={teamMembers}
      />
      <TeamSelect
        label="Chef"
        value={selectedChef}
        onChange={setSelectedChef}
        members={teamMembers}
      />
      <TeamSelect
        label="Driver"
        value={selectedDriver}
        onChange={setSelectedDriver}
        members={teamMembers}
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-[#32373c] text-white text-xs font-semibold py-2 rounded-xl disabled:opacity-50 hover:bg-[#1a2018] transition-colors"
        >
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function TeamRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value}</p>
    </div>
  );
}

function TeamSelect({
  label,
  value,
  onChange,
  members,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  members: TeamMember[];
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white"
      >
        <option value="">— Nenhum —</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
