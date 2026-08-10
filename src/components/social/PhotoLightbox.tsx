"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { ReviewPhoto } from "@/components/social/PhotoCard";

function scoreBadgeClass(score: number | null) {
  if (score === null) return "bg-gray-100 text-gray-400";
  if (score >= 75) return "bg-emerald-100 text-emerald-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

export function PhotoLightbox({
  photos,
  photo,
  onClose,
  onNavigate,
  onReview,
}: {
  photos: ReviewPhoto[];
  photo: ReviewPhoto | null;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  onReview: (photoId: string, status: "approved" | "rejected" | "pending") => void;
}) {
  const index = photo ? photos.findIndex((p) => p.id === photo.id) : -1;
  const prev = index > 0 ? photos[index - 1] : null;
  const next = index >= 0 && index < photos.length - 1 ? photos[index + 1] : null;

  useEffect(() => {
    if (!photo) return;
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prev) onNavigate(prev.id);
      if (e.key === "ArrowRight" && next) onNavigate(next.id);
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [photo, prev, next, onClose, onNavigate]);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
      >
        ✕
      </button>

      {photos.length > 1 && (
        <span className="absolute top-4 left-4 text-xs font-medium text-white/60 bg-white/10 px-3 py-1.5 rounded-full">
          {index + 1} / {photos.length}
        </span>
      )}

      {prev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(prev.id);
          }}
          aria-label="Foto anterior"
          className="absolute left-2 sm:left-4 text-white/70 hover:text-white text-3xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          ‹
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(next.id);
          }}
          aria-label="Próxima foto"
          className="absolute right-2 sm:right-4 text-white/70 hover:text-white text-3xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          ›
        </button>
      )}

      <div
        className="bg-[#1c1f1e] rounded-2xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex-1 min-h-[40vh] md:min-h-[60vh] bg-black">
          <Image
            src={photo.blob_url}
            alt={photo.filename ?? ""}
            fill
            sizes="(max-width: 768px) 100vw, 70vw"
            className="object-contain"
            priority
          />
        </div>

        <div className="w-full md:w-72 shrink-0 p-5 flex flex-col gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{photo.filename ?? "sem nome"}</p>
            {photo.parent_folder_name && (
              <p className="text-xs text-white/40 truncate">{photo.parent_folder_name}</p>
            )}
          </div>

          {photo.ai_score !== null && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadgeClass(photo.ai_score)}`}>
                {photo.ai_score}
              </span>
              {photo.ai_score_reason && <p className="text-xs text-white/60">{photo.ai_score_reason}</p>}
            </div>
          )}

          {photo.ai_tags && photo.ai_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {photo.ai_tags.map((tag) => (
                <span key={tag} className="text-[11px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto flex gap-2 pt-3">
            {photo.review_status !== "approved" && (
              <button
                type="button"
                onClick={() => onReview(photo.id, "approved")}
                className="flex-1 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl transition-colors"
              >
                Aprovar
              </button>
            )}
            {photo.review_status !== "rejected" && (
              <button
                type="button"
                onClick={() => onReview(photo.id, "rejected")}
                className="flex-1 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white py-2 rounded-xl transition-colors"
              >
                Rejeitar
              </button>
            )}
            {photo.review_status !== "pending" && (
              <button
                type="button"
                onClick={() => onReview(photo.id, "pending")}
                title="Voltar a pendente"
                className="text-sm font-semibold bg-white/5 hover:bg-white/10 text-white/50 px-3 py-2 rounded-xl transition-colors"
              >
                ↺
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
