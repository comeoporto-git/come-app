"use client";

import { useRef, useState } from "react";

const EQUIPA_OPTIONS = ["Guia", "Chef", "Driver", "Copa"];
const TYPE_OPTIONS   = ["Food Tour", "Private", "VIP", "Corporate", "Other"];

type Props = { action: (fd: FormData) => Promise<void> };

export default function NewServiceForm({ action }: Props) {
  const formRef  = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggleRole(role: string) {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set("equipa", selected.join(","));
    try {
      await action(fd);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Informação Básica</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
            <input
              name="name"
              required
              placeholder="Ex: Old School to New School + Chef"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select
              name="type"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors bg-white"
            >
              <option value="">— Selecionar —</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Processo</label>
            <input
              name="processo"
              placeholder="URL ou referência do processo"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Equipa */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Equipa necessária</h2>
          <p className="text-xs text-gray-400 mt-0.5">Funções obrigatórias para este serviço</p>
        </div>
        <div className="px-5 py-4 flex flex-wrap gap-2">
          {EQUIPA_OPTIONS.map((role) => {
            const active = selected.includes(role);
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`text-sm px-3 py-1.5 rounded-xl border font-medium transition-all ${
                  active
                    ? "bg-[#667470] text-white border-[#667470]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-[#667470]/40"
                }`}
              >
                {role}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Preço por Pax</h2>
          <p className="text-xs text-gray-400 mt-0.5">Valor cobrado ao cliente por pessoa</p>
        </div>
        <div className="px-5 py-4 grid grid-cols-3 gap-3">
          {([["pax_2_3", "2–3 pax"], ["pax_4_6", "4–6 pax"], ["pax_7_plus", "7+ pax"]] as const).map(([name, label]) => (
            <div key={name}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <div className="relative">
                <input
                  name={name}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl pl-6 pr-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Staff rates */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-[#32373c]">Valores de Equipa</h2>
          <p className="text-xs text-gray-400 mt-0.5">Pagamento por função</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Chef</p>
            <div className="grid grid-cols-3 gap-3">
              {([["valor_chef_2_3", "2–3 pax"], ["valor_chef_4_6", "4–6 pax"], ["valor_chef_7_10", "7–10 pax"]] as const).map(([name, label]) => (
                <div key={name}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <div className="relative">
                    <input
                      name={name}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-xl pl-6 pr-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([["valor_copa", "Copa"], ["valor_driver", "Driver"]] as const).map(([name, label]) => (
              <div key={name}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <div className="relative">
                  <input
                    name={name}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl pl-6 pr-3 py-2 text-sm focus:outline-none focus:border-[#667470] transition-colors"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                </div>
              </div>
            ))}
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
