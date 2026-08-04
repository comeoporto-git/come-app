"use client";

import { useState, useRef } from "react";
import { editEarningAction, deleteEarningAction } from "@/actions/transactions";
import type { Transaction } from "@/lib/notion";
import { CONTA_PAGAMENTO_OPTIONS } from "@/lib/constants";
import { useRouter } from "next/navigation";

type FormState = {
  reference: string;
  date: string;
  invoiceId: string;
  contaPagamento: string;
  base6: number;
  base13: number;
  base23: number;
  taxFree: number;
  iva6: number;
  iva13: number;
  iva23: number;
  totalCost: number;
};

export function EditEarningModal({
  transaction,
  tourId,
  onClose,
}: {
  transaction: Transaction;
  tourId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]               = useState("");
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [lightboxSrc, setLightboxSrc]   = useState("");
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const rawRef = transaction.supplier.replace(/^IN\s*-\s*/i, "");

  const [form, setForm] = useState<FormState>({
    reference:      rawRef,
    date:           transaction.date ?? new Date().toISOString().slice(0, 10),
    invoiceId:      transaction.invoiceId,
    contaPagamento: transaction.contaPagamento ?? "",
    base6:          transaction.iva6  ? transaction.iva6  / 0.06 : 0,
    base13:    transaction.iva13 ? transaction.iva13 / 0.13 : 0,
    base23:    transaction.iva23 ? transaction.iva23 / 0.23 : 0,
    taxFree:   transaction.taxFree,
    iva6:      transaction.iva6,
    iva13:     transaction.iva13,
    iva23:     transaction.iva23,
    totalCost: transaction.totalCost,
  });

  function update(field: keyof FormState, value: string | number) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (["base6", "base13", "base23"].includes(field as string)) {
        next.taxFree = Number(next.base6) + Number(next.base13) + Number(next.base23);
      }
      if (["base6", "base13", "base23", "taxFree", "iva6", "iva13", "iva23"].includes(field as string)) {
        next.totalCost =
          Number(next.taxFree) + Number(next.iva6) + Number(next.iva13) + Number(next.iva23);
      }
      return next;
    });
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf") {
      setImageFile(file);
      setImageDataUrl("pdf");
      return;
    }
    const MAX_PX = 2048;
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target!.result as string);
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
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.85));
    const outUrl = (() => { const d = canvas.toDataURL("image/jpeg", 0.85); return d.length > 50 ? d : rawDataUrl; })();
    setImageFile(blob ? new File([blob], "invoice.jpg", { type: "image/jpeg" }) : file);
    setImageDataUrl(outUrl);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteEarningAction(transaction.id, tourId);
      router.refresh();
      onClose();
    } catch {
      setError("Erro ao eliminar. Tenta novamente.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
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
          invoiceImageUrl = (await res.json()).url;
        } else {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload falhou (${res.status})`);
        }
      }
      await editEarningAction(transaction.id, tourId, {
        reference:      form.reference,
        date:           form.date,
        invoiceId:      form.invoiceId,
        taxFree:        form.taxFree,
        iva6:           form.iva6,
        iva13:          form.iva13,
        iva23:          form.iva23,
        totalCost:      form.totalCost,
        contaPagamento: form.contaPagamento || undefined,
        ...(invoiceImageUrl ? { invoiceImageUrl } : {}),
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
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Editar Faturação</h2>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400 hover:text-red-600 font-medium"
              >
                Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Tens a certeza?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                >
                  {deleting ? "…" : "Sim"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg border border-gray-200"
                >
                  Não
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 mb-4">
              {error}
            </div>
          )}

          {lightboxSrc && lightboxSrc !== "pdf" && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
              onClick={() => setLightboxSrc("")}
            >
              <img src={lightboxSrc} alt="Fatura" className="max-w-full max-h-full object-contain" />
            </div>
          )}

          <div className="space-y-3">
            {transaction.invoiceImageUrl && !imageDataUrl && (
              <InvoicePreview url={transaction.invoiceImageUrl} onZoom={setLightboxSrc} />
            )}

            {/* Reference */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Referência</label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => update("reference", e.target.value)}
                className="input"
                placeholder="Ex: MyBookpack 001"
              />
            </div>

            {/* Date + Invoice */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Data</label>
                <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className="input" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nº Fatura</label>
                <input type="text" value={form.invoiceId} onChange={(e) => update("invoiceId", e.target.value)} className="input" />
              </div>
            </div>

            {/* Conta de Pagamento */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Conta de Pagamento</label>
              <select
                value={form.contaPagamento}
                onChange={(e) => update("contaPagamento", e.target.value)}
                className="input"
              >
                {!(CONTA_PAGAMENTO_OPTIONS as readonly string[]).includes(form.contaPagamento) && form.contaPagamento && (
                  <option value={form.contaPagamento}>{form.contaPagamento}</option>
                )}
                {CONTA_PAGAMENTO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* IVA */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">IVA</label>
              <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
                <div className="grid grid-cols-3 bg-gray-50 text-xs text-gray-400 font-medium px-3 py-2">
                  <span>Taxa</span><span className="text-right">Incidência</span><span className="text-right">IVA</span>
                </div>
                {(["6", "13", "23"] as const).map((rate) => {
                  const bk = `base${rate}` as "base6"|"base13"|"base23";
                  const ik = `iva${rate}`  as "iva6" |"iva13" |"iva23";
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

            {/* Total */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Total</label>
              <input
                type="number" step="0.01" min="0"
                value={form.totalCost || ""}
                onChange={(e) => update("totalCost", parseFloat(e.target.value) || 0)}
                className="input font-semibold"
              />
            </div>

            {/* Invoice upload */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {transaction.invoiceImageUrl ? "Substituir Fatura" : "Fatura (opcional)"}
              </label>
              <input ref={cameraRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} capture="environment" />
              <input ref={fileRef}   type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleImageChange} />
              {imageDataUrl === "pdf" ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-2xl">📄</span>
                  <p className="flex-1 text-sm font-medium text-gray-700 truncate">{imageFile?.name}</p>
                  <button onClick={() => { setImageDataUrl(""); setImageFile(null); }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </div>
              ) : imageDataUrl ? (
                <div className="relative">
                  <img src={imageDataUrl} alt="Nova fatura" className="w-full max-h-48 object-contain rounded-xl border border-gray-200 cursor-zoom-in" onClick={() => setLightboxSrc(imageDataUrl)} />
                  <button onClick={() => { setImageDataUrl(""); setImageFile(null); }} className="absolute top-1 right-1 text-xs bg-white border rounded-full px-2 py-0.5 text-gray-500">✕</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-2 border border-dashed border-emerald-400/40 rounded-xl py-3 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors font-medium">
                    📷 Tirar Foto
                  </button>
                  <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors font-medium">
                    🖼️ Carregar Ficheiro
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving || form.totalCost === 0}
              className="w-full bg-emerald-700 text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 hover:bg-emerald-800 active:scale-[0.98] transition-colors"
            >
              {saving ? "A guardar…" : "Guardar Alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoicePreview({ url, onZoom }: { url: string; onZoom: (src: string) => void }) {
  const [failed, setFailed] = useState(false);
  const isPdf = url.toLowerCase().endsWith(".pdf") || url.includes("application/pdf") || url.includes("/invoice-image/");
  if (isPdf || failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-2xl">{failed ? "🖼️" : "📄"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700">{failed ? "Ver fatura" : "Fatura em PDF"}</p>
          <p className="text-xs text-[#667470]">Toque para abrir</p>
        </div>
        <span className="text-xs text-gray-400">↗</span>
      </a>
    );
  }
  return (
    <img src={url} alt="Fatura atual" className="w-full max-h-48 object-contain rounded-xl border border-gray-200 cursor-zoom-in" onClick={() => onZoom(url)} onError={() => setFailed(true)} />
  );
}
