"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { CONTA_PAGAMENTO_OPTIONS, type Transaction } from "@/lib/notion";
import { EditEarningModal } from "./EditEarningModal";
import { createEarningAction } from "@/actions/transactions";

export function EarningList({
  earnings,
  tourId,
  isAdmin,
  tourDate,
  tourReference,
}: {
  earnings: Transaction[];
  tourId: string;
  isAdmin: boolean;
  tourDate: string | null;
  tourReference: string;
}) {
  const router = useRouter();
  const [editing, setEditing]   = useState<Transaction | null>(null);
  const [adding, setAdding]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const faturacao = earnings.reduce((s, e) => s + e.totalCost, 0);

  async function handleCreate(fd: FormData) {
    setSaving(true);
    setError("");
    const totalCost = parseFloat(fd.get("totalCost") as string) || 0;
    if (!totalCost) { setSaving(false); return; }

    const toNum = (k: string) => parseFloat(fd.get(k) as string) || 0;

    let invoiceImageUrl: string | undefined;
    const file = (fd.get("invoiceFile") as File | null);
    if (file && file.size > 0) {
      const uploadFd = new FormData();
      uploadFd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: uploadFd });
      if (res.ok) invoiceImageUrl = (await res.json()).url;
    }

    const result = await createEarningAction(tourId, {
      reference:      (fd.get("reference") as string)?.trim() || tourReference,
      date:           (fd.get("date") as string) || (tourDate ?? new Date().toISOString().slice(0, 10)),
      invoiceId:      (fd.get("invoiceId") as string)?.trim() || "",
      contaPagamento: (fd.get("contaPagamento") as string)?.trim() || undefined,
      taxFree:    toNum("taxFree"),
      iva6:       toNum("iva6"),
      iva13:      toNum("iva13"),
      iva23:      toNum("iva23"),
      totalCost,
      invoiceImageUrl,
    });

    if (result?.error) {
      setError(result.error);
    } else {
      setAdding(false);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Faturação
            <span className="ml-2 text-gray-400 font-normal">€{faturacao.toFixed(2)}</span>
          </h2>
          {isAdmin && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-full hover:bg-emerald-800 active:scale-95 transition-all"
            >
              + Faturação
            </button>
          )}
        </div>

        {earnings.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-sm">Sem faturação registada</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {earnings.map((e) => (
              <li
                key={e.id}
                onClick={() => isAdmin && setEditing(e)}
                className={`bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 space-y-1 transition-all ${
                  isAdmin ? "cursor-pointer hover:border-emerald-300 active:scale-[0.99]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-emerald-800 truncate">
                        {e.supplier.replace(/^IN\s*-\s*/i, "") || "—"}
                      </p>
                      {e.invoiceImageUrl && <span className="text-xs text-emerald-500 shrink-0" title="Fatura anexada">📎</span>}
                    </div>
                    <p className="text-xs text-emerald-600">{e.date ?? "—"}</p>
                    {e.invoiceId && <p className="text-xs text-emerald-600">{e.invoiceId}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-emerald-700">+€{e.totalCost.toFixed(2)}</p>
                    {e.status && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {e.status}
                      </span>
                    )}
                  </div>
                </div>
                {(e.iva6 > 0 || e.iva13 > 0 || e.iva23 > 0) && (
                  <div className="flex gap-3 text-xs text-emerald-500 pt-0.5">
                    {e.iva6  > 0 && <span>IVA 6%: €{e.iva6.toFixed(2)}</span>}
                    {e.iva13 > 0 && <span>IVA 13%: €{e.iva13.toFixed(2)}</span>}
                    {e.iva23 > 0 && <span>IVA 23%: €{e.iva23.toFixed(2)}</span>}
                  </div>
                )}
                {isAdmin && <p className="text-xs text-emerald-300 text-right">toque para editar</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EditEarningModal
          transaction={editing}
          tourId={tourId}
          onClose={() => setEditing(null)}
        />
      )}

      {adding && (
        <AddEarningModal
          tourId={tourId}
          tourDate={tourDate}
          tourReference={tourReference}
          saving={saving}
          error={error}
          onSubmit={handleCreate}
          onClose={() => { setAdding(false); setError(""); }}
        />
      )}
    </>
  );
}

// ── Inline add modal ──────────────────────────────────────────────────────────

function AddEarningModal({
  tourDate,
  tourReference,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  tourId: string;
  tourDate: string | null;
  tourReference: string;
  saving: boolean;
  error: string;
  onSubmit: (fd: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [base6,  setBase6]  = useState(0);
  const [base13, setBase13] = useState(0);
  const [base23, setBase23] = useState(0);
  const [iva6,   setIva6]   = useState(0);
  const [iva13,  setIva13]  = useState(0);
  const [iva23,  setIva23]  = useState(0);
  const [total,  setTotal]  = useState(0);
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const taxFree = base6 + base13 + base23;

  function recalcTotal(b6=base6, b13=base13, b23=base23, i6=iva6, i13=iva13, i23=iva23) {
    setTotal(b6 + b13 + b23 + i6 + i13 + i23);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (file.type !== "application/pdf") {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview("pdf");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("taxFree", String(taxFree));
    fd.set("iva6",    String(iva6));
    fd.set("iva13",   String(iva13));
    fd.set("iva23",   String(iva23));
    fd.set("totalCost", String(total));
    if (imageFile) fd.set("invoiceFile", imageFile);
    onSubmit(fd);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-5 pb-8 pt-2 space-y-3">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nova Faturação</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Referência</label>
              <input name="reference" defaultValue={tourReference} className="input" placeholder="Ex: MyBookpack 001" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Data</label>
                <input name="date" type="date" defaultValue={tourDate ?? new Date().toISOString().slice(0, 10)} className="input" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nº Fatura</label>
                <input name="invoiceId" type="text" className="input" placeholder="FT 2024/001" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Conta de Pagamento</label>
              <select name="contaPagamento" defaultValue="COME" className="input">
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
                {([
                  ["6",  base6,  setBase6,  iva6,  setIva6]  as const,
                  ["13", base13, setBase13, iva13, setIva13] as const,
                  ["23", base23, setBase23, iva23, setIva23] as const,
                ]).map(([rate, bv, setBv, iv, setIv]) => (
                  <div key={rate} className="grid grid-cols-3 gap-1 px-2 py-1.5 border-t border-gray-100">
                    <span className="flex items-center text-xs text-gray-500 font-medium pl-1">{rate}%</span>
                    <input type="number" step="0.01" min="0" value={bv || ""} placeholder="0.00"
                      onChange={(e) => { const v = parseFloat(e.target.value) || 0; setBv(v); recalcTotal(rate==="6"?v:base6, rate==="13"?v:base13, rate==="23"?v:base23, iva6, iva13, iva23); }}
                      className="input text-right text-sm py-1 px-2" />
                    <input type="number" step="0.01" min="0" value={iv || ""} placeholder="0.00"
                      onChange={(e) => { const v = parseFloat(e.target.value) || 0; setIv(v); recalcTotal(base6, base13, base23, rate==="6"?v:iva6, rate==="13"?v:iva13, rate==="23"?v:iva23); }}
                      className="input text-right text-sm py-1 px-2" />
                  </div>
                ))}
                <div className="grid grid-cols-3 px-3 py-2 border-t border-gray-200 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-600">Total base</span>
                  <span className="text-right text-sm font-semibold text-gray-800">€{taxFree.toFixed(2)}</span>
                  <span />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Total <span className="text-red-400">*</span></label>
              <input type="number" step="0.01" min="0" value={total || ""} placeholder="0.00"
                onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                className="input font-semibold" required />
            </div>

            {/* File */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fatura (opcional)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                ref={(el) => { fileRef.current = el; }}
                onChange={handleImageChange} />
              {imagePreview === "pdf" ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <span className="text-2xl">📄</span>
                  <p className="flex-1 text-sm font-medium text-gray-700 truncate">{imageFile?.name}</p>
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(""); }} className="text-xs text-gray-400">✕</button>
                </div>
              ) : imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Fatura" className="w-full max-h-40 object-contain rounded-xl border border-gray-200" />
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(""); }} className="absolute top-1 right-1 text-xs bg-white border rounded-full px-2 py-0.5 text-gray-500">✕</button>
                </div>
              ) : (
                <button type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-emerald-400/40 rounded-xl py-3 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors font-medium">
                  📎 Anexar Fatura
                </button>
              )}
            </div>

            <button type="submit" disabled={saving || total === 0}
              className="w-full bg-emerald-700 text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 hover:bg-emerald-800 active:scale-[0.98] transition-colors">
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
