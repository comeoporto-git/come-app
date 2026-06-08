"use client";

import { useState, useMemo } from "react";
import { AnalyticsPeriodPicker } from "@/components/AnalyticsPeriodPicker";
import type { Tour, Transaction } from "@/lib/notion";

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
  return t.status === "Cancelled" || t.status === "Canceled";
}
function isTourFuture(t: Tour) {
  return !!t.date && new Date(t.date) >= TODAY;
}
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
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xl font-bold text-[#32373c]">{value}</p>
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
    <div className="group/hbar relative flex items-center gap-2 sm:gap-3 rounded-lg hover:bg-gray-50 -mx-1 px-1 transition-colors cursor-default">
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
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
 *  (used to split past vs future services in the yearly chart). */
function VBars({ entries, max, color, colors, formatValue, barHeight = 88, baseValues, baseColors }: {
  entries: [string, number][];
  max: number;
  color: string;
  colors?: string[];
  formatValue?: (v: number) => string;
  barHeight?: number;
  baseValues?: number[];
  baseColors?: string[];
}) {
  return (
    <div className="flex items-end gap-2" style={{ height: `${barHeight + 32}px` }}>
      {entries.map(([label, value], i) => {
        const pct       = (value / max) * 100;
        const barColor  = colors?.[i] ?? color;
        const baseVal   = baseValues?.[i] ?? value;
        const baseColor = baseColors?.[i] ?? barColor;
        const basePct      = max > 0 ? (baseVal / max) * 100 : 0;
        const tooltipLabel = baseValues
          ? `${fmt(value)} total · ${fmt(baseVal)} realizado${baseVal !== 1 ? "s" : ""}`
          : formatValue ? formatValue(value) : fmt(value);
        return (
          <div key={label} className="group/vbar flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {value > 0 && (
              <span className="text-xs font-semibold text-gray-500 leading-none">
                {formatValue ? formatValue(value) : fmt(value)}
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
  return (
    <div className="flex items-end gap-2" style={{ height: `${barHeight + 32}px` }}>
      {data.map(({ label, segments: seg, total, isFuture }) => {
        const totalPct = max > 0 ? (total / max) * 100 : 0;
        const entries  = Object.entries(seg).sort((a, b) => b[1] - a[1]);
        return (
          <div key={label} className="group/svbar flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {total > 0 && (
              <span className="text-xs font-semibold text-gray-500 leading-none">{fmtVal(total)}</span>
            )}
            <div className="w-full relative" style={{ height: `${barHeight}px` }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 opacity-0 group-hover/svbar:opacity-100 transition-opacity z-30 pointer-events-none">
                <div className="bg-[#32373c] text-white text-[11px] font-semibold rounded px-2 py-1.5 whitespace-nowrap shadow space-y-1">
                  <div className="border-b border-white/20 pb-1 mb-0.5">{fmtVal(total)}</div>
                  {entries.map(([status, value]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-sm shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-400"}`} />
                      <span>{status}: {fmtVal(value)}</span>
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
                        className={`absolute w-full ${STATUS_COLORS[status] ?? "bg-gray-400"}`}
                        style={{ bottom: `${bottom}%`, height: `${segPct}%` }}
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
  const [period,   setPeriod]   = useState(180);
  const [category, setCategory] = useState<Category>("resumo");

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
      const s = t.status === "Canceled" ? "Cancelled" : (t.status || "Sem estado");
      map[y].servicesByStatus[s] = (map[y].servicesByStatus[s] ?? 0) + 1;
      if (t.expectedRevenue) {
        map[y].billingByStatus[s] = (map[y].billingByStatus[s] ?? 0) + t.expectedRevenue;
      }
    }
    const tourStatusById = new Map(
      allTours.filter((t) => t.id).map((t) => [t.id!, t.status === "Canceled" ? "Cancelled" : (t.status || "Sem estado")])
    );
    for (const t of allTransactions) {
      if (!t.date || !t.supplier.startsWith("IN -")) continue;
      const y = new Date(t.date).getFullYear();
      if (!map[y]) map[y] = { services: 0, futureSvcs: 0, servicesByStatus: {}, revenue: 0, revenueByStatus: {}, billingByStatus: {} };
      map[y].revenue += t.totalCost;
      const status = t.tourId ? (tourStatusById.get(t.tourId) ?? "Sem estado") : "Sem estado";
      map[y].revenueByStatus[status] = (map[y].revenueByStatus[status] ?? 0) + t.totalCost;
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
  const yearlyBillingTotals = yearlyData.map((d) => Object.values(d.billingByStatus).reduce((a, b) => a + b, 0));
  const maxYearlyBilling    = Math.max(...yearlyBillingTotals, 1);
  const hasYearlyBilling    = yearlyBillingTotals.some((v) => v > 0);

  // ── Period-filtered analytics ─────────────────────────────────────────────
  const a = useMemo(() => {
    const cutoff = period === 0 ? new Date(0) : new Date(Date.now() - period * 86_400_000);
    const tours  = allTours.filter((t) => t.date && new Date(t.date) >= cutoff);
    const txns   = allTransactions.filter((t) => t.date && new Date(t.date) >= cutoff);

    const completed       = tours.filter((t) => !isCancelled(t));
    const cancelled       = tours.filter((t) => isCancelled(t));
    const pastCompleted   = completed.filter((t) => !isTourFuture(t));
    const futureCompleted = completed.filter((t) => isTourFuture(t));
    const hasFuture       = futureCompleted.length > 0;

    // KPIs — base on all completed (past + future)
    const totalGuests = completed.reduce((s, t) => s + t.numGuests, 0);
    const avgGroup    = completed.length > 0 ? totalGuests / completed.length : 0;
    const cancelRate  = tours.length > 0 ? (cancelled.length / tours.length) * 100 : 0;

    // Monthly trend — past N months + any future months that have bookings
    const numMonths = period === 0 ? 12 : period <= 30 ? 1 : period <= 90 ? 3 : period <= 180 ? 6 : 12;
    const monthlyMap: Record<string, number> = {};
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
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
      const key = s === "Canceled" ? "Cancelled" : s;
      byStatus[key] = (byStatus[key] ?? 0) + 1;
    }
    const topStatuses = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
    const maxStatus   = Math.max(...topStatuses.map(([, v]) => v), 1);

    // Revenue by status — sum IN- earnings per tour, grouped by that tour's status
    const tourStatusMap: Record<string, string> = {};
    for (const t of tours) {
      if (t.id) tourStatusMap[t.id] = t.status === "Canceled" ? "Cancelled" : (t.status || "Sem estado");
    }
    const revenueByStatus: Record<string, number> = {};
    for (const tx of txns) {
      if (!tx.supplier.startsWith("IN -") || !tx.tourId) continue;
      const s = tourStatusMap[tx.tourId];
      if (!s) continue;
      revenueByStatus[s] = (revenueByStatus[s] ?? 0) + tx.totalCost;
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
      if (!tx.supplier.startsWith("IN -") || !tx.tourId) continue;
      const cid = tourClientMap[tx.tourId];
      if (!cid) continue;
      revenueByClient[cid] = (revenueByClient[cid] ?? 0) + tx.totalCost;
    }
    const topClientsByRevenue = Object.entries(revenueByClient)
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([id, rev]) => [clientNameMap[id] || "—", rev] as [string, number]);
    const maxClientRevenue = Math.max(...topClientsByRevenue.map(([, v]) => v), 1);

    // Expenses & revenue (past transactions only — future txns not expected)
    const expenses      = txns.filter((t) => !t.supplier.startsWith("IN -"));
    const earnings      = txns.filter((t) => t.supplier.startsWith("IN -"));
    const totalExpenses = expenses.reduce((s, t) => s + t.totalCost, 0);
    const totalEarnings = earnings.reduce((s, t) => s + t.totalCost, 0);
    const expPerTour    = pastCompleted.length > 0 ? totalExpenses / pastCompleted.length : 0;
    const byMethod: Record<string, number> = {};
    for (const t of expenses) {
      const m = t.paymentMethod || "Outro";
      byMethod[m] = (byMethod[m] ?? 0) + t.totalCost;
    }
    const topMethods = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
    const maxMethod  = Math.max(...topMethods.map(([, v]) => v), 1);

    // Range label
    const now      = new Date();
    const fromDate = new Date(Date.now() - period * 86_400_000);
    const rangeLbl = period === 0
      ? `Todo o histórico · ${allTours.length} serviços carregados`
      : `${fromDate.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })} – ${now.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}`;

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
      rangeLbl,
    };
  }, [allTours, allTransactions, teamMap, clientNameMap, period]);

  const periodLabel = period === 0 ? "todo o histórico" : `últimos ${period} dias`;

  return (
    <div className="space-y-5">

      {/* ── Period picker + range label ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <AnalyticsPeriodPicker current={period} onChange={setPeriod} />
        <p className="text-xs text-white/40 font-medium">{a.rangeLbl}</p>
      </div>

      {/* ── Category buttons ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

          <SectionCard title="Receita por Estado" sub="Receita faturada (IN-) agrupada pelo estado do serviço">
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
                    <p className="text-[11px] text-gray-400 mb-3 -mt-2">Faturação esperada (preço × pax) · exclui cancelados</p>
                    <StackedVBars
                      data={yearlyData.map((d, i) => ({
                        label: String(d.year),
                        segments: d.billingByStatus,
                        total: yearlyBillingTotals[i],
                        isFuture: d.isFuture,
                      }))}
                      max={maxYearlyBilling}
                      formatValue={fmtEur}
                    />
                    {(() => {
                      const statuses = [...new Set(yearlyData.flatMap((d) => Object.keys(d.billingByStatus)))];
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
            sub={period === 0 ? "Últimos 12 meses" : "Serviços por mês"}
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
      )}

      <p className="text-xs text-white/30 text-center pb-4">
        Dados calculados a partir do Notion · atualizado a cada página carregada
      </p>
    </div>
  );
}
