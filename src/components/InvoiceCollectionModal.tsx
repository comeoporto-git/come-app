"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { analyzeInvoice, type InvoiceData } from "@/actions/invoice";
import { markInvoiceCollectedAction, createFornecedorAction } from "@/actions/transactions";
import type { Transaction, Fornecedor } from "@/lib/notion";

type Step = "capture" | "scanning" | "review";

const EMPTY_FORM: InvoiceData = {
  supplier: "",
  date: new Date().toISOString().slice(0, 10),
  invoiceId: "",
  taxFree: 0,
  iva6: 0,
  iva13: 0,
  iva23: 0,
  totalCost: 0,
};

export function InvoiceCollectionModal({
  transaction,
  fornecedores: initialFornecedores = [],
  onClose,
}: {
  transaction: Transaction;
  fornecedores?: Fornecedor[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("capture");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(initialFornecedores);
  // Pre-select existing fornecedor if the transaction already has one
  const [selectedFornecedorId, setSelectedFornecedorId] = useState<string>(
    transaction.fornecedorId ?? ""
  );
  const [fornecedorQuery, setFornecedorQuery] = useState(
    initialFornecedores.find((f) => f.id === transaction.fornecedorId)?.name ??
    transaction.supplier ??
    ""
  );
  const [showFornecedorList, setShowFornecedorList] = useState(false);
  const [creatingFornecedor, setCreatingFornecedor] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [form, setForm] = useState<InvoiceData>({
    ...EMPTY_FORM,
    supplier: transaction.supplier,
    date: transaction.date ?? EMPTY_FORM.date,
    totalCost: transaction.totalCost,
  });

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setError("");

    if (file.type === "application/pdf") {
      setImageDataUrl("pdf");
      setStep("review");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageDataUrl(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mt = file.type as "image/jpeg" | "image/png" | "image/webp";
      setStep("scanning");
      try {
        const result = await analyzeInvoice(
          base64,
          mt,
          fornecedores.map((f) => f.name)
        );
        setForm((f) => ({ ...f, ...result }));
        // If AI recognised a supplier that matches a known fornecedor, pre-select it
        const matched = fornecedores.find(
          (f) => f.name.toLowerCase() === result.supplier?.toLowerCase()
        );
        if (matched) {
          setSelectedFornecedorId(matched.id);
          setFornecedorQuery(matched.name);
        }
      } catch {
        setError("Não foi possível analisar a imagem. Podes preencher manualmente.");
      } finally {
        setStep("review");
      }
    };
    reader.readAsDataURL(file);
  }

  function update(field: keyof InvoiceData, value: string | number) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      if (["taxFree", "iva6", "iva13", "iva23"].includes(field as string)) {
        updated.totalCost =
          Number(updated.taxFree) +
          Number(updated.iva6) +
          Number(updated.iva13) +
          Number(updated.iva23);
      }
      return updated;
    });
  }

  // Fornecedor picker helpers
  const filteredFornecedores = fornecedorQuery.length > 0
    ? fornecedores.filter((f) => f.name.toLowerCase().includes(fornecedorQuery.toLowerCase()))
    : fornecedores;
  const exactMatch = fornecedores.some(
    (f) => f.name.toLowerCase() === fornecedorQuery.toLowerCase()
  );
  const showCreateOption = fornecedorQuery.trim().length > 1 && !exactMatch;

  function selectFornecedor(f: Fornecedor) {
    setSelectedFornecedorId(f.id);
    setFornecedorQuery(f.name);
    setShowFornecedorList(false);
  }

  async function handleCreateFornecedor() {
    if (!fornecedorQuery.trim()) return;
    setCreatingFornecedor(true);
    try {
      const newF = await createFornecedorAction(fornecedorQuery.trim());
      setFornecedores((prev) => [...prev, newF].sort((a, b) => a.name.localeCompare(b.name)));
      selectFornecedor(newF);
    } finally {
      setCreatingFornecedor(false);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      let invoiceImageUrl: string | undefined;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) invoiceImageUrl = (await res.json()).url;
      }
      await markInvoiceCollectedAction(transaction.id, {
        invoiceId: form.invoiceId,
        taxFree: form.taxFree,
        iva6: form.iva6,
        iva13: form.iva13,
        iva23: form.iva23,
        totalCost: form.totalCost,
        invoiceImageUrl,
        fornecedorId: selectedFornecedorId || null,
      });
      router.refresh();
      onClose();
    } catch {
      setError("Erro ao guardar. Tenta novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-8 pt-2 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Adicionar Fatura</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {transaction.supplier}
              {transaction.tourName ? ` · ${transaction.tourName}` : ""}
            </p>
          </div>

          {/* Transaction summary */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-500">{transaction.date ?? "—"}</div>
            <div className="text-sm font-semibold text-gray-800">€{transaction.totalCost.toFixed(2)}</div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* STEP: capture */}
          {step === "capture" && (
            <>
              <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} capture="environment" />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleImageChange} />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-[#667470]/30 bg-[#667470]/5 hover:bg-[#667470]/10 transition-colors"
                >
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-semibold text-[#667470]">Tirar Foto</span>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-3xl">🖼️</span>
                  <span className="text-sm font-semibold text-gray-700">Carregar Ficheiro</span>
                </button>
              </div>
              <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-gray-600 text-center">
                Cancelar
              </button>
            </>
          )}

          {/* STEP: scanning */}
          {step === "scanning" && (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#667470]/20 border-t-[#667470]" />
              <p className="text-sm text-gray-500">A analisar com IA…</p>
            </div>
          )}

          {/* STEP: review */}
          {step === "review" && (
            <>
              {/* Image preview / PDF indicator */}
              {imageDataUrl === "pdf" ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-2xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{imageFile?.name}</p>
                    <p className="text-xs text-gray-400">PDF anexado</p>
                  </div>
                  <button onClick={() => { setImageFile(null); setImageDataUrl(""); setStep("capture"); }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </div>
              ) : imageDataUrl ? (
                <>
                  <img
                    src={imageDataUrl}
                    alt="Fatura"
                    className="w-full max-h-44 object-contain rounded-xl border border-gray-200 cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                  />
                  {lightboxOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" onClick={() => setLightboxOpen(false)}>
                      <img src={imageDataUrl} alt="Fatura" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                </>
              ) : null}

              {/* Form */}
              <div className="space-y-3">

                {/* Fornecedor picker */}
                <Field label="Fornecedor">
                  <div className="relative">
                    <input
                      type="text"
                      value={fornecedorQuery}
                      onChange={(e) => {
                        setFornecedorQuery(e.target.value);
                        setSelectedFornecedorId("");
                        setShowFornecedorList(true);
                      }}
                      onFocus={() => setShowFornecedorList(true)}
                      onBlur={() => setTimeout(() => setShowFornecedorList(false), 200)}
                      placeholder="Pesquisar ou criar fornecedor…"
                      className="input pr-8"
                      autoComplete="off"
                    />
                    {fornecedorQuery && (
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setFornecedorQuery(""); setSelectedFornecedorId(""); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                    {showFornecedorList && (filteredFornecedores.length > 0 || showCreateOption) && (
                      <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                        {filteredFornecedores.map((f) => (
                          <li key={f.id}>
                            <button
                              type="button"
                              onMouseDown={() => selectFornecedor(f)}
                              className="w-full text-left px-3 py-2.5 text-sm text-[#32373c] hover:bg-[#667470]/10 transition-colors first:rounded-t-xl last:rounded-b-xl"
                            >
                              {f.name}
                            </button>
                          </li>
                        ))}
                        {showCreateOption && (
                          <li>
                            <button
                              type="button"
                              onMouseDown={handleCreateFornecedor}
                              disabled={creatingFornecedor}
                              className="w-full text-left px-3 py-2.5 text-sm text-[#667470] font-semibold hover:bg-[#667470]/10 transition-colors border-t border-gray-100 first:border-t-0 last:rounded-b-xl disabled:opacity-50"
                            >
                              {creatingFornecedor ? "A criar…" : `+ Criar "${fornecedorQuery.trim()}"`}
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </Field>

                <Field label="Nº Fatura">
                  <input
                    type="text"
                    value={form.invoiceId}
                    onChange={(e) => update("invoiceId", e.target.value)}
                    placeholder="FT 2024/001"
                    className="input"
                  />
                </Field>

                <Field label="Data">
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => update("date", e.target.value)}
                    className="input"
                  />
                </Field>

                <Field label="Base tributável (s/ IVA)">
                  <input type="number" step="0.01" min="0" value={form.taxFree || ""} onChange={(e) => update("taxFree", parseFloat(e.target.value) || 0)} className="input" />
                </Field>

                <div className="grid grid-cols-3 gap-2">
                  {(["iva6", "iva13", "iva23"] as const).map((k) => (
                    <Field key={k} label={`IVA ${k === "iva6" ? "6" : k === "iva13" ? "13" : "23"}%`}>
                      <input type="number" step="0.01" min="0" value={form[k] || ""} onChange={(e) => update(k, parseFloat(e.target.value) || 0)} className="input" />
                    </Field>
                  ))}
                </div>

                <Field label="Total">
                  <input type="number" step="0.01" min="0" value={form.totalCost || ""} onChange={(e) => update("totalCost", parseFloat(e.target.value) || 0)} className="input font-semibold" />
                </Field>
              </div>

              <button
                onClick={handleConfirm}
                disabled={saving || form.totalCost === 0}
                className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 hover:bg-[#1a2018] active:scale-[0.98] transition-colors"
              >
                {saving ? "A guardar…" : "Confirmar Fatura"}
              </button>

              <button onClick={() => { setStep("capture"); setImageFile(null); setImageDataUrl(""); }} className="w-full text-sm text-gray-400 hover:text-gray-600 text-center">
                ← Tirar outra foto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
