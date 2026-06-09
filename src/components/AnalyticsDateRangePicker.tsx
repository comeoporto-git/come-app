"use client";

import { useState, useRef, useEffect } from "react";

export interface DateRange {
  start: Date | null; // null = all history (no lower bound)
  end: Date | null;   // null = open-ended (include future tours)
}

const MONTHS_FULL = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function addMonths(d: Date, n: number) {
  const r = new Date(d); r.setDate(1); r.setMonth(r.getMonth() + n); return r;
}

function makePresets(): { label: string; range: DateRange }[] {
  const ago = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(0,0,0,0); return d; };
  return [
    { label: "30 dias",  range: { start: ago(30),  end: null } },
    { label: "3 meses",  range: { start: ago(90),  end: null } },
    { label: "6 meses",  range: { start: ago(180), end: null } },
    { label: "12 meses", range: { start: ago(365), end: null } },
    { label: "Tudo",     range: { start: null,     end: null } },
  ];
}

function CalMonth({
  year, month,
  lo, hi, pickingEnd, hovered,
  onClickDay, onHoverDay,
}: {
  year: number; month: number;
  lo: Date | null; hi: Date | null;
  pickingEnd: boolean; hovered: Date | null;
  onClickDay: (d: Date) => void;
  onHoverDay: (d: Date | null) => void;
}) {
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // Effective range for highlight (while picking, hi = hovered)
  const effectiveHi = pickingEnd ? hovered : hi;
  const [rLo, rHi] = lo && effectiveHi && lo > effectiveHi
    ? [effectiveHi, lo]
    : [lo, effectiveHi];

  return (
    <div className="select-none">
      <p className="text-center text-sm font-semibold text-[#32373c] mb-3">
        {MONTHS_FULL[month]} {year}
      </p>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const isLo      = lo && sameDay(date, lo);
          const isHi      = hi && sameDay(date, hi);
          const isHov     = hovered && sameDay(date, hovered);
          const selected  = isLo || (pickingEnd ? isHov : isHi);
          const inRange   = rLo && rHi && date > rLo && date < rHi;
          const isToday   = sameDay(date, TODAY);

          return (
            <button
              key={date.getDate()}
              onClick={() => onClickDay(new Date(date))}
              onMouseEnter={() => onHoverDay(new Date(date))}
              onMouseLeave={() => onHoverDay(null)}
              className={[
                "relative h-8 text-xs font-medium transition-colors",
                selected
                  ? "bg-[#32373c] text-white rounded-lg z-10"
                  : inRange
                  ? "bg-[#32373c]/10 text-[#32373c] rounded-none"
                  : isToday
                  ? "text-[#667470] font-bold hover:bg-gray-100 rounded-lg"
                  : "text-gray-700 hover:bg-gray-100 rounded-lg",
              ].join(" ")}
            >
              {date.getDate()}
              {isToday && !selected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#667470]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatLabel(value: DateRange): string {
  if (!value.start) return "Todo o histórico";
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
  if (!value.end) return `${fmt(value.start)} – hoje`;
  return `${fmt(value.start)} – ${fmt(value.end)}`;
}

export function AnalyticsDateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  // View anchored to the left month shown in the calendar
  const [viewDate, setViewDate] = useState<Date>(() => {
    const anchor = value.start ?? new Date(Date.now() - 30 * 86400000);
    const d = new Date(anchor); d.setDate(1);
    // If anchor is close to now, show the month before current so right panel = current
    const now = new Date(); now.setDate(1);
    if (d >= now) { d.setMonth(d.getMonth() - 1); }
    return d;
  });

  // Picking state: null = idle (show committed range), "end" = user clicked start, awaiting end
  const [pickingEnd, setPickingEnd] = useState(false);
  const [tempStart, setTempStart]   = useState<Date | null>(null);
  const [hovered, setHovered]       = useState<Date | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPickingEnd(false);
        setTempStart(null);
        setHovered(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleDayClick(date: Date) {
    if (!pickingEnd) {
      setTempStart(date);
      setPickingEnd(true);
    } else {
      const start = tempStart!;
      const end   = date;
      const [lo, hi] = start <= end ? [start, end] : [end, start];
      hi.setHours(23, 59, 59, 999);
      onChange({ start: lo, end: hi });
      setPickingEnd(false);
      setTempStart(null);
      setHovered(null);
      setOpen(false);
    }
  }

  function handlePreset(range: DateRange) {
    onChange(range);
    setPickingEnd(false);
    setTempStart(null);
    setOpen(false);
  }

  function openPicker() {
    setPickingEnd(false);
    setTempStart(null);
    setHovered(null);
    // Reset view to anchor around start
    const anchor = value.start ?? new Date(Date.now() - 30 * 86400000);
    const d = new Date(anchor); d.setDate(1);
    const now = new Date(); now.setDate(1);
    if (d >= now) d.setMonth(d.getMonth() - 1);
    setViewDate(d);
    setOpen((o) => !o);
  }

  const m2 = addMonths(viewDate, 1);

  // Display values for calendar highlight
  const displayLo = pickingEnd ? tempStart : value.start;
  const displayHi = pickingEnd ? null      : value.end;

  const PRESETS = makePresets();

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Trigger */}
      <button
        onClick={openPicker}
        className="flex items-center gap-2 bg-black/10 hover:bg-black/20 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-all"
      >
        <svg className="w-4 h-4 text-white/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{formatLabel(value)}</span>
        <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-5 flex gap-5">
          {/* Presets */}
          <div className="flex flex-col gap-0.5 border-r border-gray-100 pr-5 min-w-[108px]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Período</p>
            {PRESETS.map(({ label, range }) => {
              const active =
                !pickingEnd &&
                ((range.start === null) === (value.start === null)) &&
                ((range.end === null) === (value.end === null)) &&
                (range.start === null || (value.start !== null && sameDay(range.start, value.start)));
              return (
                <button
                  key={label}
                  onClick={() => handlePreset(range)}
                  className={[
                    "text-left text-sm px-3 py-1.5 rounded-lg font-medium transition-colors",
                    active
                      ? "bg-[#32373c] text-white"
                      : "text-gray-700 hover:bg-gray-100",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ou seleciona</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {pickingEnd ? "Clica na data final" : "Clica no início do intervalo"}
              </p>
            </div>
          </div>

          {/* Calendar */}
          <div>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setViewDate(addMonths(viewDate, -1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                onClick={() => setViewDate(addMonths(viewDate, 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            <div className="flex gap-6">
              <CalMonth
                year={viewDate.getFullYear()} month={viewDate.getMonth()}
                lo={displayLo} hi={displayHi}
                pickingEnd={pickingEnd} hovered={hovered}
                onClickDay={handleDayClick} onHoverDay={setHovered}
              />
              <CalMonth
                year={m2.getFullYear()} month={m2.getMonth()}
                lo={displayLo} hi={displayHi}
                pickingEnd={pickingEnd} hovered={hovered}
                onClickDay={handleDayClick} onHoverDay={setHovered}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
