"use client";

import { useState } from "react";
import { updateTourTeamAction } from "@/actions/transactions";
import type { TeamMember } from "@/lib/notion";

export function TeamPicker({
  tourId,
  guideId,
  guideName,
  guidePhone,
  chefId,
  chefName,
  chefPhone,
  driverId,
  driverName,
  driverPhone,
  logisticsId,
  logisticsName,
  logisticsPhone,
  teamMembers,
}: {
  tourId: string;
  guideId: string | null;
  guideName: string;
  guidePhone?: string;
  chefId: string | null;
  chefName: string;
  chefPhone?: string;
  driverId: string | null;
  driverName: string;
  driverPhone?: string;
  logisticsId: string | null;
  logisticsName: string;
  logisticsPhone?: string;
  teamMembers: TeamMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide]         = useState(guideId      ?? "");
  const [selectedChef, setSelectedChef]           = useState(chefId       ?? "");
  const [selectedDriver, setSelectedDriver]       = useState(driverId     ?? "");
  const [selectedLogistics, setSelectedLogistics] = useState(logisticsId  ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await updateTourTeamAction(
        tourId,
        selectedGuide      || null,
        selectedChef       || null,
        selectedDriver     || null,
        selectedLogistics  || null,
      );
      if (result.error) {
        setError(result.error);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar equipa");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setSelectedGuide(guideId          ?? "");
    setSelectedChef(chefId            ?? "");
    setSelectedDriver(driverId        ?? "");
    setSelectedLogistics(logisticsId  ?? "");
    setEditing(false);
  }

  // Derive phone for currently selected members (used after editing)
  const phoneFor = (id: string) =>
    teamMembers.find((m) => m.id === id)?.phone ?? undefined;

  if (!editing) {
    return (
      <div className="space-y-3">
        <TeamRow label="Guia"       value={guideName      || "—"} phone={guidePhone} />
        <TeamRow label="Chef"       value={chefName       || "—"} phone={chefPhone} />
        <TeamRow label="Driver"     value={driverName     || "—"} phone={driverPhone} />
        <TeamRow label="Logistics"  value={logisticsName  || "—"} phone={logisticsPhone} />
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
      <TeamSelect
        label="Logistics"
        value={selectedLogistics}
        onChange={setSelectedLogistics}
        members={teamMembers}
      />
      {error && (
        <p className="text-xs text-red-500 font-medium px-1">{error}</p>
      )}
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

function PhoneIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function TeamRow({ label, value, phone }: { label: string; value: string; phone?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-800 font-medium flex-1">{value}</p>
        {phone && value !== "—" && (
          <a
            href={`tel:${phone}`}
            className="text-[#667470] hover:text-[#32373c] transition-colors p-1 rounded-lg hover:bg-gray-50 flex-shrink-0"
            aria-label={`Ligar para ${value}`}
            title={phone}
          >
            <PhoneIcon />
          </a>
        )}
      </div>
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
