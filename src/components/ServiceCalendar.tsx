"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Tour } from "@/lib/notion";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const TYPE_CHIPS = [
  "bg-emerald-100 text-emerald-800",
  "bg-orange-100 text-orange-800",
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-amber-100 text-amber-800",
];
const TYPE_DOTS = ["bg-emerald-400", "bg-orange-400", "bg-blue-400", "bg-violet-400", "bg-rose-400", "bg-amber-400"];

// Same hash as the list view, so a service type keeps its colour across views.
function typeIndex(type: string): number {
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return h % TYPE_CHIPS.length;
}

function isCancelled(t: Tour): boolean {
  return t.status === "Cancelled" || t.status === "Canceled";
}

/** YYYY-MM-DD of the service in Lisbon time. */
function lisbonDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

const MAX_CHIPS = 3;

export function ServiceCalendar({ tours }: { tours: Tour[] }) {
  const todayKey = lisbonDay(new Date().toISOString());
  const [year, setYear]   = useState(() => Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string | null>(todayKey);

  const byDay = useMemo(() => {
    const map = new Map<string, Tour[]>();
    for (const t of tours) {
      if (!t.date) continue;
      const key = lisbonDay(t.date);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return map;
  }, [tours]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first offset of the 1st of the month.
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(year, month, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  const monthTotal = Array.from(byDay.entries())
    .filter(([k]) => k.startsWith(`${year}-${pad(month + 1)}`))
    .reduce((n, [, list]) => n + list.filter((t) => !isCancelled(t)).length, 0);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(null);
  }

  function goToday() {
    setYear(Number(todayKey.slice(0, 4)));
    setMonth(Number(todayKey.slice(5, 7)) - 1);
    setSelected(todayKey);
  }

  const selectedTours = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#32373c]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior" className="p-1.5 rounded-lg hover:bg-gray-100">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button type="button" onClick={() => shift(1)} aria-label="Mês seguinte" className="p-1.5 rounded-lg hover:bg-gray-100">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <h3 className="text-sm font-semibold capitalize ml-1">{monthLabel}</h3>
            <span className="text-xs text-gray-400 ml-1">· {monthTotal} serviços</span>
          </div>
          <button type="button" onClick={goToday} className="text-xs font-medium text-[#667470] hover:text-[#32373c] px-2 py-1 rounded-lg hover:bg-gray-100">
            Hoje
          </button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-center sm:text-left">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="min-h-14 sm:min-h-28 border-b border-r border-gray-50 bg-gray-50/50" />;
            }
            const key = dayKey(year, month, day);
            const list = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(isSelected ? null : key)}
                className={`min-h-14 sm:min-h-28 border-b border-r border-gray-50 p-1 sm:p-1.5 text-left align-top flex flex-col gap-1 transition-colors ${
                  isSelected ? "bg-[#667470]/10" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`text-xs w-6 h-6 flex items-center justify-center rounded-full shrink-0 ${
                    isToday ? "bg-[#32373c] text-white font-semibold" : "text-gray-500"
                  }`}
                >
                  {day}
                </span>

                {/* Chips on wider screens */}
                <div className="hidden sm:flex flex-col gap-0.5 w-full min-w-0">
                  {list.slice(0, MAX_CHIPS).map((t) => (
                    <span
                      key={t.id}
                      title={`${t.startTime ?? ""} ${t.serviceName ?? t.saleId}`.trim()}
                      className={`block truncate text-[11px] leading-4 px-1.5 py-0.5 rounded-md ${
                        isCancelled(t) ? "bg-gray-100 text-gray-400 line-through" : TYPE_CHIPS[typeIndex(t.serviceType)]
                      }`}
                    >
                      {t.startTime && <span className="font-semibold">{t.startTime} </span>}
                      {t.serviceName || t.saleId}
                    </span>
                  ))}
                  {list.length > MAX_CHIPS && (
                    <span className="text-[11px] text-gray-400 px-1.5">+{list.length - MAX_CHIPS} mais</span>
                  )}
                </div>

                {/* Dots on mobile */}
                {list.length > 0 && (
                  <div className="flex sm:hidden flex-wrap gap-0.5 px-0.5">
                    {list.slice(0, 4).map((t) => (
                      <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${isCancelled(t) ? "bg-gray-300" : TYPE_DOTS[typeIndex(t.serviceType)]}`} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day */}
      {selected && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/80">
            {new Date(`${selected}T12:00:00`).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}{selectedTours.length}
          </h3>
          {selectedTours.length === 0 ? (
            <p className="text-sm text-white/50 py-4 text-center">Sem serviços neste dia</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedTours.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/guide/tours/${t.id}`}
                    className={`flex items-center justify-between gap-3 bg-white rounded-xl px-4 py-3 shadow-sm text-[#32373c] hover:bg-gray-50 transition-colors ${isCancelled(t) ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">{t.saleId}</p>
                      <p className="text-sm font-semibold truncate">
                        {t.startTime && <span>{t.startTime}{t.endTime ? ` - ${t.endTime}` : ""} · </span>}
                        {t.serviceName || "—"}
                      </p>
                      {(t.guideName || t.numGuests > 0) && (
                        <p className="text-xs text-gray-400">
                          {t.guideName ? `🧭 ${t.guideName}` : ""}
                          {t.guideName && t.numGuests > 0 ? " · " : ""}
                          {t.numGuests > 0 ? `${t.numGuests} pax` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {t.serviceType && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_CHIPS[typeIndex(t.serviceType)]}`}>
                          {t.serviceType}
                        </span>
                      )}
                      {isCancelled(t) && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">{t.status}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
