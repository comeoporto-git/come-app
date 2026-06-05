"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { analyzeInvoice, type InvoiceData } from "@/actions/invoice";
import { markInvoiceCollectedAction, createFornecedorAction, markAiScanFailedAction, markNoInvoiceNeededAction } from "@/actions/transactions";
import type { Transaction, Fornecedor } from "@/lib/notion";

type Step = "capture" | "scanning" | "review";

const EMPTY_FORM: InvoiceData = {
  supplier: "",
  date: new Date().toISOString().slice(0, 10),
  invoiceId: "",
  base6: 0,
  base13: 0,
  base23: 0,
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
  const isAiScanFailed = transaction.precisaDeFatura === "AI Scan Falhou";
  const [step, setStep] = useState<Step>(
    isAiScanFailed && transaction.invoiceImageUrl ? "review" : "capture"
  );
  const [error, setError] = useState("");
  const [aiScanFailed, setAiScanFailed] = useState(isAiScanFailed);
  const [saving, setSaving] = useState(false);
  const [markingNoInvoice, setMarkingNoInvoice] = useState(false);
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
  const [imageDataUrl, setImageDataUrl] = useState(
    isAiScanFailed && transaction.invoiceImageUrl ? transaction.invoiceImageUrl : ""
  );
  const [form, setForm] = useState<InvoiceData>({
    ...EMPTY_FORM,
    supplier: transaction.supplier,
    date: transaction.date ?? EMPTY_FORM.date,
  });

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function normalizeImage(file: File): Promise<{
    dataUrl: string; base64: string;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    normalizedFile: File;
  }> {
    const MAX_PX = 2048;
    const isHeic = file.type === "image/heic" || file.type === "image/heif" ||
      file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif");

    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target!.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = rawDataUrl;
    });

    const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round((img.naturalWidth  || 1) * scale);
    canvas.height = Math.round((img.naturalHeight || 1) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const mediaType = (!isHeic && file.type === "image/png") ? "image/png" : "image/jpeg";
    const quality   = mediaType === "image/jpeg" ? 0.85 : undefined;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mediaType, quality)
    );

    const dataUrl = (() => {
      const d = canvas.toDataURL(mediaType, quality);
      return d.length > 50 ? d : rawDataUrl;
    })();

    const ext = mediaType === "image/png" ? "png" : "jpg";
    const normalizedFile = blob
      ? new File([blob], `invoice.${ext}`, { type: mediaType })
      : file;

    return { dataUrl, base64: dataUrl.split(",")[1], mediaType, normalizedFile };
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setAiScanFailed(false);

    if (file.type === "application/pdf") {
      setImageFile(file);
      setImageDataUrl("pdf");
      setStep("review");
      return;
    }

    setStep("scanning");
    let capturedNormalizedFile: File | null = null;
    try {
      const { dataUrl, base64, mediaType, normalizedFile } = await normalizeImage(file);
      capturedNormalizedFile = normalizedFile;
      setImageFile(normalizedFile);
      setImageDataUrl(dataUrl);
      const result = await analyzeInvoice(base64, mediaType, fornecedores.map((f) => f.name));
      setForm((f) => ({ ...f, ...result }));
      const matched = fornecedores.find(
        (f) => f.name.toLowerCase() === result.supplier?.toLowerCase()
      );
      if (matched) {
        setSelectedFornecedorId(matched.id);
        setFornecedorQuery(matched.name);
      }
    } catch {
      setAiScanFailed(true);
      if (capturedNormalizedFile) {
        setError("Scan IA falhou — a foto foi guardada. Podes preencher manualmente.");
        try {
          const fd = new FormData();
          fd.append("file", capturedNormalizedFile);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (res.ok) {
            const { url } = await res.json() as { url: string };
            await markAiScanFailedAction(transaction.id, url);
            router.refresh();
          }
        } catch { /* ignore upload errors — photo still in review */ }
      } else {
        setError("Não foi possível analisar a imagem. Podes preencher manualmente.");
      }
    } finally {
      setStep("review");
    }
  }

  function update(field: keyof InvoiceData, value: string | number) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      // Recalculate taxFree when any per-rate base changes
      if (["base6", "base13", "base23"].includes(field as string)) {
        updated.taxFree = Number(updated.base6) + Number(updated.base13) + Number(updated.base23);
      }
      // Recalculate totalCost when any tax field changes
      if (["base6", "base13", "base23", "taxFree", "iva6", "iva13", "iva23"].includes(field as string)) {
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
        if (res.ok) {
          invoiceImageUrl = (await res.json()).url;
        } else {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload falhou (${res.status})`);
        }
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
        supplier: transaction.supplier,
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
            <div className="text-sm font-semibold text-gray-800">€{Math.abs(transaction.totalCost).toFixed(2)}</div>
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
              <button
                onClick={async () => {
                  setMarkingNoInvoice(true);
                  try {
                    await markNoInvoiceNeededAction(transaction.id);
                    router.refresh();
                    onClose();
                  } finally {
                    setMarkingNoInvoice(false);
                  }
                }}
                disabled={markingNoInvoice}
                className="w-full border border-gray-200 text-gray-500 font-medium py-3 rounded-2xl text-sm disabled:opacity-50 hover:bg-gray-50 active:scale-[0.98] transition-colors"
              >
                {markingNoInvoice ? "A guardar…" : "Não precisa de fatura"}
              </button>
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
              {aiScanFailed && !error && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                  Scan IA falhou — preenche os campos manualmente.
                </div>
              )}
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

                {/* IVA breakdown table */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">IVA</label>
                  <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
                    <div className="grid grid-cols-3 bg-gray-50 text-xs text-gray-400 font-medium px-3 py-2">
                      <span>Taxa</span>
                      <span className="text-right">Incidência</span>
                      <span className="text-right">IVA</span>
                    </div>
                    {(["6", "13", "23"] as const).map((rate) => {
                      const bk = `base${rate}` as "base6" | "base13" | "base23";
                      const ik = `iva${rate}` as "iva6" | "iva13" | "iva23";
                      return (
                        <div key={rate} className="grid grid-cols-3 gap-1 px-2 py-1.5 border-t border-gray-100">
                          <span className="flex items-center text-xs text-gray-500 font-medium pl-1">{rate}%</span>
                          <input type="number" step="0.01" min="0" value={form[bk] || ""} onChange={(e) => update(bk, parseFloat(e.target.value) || 0)} className="input text-right text-sm py-1 px-2" placeholder="0.00" />
                          <input type="number" step="0.01" min="0" value={form[ik] || ""} onChange={(e) => update(ik, parseFloat(e.target.value) || 0)} className="input text-right text-sm py-1 px-2" placeholder="0.00" />
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-3 px-3 py-2 border-t border-gray-200 bg-gray-50">
                      <span className="text-xs font-semibold text-gray-600">Total base</span>
                      <span className="text-right text-sm font-semibold text-gray-800">€{(form.taxFree || 0).toFixed(2)}</span>
                      <span />
                    </div>
                  </div>
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
