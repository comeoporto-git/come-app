import { PhotoCard, type ReviewPhoto } from "@/components/social/PhotoCard";

const SUGGESTION_COUNT = 5;
const SUGGESTION_MIN_SCORE = 60;

export function PhotoReviewGrid({ photos, showSuggestions }: { photos: ReviewPhoto[]; showSuggestions: boolean }) {
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
              <PhotoCard key={photo.id} photo={photo} highlighted />
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
            <PhotoCard key={photo.id} photo={photo} />
          ))}
        </div>
      </div>
    </div>
  );
}
