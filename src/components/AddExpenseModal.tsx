"use client";

import { useState, useRef } from "react";
import { analyzeInvoice, submitAiCorrection, type InvoiceData } from "@/actions/invoice";
import { logExpenseAction, finishPendingExpenseAction } from "@/actions/transactions";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { useRouter } from "next/navigation";

type Mode = "choose" | "scan" | "manual" | "review";

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

export function AddExpenseModal({
  tourId,
  pendingTransaction,
  fornecedores = [],
  onClose,
}: {
  tourId: string;
  pendingTransaction?: Transaction;
  fornecedores?: Fornecedor[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(pendingTransaction ? "scan" : "choose");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Cartão Comum" | "Pelo Guia">("Cartão Comum");

  // AI flow state
  const [imageBase64, setImageBase64] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [aiResult, setAiResult] = useState<InvoiceData | null>(null);
  const [form, setForm] = useState<InvoiceData>(EMPTY_FORM);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);

    // PDFs can't be analysed by the vision model — skip AI and go straight to manual
    if (file.type === "application/pdf") {
      setImageDataUrl(""); // no preview for PDFs
      setImageBase64("");
      setError("");
      setMode("manual");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageDataUrl(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
      const mt = file.type as "image/jpeg" | "image/png" | "image/webp";
      setScanning(true);
      setError("");
      try {
        const result = await analyzeInvoice(base64, mt, fornecedores.map((f) => f.name));
        setAiResult(result);
        setForm(result);
        setMode("review");
      } catch {
        setError("Erro ao analisar a imagem. Podes editar manualmente.");
        setMode("manual");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function update(field: keyof InvoiceData, value: string | number) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      // Auto-recalculate total
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

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      // Upload invoice image to Vercel Blob if we have one
      let invoiceImageUrl: string | undefined;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const json = await res.json();
          invoiceImageUrl = json.url;
        }
      }

      // Save AI correction if user reviewed AI output
      if (aiResult && mode === "review") {
        await submitAiCorrection(imageDataUrl, aiResult, form);
      }

      if (pendingTransaction) {
        // Finishing a pending receipt
        await finishPendingExpenseAction(
          pendingTransaction.id,
          form.invoiceId,
          form.taxFree,
          form.iva6,
          form.iva13,
          form.iva23,
          form.totalCost,
          tourId,
          invoiceImageUrl,
        );
      } else {
        // Find the Fornecedor ID by matching the selected name
        const selectedFornecedor = fornecedores.find(
          (f) => f.name.toLowerCase() === form.supplier.toLowerCase()
        );
        await logExpenseAction({
          supplier: form.supplier,
          fornecedorId: selectedFornecedor?.id ?? null,
          date: form.date,
          invoiceId: form.invoiceId,
          taxFree: form.taxFree,
          iva6: form.iva6,
          iva13: form.iva13,
          iva23: form.iva23,
          totalCost: form.totalCost,
          whoPaid: paymentMethod === "Pelo Guia" ? "Guide" : "Company",
          paymentMethod,
          status: form.invoiceId ? "Paid" : "Pending Receipt",
          tourId,
          bankReference: "",
          invoiceImageUrl,
        });
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError("Erro ao guardar. Tenta novamente.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickLog() {
    setSaving(true);
    setError("");
    try {
      const selectedFornecedor = fornecedores.find(
        (f) => f.name.toLowerCase() === form.supplier.toLowerCase()
      );
      await logExpenseAction({
        supplier: form.supplier,
        fornecedorId: selectedFornecedor?.id ?? null,
        date: form.date,
        invoiceId: "",
        taxFree: 0,
        iva6: 0,
        iva13: 0,
        iva23: 0,
        totalCost: form.totalCost,
        whoPaid: paymentMethod === "Pelo Guia" ? "Guide" : "Company",
        paymentMethod,
        status: "Pending Receipt",
        tourId,
        bankReference: "",
      });
      router.refresh();
      onClose();
    } catch {
      setError("Erro ao guardar.");
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

        <div className="px-5 pb-8 pt-2">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {pendingTransaction ? "Adicionar Recibo" : "Nova Despesa"}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 mb-4">
              {error}
            </div>
          )}

          {/* CHOOSE MODE */}
          {mode === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("scan")}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-[#667470]/30 bg-[#667470]/5 hover:bg-[#667470]/10 transition-colors"
              >
                <span className="text-3xl">📷</span>
                <span className="text-sm font-semibold text-[#667470] font-bold">Escanear Recibo</span>
              </button>
              <button
                onClick={() => setMode("manual")}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-3xl">✏️</span>
                <span className="text-sm font-semibold text-gray-700">Entrada Manual</span>
              </button>
            </div>
          )}

          {/* SCAN MODE */}
          {mode === "scan" && (
            <div className="space-y-4">
              {scanning ? (
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#667470]/20 border-t-[#667470]" />
                  <p className="text-sm text-gray-500">A analisar com IA…</p>
                </div>
              ) : (
                <>
                  {/* Hidden inputs — camera and file picker */}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageChange}
                    capture="environment"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => cameraRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-[#667470]/30 bg-[#667470]/5 hover:bg-[#667470]/10 transition-colors"
                    >
                      <span className="text-3xl">📷</span>
                      <span className="text-sm font-semibold text-[#667470]">Tirar Foto</span>
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-3xl">🖼️</span>
                      <span className="text-sm font-semibold text-gray-700">Carregar Foto/Ficheiro</span>
                    </button>
                  </div>
                </>
              )}
              {!scanning && (
                <button
                  onClick={() => setMode("choose")}
                  className="text-sm text-gray-400 hover:text-gray-600 w-full text-center"
                >
                  ← Voltar
                </button>
              )}
            </div>
          )}

          {/* MANUAL / REVIEW MODE */}
          {(mode === "manual" || mode === "review") && (
            <div className="space-y-4">
              {/* PDF attached indicator */}
              {imageFile?.type === "application/pdf" && (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-2xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{imageFile.name}</p>
                    <p className="text-xs text-gray-400">PDF anexado</p>
                  </div>
                  <button
                    onClick={() => setImageFile(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              )}

              {mode === "review" && imageDataUrl && (
                <>
                  <img
                    src={imageDataUrl}
                    alt="Recibo"
                    className="w-full max-h-40 object-contain rounded-xl border border-gray-200 cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                  />
                  {lightboxOpen && (
                    <div
                      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
                      onClick={() => setLightboxOpen(false)}
                    >
                      <img
                        src={imageDataUrl}
                        alt="Recibo"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  )}
                </>
              )}

              <InvoiceForm form={form} update={update} fornecedores={fornecedores} />

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Método de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="Cartão Comum">Cartão Comum</option>
                  <option value="Pelo Guia">Pelo Guia</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {mode === "manual" && (
                  <button
                    onClick={handleQuickLog}
                    disabled={saving || !form.supplier}
                    className="flex-1 border border-gray-200 text-gray-700 font-semibold py-3 rounded-2xl text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Quick Log
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !form.supplier || form.totalCost === 0}
                  className={`font-semibold py-3 rounded-2xl text-sm text-white disabled:opacity-50 transition-colors ${
                    mode === "manual" ? "flex-1" : "w-full"
                  } bg-[#32373c] hover:bg-[#1a2018] active:scale-[0.98]`}
                >
                  {saving ? "A guardar…" : "Guardar"}
                </button>
              </div>
              {mode === "review" && (
                <p className="text-xs text-center text-gray-400">
                  Os dados extraídos pela IA serão guardados para melhorar futuros reconhecimentos.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceForm({
  form,
  update,
  fornecedores,
}: {
  form: InvoiceData;
  update: (field: keyof InvoiceData, value: string | number) => void;
  fornecedores: Fornecedor[];
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);

  const filtered = query.length > 0
    ? fornecedores.filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase())
      )
    : fornecedores;

  function selectFornecedor(name: string) {
    update("supplier", name);
    setQuery(name);
    setShowList(false);
  }

  return (
    <div className="space-y-3">
      <Field label="Fornecedor" required>
        <div className="relative">
          <input
            type="text"
            value={query || form.supplier}
            onChange={(e) => {
              setQuery(e.target.value);
              update("supplier", e.target.value);
              setShowList(true);
            }}
            onFocus={() => setShowList(true)}
            onBlur={() => setTimeout(() => setShowList(false), 150)}
            placeholder="Pesquisar fornecedor…"
            className="input pr-8"
            autoComplete="off"
          />
          {(query || form.supplier) && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setQuery(""); update("supplier", ""); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none"
            >
              ×
            </button>
          )}
          {showList && filtered.length > 0 && (
            <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {filtered.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onMouseDown={() => selectFornecedor(f.name)}
                    className="w-full text-left px-3 py-2.5 text-sm text-[#32373c] hover:bg-[#667470]/10 transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <input
            type="date"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            className="input"
          />
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
      </div>
      <Field label="Base tributável (s/ IVA)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.taxFree || ""}
          onChange={(e) => update("taxFree", parseFloat(e.target.value) || 0)}
          className="input"
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="IVA 6%">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.iva6 || ""}
            onChange={(e) => update("iva6", parseFloat(e.target.value) || 0)}
            className="input"
          />
        </Field>
        <Field label="IVA 13%">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.iva13 || ""}
            onChange={(e) => update("iva13", parseFloat(e.target.value) || 0)}
            className="input"
          />
        </Field>
        <Field label="IVA 23%">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.iva23 || ""}
            onChange={(e) => update("iva23", parseFloat(e.target.value) || 0)}
            className="input"
          />
        </Field>
      </div>
      <Field label="Total">
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.totalCost || ""}
          onChange={(e) => update("totalCost", parseFloat(e.target.value) || 0)}
          className="input font-semibold"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
