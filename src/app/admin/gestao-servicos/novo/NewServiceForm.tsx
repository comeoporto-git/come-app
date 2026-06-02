"use client";

import { useState } from "react";

type ServiceType = { id: string; name: string };
type Client      = { id: string; name: string };
type Member      = { id: string; name: string };
type Props = {
  serviceTypes: ServiceType[];
  clients:      Client[];
  guides:       Member[];
  chefs:        Member[];
  action: (fd: FormData) => Promise<void>;
};

export default function NewServiceForm({ serviceTypes, clients, guides, chefs, action }: Props) {
  const [loading, setLoading]         = useState(false);
  const [newClient, setNewClient]     = useState(false);
  const [clientQuery, setClientQuery] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await action(fd);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Core details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Detalhes</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Service *</label>
            <select
              name="serviceId"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors bg-white"
            >
              <option value="">— Selecionar serviço —</option>
              {serviceTypes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Cliente</label>
              <button
                type="button"
                onClick={() => { setNewClient(!newClient); setClientQuery(""); }}
                className="text-xs text-[#667470] hover:text-[#32373c] font-medium"
              >
                {newClient ? "← Selecionar existente" : "+ Novo cliente"}
              </button>
            </div>
            {newClient ? (
              <input
                name="newClientName"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Nome do novo cliente…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
              />
            ) : (
              <select
                name="clientId"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors bg-white"
              >
                <option value="">— Selecionar cliente —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Data *</label>
            <input
              name="date"
              type="date"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora de Início</label>
              <input
                name="startTime"
                type="time"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora de Fim</label>
              <input
                name="endTime"
                type="time"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
            <select
              name="status"
              defaultValue="Pending"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors bg-white"
            >
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Referência</label>
            <input
              name="notionId"
              placeholder="Ex: 2575, MyBookpack 001…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Equipa</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Guia</label>
              <select
                name="guideId"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors bg-white"
              >
                <option value="">— Nenhum —</option>
                {guides.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Chef</label>
              <select
                name="chefId"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors bg-white"
              >
                <option value="">— Nenhum —</option>
                {chefs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Guests */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Participantes</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nº de Pessoas</label>
            <input
              name="numGuests"
              type="number"
              min="1"
              placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nomes</label>
            <input
              name="names"
              placeholder="Ex: João, Maria, Pedro…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contacto</label>
            <input
              name="phoneNumber"
              type="tel"
              placeholder="+351 9XX XXX XXX"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Logistics */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Logística</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ponto de Encontro</label>
            <input
              name="meetingPoint"
              placeholder="Ex: Praça da Ribeira"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Informações adicionais…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm hover:bg-[#444c52] active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {loading ? "A criar…" : "Criar Serviço"}
      </button>
    </form>
  );
}
