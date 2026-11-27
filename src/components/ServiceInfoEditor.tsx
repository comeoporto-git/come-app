"use client";

import { useState } from "react";
import Link from "next/link";
import { updateTourServiceInfoAction } from "@/actions/transactions";
import { MapsLink } from "@/components/MapsLink";
import { ChildrenInputs } from "@/components/pricing/ChildrenInputs";
import { NO_CHILDREN, childrenSummary, type Children } from "@/lib/pricing";

const STATUS_OPTIONS = ["Pending", "Confirmed", "Finalised", "Invoiced", "Paid", "Cancelled"];
const STATUS_COLORS: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending:   "bg-yellow-100 text-yellow-700",
  Finalised: "bg-blue-100 text-blue-700",
  Invoiced:  "bg-purple-100 text-purple-700",
  Paid:      "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-100 text-red-700",
  Canceled:  "bg-red-100 text-red-700",
};

interface Props {
  tourId: string;
  status: string;
  serviceType?: string;
  serviceName?: string;
  serviceId?: string;
  clientName?: string;
  clientId?: string;
  numGuests: number;
  names: string;
  phoneNumber: string;
  notes: string;
  meetingPoint: string;
  dietaryRestrictions?: string;
  mobilityRestrictions?: string;
  /** Only passed in for Admin / Super Guide. */
  emergencyContact?: string;
  notionId?: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  services?: { id: string; name: string; transportHours?: number | null }[];
  clients?: { id: string; name: string }[];
  /** Transport add-on booked for this service (Carro / Van / Autocarro). */
  transportVehicle?: string | null;
  /** Vehicles that can be booked as transport. */
  transportVehicles?: string[];
  /** Children among numGuests, by age band. */
  children?: Children;
}

