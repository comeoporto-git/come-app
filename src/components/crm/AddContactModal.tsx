"use client";

import { useState, useTransition } from "react";
import { createCRMContact } from "@/actions/crm";

export function AddContactModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createCRMContact({
        account_id: accountId,
        name: fd.get("name") as string,
        email: (fd.get("email") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        country: (fd.get("country") as string) || undefined,
        linkedin_url: (fd.get("linkedin_url") as string) || undefined,
        role: (fd.get("role") as string) || undefined,
        is_primary: fd.get("is_primary") === "on",
      });
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-[#32373c]">Novo Contacto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
            <input name="name" required className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cargo</label>
            <input name="role" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder="ex: CEO, Responsável de Eventos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input name="email" type="email" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefone</label>
              <input name="phone" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">LinkedIn</label>
            <input name="linkedin_url" type="url" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" placeholder="https://linkedin.com/in/..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">País</label>
            <input name="country" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="is_primary" className="rounded" />
            <span className="text-sm text-gray-600">Contacto principal</span>
          </label>
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
