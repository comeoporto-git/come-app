"use client";

import { useState, useTransition } from "react";
import { schedulePost, unschedulePost, markPostPublished } from "@/actions/social";

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostPublishPanel({
  postId,
  status,
  scheduledFor,
  publishedAt,
  igPermalink,
}: {
  postId: string;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  igPermalink: string | null;
}) {
  const [dateValue, setDateValue] = useState(toDatetimeLocalValue(scheduledFor));
  const [permalink, setPermalink] = useState(igPermalink ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSchedule() {
    if (!dateValue) return;
    startTransition(async () => {
      await schedulePost(postId, dateValue);
    });
  }

  function handleUnschedule() {
    startTransition(async () => {
      await unschedulePost(postId);
    });
  }

  function handleMarkPublished() {
    startTransition(async () => {
      await markPostPublished(postId, permalink);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Publicação</p>

      {status === "in_review" && (
        <p className="text-sm text-gray-400">Aprova a copy para poderes agendar esta publicação.</p>
      )}

      {(status === "approved" || status === "scheduled") && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500">
            {status === "scheduled" ? "Reagendar para" : "Agendar para"}
          </label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              disabled={isPending}
              className="flex-1 text-sm bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSchedule}
              disabled={isPending || !dateValue}
              className="text-sm font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              {status === "scheduled" ? "Reagendar" : "Agendar"}
            </button>
          </div>
          {status === "scheduled" && (
            <button
              type="button"
              onClick={handleUnschedule}
              disabled={isPending}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              ↺ Desagendar
            </button>
          )}
        </div>
      )}

      {status === "scheduled" && (
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <label className="text-xs font-medium text-gray-500">
            Já publicaste no Instagram? Cola o link para marcar como publicada
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={permalink}
              onChange={(e) => setPermalink(e.target.value)}
              placeholder="https://www.instagram.com/p/..."
              disabled={isPending}
              className="flex-1 text-sm bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleMarkPublished}
              disabled={isPending}
              className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              Marcar publicada
            </button>
          </div>
        </div>
      )}

      {status === "published" && (
        <div className="space-y-1">
          <p className="text-sm text-emerald-700 font-medium">
            Publicada{publishedAt ? ` em ${new Date(publishedAt).toLocaleDateString("pt-PT")}` : ""}
          </p>
          {igPermalink && (
            <a href={igPermalink} target="_blank" rel="noreferrer" className="text-xs text-[#667470] underline break-all">
              {igPermalink}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
