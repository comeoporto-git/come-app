"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AnalyticsDateRangePicker, type DateRange } from "@/components/AnalyticsDateRangePicker";
import type { Tour, Transaction } from "@/lib/notion";
import {
  buildMonthlySeries, buildYoYSeries, buildMoMSeries, summarizeAll,
  type DatedAmount, type GrowthPoint,
} from "@/lib/financials";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const CURRENT_YEAR  = TODAY.getFullYear();
const CURRENT_MONTH = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtEur(n: number) {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function isCancelled(t: Tour) {
  return t.status === "Cancelled";
}
function isTourFuture(t: Tour) {
  return !!t.date && new Date(t.date) >= TODAY;
}
function isBernardoGuide(name: string) {
  return name.toLowerCase().includes("bernardo");
}

type ServiceTourDetail = {
  id: string; date: string | null; clientName: string; guideName: string;
  numGuests: number; status: string;
  revenue: number; cost: number; profit: number;
  revenueNet: number; costNet: number; profitNet: number;
};
function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("pt-PT", { month: "short" })
    .replace(".", "");
}

const STATUS_COLORS: Record<string, string> = {
  Confirmed:  "bg-green-400",
  Pending:    "bg-yellow-400",
  Paid:       "bg-blue-400",
  Cancelled:  "bg-red-400",
  Invoiced:   "bg-violet-400",
  Finalised:  "bg-emerald-400",
};

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "resumo",     label: "Resumo",     icon: "📊" },
  { id: "servicos",   label: "Serviços",   icon: "🗓️" },
  { id: "equipa",     label: "Equipa",     icon: "👥" },
  { id: "clientes",   label: "Clientes",   icon: "🤝" },
  { id: "financeiro", label: "Financeiro", icon: "💰" },
] as const;

type Category = typeof CATEGORIES[number]["id"];