export function ServiceInfoEditor({
  tourId,
  status,
  serviceType,
  serviceName,
  serviceId,
  clientName,
  clientId,
  numGuests,
  names,
  phoneNumber,
  notes,
  meetingPoint,
  dietaryRestrictions = "",
  mobilityRestrictions = "",
  emergencyContact = "",
  notionId,
  date,
  startTime,
  endTime,
  services = [],
  clients = [],
  transportVehicle = null,
  transportVehicles = [],
  children = NO_CHILDREN,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [newClient, setNewClient] = useState(false);

  const [draftStatus,    setDraftStatus]    = useState(status);
  const [draftNotionId,  setDraftNotionId]  = useState(notionId ?? "");
  const [draftServiceId, setDraftServiceId] = useState(serviceId ?? "");
  const [draftClientId,  setDraftClientId]  = useState(clientId ?? "");
  const [draftNewClient, setDraftNewClient] = useState("");
  const [draftDate,      setDraftDate]      = useState(date ?? "");
  const [draftStart,     setDraftStart]     = useState(startTime ?? "");
  const [draftEnd,       setDraftEnd]       = useState(endTime ?? "");
  const [draftGuests,    setDraftGuests]    = useState(numGuests > 0 ? String(numGuests) : "");
  const [draftNames,     setDraftNames]     = useState(names);
  const [draftPhone,     setDraftPhone]     = useState(phoneNumber);
  const [draftNotes,     setDraftNotes]     = useState(notes);
  const [draftMeeting,   setDraftMeeting]   = useState(meetingPoint);
  const [draftDietary,   setDraftDietary]   = useState(dietaryRestrictions);
  const [draftMobility,  setDraftMobility]  = useState(mobilityRestrictions);
  const [draftEmergency, setDraftEmergency] = useState(emergencyContact);
  const [draftTransport, setDraftTransport] = useState(transportVehicle ?? "");
  const [draftChildren,  setDraftChildren]  = useState<Children>(children);
  const currentTransportHours = services.find((s) => s.id === serviceId)?.transportHours ?? null;
  const draftTransportHours   = services.find((s) => s.id === draftServiceId)?.transportHours ?? null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let resolvedClientId = draftClientId || undefined;
      if (newClient && draftNewClient.trim()) {
        const { createNewClient } = await import("@/lib/notion");
        resolvedClientId = await createNewClient(draftNewClient.trim());
      }
      const result = await updateTourServiceInfoAction(tourId, {
        numGuests:   draftGuests ? Number(draftGuests) : null,
        names:       draftNames,
        phoneNumber: draftPhone,
        notes:       draftNotes,
        meetingPoint: draftMeeting,
        dietaryRestrictions:  draftDietary,
        mobilityRestrictions: draftMobility,
        emergencyContact:     draftEmergency,
        status:      draftStatus,
        notionId:    draftNotionId || undefined,
        serviceId:   draftServiceId || undefined,
        clientId:    resolvedClientId,
        date:        draftDate || undefined,
        startTime:   draftStart || null,
        endTime:     draftEnd   || null,
        transportVehicle: draftTransportHours ? (draftTransport || null) : null,
        children:    draftChildren,
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
    setDraftStatus(status);
    setDraftNotionId(notionId ?? "");
    setDraftServiceId(serviceId ?? "");
    setDraftClientId(clientId ?? "");
    setDraftNewClient("");
    setDraftDate(date ?? "");
    setDraftStart(startTime ?? "");
    setDraftEnd(endTime ?? "");
    setDraftGuests(numGuests > 0 ? String(numGuests) : "");
    setDraftNames(names);
    setDraftPhone(phoneNumber);
    setDraftNotes(notes);
    setDraftMeeting(meetingPoint);
    setDraftDietary(dietaryRestrictions);
    setDraftMobility(mobilityRestrictions);
    setDraftEmergency(emergencyContact);
    setDraftTransport(transportVehicle ?? "");
    setDraftChildren(children);
    setNewClient(false);
    setEditing(false);
  }

  const statusColor = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500";

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">Informação do Serviço</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Editar Informação do Serviço"
            title="Editar Informação do Serviço"
            className="text-gray-400 hover:text-[#667470] transition-colors p-1 flex-shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
              <path d="m15 5 4 4"></path>
            </svg>
          </button>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
      {!editing ? (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-1">Estado</p>
            {status ? (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{status}</span>
            ) : (
              <p className="text-sm text-gray-800 font-medium">—</p>
            )}
          </div>
          {serviceType && <ReadField label="Tipo" value={serviceType} />}
          <ReadField label="Serviço"  value={serviceName || "—"} />
          <div>
            <p className="text-xs text-gray-500 mb-1">Cliente</p>
            {clientId ? (
              <Link href={`/admin/crm/accounts/${clientId}`} className="text-sm font-medium text-[#667470] hover:underline">
                {clientName || "—"}
              </Link>
            ) : (
              <p className="text-sm text-gray-800 font-medium">{clientName || "—"}</p>
            )}
          </div>
          <ReadField label="Nº de Pax" value={numGuests ? String(numGuests) : "—"} />
          {childrenSummary(children) && <ReadField label="Crianças" value={childrenSummary(children)} />}
          {(transportVehicle || currentTransportHours) && (
            <ReadField
              label="Transporte"
              value={transportVehicle ? `${transportVehicle}${currentTransportHours ? ` (${currentTransportHours}h)` : ""}` : "Sem transporte"}
            />
          )}
          <ReadField label="Nomes"    value={names || "—"} />
          <div>
            <p className="text-xs text-gray-500 mb-1">Contacto</p>
            {phoneNumber ? (
              <a href={`tel:${phoneNumber}`} className="text-sm text-[#667470] font-medium hover:underline">{phoneNumber}</a>
            ) : (
              <p className="text-sm text-gray-800 font-medium">—</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Ponto de Encontro</p>
            {meetingPoint ? <MapsLink location={meetingPoint} /> : <p className="text-sm text-gray-800 font-medium">—</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Restrições Alimentares</p>
            <p className="text-sm font-bold text-red-600 whitespace-pre-line">{dietaryRestrictions || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Restrições de Mobilidade</p>
            <p className="text-sm font-bold text-red-600 whitespace-pre-line">{mobilityRestrictions || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Contacto de Emergência</p>
            <p className="text-sm text-gray-800 font-medium whitespace-pre-line">{emergencyContact || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Notas</p>
            <p className="text-sm font-bold text-red-600 whitespace-pre-line">{notes || "—"}</p>
          </div>
          {(date || startTime) && (
            <ReadField label="Horário" value={[date, startTime && endTime ? `${startTime} – ${endTime}` : startTime].filter(Boolean).join(" | ")} />
          )}
        </>
      ) : (
        <>
          {/* Status */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Estado</label>
            <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className="input">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Reference */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Referência</label>
            <input type="text" value={draftNotionId} onChange={(e) => setDraftNotionId(e.target.value)} placeholder="Ex: 2575, MyBookpack 001…" className="input" />
          </div>

          {/* Service */}
          {services.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Serviço</label>
              <select value={draftServiceId} onChange={(e) => setDraftServiceId(e.target.value)} className="input bg-white">
                <option value="">— Selecionar —</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Transport add-on */}
          {draftTransportHours !== null && transportVehicles.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Transporte ({draftTransportHours}h)</label>
              <select value={draftTransport} onChange={(e) => setDraftTransport(e.target.value)} className="input bg-white">
                <option value="">Sem transporte</option>
                {transportVehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Ao mudar o transporte, a faturação (IN-) é atualizada, exceto se o serviço já estiver faturado ou pago.</p>
            </div>
          )}

          {/* Client */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Cliente</label>
              <button type="button" onClick={() => { setNewClient(!newClient); setDraftNewClient(""); }} className="text-xs text-[#667470] font-medium hover:underline">
                {newClient ? "← Selecionar existente" : "+ Novo cliente"}
              </button>
            </div>
            {newClient ? (
              <input type="text" value={draftNewClient} onChange={(e) => setDraftNewClient(e.target.value)} placeholder="Nome do novo cliente…" className="input" />
            ) : (
              <select value={draftClientId} onChange={(e) => setDraftClientId(e.target.value)} className="input bg-white">
                <option value="">— Selecionar —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Data</label>
            <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className="input" />
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Hora de Início</label>
              <input type="time" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Hora de Fim</label>
              <input type="time" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} className="input" />
            </div>
          </div>

          {/* Guests */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nº de Pax</label>
            <input type="number" min={0} value={draftGuests} onChange={(e) => setDraftGuests(e.target.value)} placeholder="0" className="input" />
          </div>
          <ChildrenInputs value={draftChildren} onChange={setDraftChildren} totalGuests={draftGuests ? Number(draftGuests) : null} inputClassName="input" />
          <p className="text-xs text-gray-400 -mt-1">Ao mudar as crianças, a faturação (IN-) é atualizada, exceto se o serviço já estiver faturado ou pago.</p>

          {/* Names */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nomes</label>
            <input type="text" value={draftNames} onChange={(e) => setDraftNames(e.target.value)} placeholder="Nomes dos participantes" className="input" />
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Contacto</label>
            <input type="tel" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="+351 ..." className="input" />
          </div>

          {/* Meeting point */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ponto de Encontro</label>
            <input type="text" value={draftMeeting} onChange={(e) => setDraftMeeting(e.target.value)} placeholder="Ex: Mercado do Bolhão" className="input" />
          </div>

          {/* Restrictions */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Restrições Alimentares</label>
            <textarea value={draftDietary} onChange={(e) => setDraftDietary(e.target.value)} rows={2} placeholder="Ex: 1 vegetariano, alergia a marisco…" className="input resize-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Restrições de Mobilidade</label>
            <textarea value={draftMobility} onChange={(e) => setDraftMobility(e.target.value)} rows={2} placeholder="Ex: cadeira de rodas, dificuldade em escadas…" className="input resize-none" />
          </div>

          {/* Emergency contact (Admin / Super Guide only) */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Contacto de Emergência</label>
            <input type="text" value={draftEmergency} onChange={(e) => setDraftEmergency(e.target.value)} placeholder="Nome e telefone" className="input" />
            <p className="text-xs text-gray-400 mt-1">Visível apenas para Admin e Super Guide.</p>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas</label>
            <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={3} placeholder="Notas adicionais..." className="input resize-none" />
          </div>

          {error && <p className="text-xs text-red-500 font-medium px-1">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#32373c] text-white text-xs font-semibold py-2 rounded-xl disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
              {saving ? "A guardar…" : "Guardar"}
            </button>
            <button onClick={handleCancel} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          </div>
        </>
      )}
      </div>
    </>
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
