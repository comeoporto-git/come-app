"use client";

import { useState, useRef } from "react";
import { editExpenseAction, deleteExpenseAction, createFornecedorAction } from "@/actions/transactions";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { useRouter } from "next/navigation";
import { PARTNERS, ownershipForDate } from "@/lib/constants";

type FormState = {
  supplier: string;
  date: string;
  invoiceId: string;
  base6: number;
  base13: number;
  base23: number;
  taxFree: number;
  iva6: number;
  iva13: number;
  iva23: number;
  totalCost: number;
  paymentMethod: string;
  socioPessoal: string;
};

export function EditExpenseModal({
  transaction,
  tourId,
  fornecedores: initialFornecedores = [],
  userRole = "Guide",
  onClose,
}: {
  transaction: Transaction;
  tourId: string;
  fornecedores?: Fornecedor[];
  userRole?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  // Local fornecedor list (grows if user creates a new one)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(initialFornecedores);
  const [creatingFornecedor, setCreatingFornecedor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // totalCost in Notion is stored as negative; show/work with positive in the form
  const [form, setForm] = useState<FormState>({
    supplier: transaction.supplier,
    date: transaction.date ?? new Date().toISOString().slice(0, 10),
    invoiceId: transaction.invoiceId,
    // Derive per-rate bases from IVA amounts (base = iva / rate)
    base6:  transaction.iva6  ? Math.abs(transaction.iva6)  / 0.06 : 0,
    base13: transaction.iva13 ? Math.abs(transaction.iva13) / 0.13 : 0,
    base23: transaction.iva23 ? Math.abs(transaction.iva23) / 0.23 : 0,
    taxFree: Math.abs(transaction.taxFree),
    iva6: Math.abs(transaction.iva6),
    iva13: Math.abs(transaction.iva13),
    iva23: Math.abs(transaction.iva23),
    totalCost: Math.abs(transaction.totalCost),
    paymentMethod: transaction.paymentMethod,
    socioPessoal: transaction.socioPessoal ?? "",
  });

  // Supplier combobox state
  const [query, setQuery] = useState(transaction.supplier);
  const [showList, setShowList] = useState(false);
  const filtered = query.length > 0
    ? fornecedores.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : fornecedores;
  const exactMatch = fornecedores.some((f) => f.name.toLowerCase() === query.toLowerCase());
  const showCreateOption = query.trim().length > 1 && !exactMatch;

  async function handleCreateFornecedor() {
    const name = query.trim();
    if (!name) return;
    setCreatingFornecedor(true);
    try {
      const newF = await createFornecedorAction(name);
      setFornecedores((prev) => [...prev, newF].sort((a, b) => a.name.localeCompare(b.name)));
      update("supplier", newF.name);
      setQuery(newF.name);
      setShowList(false);
    } finally {
      setCreatingFornecedor(false);
    }
  }

  function update(field: keyof FormState, value: string | number) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      if (["base6", "base13", "base23"].includes(field as string)) {
        updated.taxFree = Number(updated.base6) + Number(updated.base13) + Number(updated.base23);
      }
      if (["base6", "base13", "base23", "taxFree", "iva6", "iva13", "iva23"].includes(field as string)) {
        updated.totalCost =
          Number(updated.taxFree) + Number(updated.iva6) +
          Number(updated.iva13) + Number(updated.iva23);
      }
      return updated;
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

    try {
      // Normalize: resize to max 2048px and convert to JPEG via FileReader+Image
      // (avoids createImageBitmap which is unreliable on iOS Safari)
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
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
      );
      // toDataURL can return "data:," on low-memory iOS — fall back to rawDataUrl
      const outUrl = (() => {
        const d = canvas.toDataURL("image/jpeg", 0.85);
        return d.length > 50 ? d : rawDataUrl;
      })();
      setImageFile(blob
        ? new File([blob], "invoice.jpg", { type: "image/jpeg" })
        : file // fallback: upload original
      );
      setImageDataUrl(outUrl);
    } catch {
      // Fallback: use original file as-is
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImageDataUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteExpenseAction(transaction.id, tourId);
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

      const selectedFornecedor = fornecedores.find(
        (f) => f.name.toLowerCase() === form.supplier.toLowerCase()
      );

      await editExpenseAction(transaction.id, tourId, {
        supplier: form.supplier,
        fornecedorId: selectedFornecedor?.id ?? transaction.fornecedorId,
        date: form.date,
        invoiceId: form.invoiceId,
        taxFree: form.taxFree,
        iva6: form.iva6,
        iva13: form.iva13,
        iva23: form.iva23,
        totalCost: form.totalCost,
        whoPaid: form.paymentMethod === "Pelo Guia" ? "Guide"
               : form.paymentMethod === "Pelo Chef" ? "Chef"
               : form.paymentMethod === "Pelo Driver" ? "Driver"
               : form.paymentMethod === "Pelo Logistics" ? "Logistics"
               : form.paymentMethod === "Pago pelo Bernardo Providência" ? "Bernardo"
               : "Company",
        paymentMethod: form.paymentMethod,
        socioPessoal: form.socioPessoal || null,
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
            <h2 className="text-lg font-bold text-gray-900">Editar Despesa</h2>
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

          {/* Lightbox */}
          {lightboxSrc && lightboxSrc !== "pdf" && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
              onClick={() => setLightboxSrc("")}
            >
              <img src={lightboxSrc} alt="Fatura" className="max-w-full max-h-full object-contain" />
            </div>
          )}

          <div className="space-y-3">
            {/* Existing invoice — image or PDF */}
            {transaction.invoiceImageUrl && !imageDataUrl && (
              <InvoicePreview url={transaction.invoiceImageUrl} onZoom={setLightboxSrc} />
            )}

            {/* Supplier */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fornecedor <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); update("supplier", e.target.value); setShowList(true); }}
                  onFocus={() => setShowList(true)}
                  onBlur={() => setTimeout(() => setShowList(false), 150)}
                  className="input pr-8"
                  autoComplete="off"
                />
                {showList && (filtered.length > 0 || showCreateOption) && (
                  <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {filtered.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onMouseDown={() => { update("supplier", f.name); setQuery(f.name); setShowList(false); }}
                          className="w-full text-left px-3 py-2.5 text-sm text-[#32373c] hover:bg-[#667470]/10 first:rounded-t-xl last:rounded-b-xl"
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
                          className="w-full text-left px-3 py-2.5 text-sm text-[#667470] font-semibold hover:bg-[#667470]/10 border-t border-gray-100 first:border-t-0 last:rounded-b-xl disabled:opacity-50"
                        >
                          {creatingFornecedor ? "A criar…" : `+ Criar "${query.trim()}"`}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
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

            {/* IVA breakdown */}
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

            {/* Total */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Total</label>
              <input type="number" step="0.01" min="0" value={form.totalCost || ""} onChange={(e) => update("totalCost", parseFloat(e.target.value) || 0)} className="input font-semibold" />
            </div>

            {/* Payment method — Admin/Super Guide only */}
            {(userRole === "Admin" || userRole === "Super Guide") && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Método de Pagamento</label>
                <select value={form.paymentMethod} onChange={(e) => update("paymentMethod", e.target.value)} className="input">
                  <option value="Cartão COME">Cartão COME</option>
                  <option value="Transferência Bancária COME">Transferência Bancária COME</option>
                  <option value="Pelo Guia">Pelo Guia</option>
                  <option value="Pelo Chef">Pelo Chef</option>
                  <option value="Pelo Driver">Pelo Driver</option>
                  <option value="Pelo Logistics">Pelo Logistics</option>
                  <option value="Pago pelo Bernardo Providência">Pago pelo Bernardo Providência</option>
                </select>
              </div>
            )}

            {/* Despesa pessoal de sócio — needs redistribution to the other partners */}
            {(userRole === "Admin" || userRole === "Super Guide") && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Despesa Pessoal de Sócio</label>
                <select value={form.socioPessoal} onChange={(e) => update("socioPessoal", e.target.value)} className="input">
                  <option value="">— Não aplicável —</option>
                  {PARTNERS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {form.socioPessoal && (
                  <p className="text-xs text-gray-400 mt-1">
                    Precisa de transferir: {PARTNERS.filter((p) => p !== form.socioPessoal).map((p) => {
                      const pct = ownershipForDate(form.date)[p] ?? 0;
                      const amount = (pct / 100) * form.taxFree;
                      return `${p} €${amount.toFixed(2)}`;
                    }).join(" · ")}
                  </p>
                )}
              </div>
            )}

            {/* Replace receipt photo */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Substituir Fatura (opcional)</label>
              {/* Camera input */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
                capture="environment"
              />
              {/* File/gallery picker */}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleImageChange}
              />
              {imageDataUrl === "pdf" ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-2xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{imageFile?.name}</p>
                    <p className="text-xs text-gray-400">PDF anexado</p>
                  </div>
                  <button
                    onClick={() => { setImageDataUrl(""); setImageFile(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              ) : imageDataUrl ? (
                <div className="relative">
                  <img
                    src={imageDataUrl}
                    alt="Nova fatura"
                    className="w-full max-h-48 object-contain rounded-xl border border-gray-200 cursor-zoom-in"
                    onClick={() => setLightboxSrc(imageDataUrl)}
                  />
                  <button
                    onClick={() => { setImageDataUrl(""); setImageFile(null); }}
                    className="absolute top-1 right-1 text-xs bg-white border rounded-full px-2 py-0.5 text-gray-500"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="flex items-center justify-center gap-2 border border-dashed border-[#667470]/40 rounded-xl py-3 text-sm text-[#667470] bg-[#667470]/5 hover:bg-[#667470]/10 transition-colors font-medium"
                  >
                    📷 Tirar Foto
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors font-medium"
                  >
                    🖼️ Carregar Ficheiro
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !form.supplier || form.totalCost === 0}
              className="w-full bg-[#32373c] text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 hover:bg-[#1a2018] active:scale-[0.98] transition-colors"
            >
              {saving ? "A guardar…" : "Guardar Alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invoice preview with robust fallback ─────────────────────────────────────

function InvoicePreview({ url, onZoom }: { url: string; onZoom: (src: string) => void }) {
  const [failed, setFailed] = useState(false);
  const isPdf =
    url.toLowerCase().endsWith(".pdf") ||
    url.includes("application/pdf") ||
    url.includes("/invoice-image/"); // proxy route may serve PDF

  // Old files imported from Notion have a permanently expired link (Notion's
  // presigned S3 URLs die ~1h after being generated) — there's no way to
  // recover the original bytes, so point at "Substituir Fatura" below instead
  // of showing a link that just leads to an AccessDenied error page.
  if (failed) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">Fatura indisponível</p>
          <p className="text-xs text-amber-600">Link expirado — se tiver o ficheiro, carregue-o em &quot;Substituir Fatura&quot; abaixo</p>
        </div>
      </div>
    );
  }

  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-2xl">📄</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700">Fatura em PDF</p>
          <p className="text-xs text-[#667470]">Toque para abrir</p>
        </div>
        <span className="text-xs text-gray-400">↗</span>
      </a>
    );
  }

  return (
    <img
      src={url}
      alt="Fatura atual"
      className="w-full max-h-48 object-contain rounded-xl border border-gray-200 cursor-zoom-in"
      onClick={() => onZoom(url)}
      onError={() => setFailed(true)}
    />
  );
}
