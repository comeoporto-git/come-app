"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { schedulePost } from "@/actions/social";
import { CategoryBadge } from "@/components/social/CategoryBadge";

export type CalendarPost = {
  id: string;
  caption: string | null;
  category: string | null;
  scheduled_for: string | null;
  photo: { blob_url: string; filename: string | null } | null;
};

const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

const DEFAULT_TIME = "10:00";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateTimeLocal(date: Date, time: string) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

function timeOf(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PostThumb({ post }: { post: CalendarPost }) {
  return (
    <>
      {post.photo?.blob_url && (
        <div className="relative w-5 h-5 rounded overflow-hidden shrink-0 bg-gray-200">
          <Image src={post.photo.blob_url} alt="" fill sizes="20px" className="object-cover" />
        </div>
      )}
      <span className="text-[10px] text-gray-600 truncate">{post.caption ? post.caption.slice(0, 28) : "Sem legenda"}</span>
    </>
  );
}

export function PostCalendar({
  scheduledPosts,
  unscheduledPosts,
}: {
  scheduledPosts: CalendarPost[];
  unscheduledPosts: CalendarPost[];
}) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [isPending, startTransition] = useTransition();
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const postsByDay = new Map<string, CalendarPost[]>();
  for (const post of scheduledPosts) {
    if (!post.scheduled_for) continue;
    const key = dayKey(new Date(post.scheduled_for));
    if (!postsByDay.has(key)) postsByDay.set(key, []);
    postsByDay.get(key)!.push(post);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function handleDragStart(e: React.DragEvent, postId: string) {
    e.dataTransfer.setData("text/plain", postId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(date: Date, e: React.DragEvent) {
    e.preventDefault();
    setDragOverKey(null);
    const postId = e.dataTransfer.getData("text/plain");
    if (!postId) return;

    // Reschedules keep the original time-of-day; a first-time schedule from
    // the unscheduled tray defaults to a sensible posting time.
    const existing = scheduledPosts.find((p) => p.id === postId);
    const time = existing?.scheduled_for ? timeOf(existing.scheduled_for) : DEFAULT_TIME;
    const iso = toDateTimeLocal(date, time);

    startTransition(async () => {
      await schedulePost(postId, iso);
    });
  }

  return (
    <div className="space-y-4">
      {unscheduledPosts.length > 0 && (
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 ${isPending ? "opacity-60" : ""}`}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Aprovadas por agendar — arrasta para um dia no calendário
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {unscheduledPosts.map((post) => (
              <div
                key={post.id}
                draggable
                onDragStart={(e) => handleDragStart(e, post.id)}
                className="flex-none w-28 bg-gray-50 hover:bg-gray-100 rounded-xl p-1.5 cursor-grab active:cursor-grabbing transition-colors"
              >
                <Link href={`/admin/social/posts/${post.id}`} draggable={false} className="block">
                  <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-200 mb-1">
                    {post.photo?.blob_url && (
                      <Image src={post.photo.blob_url} alt="" fill sizes="112px" className="object-cover" />
                    )}
                  </div>
                  <CategoryBadge category={post.category} />
                  <p className="text-[10px] text-gray-600 truncate mt-1">
                    {post.caption ? post.caption.slice(0, 30) : "Sem legenda"}
                  </p>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setViewDate(addMonths(viewDate, -1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <p className="text-sm font-semibold text-[#32373c]">
            {MONTHS_FULL[month]} {year}
          </p>
          <button
            type="button"
            onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Mês seguinte"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} className="min-h-[92px]" />;
            const key = dayKey(date);
            const dayPosts = postsByDay.get(key) ?? [];
            const isToday = sameDay(date, today);
            const isDragOver = dragOverKey === key;

            return (
              <div
                key={key}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverKey !== key) setDragOverKey(key);
                }}
                onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => handleDrop(date, e)}
                className={`min-h-[92px] rounded-lg border p-1 flex flex-col gap-1 transition-colors ${
                  isDragOver
                    ? "border-[#667470] bg-[#667470]/10"
                    : isToday
                      ? "border-[#667470] bg-[#667470]/5"
                      : "border-gray-100"
                }`}
              >
                <span className={`text-[11px] font-medium px-0.5 ${isToday ? "text-[#667470]" : "text-gray-400"}`}>
                  {date.getDate()}
                </span>
                {dayPosts.map((post) => (
                  <div
                    key={post.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, post.id)}
                    className={`cursor-grab active:cursor-grabbing rounded-md ${isPending ? "opacity-60" : ""}`}
                  >
                    <Link
                      href={`/admin/social/posts/${post.id}`}
                      draggable={false}
                      className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 rounded-md p-1 transition-colors"
                    >
                      <PostThumb post={post} />
                    </Link>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
