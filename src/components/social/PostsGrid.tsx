"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { CategoryBadge } from "@/components/social/CategoryBadge";
import { bulkSchedulePosts } from "@/actions/social";

export type PostRow = {
  id: string;
  caption: string | null;
  status: string;
  category: string | null;
  photo: { blob_url: string; filename: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Por rever",
  approved: "Copy aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  archived: "Arquivada",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-600 text-white",
  archived: "bg-gray-100 text-gray-400",
};

export function PostsGrid({ posts }: { posts: PostRow[] }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const schedulable = posts.filter((p) => p.status === "approved");

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === schedulable.length ? new Set() : new Set(schedulable.map((p) => p.id))));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setMessage(null);
  }

  function handleBulkSchedule() {
    if (!startDate || selectedIds.size === 0) return;
    setMessage(null);
    startTransition(async () => {
      const result = await bulkSchedulePosts(Array.from(selectedIds), startDate);
      setMessage(`${result.scheduled} publicação(ões) agendada(s) a partir de ${startDate}.`);
      setSelectedIds(new Set());
    });
  }

  return (
    <div className="space-y-4">
      {schedulable.length > 0 && (
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
                {selectedIds.size === schedulable.length ? "Limpar seleção" : "Selecionar todas aprovadas"}
              </button>
              <span className="text-xs text-white/50">{selectedIds.size} selecionada(s)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs bg-white/10 text-white rounded-full px-3 py-1.5 border-0 focus:outline-none focus:ring-2 focus:ring-white/30 [color-scheme:dark]"
              />
              <button
                type="button"
                onClick={handleBulkSchedule}
                disabled={selectedIds.size === 0 || !startDate || isPending}
                className="text-xs font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
              >
                {isPending ? "A agendar…" : "Agendar automaticamente"}
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
          {message && <span className="text-xs text-white/60">{message}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {posts.map((post) => {
          const canSelect = selectMode && post.status === "approved";
          return (
            <Link
              key={post.id}
              href={`/admin/social/posts/${post.id}`}
              onClick={(e) => {
                if (canSelect) {
                  e.preventDefault();
                  toggleSelect(post.id);
                }
              }}
              className={`relative bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow ${
                selectedIds.has(post.id) ? "border-[#667470] ring-2 ring-[#667470]/40" : "border-gray-100"
              }`}
            >
              {canSelect && (
                <span
                  className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-bold ${
                    selectedIds.has(post.id) ? "bg-[#667470] border-[#667470] text-white" : "bg-white/80 border-white text-transparent"
                  }`}
                >
                  ✓
                </span>
              )}
              <div className="relative aspect-square bg-gray-50">
                {post.photo?.blob_url && (
                  <Image
                    src={post.photo.blob_url}
                    alt={post.photo.filename ?? ""}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                )}
                <span
                  className={`absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm ${STATUS_CLASS[post.status] ?? "bg-gray-100 text-gray-500"}`}
                >
                  {STATUS_LABEL[post.status] ?? post.status}
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                <CategoryBadge category={post.category} />
                <p className="text-xs text-gray-600 line-clamp-3">{post.caption ?? "Sem legenda ainda."}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
