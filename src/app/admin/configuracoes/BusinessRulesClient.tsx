"use client";

import { useState, useTransition } from "react";
import { updateBusinessRule, createBusinessRule, deleteBusinessRule } from "./actions";

type Rule = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
};

export function BusinessRulesClient({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startEdit(rule: Rule) {
    setEditing(rule.key);
    setDraft(rule.value);
    setSaved(null);
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  function saveEdit(key: string) {
    if (!draft.trim()) return;
    startTransition(async () => {
      try {
        await updateBusinessRule(key, draft);
        setRules((prev) =>
          prev.map((r) => (r.key === key ? { ...r, value: draft.trim(), updated_at: new Date().toISOString() } : r))
        );
        setEditing(null);
        setSaved(key);
        setTimeout(() => setSaved(null), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao guardar");
      }
    });
  }

  function handleDelete(key: string) {
    if (!confirm(`Eliminar a regra "${key}"?`)) return;
    startTransition(async () => {
      try {
        await deleteBusinessRule(key);
        setRules((prev) => prev.filter((r) => r.key !== key));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao eliminar");
      }
    });
  }

  function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return;
    startTransition(async () => {
      try {
        await createBusinessRule(newKey, newValue, newDesc);
        const cleanKey = newKey.trim().toLowerCase().replace(/\s+/g, "_");
        setRules((prev) => [
          ...prev,
          { key: cleanKey, value: newValue.trim(), description: newDesc.trim() || null, updated_at: new Date().toISOString() },
        ]);
        setAdding(false);
        setNewKey("");
        setNewValue("");
        setNewDesc("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar");
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="divide-y divide-black/8">
        {rules.map((rule) => (
          <div key={rule.key} className="py-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-mono font-semibold text-[#32373c]">{rule.key}</p>
              {rule.description && (
                <p className="text-[12px] text-[#32373c]/50 mt-0.5">{rule.description}</p>
              )}
              <p className="text-[10px] text-[#32373c]/30 mt-1">
                Atualizado: {new Date(rule.updated_at).toLocaleString("pt-PT")}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-none">
              {editing === rule.key ? (
                <>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(rule.key);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="w-24 text-[13px] font-mono border border-black/20 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-[#111514]/20"
                    autoFocus
                    disabled={isPending}
                  />
                  <button
                    onClick={() => saveEdit(rule.key)}
                    disabled={isPending || !draft.trim()}
                    className="text-[12px] font-semibold text-white bg-[#111514] px-3 py-1 rounded-lg hover:bg-[#32373c] transition-colors disabled:opacity-40"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="text-[12px] text-[#32373c]/50 hover:text-[#32373c] transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={`text-[13px] font-mono font-bold px-3 py-1 rounded-lg transition-colors ${
                      saved === rule.key ? "bg-green-100 text-green-700" : "bg-[#f5f5f0] text-[#32373c]"
                    }`}
                  >
                    {saved === rule.key ? "Guardado ✓" : rule.value}
                  </span>
                  <button
                    onClick={() => startEdit(rule)}
                    className="text-[12px] text-[#32373c]/40 hover:text-[#32373c] transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(rule.key)}
                    disabled={isPending}
                    className="text-[12px] text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add new rule */}
      {adding ? (
        <div className="mt-6 border border-black/10 rounded-2xl p-4 space-y-3">
          <p className="text-[13px] font-semibold text-[#32373c]">Nova regra</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-[#32373c]/50 font-medium">Chave</label>
              <input
                type="text"
                placeholder="ex: max_guests_per_tour"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full text-[13px] font-mono border border-black/15 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#111514]/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#32373c]/50 font-medium">Valor</label>
              <input
                type="text"
                placeholder="ex: 20"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="w-full text-[13px] font-mono border border-black/15 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#111514]/20"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#32373c]/50 font-medium">Descrição (opcional)</label>
            <input
              type="text"
              placeholder="Explicação da regra…"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full text-[13px] border border-black/15 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#111514]/20"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={isPending || !newKey.trim() || !newValue.trim()}
              className="text-[13px] font-semibold text-white bg-[#111514] px-4 py-2 rounded-xl hover:bg-[#32373c] transition-colors disabled:opacity-40"
            >
              Adicionar
            </button>
            <button
              onClick={() => { setAdding(false); setNewKey(""); setNewValue(""); setNewDesc(""); }}
              className="text-[13px] text-[#32373c]/50 hover:text-[#32373c] transition-colors px-4 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-5 text-[13px] font-semibold text-[#32373c]/50 hover:text-[#32373c] transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none">+</span> Nova regra
        </button>
      )}
    </div>
  );
}
