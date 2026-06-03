"use client";

import { useState, useTransition } from "react";
import { createCRMAccount } from "@/actions/crm";

const STAGES = ["Prospect", "Lead", "Qualified", "Proposal", "Client"];
const SIZES = ["Solo", "2–10", "11–50", "51–200", "200+"];

export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createCRMAccount({
        name: fd.get("name") as string,
        pessoa: (fd.get("pessoa") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        phone_number: (fd.get("phone_number") as string) || undefined,
        website: (fd.get("website") as string) || undefined,
        stage: (fd.get("stage") as string) || "Prospect",
        company_size: (fd.get("company_size") as string) || undefined,
        country: (fd.get("country") as string) || undefined,
        industry: (fd.get("industry") as string) || undefined,
        linkedin_url: (fd.get("linkedin_url") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      });
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-[#32373c]">Nova Empresa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nome da empresa *</label>
            <input name="name" required className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fase</label>
              <select name="stage" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#667470]/30">
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dimensão</label>
              <select name="company_size" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#667470]/30">
                <option value="">—</option>
                {SIZES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">País</label>
              <input name="country" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Indústria</label>
              <input name="industry" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contacto principal</label>
            <input name="pessoa" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder="Nome" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input name="email" type="email" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefone</label>
              <input name="phone_number" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
            <input name="website" type="url" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder="https://" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">LinkedIn</label>
            <input name="linkedin_url" type="url" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder="https://linkedin.com/company/..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea name="notes" rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30 resize-none" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={isPending} className="flex-1 bg-[#667470] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#556360] transition-colors disabled:opacity-50">
              {isPending ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