// ── UI components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false, subAccent = false }: {
  label: string; value: string; sub?: string; accent?: boolean; subAccent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 flex flex-col gap-1 min-w-0 overflow-hidden ${
      accent ? "bg-[#32373c] border-[#32373c] text-white" : "bg-white border-gray-100 shadow-sm"
    }`}>
      <p className={`text-[11px] font-medium uppercase tracking-wide leading-tight ${accent ? "text-white/50" : "text-gray-400"}`}>{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold ${accent ? "text-white" : "text-[#32373c]"}`}>{value}</p>
      {sub && (
        <p className={`text-xs ${
          subAccent ? "text-amber-300 font-semibold" : accent ? "text-white/40" : "text-gray-400"
        }`}>{sub}</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center overflow-hidden">
      <p className="text-xl font-bold text-[#32373c] truncate">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function HBar({ label, value, max, color = "bg-[#667470]", labelWidth = "w-20 sm:w-36", formatValue }: {
  label: string; value: number; max: number; color?: string; labelWidth?: string;
  formatValue?: (v: number) => string;
}) {
  const pct     = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const realPct = max > 0 ? Math.round((value / max) * 100) : 0;
  const displayed = formatValue ? formatValue(value) : fmt(value);
  return (
    <div className="group/hbar relative flex items-center gap-2 sm:gap-3 rounded-lg hover:bg-gray-50 transition-colors cursor-default">
      <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 opacity-0 group-hover/hbar:opacity-100 transition-opacity z-20 pointer-events-none">
        <div className="bg-[#32373c] text-white text-[11px] font-semibold rounded px-2 py-0.5 whitespace-nowrap shadow">
          {displayed} · {realPct}%
        </div>
      </div>
      <span className={`text-xs text-gray-500 shrink-0 ${labelWidth} truncate text-right`}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-opacity group-hover/hbar:opacity-80`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 sm:w-16 text-right shrink-0">{displayed}</span>
    </div>
  );
}

function SectionCard({ title, sub, children }: {
  title: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm [transform:translateZ(0)]">
      <div className="px-4 sm:px-5 py-4 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-[#32373c]">{title}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="px-4 sm:px-5 py-4">{children}</div>
    </section>
  );
}

/** VBars — vertical bar chart. Pass `colors` for per-bar color overrides.
 *  Pass `baseValues`+`baseColors` to render a solid darker layer within each bar
 *  (used to split past vs future services in the yearly chart).
 *  Pass `formatValues` for per-bar label overrides (e.g. signed profit strings). */
function VBars({ entries, max, color, colors, formatValue, formatValues, barHeight = 88, baseValues, baseColors }: {
  entries: [string, number][];
  max: number;
  color: string;
  colors?: string[];
  formatValue?: (v: number) => string;
  formatValues?: string[];
  barHeight?: number;
  baseValues?: number[];
  baseColors?: string[];
}) {
  return (
    <div className="[overflow-x:clip] flex items-end gap-2" style={{ height: `${barHeight + 32}px` }}>
      {entries.map(([label, value], i) => {
        const pct       = (value / max) * 100;
        const barColor  = colors?.[i] ?? color;
        const baseVal   = baseValues?.[i] ?? value;
        const baseColor = baseColors?.[i] ?? barColor;
        const basePct      = max > 0 ? (baseVal / max) * 100 : 0;
        const displayLabel = formatValues?.[i] ?? (formatValue ? formatValue(value) : fmt(value));
        const tooltipLabel = baseValues
          ? `${fmt(value)} total · ${fmt(baseVal)} realizado${baseVal !== 1 ? "s" : ""}`
          : displayLabel;
        return (
          <div key={label} className="group/vbar flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
            {value > 0 && (
              <span className="block w-full text-center text-[10px] font-semibold text-gray-500 leading-none overflow-hidden">
                {displayLabel}
              </span>
            )}
            <div className="w-full relative" style={{ height: `${barHeight}px` }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 opacity-0 group-hover/vbar:opacity-100 transition-opacity z-30 pointer-events-none">
                <div className="bg-[#32373c] text-white text-[11px] font-semibold rounded px-2 py-0.5 whitespace-nowrap shadow">
                  {tooltipLabel}
                </div>
              </div>

              <div
                className={`absolute bottom-0 w-full ${barColor} rounded-t-lg`}
                style={{ height: `${pct}%`, minHeight: value > 0 ? "4px" : "0" }}
              />
              {baseValues && (
                <div
                  className={`absolute bottom-0 w-full ${baseColor} rounded-t-lg`}
                  style={{ height: `${basePct}%`, minHeight: baseVal > 0 ? "4px" : "0" }}
                />
              )}
            </div>
            <span className="text-xs text-gray-400 capitalize leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mt-3">
      {items.map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`inline-block w-3 h-2.5 rounded-sm ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** StackedVBars — vertical bar chart with status-coloured stacked segments. */
function StackedVBars({ data, max, barHeight = 88, formatValue }: {
  data: { label: string; segments: Record<string, number>; total: number; isFuture: boolean }[];
  max: number;
  barHeight?: number;
  formatValue?: (v: number) => string;
}) {
  const fmtVal = (v: number) => formatValue ? formatValue(v) : fmt(v);
  const [hovered, setHovered] = useState<{ col: string; status: string } | null>(null);
  return (
    <div className="[overflow-x:clip] flex items-end gap-2" style={{ height: `${barHeight + 32}px` }}>
      {data.map(({ label, segments: seg, total, isFuture }) => {
        const totalPct = max > 0 ? (total / max) * 100 : 0;
        const entries  = Object.entries(seg).sort((a, b) => b[1] - a[1]);
        const activeStatus = hovered?.col === label ? hovered.status : null;
        return (
          <div key={label} className="group/svbar flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
            {total > 0 && (
              <span className="block w-full text-center text-[10px] font-semibold text-gray-500 leading-none overflow-hidden">{fmtVal(total)}</span>
            )}
            <div className="w-full relative" style={{ height: `${barHeight}px` }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 opacity-0 group-hover/svbar:opacity-100 transition-opacity z-30 pointer-events-none">
                <div className="bg-[#32373c] text-white text-[11px] font-semibold rounded px-2 py-1.5 whitespace-nowrap shadow space-y-1">
                  <div className="border-b border-white/20 pb-1 mb-0.5">{fmtVal(total)}</div>
                  {entries.map(([status, value]) => (
                    <div key={status} className={`flex items-center gap-1.5 transition-opacity ${activeStatus && activeStatus !== status ? "opacity-40" : ""}`}>
                      <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-400"}`} />
                      <span className={activeStatus === status ? "font-bold" : ""}>{status}: {fmtVal(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div
                className={`absolute bottom-0 w-full rounded-t-lg overflow-hidden${isFuture ? " opacity-40" : ""}`}
                style={{ height: `${totalPct}%`, minHeight: total > 0 ? "4px" : "0" }}
              >
                {(() => {
                  let cumPct = 0;
                  return entries.map(([status, value]) => {
                    const segPct = total > 0 ? (value / total) * 100 : 0;
                    const bottom = cumPct;
                    cumPct += segPct;
                    return (
                      <div
                        key={status}
                        className={`absolute w-full ${STATUS_COLORS[status] ?? "bg-gray-400"} transition-opacity ${activeStatus && activeStatus !== status ? "opacity-50" : ""}`}
                        style={{ bottom: `${bottom}%`, height: `${segPct}%` }}
                        onMouseEnter={() => setHovered({ col: label, status })}
                        onMouseLeave={() => setHovered(null)}
                      />
                    );
                  });
                })()}
              </div>
            </div>
            <span className="text-xs text-gray-400 capitalize leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function fmtPct(v: number | null, decimals = 1) {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmt(v * 100, decimals)}%`;
}

/** LineTrend — dependency-free SVG line chart for capped growth-% series.
 *  `min`/`max` are fraction values (e.g. -1 / 3 = -100% / +300%) matching each
 *  point's `capped` field. A dashed line marks 0%. X labels are thinned so
 *  they stay readable with 40+ months of data on a phone screen. */
function LineTrend({ series, min, max, capNote }: {
  series: { label: string; color: string; points: GrowthPoint[] }[];
  min: number; max: number; capNote?: string;
}) {
  const categories = series[0]?.points.map((p) => ({ key: p.key, label: p.label })) ?? [];
  const n = categories.length;
  if (n === 0) return <EmptyState />;

  const H = 100, stepX = 10, W = Math.max(n * stepX, stepX);
  const yFor = (v: number) => H - ((v - min) / (max - min)) * H;
  const zeroY = yFor(0);
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div>
      <div className="relative">
        {/* y-axis labels */}
        <div className="absolute -left-1 top-0 h-full flex flex-col justify-between text-[9px] text-gray-300 -translate-x-full pr-1.5">
          <span>{fmtPct(max, 0)}</span>
          <span>0%</span>
          <span>{fmtPct(min, 0)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 140 }}>
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#E5E7EB" strokeWidth={0.6} strokeDasharray="2,2" />
          {series.map(({ label, color, points }) => {
            let d = "";
            let drawing = false;
            points.forEach((p, i) => {
              const x = i * stepX + stepX / 2;
              if (p.capped === null) { drawing = false; return; }
              const y = yFor(p.capped);
              d += `${drawing ? "L" : "M"}${x},${y} `;
              drawing = true;
            });
            return <path key={label} d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />;
          })}
        </svg>
        <div className="flex text-[9px] text-gray-300 mt-1" style={{ marginLeft: 0 }}>
          {categories.map(({ key, label }, i) => (
            <span key={key} className="text-center" style={{ width: `${100 / n}%` }}>
              {/* label is "jan 2025" etc. (year-inclusive, from financials.ts) — shorten to "jan/25" so
                  it stays readable when several years of monthly data are on screen at once. */}
              {i % labelEvery === 0 ? label.replace(/ (\d{2})\d{2}$/, "/$1") : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-3">
        {series.map(({ label, color, points }) => {
          const latest = [...points].reverse().find((p) => p.value !== null);
          return (
            <span key={label} className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-3 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {label} <span className="font-semibold text-gray-700">{fmtPct(latest?.value ?? null)}</span>
            </span>
          );
        })}
      </div>
      {capNote && <p className="text-[11px] text-gray-300 mt-2">{capNote}</p>}
    </div>
  );
}

function IvaToggle({ value, onChange }: { value: "com" | "sem"; onChange: (v: "com" | "sem") => void }) {
  return (
    <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold shrink-0">
      {(["com", "sem"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            value === mode ? "bg-white text-[#32373c] shadow-sm" : "text-white/60 hover:text-white"
          }`}
        >
          {mode === "com" ? "Com IVA" : "Sem IVA"}
        </button>
      ))}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3 text-gray-300 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 3H3v10h10V10M9 3h4v4M12.5 3.5L7 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfitRow({ label, services, ivaMode, gross, net, tours }: {
  label: string; services?: number; ivaMode: "com" | "sem";
  gross: { revenue: number; cost: number; profit: number; margin: number };
  net: { revenue: number; cost: number; profit: number; margin: number };
  tours?: ServiceTourDetail[];
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!tours && tours.length > 0;
  const shown = ivaMode === "com" ? gross : net;
  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={`w-full text-left py-2.5 space-y-1.5 ${expandable ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[#32373c] truncate flex items-center gap-1.5">
            {expandable && (
              <svg
                className={`w-2.5 h-2.5 text-gray-300 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                viewBox="0 0 16 16" fill="currentColor"
              >
                <path d="M6 4l4 4-4 4V4z" />
              </svg>
            )}
            <span className="truncate">
              {label}{services != null && <span className="text-gray-400 font-normal"> · {services} serviços</span>}
            </span>
          </span>
          <span className={`text-sm font-bold shrink-0 ${shown.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtEur(shown.profit)}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>Receita <span className="text-gray-600 font-medium">{fmtEur(shown.revenue)}</span></span>
          <span>Custo <span className="text-gray-600 font-medium">{fmtEur(shown.cost)}</span></span>
          <span className={`ml-auto font-semibold ${shown.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(shown.margin, 0)}% margem</span>
        </div>
      </button>
      {open && expandable && (
        <div className="pb-3 pl-4 space-y-1.5">
          {tours!.map((t) => {
            const tRevenue = ivaMode === "com" ? t.revenue : t.revenueNet;
            const tCost    = ivaMode === "com" ? t.cost    : t.costNet;
            const tProfit  = ivaMode === "com" ? t.profit  : t.profitNet;
            const tMargin  = tRevenue > 0 ? (tProfit / tRevenue) * 100 : 0;
            return (
              <Link
                key={t.id}
                href={`/guide/tours/${t.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 bg-gray-50 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-gray-700 font-medium truncate">
                    {t.date ? new Date(t.date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "Sem data"}
                    {t.clientName && <span className="text-gray-400 font-normal"> · {t.clientName}</span>}
                  </p>
                  <p className="text-gray-400 truncate">
                    {t.guideName || "Sem guia"} · {t.numGuests} pax · {t.status}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="text-right">
                    <p className={`font-semibold ${tProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmtEur(tProfit)}
                      {tRevenue > 0 && <span className="font-normal"> · {fmt(tMargin, 0)}%</span>}
                    </p>
                    <p className="text-gray-400">{fmtEur(tRevenue)} − {fmtEur(tCost)}</p>
                  </div>
                  <ExternalLinkIcon />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message = "Sem dados para este período" }: { message?: string }) {
  return <p className="text-sm text-gray-400 text-center py-6">{message}</p>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnalyticsDashboard({
  tours: allTours,
  transactions: allTransactions,
  teamMap,
  clientNameMap,
}: {
  tours: Tour[];
  transactions: Transaction[];
  teamMap: Record<string, string>;
  clientNameMap: Record<string, string>;
}) {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  });
  const [category, setCategory] = useState<Category>("resumo");
  const [ivaMode, setIvaMode] = useState<"com" | "sem">("com");
  const [profitTypeFilter, setProfitTypeFilter] = useState<string>("all");

  // ── By year (always full history) ──────────────────────────────────────────
  const yearlyData = useMemo(() => {
    const map: Record<number, {
      services: number; futureSvcs: number;
      servicesByStatus: Record<string, number>;
      revenue: number; revenueByStatus: Record<string, number>;
      billingByStatus: Record<string, number>;
    }> = {};
    for (const t of allTours) {
      if (!t.date || isCancelled(t)) continue;
      const y = new Date(t.date).getFullYear();
      if (!map[y]) map[y] = { services: 0, futureSvcs: 0, servicesByStatus: {}, revenue: 0, revenueByStatus: {}, billingByStatus: {} };
      map[y].services++;
      if (isTourFuture(t)) map[y].futureSvcs++;
      const s = t.status || "Sem estado";
      map[y].servicesByStatus[s] = (map[y].servicesByStatus[s] ?? 0) + 1;
      if (t.expectedRevenue) {
        map[y].billingByStatus[s] = (map[y].billingByStatus[s] ?? 0) + t.expectedRevenue;
      }
    }
    const tourStatusById = new Map(
      allTours.filter((t) => t.id).map((t) => [t.id!, t.status || "Sem estado"])
    );
    for (const t of allTransactions) {
      if (!t.date || !t.supplier.startsWith("IN -")) continue;
      const tourStatus = t.tourId ? (tourStatusById.get(t.tourId) ?? "Sem estado") : "Sem estado";
      if (tourStatus === "Cancelled") continue;
      const y = new Date(t.date).getFullYear();
      if (!map[y]) map[y] = { services: 0, futureSvcs: 0, servicesByStatus: {}, revenue: 0, revenueByStatus: {}, billingByStatus: {} };
      map[y].revenue += t.totalCost;
      map[y].revenueByStatus[tourStatus] = (map[y].revenueByStatus[tourStatus] ?? 0) + t.totalCost;
    }
    return Object.entries(map)
      .map(([year, d]) => ({
        year: Number(year),
        ...d,
        // A year is "future-dominant" if it's strictly beyond the current year
        isFuture: Number(year) > CURRENT_YEAR,
        // Current year has some future tours mixed in
        hasFuturePartial: Number(year) === CURRENT_YEAR && d.futureSvcs > 0,
      }))
      .sort((a, b) => a.year - b.year);
  }, [allTours, allTransactions]);

  const maxYearlyServices = Math.max(...yearlyData.map((d) => d.services), 1);
  const maxYearlyRevenue  = Math.max(...yearlyData.map((d) => d.revenue), 1);
  const hasYearlyRevenue  = yearlyData.some((d) => d.revenue > 0);
  const yearlyHasFuture   = yearlyData.some((d) => d.isFuture || d.hasFuturePartial);
  const yearlyBillingTotals = yearlyData.map((d) => Object.values(d.revenueByStatus).reduce((a, b) => a + b, 0));
  const maxYearlyBilling    = Math.max(...yearlyBillingTotals, 1);
  const hasYearlyBilling    = yearlyBillingTotals.some((v) => v > 0);

  // ── Date-range-filtered analytics ────────────────────────────────────────
  const a = useMemo(() => {
    const { start, end } = dateRange;
    const tours = allTours.filter((t) => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      return true;
    });
    const txns = allTransactions.filter((t) => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      return true;
    });

    const completed       = tours.filter((t) => !isCancelled(t));
    const cancelled       = tours.filter((t) => isCancelled(t));
    const pastCompleted   = completed.filter((t) => !isTourFuture(t));
    const futureCompleted = completed.filter((t) => isTourFuture(t));
    const hasFuture       = futureCompleted.length > 0;

    // KPIs — base on all completed (past + future)
    const totalGuests = completed.reduce((s, t) => s + t.numGuests, 0);
    const avgGroup    = completed.length > 0 ? totalGuests / completed.length : 0;
    const cancelRate  = tours.length > 0 ? (cancelled.length / tours.length) * 100 : 0;

    // Monthly trend — span of selected range
    const effectiveEnd = end ?? new Date();
    const diffDays = start
      ? (effectiveEnd.getTime() - start.getTime()) / 86_400_000
      : Infinity;
    const numMonths = diffDays > 180 ? 12 : diffDays > 60 ? 6 : diffDays > 20 ? 3 : 1;
    const monthlyMap: Record<string, number> = {};
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(effectiveEnd); d.setDate(1); d.setMonth(d.getMonth() - i);
      monthlyMap[monthKey(d)] = 0;
    }
    // Add any future months that aren't already in the window
    for (const t of futureCompleted) {
      if (!t.date) continue;
      const k = monthKey(new Date(t.date));
      if (!(k in monthlyMap)) monthlyMap[k] = 0;
    }
    // Count all completed tours
    for (const t of completed) {
      if (!t.date) continue;
      const k = monthKey(new Date(t.date));
      if (k in monthlyMap) monthlyMap[k]++;
    }
    // Sort chronologically
    const monthlyEntries  = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b));
    const maxMonthly      = Math.max(...monthlyEntries.map(([, v]) => v), 1);
    // A month key > CURRENT_MONTH is definitively future
    const monthlyIsFuture = monthlyEntries.map(([k]) => k > CURRENT_MONTH);
    const monthlyColors   = monthlyIsFuture.map((f) => f ? "bg-[#667470]/40" : "bg-[#667470]");
    const hasFutureMonths = monthlyIsFuture.some(Boolean);

    // By status (all tours, including cancelled)
    const byStatus: Record<string, number> = {};
    for (const t of tours) {
      const s = t.status || "Sem estado";
      const key = s;
      byStatus[key] = (byStatus[key] ?? 0) + 1;
    }
    const topStatuses = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
    const maxStatus   = Math.max(...topStatuses.map(([, v]) => v), 1);

    // Revenue by status — actual transaction values grouped by the linked tour's status
    const tourStatusById = new Map(
      allTours.filter((t) => t.id).map((t) => [t.id!, t.status || "Sem estado"])
    );
    const revenueByStatus: Record<string, number> = {};
    for (const t of txns) {
      if (!(t.supplier.startsWith("IN -") || t.txType === "Earning")) continue;
      const s = t.tourId ? (tourStatusById.get(t.tourId) ?? "Sem estado") : "Sem estado";
      revenueByStatus[s] = (revenueByStatus[s] ?? 0) + t.totalCost;
    }
    const topRevenueByStatus = Object.entries(revenueByStatus).sort((a, b) => b[1] - a[1]);
    const maxRevenueByStatus = Math.max(...topRevenueByStatus.map(([, v]) => v), 1);

    // By service name
    const byService: Record<string, number> = {};
    for (const t of completed) {
      const name = t.serviceName || t.type || "Outro";
      byService[name] = (byService[name] ?? 0) + 1;
    }
    const topServices = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxService  = Math.max(...topServices.map(([, v]) => v), 1);

    // By service category (Type field from the linked Service page)
    const byCategory: Record<string, number> = {};
    for (const t of completed) {
      const cat = t.serviceType || "Outro";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const maxCategory   = Math.max(...topCategories.map(([, v]) => v), 1);

    // By day of week
    const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const byDay   = [0, 0, 0, 0, 0, 0, 0];
    for (const t of completed) {
      if (!t.date) continue;
      byDay[new Date(t.date).getDay()]++;
    }
    const maxDay = Math.max(...byDay, 1);

    // Team
    function countByRole(getId: (t: Tour) => string | null) {
      const counts: Record<string, number> = {};
      for (const t of completed) {
        const id = getId(t);
        if (!id) continue;
        const name = teamMap[id] || "Desconhecido";
        counts[name] = (counts[name] ?? 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }
    const guideWork  = countByRole((t) => t.guideId);
    const chefWork   = countByRole((t) => t.chefId);
    const driverWork = countByRole((t) => t.driverId);
    const maxTeam    = Math.max(
      ...guideWork.map(([, v]) => v),
      ...chefWork.map(([, v]) => v),
      ...driverWork.map(([, v]) => v), 1
    );

    // Clients
    const byClient: Record<string, number> = {};
    for (const t of completed) {
      if (!t.client) continue;
      byClient[t.client] = (byClient[t.client] ?? 0) + 1;
    }
    const uniqueClientCount = Object.keys(byClient).length;
    const repeatClientCount = Object.values(byClient).filter((n) => n > 1).length;
    const repeatRate        = uniqueClientCount > 0 ? (repeatClientCount / uniqueClientCount) * 100 : 0;
    const topClients        = Object.entries(byClient)
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([id, count]) => [clientNameMap[id] || "—", count] as [string, number]);
    const maxClientCount    = Math.max(...topClients.map(([, v]) => v), 1);

    // Revenue by client
    const tourClientMap: Record<string, string> = {};
    for (const t of allTours) { if (t.id && t.client) tourClientMap[t.id] = t.client; }
    const revenueByClient: Record<string, number> = {};
    for (const tx of txns) {
      if (!(tx.supplier.startsWith("IN -") || tx.txType === "Earning") || !tx.tourId) continue;
      const cid = tourClientMap[tx.tourId];
      if (!cid) continue;
      revenueByClient[cid] = (revenueByClient[cid] ?? 0) + tx.totalCost;
    }
    const topClientsByRevenue = Object.entries(revenueByClient)
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([id, rev]) => [clientNameMap[id] || "—", rev] as [string, number]);
    const maxClientRevenue = Math.max(...topClientsByRevenue.map(([, v]) => v), 1);

    // Expenses & revenue (past transactions only — future txns not expected)
    const cancelledTourIds = new Set(
      allTours.filter(isCancelled).map((t) => t.id).filter((id): id is string => !!id)
    );
    const isEarning = (t: typeof txns[0]) => t.supplier.startsWith("IN -") || t.txType === "Earning";
    // Earnings from cancelled tours are excluded from revenue (costs still count)
    const isBillableEarning = (t: typeof txns[0]) =>
      isEarning(t) && (!t.tourId || !cancelledTourIds.has(t.tourId));
    const expenses      = txns.filter((t) => !isEarning(t));
    const earnings      = txns.filter(isBillableEarning);
    // totalCost is signed (negative for expenses) — abs() here, same as
    // finCostMap/tourCostMap below, so totals/margin come out positive.
    const totalExpenses = expenses.reduce((s, t) => s + Math.abs(t.totalCost), 0);
    const totalEarnings = earnings.reduce((s, t) => s + t.totalCost, 0);
    const expPerTour    = pastCompleted.length > 0 ? totalExpenses / pastCompleted.length : 0;
    const byMethod: Record<string, number> = {};
    for (const t of expenses) {
      const m = t.paymentMethod || "Outro";
      byMethod[m] = (byMethod[m] ?? 0) + Math.abs(t.totalCost);
    }
    const topMethods = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
    const maxMethod  = Math.max(...topMethods.map(([, v]) => v), 1);

    // Monthly financials — build explicit month range from the selected date picker dates
    const finRevMap: Record<string, number> = {};
    const finCostMap: Record<string, number> = {};
    const finMonthRange = new Set<string>();
    if (start) {
      const cur = new Date(start); cur.setDate(1);
      const endBound = new Date(effectiveEnd); endBound.setDate(1);
      while (cur <= endBound) {
        finMonthRange.add(monthKey(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      for (let i = numMonths - 1; i >= 0; i--) {
        const d2 = new Date(effectiveEnd); d2.setDate(1); d2.setMonth(d2.getMonth() - i);
        finMonthRange.add(monthKey(d2));
      }
    }
    for (const k of finMonthRange) { finRevMap[k] = 0; finCostMap[k] = 0; }
    for (const t of txns) {
      if (!t.date) continue;
      const k = monthKey(new Date(t.date));
      if (!finMonthRange.has(k)) continue;
      if (isBillableEarning(t)) {
        finRevMap[k] = (finRevMap[k] ?? 0) + t.totalCost;
      } else if (!isEarning(t)) {
        finCostMap[k] = (finCostMap[k] ?? 0) + Math.abs(t.totalCost);
      }
    }
    const allFinMonths = [...finMonthRange].sort();
    const monthlyFinancials = allFinMonths.map((k) => ({
      label: monthLabel(k),
      revenue: finRevMap[k] ?? 0,
      costs: finCostMap[k] ?? 0,
      profit: (finRevMap[k] ?? 0) - (finCostMap[k] ?? 0),
    }));
    const maxMonthlyRev  = Math.max(...monthlyFinancials.map((d) => d.revenue), 1);
    const maxMonthlyCost = Math.max(...monthlyFinancials.map((d) => d.costs), 1);
    const maxMonthlyProfit = Math.max(...monthlyFinancials.map((d) => Math.abs(d.profit)), 1);
    const profitColors    = monthlyFinancials.map((d) => d.profit >= 0 ? "bg-emerald-400" : "bg-red-400");
    const profitFmtValues = monthlyFinancials.map((d) => fmtEur(d.profit));

    // Per-tour revenue & cost (for service profitability + guide cost comparison)
    // "Net" figures use taxFree (valor sem IVA) instead of the tax-inclusive totalCost
    const tourRevMap: Record<string, number> = {};
    const tourCostMap: Record<string, number> = {};
    const tourRevMapNet: Record<string, number> = {};
    const tourCostMapNet: Record<string, number> = {};
    for (const t of txns) {
      if (!t.tourId) continue;
      if (isBillableEarning(t)) {
        tourRevMap[t.tourId]    = (tourRevMap[t.tourId]    ?? 0) + t.totalCost;
        tourRevMapNet[t.tourId] = (tourRevMapNet[t.tourId] ?? 0) + t.taxFree;
      } else if (!isEarning(t)) {
        tourCostMap[t.tourId]    = (tourCostMap[t.tourId]    ?? 0) + Math.abs(t.totalCost);
        tourCostMapNet[t.tourId] = (tourCostMapNet[t.tourId] ?? 0) + Math.abs(t.taxFree);
      }
    }

    // Only services that have actually happened — excludes not-yet-realised statuses
    // (Confirmed/Pending) in addition to the past-date + non-cancelled filtering above
    const realizedTours = pastCompleted.filter((t) => t.status !== "Confirmed" && t.status !== "Pending");

    // Profit by service — revenue & cost of transactions linked to each tour, grouped by service name
    const serviceProfitMap: Record<string, {
      type: string; services: number; revenue: number; cost: number; revenueNet: number; costNet: number; tours: ServiceTourDetail[];
    }> = {};
    for (const t of realizedTours) {
      if (!t.id) continue;
      const name = t.serviceName || t.type || "Outro";
      const svcType = t.serviceType || "Outro";
      if (!serviceProfitMap[name]) serviceProfitMap[name] = { type: svcType, services: 0, revenue: 0, cost: 0, revenueNet: 0, costNet: 0, tours: [] };
      const revenue    = tourRevMap[t.id]    ?? 0;
      const cost       = tourCostMap[t.id]   ?? 0;
      const revenueNet = tourRevMapNet[t.id] ?? 0;
      const costNet    = tourCostMapNet[t.id] ?? 0;
      serviceProfitMap[name].services++;
      serviceProfitMap[name].revenue    += revenue;
      serviceProfitMap[name].cost       += cost;
      serviceProfitMap[name].revenueNet += revenueNet;
      serviceProfitMap[name].costNet    += costNet;
      serviceProfitMap[name].tours.push({
        id: t.id, date: t.date, clientName: t.clientName, guideName: t.guideName,
        numGuests: t.numGuests, status: t.status || "Sem estado",
        revenue, cost, profit: revenue - cost,
        revenueNet, costNet, profitNet: revenueNet - costNet,
      });
    }
    const serviceProfit = Object.entries(serviceProfitMap)
      .map(([name, d]) => ({
        name, ...d,
        tours:     [...d.tours].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
        profit:    d.revenue - d.cost,
        margin:    d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
        profitNet: d.revenueNet - d.costNet,
        marginNet: d.revenueNet > 0 ? ((d.revenueNet - d.costNet) / d.revenueNet) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    const hasServiceProfit = serviceProfit.some((d) => d.revenue > 0 || d.cost > 0);

    // Guide cost comparison — Bernardo (owner/Super Guide) vs other guides
    const guideGroupsRaw: Record<string, { services: number; revenue: number; cost: number; revenueNet: number; costNet: number }> = {
      "Bernardo": { services: 0, revenue: 0, cost: 0, revenueNet: 0, costNet: 0 },
      "Outros Guias": { services: 0, revenue: 0, cost: 0, revenueNet: 0, costNet: 0 },
    };
    for (const t of realizedTours) {
      if (!t.id || !t.guideName) continue;
      const group = isBernardoGuide(t.guideName) ? "Bernardo" : "Outros Guias";
      guideGroupsRaw[group].services++;
      guideGroupsRaw[group].revenue    += tourRevMap[t.id]    ?? 0;
      guideGroupsRaw[group].cost       += tourCostMap[t.id]   ?? 0;
      guideGroupsRaw[group].revenueNet += tourRevMapNet[t.id] ?? 0;
      guideGroupsRaw[group].costNet    += tourCostMapNet[t.id] ?? 0;
    }
    const guideCostComparison = Object.entries(guideGroupsRaw)
      .map(([label, d]) => ({
        label, ...d,
        profit:        d.revenue - d.cost,
        avgCost:       d.services > 0 ? d.cost / d.services : 0,
        avgRevenue:    d.services > 0 ? d.revenue / d.services : 0,
        margin:        d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
        profitNet:     d.revenueNet - d.costNet,
        avgCostNet:    d.services > 0 ? d.costNet / d.services : 0,
        avgRevenueNet: d.services > 0 ? d.revenueNet / d.services : 0,
        marginNet:     d.revenueNet > 0 ? ((d.revenueNet - d.costNet) / d.revenueNet) * 100 : 0,
      }))
      .filter((g) => g.services > 0);
    const maxGuideAvgCost    = Math.max(...guideCostComparison.map((g) => g.avgCost), 1);
    const maxGuideAvgCostNet = Math.max(...guideCostComparison.map((g) => g.avgCostNet), 1);

    // Range label
    const fmtDate = (d: Date) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
    const rangeLbl = !start
      ? `Todo o histórico · ${allTours.length} serviços carregados`
      : end
      ? `${fmtDate(start)} – ${fmtDate(end)}`
      : `${fmtDate(start)} – hoje`;

    return {
      completed, cancelled, pastCompleted, futureCompleted, hasFuture,
      totalGuests, avgGroup, cancelRate,
      monthlyEntries, maxMonthly, monthlyColors, hasFutureMonths,
      topStatuses, maxStatus,
      topRevenueByStatus, maxRevenueByStatus,
      topServices, maxService,
      topCategories, maxCategory,
      DAYS_PT, byDay, maxDay,
      guideWork, chefWork, driverWork, maxTeam,
      uniqueClientCount, repeatClientCount, repeatRate,
      topClients, maxClientCount,
      topClientsByRevenue, maxClientRevenue,
      totalExpenses, totalEarnings, expPerTour, topMethods, maxMethod,
      monthlyFinancials, maxMonthlyRev, maxMonthlyCost, maxMonthlyProfit, profitColors, profitFmtValues,
      serviceProfit, hasServiceProfit,
      guideCostComparison, maxGuideAvgCost, maxGuideAvgCostNet,
      rangeLbl,
    };
  }, [allTours, allTransactions, teamMap, clientNameMap, dateRange]);

  // ── Trends (YTD/PY/YoY%/MTD/PM/MoM%) — always full history, independent of
  // the date-range picker, mirroring yearlyData above. Uses the same
  // earning/expense classification as `a` so both sections agree. ──────────
  const trends = useMemo(() => {
    const cancelledTourIds = new Set(
      allTours.filter(isCancelled).map((t) => t.id).filter((id): id is string => !!id)
    );
    const isEarning = (t: Transaction) => t.supplier.startsWith("IN -") || t.txType === "Earning";
    const isBillableEarning = (t: Transaction) =>
      isEarning(t) && (!t.tourId || !cancelledTourIds.has(t.tourId));

    const earningsEntries: DatedAmount[] = [];
    const expenseEntries: DatedAmount[] = [];
    for (const t of allTransactions) {
      if (!t.date) continue;
      if (isBillableEarning(t)) {
        earningsEntries.push({ date: t.date, amount: t.totalCost });
      } else if (!isEarning(t)) {
        expenseEntries.push({ date: t.date, amount: Math.abs(t.totalCost) });
      }
    }

    const monthly = buildMonthlySeries(earningsEntries, expenseEntries);
    const summary = summarizeAll(earningsEntries, expenseEntries);
    const yoy = {
      income:   buildYoYSeries(monthly, "income"),
      expenses: buildYoYSeries(monthly, "expenses"),
      net:      buildYoYSeries(monthly, "net"),
    };
    const mom = {
      income:   buildMoMSeries(monthly, "income"),
      expenses: buildMoMSeries(monthly, "expenses"),
      net:      buildMoMSeries(monthly, "net"),
    };
    return { monthly, summary, yoy, mom };
  }, [allTours, allTransactions]);

  const profitTypes = [...new Set(a.serviceProfit.map((s) => s.type))].sort((x, y) => x.localeCompare(y, "pt-PT"));
  const filteredServiceProfit = profitTypeFilter === "all"
    ? a.serviceProfit
    : a.serviceProfit.filter((s) => s.type === profitTypeFilter);

  const periodLabel = (() => {
    const { start, end } = dateRange;
    if (!start) return "todo o histórico";
    const fmtDate = (d: Date) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
    return end ? `${fmtDate(start)} – ${fmtDate(end)}` : `desde ${fmtDate(start)}`;
  })();

  return (
    <div className="space-y-5 w-full overflow-x-hidden">

      {/* ── Period picker + range label ── */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <AnalyticsDateRangePicker value={dateRange} onChange={setDateRange} />
        <p className="text-xs text-white/40 font-medium">{a.rangeLbl}</p>
      </div>

      {/* ── Category buttons ── */}
      <div className="w-full flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setCategory(id)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              category === id
                ? "bg-white text-[#32373c] shadow-sm"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ── KPIs — always visible ── */}
      <div className="kpi-grid">
        <KpiCard
          label="Serviços"
          value={fmt(a.pastCompleted.length)}
          sub={a.hasFuture ? `+${a.futureCompleted.length} futuros` : "realizados"}
          subAccent={a.hasFuture}
          accent
        />
        <KpiCard label="Hóspedes"      value={fmt(a.totalGuests)}         sub="total de pax" />
        <KpiCard label="Média Pax"     value={fmt(a.avgGroup, 1)}         sub="por serviço" />
        <KpiCard label="Cancelamentos" value={`${fmt(a.cancelRate, 0)}%`} sub={`${a.cancelled.length} serviços`} />
      </div>

      {/* ── Future data notice banner ── */}
      {a.hasFuture && (
        <div className="flex items-center gap-2.5 bg-amber-400/15 border border-amber-400/30 rounded-xl px-4 py-2.5">
          <span className="text-amber-300 text-base">🔮</span>
          <p className="text-xs text-amber-200">
            <span className="font-semibold">{a.futureCompleted.length} serviços futuros</span>
            {" "}incluídos nos gráficos em barras mais claras · os KPIs de serviços excluem futuros
          </p>
        </div>
      )}

      {/* ── Category content ── */}

      {/* RESUMO */}
      {category === "resumo" && (
        <div className="space-y-6">
          <SectionCard title="Por Estado" sub="Todos os serviços no período seleccionado (incluindo futuros)">
            {a.topStatuses.length === 0 ? <EmptyState /> : (
              <div className="space-y-3">
                {a.topStatuses.map(([status, count]) => (
                  <HBar
                    key={status}
                    label={status}
                    value={count}
                    max={a.maxStatus}
                    color={STATUS_COLORS[status] ?? "bg-gray-400"}
                    labelWidth="w-16 sm:w-24"
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Receita por Estado" sub="Receita registada em transações agrupada pelo estado do serviço">
            {a.topRevenueByStatus.length === 0 ? <EmptyState /> : (
              <div className="space-y-3">
                {a.topRevenueByStatus.map(([status, rev]) => (
                  <HBar
                    key={status}
                    label={status}
                    value={rev}
                    max={a.maxRevenueByStatus}
                    color={STATUS_COLORS[status] ?? "bg-gray-400"}
                    labelWidth="w-16 sm:w-24"
                    formatValue={(v) => fmtEur(v)}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Por Ano" sub="Todo o histórico disponível · independente do filtro de período">
            <div className="space-y-8">
              <div>
                <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide mb-3">Serviços realizados</p>
                <StackedVBars
                  data={yearlyData.map((d) => ({
                    label: String(d.year),
                    segments: d.servicesByStatus,
                    total: d.services,
                    isFuture: d.isFuture,
                  }))}
                  max={maxYearlyServices}
                />
                {(() => {
                  const statuses = [...new Set(yearlyData.flatMap((d) => Object.keys(d.servicesByStatus)))];
                  return statuses.length > 0 ? (
                    <ChartLegend items={statuses.map((s) => ({ color: STATUS_COLORS[s] ?? "bg-gray-400", label: s }))} />
                  ) : null;
                })()}
              </div>
              {hasYearlyBilling && (
                <>
                  <div className="border-t border-gray-50" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">Faturação por Status</p>
                    <p className="text-[11px] text-gray-400 mb-3 -mt-2">Receita registada em transações · exclui cancelados</p>
                    <StackedVBars
                      data={yearlyData.map((d, i) => ({
                        label: String(d.year),
                        segments: d.revenueByStatus,
                        total: yearlyBillingTotals[i],
                        isFuture: d.isFuture,
                      }))}
                      max={maxYearlyBilling}
                      formatValue={fmtEur}
                    />
                    {(() => {
                      const statuses = [...new Set(yearlyData.flatMap((d) => Object.keys(d.revenueByStatus)))];
                      return statuses.length > 0 ? (
                        <ChartLegend items={statuses.map((s) => ({ color: STATUS_COLORS[s] ?? "bg-gray-400", label: s }))} />
                      ) : null;
                    })()}
                  </div>
                </>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* SERVIÇOS */}
      {category === "servicos" && (
        <div className="space-y-6">
          <SectionCard
            title="Tendência Mensal"
            sub={!dateRange.start ? "Últimos 12 meses" : "Serviços por mês"}
          >
            <VBars
              entries={a.monthlyEntries.map(([k, v]) => [monthLabel(k), v])}
              max={a.maxMonthly}
              color="bg-[#667470]"
              colors={a.monthlyColors}
            />
            {a.hasFutureMonths && (
              <ChartLegend items={[
                { color: "bg-[#667470]",    label: "Passado" },
                { color: "bg-[#667470]/40", label: "Futuro (estimado)" },
              ]} />
            )}
          </SectionCard>

          {/* By category */}
          <SectionCard title="Por Categoria" sub="Tour, Cooking Class, Evento, etc.">
            {a.topCategories.length === 0 ? <EmptyState /> : (
              <div className="space-y-3">
                {a.topCategories.map(([cat, count]) => (
                  <HBar key={cat} label={cat} value={count} max={a.maxCategory} color="bg-violet-400" labelWidth="w-20 sm:w-32" />
                ))}
              </div>
            )}
          </SectionCard>

          <div className="grid md:grid-cols-2 gap-6">
            <SectionCard title="Por Serviço" sub="Por nome de serviço">
              {a.topServices.length === 0 ? <EmptyState /> : (
                <div className="space-y-3">
                  {a.topServices.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={a.maxService} labelWidth="w-20 sm:w-28" />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Por Dia da Semana" sub="Volume de serviços">
              <div className="flex items-end gap-1.5" style={{ height: "110px" }}>
                {a.byDay.map((count, i) => {
                  const pct       = (count / a.maxDay) * 100;
                  const isWeekend = i === 0 || i === 6;
                  return (
                    <div key={i} className="group/daybar flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      {count > 0 && <span className="text-[10px] font-semibold text-gray-500">{count}</span>}
                      <div className="w-full relative" style={{ height: "72px" }}>
                        {count > 0 && (
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 opacity-0 group-hover/daybar:opacity-100 transition-opacity z-30 pointer-events-none">
                            <div className="bg-[#32373c] text-white text-[11px] font-semibold rounded px-2 py-0.5 whitespace-nowrap shadow">
                              {a.DAYS_PT[i]}: {count}
                            </div>
                          </div>
                        )}
                        <div
                          className={`absolute bottom-0 w-full rounded-t-md ${isWeekend ? "bg-[#667470]" : "bg-[#667470]/60"}`}
                          style={{ height: `${pct}%`, minHeight: count > 0 ? "4px" : "0" }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{a.DAYS_PT[i]}</span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* EQUIPA */}
      {category === "equipa" && (
        <SectionCard title="Carga da Equipa" sub={`Serviços por pessoa · ${periodLabel}${a.hasFuture ? " · inclui futuros" : ""}`}>
          <div className="space-y-6">
            {a.guideWork.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide mb-2.5">Guias</p>
                <div className="space-y-2.5">
                  {a.guideWork.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={a.maxTeam} color="bg-[#667470]" />
                  ))}
                </div>
              </div>
            )}
            {a.chefWork.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2.5">Chefs</p>
                <div className="space-y-2.5">
                  {a.chefWork.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={a.maxTeam} color="bg-red-400" />
                  ))}
                </div>
              </div>
            )}
            {a.driverWork.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Drivers</p>
                <div className="space-y-2.5">
                  {a.driverWork.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={a.maxTeam} color="bg-slate-400" />
                  ))}
                </div>
              </div>
            )}
            {a.guideWork.length === 0 && a.chefWork.length === 0 && a.driverWork.length === 0 && (
              <EmptyState message="Sem dados de equipa para este período" />
            )}
          </div>
        </SectionCard>
      )}

      {/* CLIENTES */}
      {category === "clientes" && (
        <SectionCard title="Clientes" sub={`${periodLabel} · campo "💼 Client"${a.hasFuture ? " · inclui futuros" : ""}`}>
          <div className="space-y-6">
            {a.uniqueClientCount === 0 ? (
              <EmptyState message="Sem dados de clientes para este período" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Únicos"         value={fmt(a.uniqueClientCount)} />
                  <MiniStat label="Recorrentes"    value={fmt(a.repeatClientCount)} />
                  <MiniStat label="Taxa repetição" value={`${fmt(a.repeatRate, 0)}%`} />
                </div>

                {a.topClients.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top clientes · por nº de serviços</p>
                    {a.topClients.map(([name, count]) => (
                      <HBar key={name} label={name} value={count} max={a.maxClientCount} color="bg-blue-400" labelWidth="w-20 sm:w-32" />
                    ))}
                  </div>
                )}

                {a.topClientsByRevenue.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Faturação por cliente</p>
                    {a.topClientsByRevenue.map(([name, revenue]) => (
                      <HBar key={name} label={name} value={revenue} max={a.maxClientRevenue} color="bg-emerald-400" labelWidth="w-20 sm:w-32" formatValue={fmtEur} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* FINANCEIRO */}
      {category === "financeiro" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <SectionCard title="Despesas" sub={periodLabel}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Total despesas</p>
                    <p className="text-lg font-bold text-[#32373c] mt-0.5">{fmtEur(a.totalExpenses)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Média p/ serviço</p>
                    <p className="text-lg font-bold text-[#32373c] mt-0.5">{fmtEur(a.expPerTour)}</p>
                  </div>
                </div>
                {a.topMethods.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Por método de pagamento</p>
                    {a.topMethods.map(([method, total]) => (
                      <HBar key={method} label={method} value={total} max={a.maxMethod} color="bg-orange-400" labelWidth="w-20 sm:w-28" formatValue={fmtEur} />
                    ))}
                  </div>
                )}
                {a.totalExpenses === 0 && <EmptyState message="Sem despesas registadas" />}
              </div>
            </SectionCard>

            <SectionCard title="Receita" sub={periodLabel}>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1">
                  <p className="text-xs text-gray-400">Total receita registada</p>
                  <p className="text-3xl font-bold text-[#32373c]">{fmtEur(a.totalEarnings)}</p>
                  {a.totalExpenses > 0 && a.totalEarnings > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Margem estimada:{" "}
                      <span className={`font-semibold ${a.totalEarnings - a.totalExpenses >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {fmtEur(a.totalEarnings - a.totalExpenses)}
                      </span>
                    </p>
                  )}
                </div>
                {a.totalEarnings === 0 && (
                  <p className="text-sm text-gray-400 text-center py-2">
                    Receita não registada ou com prefixo diferente de &quot;IN -&quot;
                  </p>
                )}
                {a.totalEarnings > 0 && a.pastCompleted.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Receita média p/ serviço realizado</p>
                    <p className="text-lg font-bold text-[#32373c] mt-0.5">
                      {fmtEur(a.totalEarnings / a.pastCompleted.length)}
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Tendências (YTD vs. Ano Anterior)" sub="Todo o histórico · independente do período selecionado acima">
            <div className="grid sm:grid-cols-3 gap-3 mb-5">
              {[
                { label: "Receita YTD",              value: trends.summary.income.ytd,   yoy: trends.summary.income.yoy },
                { label: "Despesas YTD",              value: trends.summary.expenses.ytd, yoy: trends.summary.expenses.yoy },
                { label: "Resultado Líquido YTD",     value: trends.summary.net.ytd,      yoy: trends.summary.net.yoy },
              ].map((k) => (
                <div key={k.label} className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-xs text-gray-400">{k.label}</p>
                  <p className="text-xl font-bold text-[#32373c] mt-0.5">{fmtEur(k.value)}</p>
                  <p className={`text-xs font-semibold mt-1 ${
                    k.yoy === null ? "text-gray-300" : k.yoy >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}>
                    {k.yoy === null ? "sem termo de comparação" : `${fmtPct(k.yoy)} vs. ano anterior`}
                  </p>
                </div>
              ))}
            </div>

            {trends.monthly.length === 0 ? (
              <EmptyState message="Sem histórico suficiente para calcular tendências" />
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Crescimento homólogo (YoY %) por mês</p>
                  <LineTrend
                    min={-1}
                    max={3}
                    series={[
                      { label: "Receita",            color: "#34d399", points: trends.yoy.income },
                      { label: "Despesas",           color: "#fb923c", points: trends.yoy.expenses },
                      { label: "Resultado líquido",  color: "#667470", points: trends.yoy.net },
                    ]}
                    capNote="Valores além de ±300% são limitados para legibilidade — alguns meses de baixo volume produzem oscilações extremas."
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Crescimento mensal (MoM %)</p>
                  <LineTrend
                    min={-1}
                    max={2}
                    series={[
                      { label: "Receita",            color: "#34d399", points: trends.mom.income },
                      { label: "Despesas",           color: "#fb923c", points: trends.mom.expenses },
                      { label: "Resultado líquido",  color: "#667470", points: trends.mom.net },
                    ]}
                    capNote="Valores além de ±200% são limitados para legibilidade."
                  />
                </div>
              </div>
            )}
          </SectionCard>

          {a.monthlyFinancials.length > 0 && (
            <>
              <SectionCard title="Faturação Por Mês" sub={periodLabel}>
                {a.monthlyFinancials.every((d) => d.revenue === 0) ? (
                  <EmptyState message="Sem receita registada no período" />
                ) : (
                  <VBars
                    entries={a.monthlyFinancials.map((d) => [d.label, d.revenue])}
                    max={a.maxMonthlyRev}
                    color="bg-emerald-400"
                    formatValue={fmtEur}
                  />
                )}
              </SectionCard>

              <SectionCard title="Custos Por Mês" sub={periodLabel}>
                {a.monthlyFinancials.every((d) => d.costs === 0) ? (
                  <EmptyState message="Sem despesas registadas no período" />
                ) : (
                  <VBars
                    entries={a.monthlyFinancials.map((d) => [d.label, d.costs])}
                    max={a.maxMonthlyCost}
                    color="bg-orange-400"
                    formatValue={fmtEur}
                  />
                )}
              </SectionCard>

              <SectionCard title="Lucro Por Mês" sub={periodLabel}>
                {a.monthlyFinancials.every((d) => d.profit === 0) ? (
                  <EmptyState message="Sem dados de lucro no período" />
                ) : (
                  <>
                    <VBars
                      entries={a.monthlyFinancials.map((d) => [d.label, Math.abs(d.profit)])}
                      max={a.maxMonthlyProfit}
                      color="bg-emerald-400"
                      colors={a.profitColors}
                      formatValues={a.profitFmtValues}
                    />
                    <ChartLegend items={[
                      { color: "bg-emerald-400", label: "Lucro" },
                      { color: "bg-red-400",     label: "Prejuízo" },
                    ]} />
                  </>
                )}
              </SectionCard>
            </>
          )}

          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Análise de lucro</p>
            <IvaToggle value={ivaMode} onChange={setIvaMode} />
          </div>

          <SectionCard title="Lucro por Serviço" sub={`Receita e custo de transações ligadas a cada serviço · ${periodLabel}`}>
            {!a.hasServiceProfit ? (
              <EmptyState message="Sem receita ou custos ligados a serviços neste período" />
            ) : (
              <div>
                {profitTypes.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <button
                      type="button"
                      onClick={() => setProfitTypeFilter("all")}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        profitTypeFilter === "all" ? "bg-[#667470] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      Todos
                    </button>
                    {profitTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setProfitTypeFilter(t)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          profitTypeFilter === t ? "bg-[#667470] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {filteredServiceProfit.length === 0 ? (
                  <EmptyState message="Sem serviços deste tipo neste período" />
                ) : (
                filteredServiceProfit.map((s) => (
                  <ProfitRow
                    key={s.name}
                    label={s.name}
                    services={s.services}
                    ivaMode={ivaMode}
                    gross={{ revenue: s.revenue, cost: s.cost, profit: s.profit, margin: s.margin }}
                    net={{ revenue: s.revenueNet, cost: s.costNet, profit: s.profitNet, margin: s.marginNet }}
                    tours={s.tours}
                  />
                ))
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Custo de Guia: Bernardo vs Outros Guias"
            sub={`Serviços guiados pelo sócio Bernardo comparados com os restantes guias · ${periodLabel}`}
          >
            {a.guideCostComparison.length === 0 ? (
              <EmptyState message="Sem serviços com guia atribuído neste período" />
            ) : (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  {a.guideCostComparison.map((g) => {
                    const avgCost    = ivaMode === "com" ? g.avgCost    : g.avgCostNet;
                    const avgRevenue = ivaMode === "com" ? g.avgRevenue : g.avgRevenueNet;
                    const profit     = ivaMode === "com" ? g.profit     : g.profitNet;
                    const margin     = ivaMode === "com" ? g.margin     : g.marginNet;
                    return (
                      <div key={g.label} className="bg-gray-50 rounded-xl p-3.5 space-y-2">
                        <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide">{g.label}</p>
                        <p className="text-xs text-gray-400">{fmt(g.services)} serviços</p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase">Custo médio</p>
                            <p className="text-base font-bold text-[#32373c]">{fmtEur(avgCost)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase">Receita média</p>
                            <p className="text-base font-bold text-[#32373c]">{fmtEur(avgRevenue)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                          <span className="text-xs text-gray-400">Lucro total</span>
                          <span className={`text-sm font-bold ${profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {fmtEur(profit)} · {fmt(margin, 0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custo médio por serviço</p>
                  {a.guideCostComparison.map((g) => (
                    <HBar
                      key={g.label}
                      label={g.label}
                      value={ivaMode === "com" ? g.avgCost : g.avgCostNet}
                      max={ivaMode === "com" ? a.maxGuideAvgCost : a.maxGuideAvgCostNet}
                      color={g.label === "Bernardo" ? "bg-[#667470]" : "bg-orange-400"}
                      labelWidth="w-24 sm:w-32"
                      formatValue={fmtEur}
                    />
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      <p className="text-xs text-white/30 text-center pb-4">
        Dados calculados a partir do Notion · atualizado a cada página carregada
      </p>
    </div>
  );
}
