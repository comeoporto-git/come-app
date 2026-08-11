"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { addPhotoToPost, removePhotoFromPost, reorderPostExtraPhotos } from "@/actions/social";

export type CarouselPhoto = { id: string; blob_url: string; filename: string | null };

export function PostCarouselEditor({
  postId,
  extraPhotos,
  candidatePhotos,
}: {
  postId: string;
  extraPhotos: CarouselPhoto[];
  candidatePhotos: CarouselPhoto[];
}) {
  const [photos, setPhotos] = useState(extraPhotos);
  const [showPicker, setShowPicker] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(photoId: string) {
    setError(null);
    setShowPicker(false);
    startTransition(async () => {
      try {
        await addPhotoToPost(postId, photoId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível adicionar a foto.");
      }
    });
  }

  function handleRemove(photoId: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    startTransition(async () => {
      await removePhotoFromPost(postId, photoId);
    });
  }

  function handleDrop(targetId: string) {
    setDragOverId(null);
    if (!draggingId || draggingId === targetId) return;

    const next = [...photos];
    const fromIdx = next.findIndex((p) => p.id === draggingId);
    const toIdx = next.findIndex((p) => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    setPhotos(next);
    setDraggingId(null);
    startTransition(async () => {
      await reorderPostExtraPhotos(postId, next.map((p) => p.id));
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">
          Carrossel {photos.length > 0 && `· ${photos.length + 1} fotos`}
        </p>
        {candidatePhotos.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            disabled={isPending}
            className="text-xs font-semibold text-white/60 hover:text-white transition-colors"
          >
            {showPicker ? "Fechar" : "+ Adicionar foto"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {photos.map((photo) => (
            <div
              key={photo.id}
              draggable
              onDragStart={() => setDraggingId(photo.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverId !== photo.id) setDragOverId(photo.id);
              }}
              onDragLeave={() => setDragOverId((id) => (id === photo.id ? null : id))}
              onDrop={() => handleDrop(photo.id)}
              className={`relative w-16 h-16 rounded-lg overflow-hidden bg-black/20 cursor-grab active:cursor-grabbing border-2 transition-colors ${
                dragOverId === photo.id ? "border-white" : "border-transparent"
              }`}
            >
              <Image src={photo.blob_url} alt={photo.filename ?? ""} fill sizes="64px" className="object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(photo.id)}
                aria-label="Remover do carrossel"
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 hover:bg-black/80 text-white text-[10px] leading-none flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <div className="grid grid-cols-6 gap-1.5 bg-white/5 rounded-xl p-2 max-h-40 overflow-y-auto">
          {candidatePhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handleAdd(photo.id)}
              disabled={isPending}
              className="relative aspect-square rounded-md overflow-hidden bg-black/20 hover:ring-2 hover:ring-white/60 transition-all"
            >
              <Image src={photo.blob_url} alt={photo.filename ?? ""} fill sizes="48px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
