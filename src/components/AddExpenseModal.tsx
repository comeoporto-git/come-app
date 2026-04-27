"use client";

import { useState, useRef } from "react";
import { analyzeInvoice, submitAiCorrection, type InvoiceData } from "@/actions/invoice";
import { logExpenseAction, finishPendingExpenseAction, createFornecedorAction } from "@/actions/transactions";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { useRouter } from "next/navigation";

type Mode = "chef-choose" | "choose" | "scan" | "manual" | "review";

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

export function AddExpenseModal({
  tourId,
  pendingTransaction,
  fornecedores: initialFornecedores = [],
  userRole = "Guide",
  chefName,
  onClose,
}: {
  tourId: string;
  pendingTransaction?: Transaction;
  fornecedores?: Fornecedor[];
  userRole?: string;
  chefName?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const isSuperGuide = userRole === "Super Guide" || userRole === "Admin";
  const isChef = userRole === "Chef";

  // Chef: start with a type choice; others go straight to choose/scan
  const initialMode: Mode = pendingTransaction ? "scan" : isChef ? "chef-choose" : "choose";

  // "tour-expense" → ingredients / materials (Fornecedores, paymentMethod "Pelo Chef")
  // "service-invoice" → chef's own service fee (chef name as supplier, paymentMethod "Chef Fee")
  const [chefExpenseType, setChefExpenseType] = useState<"tour-expense" | "service-invoice" | null>(null);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // For chefs: payment method is fixed by expense type; for others it's selectable
  const defaultPaymentMethod = isSuperGuide ? "Cartão COME" : "Pelo Guia";
  const [paymentMethod, setPaymentMethod] = useState<string>(defaultPaymentMethod);
  const [needsInvoice, setNeedsInvoice] = useState(false);

  // Local fornecedor list (grows if user creates a new one)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(initialFornecedores);

  // AI flow state
  const [imageBase64, setImageBase64] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [aiResult, setAiResult] = useState<InvoiceData | null>(null);
  const [form, setForm] = useState<InvoiceData>(EMPTY_FORM);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function normalizeImage(file: File): Promise<{ dataUrl: string; base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }> {
    const MAX_PX = 2048;
    const isHeic = file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif");

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const mediaType = (!isHeic && file.type === "image/png") ? "image/png" : "image/jpeg";
    const quality = mediaType === "image/jpeg" ? 0.85 : undefined;
    const dataUrl = canvas.toDataURL(mediaType, quality);
    return { dataUrl, base64: dataUrl.split(",")[1], mediaType };
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);

    if (file.type === "application/pdf") {
      setImageDataUrl("");
      setImageBase64("");
      setError("");
      setMode("manual");
      return;
    }

    setScanning(true);
    setError("");
    try {
      const { dataUrl, base64, mediaType } = await normalizeImage(file);
      setImageDataUrl(dataUrl);
      setImageBase64(base64);
      const result = await analyzeInvoice(base64, mediaType, fornecedores.map((f) => f.name));
      setAiResult(result);
      setForm(result);
      setMode("review");
    } catch {
      setError("Erro ao analisar a imagem. Podes editar manualmente.");
      setMode("manual");
    } finally {
      setScanning(false);
    }
  }

  function update(field: keyof InvoiceData, value: string | number) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      if (["base6", "base13", "base23"].includes(field as string)) {
        updated.taxFree = Number(updated.base6) + Number(updated.base13) + Number(updated.base23);
      }
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

  async function handleCreateFornecedor(name: string): Promise<Fornecedor> {
    const newF = await createFornecedorAction(name);
    setFornecedores((prev) => [...prev, newF].sort((a, b) => a.name.localeCompare(b.name)));
    return newF;
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      let invoiceImageUrl: string | undefined;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const json = await res.json();
          invoiceImageUrl = json.url;
        } else {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload falhou (${res.status})`);
        }
      }

      // Fire-and-forget: AI correction logging should never block saving
      if (aiResult && mode === "review") {
        submitAiCorrection(imageDataUrl, aiResult, form).catch(() => {});
      }

      if (pendingTransaction) {
        const result = await finishPendingExpenseAction(
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
        if (result?.error) throw new Error(result.error);
      } else {
        // Determine the effective payment method for chefs
        const effectivePaymentMethod = isChef
          ? (chefExpenseType === "service-invoice" ? "Chef Fee" : "Pelo Chef")
          : paymentMethod;

        const selectedFornecedor = fornecedores.find(
          (f) => f.name.toLowerCase() === form.supplier.toLowerCase()
        );
        // For service invoices the supplier is the chef's own name (no Fornecedor record)
        const effectiveFornecedorId =
          chefExpenseType === "service-invoice" ? null : (selectedFornecedor?.id ?? null);

        const logResult = await logExpenseAction({
          supplier: form.supplier,
          fornecedorId: effectiveFornecedorId,
          date: form.date,
          invoiceId: form.invoiceId,
          taxFree: form.taxFree,
          iva6: form.iva6,
          iva13: form.iva13,
          iva23: form.iva23,
          totalCost: form.totalCost,
          whoPaid: effectivePaymentMethod === "Pelo Guia" ? "Guide"
                 : effectivePaymentMethod === "Cartão COME" ? "Company"
                 : effectivePaymentMethod === "Pelo Chef" ? "Chef"
                 : "Chef",
          paymentMethod: effectivePaymentMethod,
          status: form.invoiceId ? "Paid" : "Pending Receipt",
          tourId,
          bankReference: "",
          invoiceImageUrl,
          precisaDeFatura: needsInvoice ? "Sim" : undefined,
        });
        if (logResult?.error) throw new Error(logResult.error);
      }
      router.refresh();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Erro ao guardar: ${msg}`);
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickLog() {
    setSaving(true);
    setError("");
    try {
      const effectivePaymentMethod = isChef
        ? (chefExpenseType === "service-invoice" ? "Chef Fee" : "Pelo Chef")
        : paymentMethod;

      const selectedFornecedor = fornecedores.find(
        (f) => f.name.toLowerCase() === form.supplier.toLowerCase()
      );
      await logExpenseAction({
        supplier: form.supplier,
        fornecedorId: chefExpenseType === "service-invoice" ? null : (selectedFornecedor?.id ?? null),
        date: form.date,
        invoiceId: "",
        taxFree: 0,
        iva6: 0,
        iva13: 0,
        iva23: 0,
        totalCost: form.totalCost,
        whoPaid: effectivePaymentMethod === "Pelo Guia" ? "Guide"
               : effectivePaymentMethod === "Cartão COME" ? "Company"
               : "Chef",
        paymentMethod: effectivePaymentMethod,
        status: "Pending Receipt",
        tourId,
        bankReference: "",
        precisaDeFatura: needsInvoice ? "Sim" : undefined,
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
            {pendingTransaction
              ? "Adicionar Recibo"
              : mode === "chef-choose"
              ? "Tipo de Despesa"
              : chefExpenseType === "service-invoice"
              ? "Fatura de Serviço"
              : "Nova Despesa"}
          </h2>

          {/* CHEF: choose expense type */}
          {mode === "chef-choose" && (
            <div className="space-y-3">
              <button
                onClick={() => {
                  setChefExpenseType("tour-expense");
                  setMode("choose");
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-[#667470]/30 bg-[#667470]/5 hover:bg-[#667470]/10 transition-colors text-left"
              >
                <span className="text-3xl flex-shrink-0">🛒</span>
                <div>
                  <p className="text-sm font-bold text-[#32373c]">Despesa do Serviço</p>
                  <p className="text-xs text-gray-500 mt-0.5">Ingredientes ou materiais comprados para o serviço</p>
                </div>
              </button>
              <button
                onClick={() => {
                  setChefExpenseType("service-invoice");
                  // Pre-fill supplier with chef's own name
                  if (chefName) {
                    setForm((f) => ({ ...f, supplier: chefName }));
                  }
                  setMode("choose");
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="text-3xl flex-shrink-0">🧾</span>
                <div>
                  <p className="text-sm font-bold text-[#32373c]">Fatura de Serviço</p>
                  <p className="text-xs text-gray-500 mt-0.5">A tua fatura de honorários à COME</p>
                </div>
              </button>
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
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={handleImageChange}
                    capture="environment"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
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
                  onClick={() => setMode(isChef ? "chef-choose" : "choose")}
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

              {chefExpenseType === "service-invoice" ? (
                <ServiceInvoiceForm form={form} update={update} />
              ) : (
                <InvoiceForm
                  form={form}
                  update={update}
                  fornecedores={fornecedores}
                  onCreateFornecedor={handleCreateFornecedor}
                />
              )}

              {/* Payment method — Super Guide/Admin choose; plain guides/chefs fixed */}
              {isSuperGuide && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Método de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="Cartão COME">Cartão COME</option>
                    <option value="Pelo Guia">Pelo Guia</option>
                    <option value="Pelo Chef">Pelo Chef</option>
                  </select>
                </div>
              )}

              {/* Needs Invoice checkbox */}
              {!pendingTransaction && (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setNeedsInvoice((v) => !v)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      needsInvoice
                        ? "bg-[#667470] border-[#667470]"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {needsInvoice && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700">Precisa de Fatura</span>
                </label>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

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
  onCreateFornecedor,
}: {
  form: InvoiceData;
  update: (field: keyof InvoiceData, value: string | number) => void;
  fornecedores: Fornecedor[];
  onCreateFornecedor: (name: string) => Promise<Fornecedor>;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = query.length > 0
    ? fornecedores.filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase())
      )
    : fornecedores;

  // Check if typed name exactly matches an existing fornecedor
  const exactMatch = fornecedores.some(
    (f) => f.name.toLowerCase() === query.toLowerCase()
  );
  const showCreateOption = query.trim().length > 1 && !exactMatch;

  function selectFornecedor(name: string) {
    update("supplier", name);
    setQuery(name);
    setShowList(false);
  }

  async function handleCreate() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const newF = await onCreateFornecedor(query.trim());
      selectFornecedor(newF.name);
    } finally {
      setCreating(false);
    }
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
            onBlur={() => setTimeout(() => setShowList(false), 200)}
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
          {showList && (filtered.length > 0 || showCreateOption) && (
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
              {showCreateOption && (
                <li>
                  <button
                    type="button"
                    onMouseDown={handleCreate}
                    disabled={creating}
                    className="w-full text-left px-3 py-2.5 text-sm text-[#667470] font-semibold hover:bg-[#667470]/10 transition-colors border-t border-gray-100 first:border-t-0 last:rounded-b-xl disabled:opacity-50"
                  >
                    {creating ? "A criar…" : `+ Criar "${query.trim()}"`}
                  </button>
                </li>
              )}
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
      <IvaBreakdown form={form} update={update} />
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

function ServiceInvoiceForm({
  form,
  update,
}: {
  form: InvoiceData;
  update: (field: keyof InvoiceData, value: string | number) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Fornecedor (o teu nome)" required>
        <input
          type="text"
          value={form.supplier}
          onChange={(e) => update("supplier", e.target.value)}
          placeholder="O teu nome"
          className="input"
        />
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
      <IvaBreakdown form={form} update={update} />
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

function IvaBreakdown({
  form,
  update,
}: {
  form: InvoiceData;
  update: (field: keyof InvoiceData, value: string | number) => void;
}) {
  return (
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
