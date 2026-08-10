"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type CalendarPost = {
  id: string;
  caption: string | null;
  scheduled_for: string;
  photo: { blob_url: string; filename: string | null } | null;
};

const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

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

export function PostCalendar({ posts }: { posts: CalendarPost[] }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const postsByDay = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const key = dayKey(new Date(post.scheduled_for));
    if (!postsByDay.has(key)) postsByDay.set(key, []);
    postsByDay.get(key)!.push(post);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
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
          const dayPosts = postsByDay.get(dayKey(date)) ?? [];
          const isToday = sameDay(date, today);

          return (
            <div
              key={dayKey(date)}
              className={`min-h-[92px] rounded-lg border p-1 flex flex-col gap-1 ${
                isToday ? "border-[#667470] bg-[#667470]/5" : "border-gray-100"
              }`}
            >
              <span className={`text-[11px] font-medium px-0.5 ${isToday ? "text-[#667470]" : "text-gray-400"}`}>
                {date.getDate()}
              </span>
              {dayPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/admin/social/posts/${post.id}`}
                  className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 rounded-md p-1 transition-colors"
                >
                  {post.photo?.blob_url && (
                    <div className="relative w-5 h-5 rounded overflow-hidden shrink-0 bg-gray-200">
                      <Image src={post.photo.blob_url} alt="" fill sizes="20px" className="object-cover" />
                    </div>
                  )}
                  <span className="text-[10px] text-gray-600 truncate">
                    {post.caption ? post.caption.slice(0, 28) : "Sem legenda"}
                  </span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
