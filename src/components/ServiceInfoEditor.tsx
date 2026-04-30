"use client";

import { useState } from "react";
import { updateTourServiceInfoAction } from "@/actions/transactions";

interface Props {
  tourId: string;
  status: string;
  serviceType?: string;
  serviceName?: string;
  clientName?: string;
  numGuests: number;
  names: string;
  phoneNumber: string;
  notes: string;
  meetingPoint: string;
}

export function ServiceInfoEditor({
  tourId,
  status,
  serviceType,
  serviceName,
  clientName,
  numGuests,
  names,
  phoneNumber,
  notes,
  meetingPoint,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftGuests,  setDraftGuests]  = useState(numGuests > 0 ? String(numGuests) : "");
  const [draftNames,   setDraftNames]   = useState(names);
  const [draftPhone,   setDraftPhone]   = useState(phoneNumber);
  const [draftNotes,   setDraftNotes]   = useState(notes);
  const [draftMeeting, setDraftMeeting] = useState(meetingPoint);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await updateTourServiceInfoAction(tourId, {
        numGuests: draftGuests ? Number(draftGuests) : null,
        names: draftNames,
        phoneNumber: draftPhone,
        notes: draftNotes,
        meetingPoint: draftMeeting,
      });
      if (result.error) {
        setError(result.error);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraftGuests(numGuests > 0 ? String(numGuests) : "");
    setDraftNames(names);
    setDraftPhone(phoneNumber);
    setDraftNotes(notes);
    setDraftMeeting(meetingPoint);
    setEditing(false);
  }

  const statusColor =
    status === "Confirmed" ? "bg-green-100 text-green-700" :
    status === "Pending"   ? "bg-yellow-100 text-yellow-700" :
    (status === "Cancelled" || status === "Canceled") ? "bg-red-100 text-red-700" :
    "bg-gray-100 text-gray-500";

  return (
    <div className="space-y-3">
      {/* Read-only fields always shown */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Estado</p>
        {status ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{status}</span>
        ) : (
          <p className="text-sm text-gray-800 font-medium">—</p>
        )}
      </div>

      {serviceType && <ReadField label="Tipo" value={serviceType} />}
      <ReadField label="Serviço" value={serviceName || "—"} />
      <ReadField label="Cliente" value={clientName || "—"} />

      {/* Editable fields */}
      {!editing ? (
        <>
          <ReadField label="Nº de Pax" value={numGuests ? String(numGuests) : "—"} />
          <ReadField label="Nomes"     value={names || "—"} />

          <div>
            <p className="text-xs text-gray-500 mb-1">Contacto</p>
            {phoneNumber ? (
              <a href={`tel:${phoneNumber}`} className="text-sm text-[#667470] font-medium hover:underline">
                {phoneNumber}
              </a>
            ) : (
              <p className="text-sm text-gray-800 font-medium">—</p>
            )}
          </div>

          <ReadField label="Notas" value={notes || "—"} />
          <div>
            <p className="text-xs text-gray-500 mb-1">Ponto de Encontro</p>
            {meetingPoint ? (
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(meetingPoint)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#667470] font-medium hover:underline flex items-center gap-1"
              >
                📍 {meetingPoint}
              </a>
            ) : (
              <p className="text-sm text-gray-800 font-medium">—</p>
            )}
          </div>

          <button
            onClick={() => setEditing(true)}
            className="mt-1 text-xs text-[#667470] font-semibold hover:underline"
          >
            Editar Informação do Serviço
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nº de Pax</label>
            <input
              type="number"
              min={0}
              value={draftGuests}
              onChange={(e) => setDraftGuests(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nomes</label>
            <input
              type="text"
              value={draftNames}
              onChange={(e) => setDraftNames(e.target.value)}
              placeholder="Nomes dos participantes"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Contacto</label>
            <input
              type="tel"
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder="+351 ..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas</label>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              rows={3}
              placeholder="Notas adicionais..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ponto de Encontro</label>
            <input
              type="text"
              value={draftMeeting}
              onChange={(e) => setDraftMeeting(e.target.value)}
              placeholder="Ex: Mercado do Bolhão, entrada principal"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 bg-white"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-medium px-1">{error}</p>}

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
        </>
      )}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-800 font-medium whitespace-pre-line">{value}</p>
    </div>
  );
}
