"use client";

import { useTransition } from "react";
import Image from "next/image";
import { reviewPhoto, setPhotoCategory } from "@/actions/social";
import { CategorySelect } from "@/components/social/CategorySelect";

export type ReviewPhoto = {
  id: string;
  filename: string | null;
  blob_url: string;
  parent_folder_name: string | null;
  review_status: "pending" | "approved" | "rejected";
  ai_score: number | null;
  ai_score_reason: string | null;
  ai_tags: string[] | null;
  category: string | null;
  missing_since: string | null;
};

function scoreBadgeClass(score: number | null) {
  if (score === null) return "bg-gray-100 text-gray-400";
  if (score >= 75) return "bg-emerald-100 text-emerald-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

export function PhotoCard({
  photo,
  highlighted = false,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  photo: ReviewPhoto;
  highlighted?: boolean;
  onOpen?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function setStatus(status: "approved" | "rejected" | "pending") {
    startTransition(async () => {
      await reviewPhoto(photo.id, status);
    });
  }

  function handleImageClick() {
    if (selectable) {
      onToggleSelect?.();
    } else {
      onOpen?.();
    }
  }

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${
        selected ? "border-[#667470] ring-2 ring-[#667470]/40" : highlighted ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-100"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <div className="relative aspect-square bg-gray-50 cursor-pointer" onClick={handleImageClick}>
        <Image
          src={photo.blob_url}
          alt={photo.filename ?? ""}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
        />
        {selectable && (
          <span
            className={`absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-bold transition-colors ${
              selected ? "bg-[#667470] border-[#667470] text-white" : "bg-white/80 border-white text-transparent"
            }`}
          >
            ✓
          </span>
        )}
        {photo.ai_score !== null && (
          <span
            title={photo.ai_score_reason ?? undefined}
            className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm ${scoreBadgeClass(photo.ai_score)}`}
          >
            {photo.ai_score}
          </span>
        )}
        {photo.missing_since && (
          <span className="absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shadow-sm">
            ⚠ Já não está no Drive
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#32373c] truncate">{photo.filename ?? "sem nome"}</p>
          {photo.parent_folder_name && (
            <p className="text-[11px] text-gray-400 truncate">{photo.parent_folder_name}</p>
          )}
        </div>

        <CategorySelect
          value={photo.category}
          onChange={(category) => setPhotoCategory(photo.id, category)}
          className="w-full"
        />

        {photo.ai_score_reason && (
          <p className="text-[11px] text-gray-500 line-clamp-2">{photo.ai_score_reason}</p>
        )}

        <div className="mt-auto flex gap-2 pt-1">
          {photo.review_status !== "approved" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatus("approved")}
              className="flex-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Aprovar
            </button>
          )}
          {photo.review_status !== "rejected" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatus("rejected")}
              className="flex-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Rejeitar
            </button>
          )}
          {photo.review_status !== "pending" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatus("pending")}
              title="Voltar a pendente"
              className="text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-gray-400 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              ↺
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
