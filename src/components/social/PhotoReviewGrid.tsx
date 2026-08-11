"use client";

import { useState, useTransition } from "react";
import { PhotoCard, type ReviewPhoto } from "@/components/social/PhotoCard";
import { PhotoLightbox } from "@/components/social/PhotoLightbox";
import { reviewPhoto, bulkReviewPhotos } from "@/actions/social";

const SUGGESTION_COUNT = 5;
const SUGGESTION_MIN_SCORE = 60;

export function PhotoReviewGrid({ photos, showSuggestions }: { photos: ReviewPhoto[]; showSuggestions: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkPending, startBulk] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const openPhoto = photos.find((p) => p.id === openId) ?? null;

  function handleReview(photoId: string, status: "approved" | "rejected" | "pending") {
    startTransition(async () => {
      await reviewPhoto(photoId, status);
    });

    // Advance immediately using the current list — don't wait on the
    // mutation, since the photo may drop out of this tab's filtered list
    // once the page revalidates (e.g. approving from the Pendentes tab).
    const idx = photos.findIndex((p) => p.id === photoId);
    const nextPhoto = photos[idx + 1] ?? photos[idx - 1] ?? null;
    setOpenId(nextPhoto ? nextPhoto.id : null);
  }

  function toggleSelect(photoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === photos.length ? new Set() : new Set(photos.map((p) => p.id))));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkMessage(null);
  }

  function handleBulk(status: "approved" | "rejected") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkMessage(null);
    startBulk(async () => {
      const result = await bulkReviewPhotos(ids, status);
      setBulkMessage(
        result.skipped > 0
          ? `${result.processed} processada(s), ${result.skipped} por processar — corre novamente para as restantes.`
          : `${result.processed} foto(s) ${status === "approved" ? "aprovada(s)" : "rejeitada(s)"}.`
      );
      setSelectedIds(new Set());
    });
  }

  if (photos.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
        Nenhuma foto aqui.
      </div>
    );
  }

  const suggestions = showSuggestions
    ? photos.filter((p) => (p.ai_score ?? 0) >= SUGGESTION_MIN_SCORE).slice(0, SUGGESTION_COUNT)
    : [];
  const suggestionIds = new Set(suggestions.map((p) => p.id));
  const rest = photos.filter((p) => !suggestionIds.has(p.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {!selectMode ? (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="text-xs font-semibold bg-white/10 hover:bg-white/15 text-white/70 px-3 py-1.5 rounded-full transition-colors"
          >
            Selecionar várias
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-semibold bg-white/10 hover:bg-white/15 text-white/70 px-3 py-1.5 rounded-full transition-colors"
            >
              {selectedIds.size === photos.length ? "Limpar seleção" : "Selecionar todas"}
            </button>
            <span className="text-xs text-white/50">{selectedIds.size} selecionada(s)</span>
            <button
              type="button"
              onClick={() => handleBulk("approved")}
              disabled={selectedIds.size === 0 || isBulkPending}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
            >
              {isBulkPending ? "A processar…" : "Aprovar selecionadas"}
            </button>
            <button
              type="button"
              onClick={() => handleBulk("rejected")}
              disabled={selectedIds.size === 0 || isBulkPending}
              className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
            >
              Rejeitar selecionadas
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
        {bulkMessage && <span className="text-xs text-white/60">{bulkMessage}</span>}
      </div>

      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">
            ✨ Sugestões AI — {suggestions.length} foto{suggestions.length !== 1 ? "s" : ""} com melhor pontuação
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {suggestions.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                highlighted
                onOpen={() => setOpenId(photo.id)}
                selectable={selectMode}
                selected={selectedIds.has(photo.id)}
                onToggleSelect={() => toggleSelect(photo.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        {suggestions.length > 0 && (
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">Todas</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {rest.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onOpen={() => setOpenId(photo.id)}
              selectable={selectMode}
              selected={selectedIds.has(photo.id)}
              onToggleSelect={() => toggleSelect(photo.id)}
            />
          ))}
        </div>
      </div>

      <PhotoLightbox
        photos={photos}
        photo={selectMode ? null : openPhoto}
        onClose={() => setOpenId(null)}
        onNavigate={setOpenId}
        onReview={handleReview}
      />
    </div>
  );
}
