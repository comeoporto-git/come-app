"use client";

import { useState } from "react";
import { updateTourTeamAction } from "@/actions/transactions";
import type { ExtraTeamMember, TeamMember, TeamSlotRole } from "@/lib/notion";

const ROLE_LABELS: { role: TeamSlotRole; label: string }[] = [
  { role: "Guide",     label: "Guia" },
  { role: "Chef",      label: "Chef" },
  { role: "Driver",    label: "Driver" },
  { role: "Logistics", label: "Logistics" },
  { role: "Decorador", label: "Decorador" },
];

// An extra member row while editing. `key` keeps React rows stable when one is removed.
type ExtraRow = { key: number; teamId: string; role: TeamSlotRole };

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
  decoradorId,
  decoradorName,
  decoradorPhone,
  extraTeam,
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
  decoradorId: string | null;
  decoradorName: string;
  decoradorPhone?: string;
  extraTeam: ExtraTeamMember[];
  teamMembers: TeamMember[];
}) {
  const initialExtras = (): ExtraRow[] =>
    extraTeam.map((m, i) => ({ key: i, teamId: m.teamId, role: m.role }));

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide]         = useState(guideId      ?? "");
  const [selectedChef, setSelectedChef]           = useState(chefId       ?? "");
  const [selectedDriver, setSelectedDriver]       = useState(driverId     ?? "");
  const [selectedLogistics, setSelectedLogistics] = useState(logisticsId  ?? "");
  const [selectedDecorador, setSelectedDecorador] = useState(decoradorId  ?? "");
  const [extras, setExtras] = useState<ExtraRow[]>(initialExtras);
  const [nextKey, setNextKey] = useState(extraTeam.length);
  const [pickingRole, setPickingRole] = useState(false);

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
        selectedDecorador  || null,
        extras.filter((e) => e.teamId).map(({ teamId, role }) => ({ teamId, role })),
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
    setSelectedDecorador(decoradorId  ?? "");
    setExtras(initialExtras());
    setPickingRole(false);
    setEditing(false);
  }

  function addExtra(role: TeamSlotRole) {
    setExtras((prev) => [...prev, { key: nextKey, teamId: "", role }]);
    setNextKey((k) => k + 1);
    setPickingRole(false);
  }

  function updateExtra(key: number, teamId: string) {
    setExtras((prev) => prev.map((e) => (e.key === key ? { ...e, teamId } : e)));
  }

  function removeExtra(key: number) {
    setExtras((prev) => prev.filter((e) => e.key !== key));
  }

  const phoneFor = (id: string) =>
    teamMembers.find((m) => m.id === id)?.phone ?? undefined;

  const primaries: Record<TeamSlotRole, { value: string; onChange: (id: string) => void; name: string; phone?: string }> = {
    Guide:     { value: selectedGuide,     onChange: setSelectedGuide,     name: guideName,     phone: guidePhone },
    Chef:      { value: selectedChef,      onChange: setSelectedChef,      name: chefName,      phone: chefPhone },
    Driver:    { value: selectedDriver,    onChange: setSelectedDriver,    name: driverName,    phone: driverPhone },
    Logistics: { value: selectedLogistics, onChange: setSelectedLogistics, name: logisticsName, phone: logisticsPhone },
    Decorador: { value: selectedDecorador, onChange: setSelectedDecorador, name: decoradorName, phone: decoradorPhone },
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        {ROLE_LABELS.map(({ role, label }) => {
          const extrasForRole = extraTeam.filter((m) => m.role === role);
          const primary = primaries[role];
          const people = [
            ...(primary.name ? [{ key: "primary", name: primary.name, phone: primary.phone }] : []),
            ...extrasForRole.map((m) => ({ key: m.teamId, name: m.name || "—", phone: phoneFor(m.teamId) })),
          ];
          if (people.length === 0) return <TeamRow key={role} label={label} value="—" />;
          return (
            <div key={role}>
              {people.map((p, i) => (
                <TeamRow key={p.key} label={i === 0 ? label : undefined} value={p.name} phone={p.phone} />
              ))}
            </div>
          );
        })}
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
      {ROLE_LABELS.map(({ role, label }) => (
        <div key={role} className="space-y-2">
          <TeamSelect
            label={label}
            value={primaries[role].value}
            onChange={primaries[role].onChange}
            members={teamMembers}
          />
          {extras.filter((e) => e.role === role).map((e) => (
            <div key={e.key} className="flex items-center gap-2">
              <div className="flex-1">
                <TeamSelect
                  value={e.teamId}
                  onChange={(id) => updateExtra(e.key, id)}
                  members={teamMembers}
                  ariaLabel={`${label} adicional`}
                />
              </div>
              <button
                type="button"
                onClick={() => removeExtra(e.key)}
                className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-gray-50 flex-shrink-0"
                aria-label={`Remover ${label} adicional`}
                title="Remover"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ))}

      {pickingRole ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-2">
          <p className="text-xs text-gray-500 mb-2 px-1">Que função quer adicionar?</p>
          <div className="flex flex-wrap gap-2">
            {ROLE_LABELS.map(({ role, label }) => (
              <button
                key={role}
                type="button"
                onClick={() => addExtra(role)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickingRole(false)}
              className="text-xs text-gray-400 px-2 py-1.5 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickingRole(true)}
          className="w-full flex items-center justify-center gap-1 border border-dashed border-gray-300 text-[#667470] text-xs font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <span className="text-base leading-none">+</span> Adicionar membro
        </button>
      )}

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

function TeamRow({ label, value, phone }: { label?: string; value: string; phone?: string }) {
  return (
    <div className={label ? undefined : "mt-1"}>
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
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
  ariaLabel,
}: {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  members: TeamMember[];
  ariaLabel?: string;
}) {
  return (
    <div>
      {label && <label className="text-xs text-gray-500 mb-1 block">{label}</label>}
      <select
        aria-label={ariaLabel ?? label}
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
