"use client";

import { useState, useTransition } from "react";
import { PhotoCard, type ReviewPhoto } from "@/components/social/PhotoCard";
import { PhotoLightbox } from "@/components/social/PhotoLightbox";
import { reviewPhoto } from "@/actions/social";

const SUGGESTION_COUNT = 5;
const SUGGESTION_MIN_SCORE = 60;

export function PhotoReviewGrid({ photos, showSuggestions }: { photos: ReviewPhoto[]; showSuggestions: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">
            ✨ Sugestões AI — {suggestions.length} foto{suggestions.length !== 1 ? "s" : ""} com melhor pontuação
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {suggestions.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} highlighted onOpen={() => setOpenId(photo.id)} />
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
            <PhotoCard key={photo.id} photo={photo} onOpen={() => setOpenId(photo.id)} />
          ))}
        </div>
      </div>

      <PhotoLightbox
        photos={photos}
        photo={openPhoto}
        onClose={() => setOpenId(null)}
        onNavigate={setOpenId}
        onReview={handleReview}
      />
    </div>
  );
}
