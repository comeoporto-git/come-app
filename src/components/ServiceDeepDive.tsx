"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Tour, Transaction, Fornecedor } from "@/lib/notion";
import { categoriaBadgeClass } from "@/lib/fornecedor-categories";
import { YoYLineChart, type YoYPoint } from "@/components/YoYLineChart";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Mode = "ytd" | "r12";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtEur(n: number) {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const isEarning = (t: Transaction) => t.supplier.startsWith("IN -") || t.txType === "Earning";

const TIERS = ["1 pax", "2–3 pax", "4–6 pax", "7+ pax"] as const;
function tierOf(pax: number): string | null {
  if (pax <= 0) return null;
  if (pax === 1) return TIERS[0];
  if (pax <= 3) return TIERS[1];
  if (pax <= 6) return TIERS[2];
  return TIERS[3];
}

// Fixed-order categorical palette — assigned by the type's rank in total cost
// (computed once per page view, so a type keeps its colour across toggles).
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
const OTHER_COLOR = "#9ca3af";
const MAX_TYPES = SERIES.length;

type Period = { start: string; end: string }; // inclusive YYYY-MM-DD bounds

function periods(mode: Mode, today: Date) {
  const t = ymd(today);
  const y = today.getFullYear();
  if (mode === "ytd") {
    return {
      cur:  { start: `${y}-01-01`, end: t },
      prev: { start: `${y - 1}-01-01`, end: `${y - 1}${t.slice(4)}` },
    };
  }
  const dayAfter = (s: string) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + 1); return ymd(d); };
  const oneYearAgo = `${y - 1}${t.slice(4)}`;
  const twoYearsAgo = `${y - 2}${t.slice(4)}`;
  return {
    cur:  { start: dayAfter(oneYearAgo), end: t },
    prev: { start: dayAfter(twoYearsAgo), end: oneYearAgo },
  };
}

function monthsOf(p: Period) {
  const out: string[] = [];
  const cur = new Date(Number(p.start.slice(0, 4)), Number(p.start.slice(5, 7)) - 1, 1);
  const end = new Date(Number(p.end.slice(0, 4)), Number(p.end.slice(5, 7)) - 1, 1);
  while (cur <= end) { out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`); cur.setMonth(cur.getMonth() + 1); }
  return out;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
}

// ── Stats for one period ──────────────────────────────────────────────────────

type TourFin = { tour: Tour; revenue: number; cost: number; costs: { label: string; fornecedor: string; categoria: string | null; amount: number }[] };

function computeStats(tourFins: TourFin[], allInPeriod: Tour[]) {
  const n = tourFins.length;
  const revs  = tourFins.map((t) => t.revenue);
  const costs = tourFins.map((t) => t.cost);
  const paxes = tourFins.map((t) => t.tour.numGuests).filter((p) => p > 0);
  const totalRevenue = revs.reduce((a, b) => a + b, 0);
  const totalCost    = costs.reduce((a, b) => a + b, 0);
  const profit       = totalRevenue - totalCost;
  const cancelled    = allInPeriod.filter((t) => t.status === "Cancelled").length;

  // Cost by type (categoria / team role)
  const byType = new Map<string, number>();
  for (const tf of tourFins) for (const c of tf.costs) byType.set(c.label, (byType.get(c.label) ?? 0) + c.amount);

  // Cost by pax tier, split by type
  const byTier = new Map<string, { tours: number; revenue: number; cost: number; types: Map<string, number> }>();
  for (const tf of tourFins) {
    const tier = tierOf(tf.tour.numGuests);
    if (!tier) continue;
    const b = byTier.get(tier) ?? { tours: 0, revenue: 0, cost: 0, types: new Map() };
    b.tours++; b.revenue += tf.revenue; b.cost += tf.cost;
    for (const c of tf.costs) b.types.set(c.label, (b.types.get(c.label) ?? 0) + c.amount);
    byTier.set(tier, b);
  }

  // Clients
  const clients = new Map<string, { revenue: number; tours: number }>();
  for (const tf of tourFins) {
    const name = tf.tour.clientName?.trim() || "Sem cliente";
    const c = clients.get(name) ?? { revenue: 0, tours: 0 };
    c.revenue += tf.revenue; c.tours++;
    clients.set(name, c);
  }

  // Fornecedores — cost per tour in which they appear
  const forn = new Map<string, { categoria: string | null; label: string; perTour: Map<string, number> }>();
  for (const tf of tourFins) {
    for (const c of tf.costs) {
      const f = forn.get(c.fornecedor) ?? { categoria: c.categoria, label: c.label, perTour: new Map() };
      f.perTour.set(tf.tour.id, (f.perTour.get(tf.tour.id) ?? 0) + c.amount);
      forn.set(c.fornecedor, f);
    }
  }
  const fornecedores = [...forn.entries()].map(([name, f]) => {
    const vals = [...f.perTour.values()];
    return {
      name, categoria: f.categoria, label: f.label,
      tours: vals.length, total: vals.reduce((a, b) => a + b, 0),
      avg: mean(vals), median: median(vals),
      share: n > 0 ? (vals.length / n) * 100 : 0,
    };
  }).sort((a, b) => b.total - a.total);

  return {
    n, cancelled, totalInPeriod: allInPeriod.length,
    cancelRate: allInPeriod.length > 0 ? (cancelled / allInPeriod.length) * 100 : null,
    totalRevenue, avgRevenue: mean(revs), medRevenue: median(revs),
    totalCost, avgCost: mean(costs), medCost: median(costs),
    profit, avgProfit: n > 0 ? profit / n : 0,
    margin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : null,
    avgPax: mean(paxes), medPax: median(paxes),
    byType, byTier, clients, fornecedores,
  };
}

// ── UI bits ───────────────────────────────────────────────────────────────────

function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
      <div className="px-4 sm:px-5 py-4 border-b border-gray-50 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#32373c]">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="px-4 sm:px-5 py-4">{children}</div>
    </section>
  );
}

/** delta: % change (or percentage points with `pp`) vs comparison period */
function Delta({ cur, prev, higherIsBetter = true, pp = false }: { cur: number | null; prev: number | null; higherIsBetter?: boolean; pp?: boolean }) {
  if (cur == null || prev == null) return <span className="text-gray-300">—</span>;
  let d: number;
  if (pp) d = cur - prev;
  else if (prev === 0) return <span className="text-gray-300">—</span>;
  else d = ((cur - prev) / Math.abs(prev)) * 100;
  const good = d === 0 ? null : (d > 0) === higherIsBetter;
  return (
    <span className={`font-semibold ${good == null ? "text-gray-400" : good ? "text-emerald-600" : "text-red-500"}`}>
      {d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}{fmt(d, 0)}{pp ? " pp" : "%"}
    </span>
  );
}

function Metric({ label, value, prevValue, delta }: { label: string; value: string; prevValue: string; delta: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 min-w-0">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-lg font-bold text-[#32373c] tabular-nums truncate">{value}</p>
      <p className="text-[11px] text-gray-400 truncate">
        <span className="tabular-nums">{prevValue}</span> <span className="ml-1">{delta}</span>
      </p>
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange, dark = false }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; dark?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg p-0.5 text-xs font-semibold shrink-0 ${dark ? "bg-white/10" : "bg-gray-100"}`}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            value === o.id
              ? (dark ? "bg-white text-[#32373c] shadow-sm" : "bg-white text-[#32373c] shadow-sm")
              : (dark ? "text-white/60 hover:text-white" : "text-gray-500 hover:text-[#32373c]")
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Bar({ label, value, max, display, color }: { label: React.ReactNode; value: number; max: number; display: string; color: string }) {
  const pct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3" title={`${typeof label === "string" ? label : ""} ${display}`}>
      <span className="text-xs text-gray-500 w-24 sm:w-32 shrink-0 truncate text-right">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-20 text-right shrink-0 tabular-nums">{display}</span>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ServiceDeepDive({
  serviceId, services, tours, transactions, fornecedores, basePath,
}: {
  serviceId: string;
  services: { id: string; name: string; count: number }[];
  tours: Tour[];
  transactions: Transaction[];
  fornecedores: Fornecedor[];
  basePath: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ytd");
  const [costView, setCostView] = useState<"abs" | "pct">("abs");
  const [clientView, setClientView] = useState<"valor" | "tours">("valor");


  // Per-tour revenue and cost (all linked transactions, whatever their date)
  const tourFinById = useMemo(() => {
    const fornById = new Map(fornecedores.map((f) => [f.id, f]));
    const svcTours = tours.filter((t) => t.service === serviceId);
    const ids = new Set(svcTours.map((t) => t.id));
    const txByTour = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      if (!tx.tourId || !ids.has(tx.tourId)) continue;
      const list = txByTour.get(tx.tourId) ?? [];
      list.push(tx);
      txByTour.set(tx.tourId, list);
    }
    const out = new Map<string, TourFin>();
    for (const t of svcTours) {
      const roles = [
        [t.guideName, "Guia"], [t.chefName, "Chef"], [t.driverName, "Motorista"],
        [t.logisticsName, "Logistics"], [t.decoradorName, "Decorador"],
        ...(t.extraTeam ?? []).map((m) => [m.name, m.role === "Guide" ? "Guia" : m.role === "Driver" ? "Motorista" : m.role]),
      ].filter(([n]) => !!n).map(([n, l]) => [String(n).trim().toLowerCase(), String(l)] as const);
      let revenue = 0, cost = 0;
      const costs: TourFin["costs"] = [];
      for (const tx of txByTour.get(t.id) ?? []) {
        if (isEarning(tx)) { revenue += tx.totalCost; continue; }
        const amount = Math.abs(tx.totalCost);
        if (!amount) continue;
        cost += amount;
        const f = tx.fornecedorId ? fornById.get(tx.fornecedorId) : undefined;
        const fornName = (f?.name || tx.supplier || "Sem fornecedor").trim();
        const role = roles.find(([n]) => n === tx.supplier.trim().toLowerCase())?.[1];
        const categoria = f?.categoria ?? null;
        costs.push({ label: categoria || role || "Outros", fornecedor: fornName, categoria, amount });
      }
      out.set(t.id, { tour: t, revenue, cost, costs });
    }
    return out;
  }, [tours, transactions, fornecedores, serviceId]);

  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const p = periods(mode, today);
    const all = [...tourFinById.values()];
    const inP = (per: Period) => (tf: TourFin) => {
      const d = tf.tour.date?.slice(0, 10);
      return !!d && d >= per.start && d <= per.end;
    };
    const realized = (tf: TourFin) => tf.tour.status !== "Cancelled" && tf.tour.status !== "Pending";
    const curAll  = all.filter(inP(p.cur));
    const prevAll = all.filter(inP(p.prev));
    const cur  = computeStats(curAll.filter(realized),  curAll.map((x) => x.tour));
    const prev = computeStats(prevAll.filter(realized), prevAll.map((x) => x.tour));

    // Monthly revenue (by service date) vs same months a year earlier
    const months = monthsOf(p.cur);
    const revByMonth = new Map<string, number>();
    const profitByMonth = new Map<string, number>();
    for (const tf of all) {
      if (!realized(tf) || !tf.tour.date) continue;
      const k = tf.tour.date.slice(0, 7);
      revByMonth.set(k, (revByMonth.get(k) ?? 0) + tf.revenue);
      profitByMonth.set(k, (profitByMonth.get(k) ?? 0) + tf.revenue - tf.cost);
    }
    const shift = (k: string) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;
    const series = (m: Map<string, number>): YoYPoint[] =>
      months.map((k) => ({ label: monthLabel(k), current: m.get(k) ?? 0, previous: m.get(shift(k)) ?? 0 }));

    // Types ranked by current cost → fixed colours
    const typeRank = [...cur.byType.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const shownTypes = typeRank.slice(0, MAX_TYPES);
    const colorOf = (label: string) => {
      const i = shownTypes.indexOf(label);
      return i >= 0 ? SERIES[i] : OTHER_COLOR;
    };

    const fmtD = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
    return {
      cur, prev, p,
      curLabel:  `${fmtD(p.cur.start)} – ${fmtD(p.cur.end)}`,
      prevLabel: `${fmtD(p.prev.start)} – ${fmtD(p.prev.end)}`,
      revSeries: series(revByMonth), profitSeries: series(profitByMonth),
      shownTypes, colorOf, hasOther: typeRank.length > MAX_TYPES,
    };
  }, [tourFinById, mode]);

  const { cur, prev } = data;
  const seriesCur = mode === "ytd" ? String(new Date().getFullYear()) : "Últimos 12M";
  const seriesPrev = mode === "ytd" ? String(new Date().getFullYear() - 1) : "12M anteriores";

  // Cost by type rows
  const typeRows = [...cur.byType.entries()]
    .map(([label, total]) => ({ label, total, avg: cur.n ? total / cur.n : 0, pct: cur.totalCost ? (total / cur.totalCost) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
  const maxTypeAvg = Math.max(...typeRows.map((r) => r.avg), 1);
  const maxTypePct = Math.max(...typeRows.map((r) => r.pct), 1);

  // Cost by tier rows
  const tierRows = TIERS.map((tier) => {
    const b = cur.byTier.get(tier);
    if (!b) return null;
    const segs = new Map<string, number>();
    for (const [label, v] of b.types) {
      const key = data.shownTypes.includes(label) ? label : "Outros (resto)";
      segs.set(key, (segs.get(key) ?? 0) + v);
    }
    return {
      tier, tours: b.tours,
      avgCost: b.cost / b.tours, avgRevenue: b.revenue / b.tours,
      costPctOfRevenue: b.revenue > 0 ? (b.cost / b.revenue) * 100 : null,
      segs: [...segs.entries()]
        .map(([label, v]) => ({ label, avg: v / b.tours, pct: b.cost > 0 ? (v / b.cost) * 100 : 0 }))
        .sort((x, y) => {
          const ix = data.shownTypes.indexOf(x.label), iy = data.shownTypes.indexOf(y.label);
          return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
        }),
    };
  }).filter((r): r is NonNullable<typeof r> => !!r);
  const maxTierAvg = Math.max(...tierRows.map((r) => r.avgCost), 1);

  const clientRows = [...cur.clients.entries()]
    .map(([name, c]) => ({ name, ...c }))
    .sort((a, b) => clientView === "valor" ? b.revenue - a.revenue : b.tours - a.tours || b.revenue - a.revenue)
    .slice(0, 10);
  const maxClient = Math.max(...clientRows.map((c) => clientView === "valor" ? c.revenue : c.tours), 1);

  const prevForn = new Map(prev.fornecedores.map((f) => [f.name, f]));
  const legendItems = [
    ...data.shownTypes.map((l) => ({ label: l, color: data.colorOf(l) })),
    ...(data.hasOther ? [{ label: "Outros (resto)", color: OTHER_COLOR }] : []),
  ];

  return (
    <div className="space-y-5 w-full">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href={basePath} className="text-xs text-white/50 hover:text-white">← Analytics</Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">Deep dive por serviço</p>
            <select
              value={serviceId}
              onChange={(e) => router.push(`${basePath}/servicos/${e.target.value}`)}
              className="mt-1 max-w-full bg-transparent text-white text-xl sm:text-2xl font-bold outline-none cursor-pointer pr-2 [&>option]:text-[#32373c]"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name.trim()} ({s.count})</option>
              ))}
            </select>
          </div>
          <div className="self-start sm:self-auto"><Toggle dark value={mode} onChange={setMode} options={[
            { id: "ytd", label: "YTD" }, { id: "r12", label: "Rolling 12M" },
          ]} /></div>
        </div>
        <p className="text-xs text-white/50">
          {data.curLabel} <span className="text-white/30">vs</span> {data.prevLabel}
          <span className="text-white/30"> · serviços realizados (excl. cancelados e pendentes)</span>
        </p>
      </div>

      {/* KPI blocks */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Faturação" sub="Por serviço realizado · vs período homólogo">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Metric label="Total"   value={fmtEur(cur.totalRevenue)} prevValue={fmtEur(prev.totalRevenue)} delta={<Delta cur={cur.totalRevenue} prev={prev.totalRevenue} />} />
            <Metric label="Média"   value={fmtEur(cur.avgRevenue)}   prevValue={fmtEur(prev.avgRevenue)}   delta={<Delta cur={cur.avgRevenue} prev={prev.avgRevenue} />} />
            <Metric label="Mediana" value={fmtEur(cur.medRevenue)}   prevValue={fmtEur(prev.medRevenue)}   delta={<Delta cur={cur.medRevenue} prev={prev.medRevenue} />} />
          </div>
        </Section>
        <Section title="Despesas" sub="Por serviço realizado · vs período homólogo">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Metric label="Total"   value={fmtEur(cur.totalCost)} prevValue={fmtEur(prev.totalCost)} delta={<Delta cur={cur.totalCost} prev={prev.totalCost} higherIsBetter={false} />} />
            <Metric label="Média"   value={fmtEur(cur.avgCost)}   prevValue={fmtEur(prev.avgCost)}   delta={<Delta cur={cur.avgCost} prev={prev.avgCost} higherIsBetter={false} />} />
            <Metric label="Mediana" value={fmtEur(cur.medCost)}   prevValue={fmtEur(prev.medCost)}   delta={<Delta cur={cur.medCost} prev={prev.medCost} higherIsBetter={false} />} />
          </div>
        </Section>
        <Section title="Lucro" sub="Faturação − despesas ligadas ao serviço">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Metric label="Total"  value={fmtEur(cur.profit)}    prevValue={fmtEur(prev.profit)}    delta={<Delta cur={cur.profit} prev={prev.profit} />} />
            <Metric label="Médio"  value={fmtEur(cur.avgProfit)} prevValue={fmtEur(prev.avgProfit)} delta={<Delta cur={cur.avgProfit} prev={prev.avgProfit} />} />
            <Metric label="Margem"
              value={cur.margin != null ? `${fmt(cur.margin)}%` : "—"}
              prevValue={prev.margin != null ? `${fmt(prev.margin)}%` : "—"}
              delta={<Delta cur={cur.margin} prev={prev.margin} pp />} />
          </div>
        </Section>
        <Section title="Volume" sub="Serviços, pessoas e cancelamentos">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Serviços" value={fmt(cur.n)} prevValue={fmt(prev.n)} delta={<Delta cur={cur.n} prev={prev.n} />} />
            <Metric label="Média pax" value={fmt(cur.avgPax, 1)} prevValue={fmt(prev.avgPax, 1)} delta={<Delta cur={cur.avgPax} prev={prev.avgPax} />} />
            <Metric label="Mediana pax" value={fmt(cur.medPax, 1)} prevValue={fmt(prev.medPax, 1)} delta={<Delta cur={cur.medPax} prev={prev.medPax} />} />
            <Metric label="Cancelamento"
              value={cur.cancelRate != null ? `${fmt(cur.cancelRate)}%` : "—"}
              prevValue={prev.cancelRate != null ? `${fmt(prev.cancelRate)}%` : "—"}
              delta={<Delta cur={cur.cancelRate} prev={prev.cancelRate} pp higherIsBetter={false} />} />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{cur.cancelled} de {cur.totalInPeriod} reservas canceladas no período</p>
        </Section>
      </div>

      {/* Monthly */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Faturação por mês" sub="Pela data do serviço">
          <YoYLineChart points={data.revSeries} color="#10b981" formatValue={fmtEur}
            currentLabel={seriesCur} previousLabel={seriesPrev} height={180} />
        </Section>
        <Section title="Lucro por mês" sub="Pela data do serviço">
          <YoYLineChart points={data.profitSeries} color="#32373c" formatValue={fmtEur}
            currentLabel={seriesCur} previousLabel={seriesPrev} height={180} />
        </Section>
      </div>

      {/* Cost by type */}
      <Section
        title="Custos por tipo"
        sub={costView === "abs" ? "Custo médio por serviço, por categoria de despesa" : "% do custo total da tour"}
        right={<Toggle value={costView} onChange={setCostView} options={[{ id: "abs", label: "€" }, { id: "pct", label: "%" }]} />}
      >
        {typeRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Sem despesas no período</p> : (
          <div className="space-y-2">
            {typeRows.map((r) => (
              <Bar key={r.label} label={r.label} color={data.colorOf(r.label)}
                value={costView === "abs" ? r.avg : r.pct}
                max={costView === "abs" ? maxTypeAvg : maxTypePct}
                display={costView === "abs" ? `${fmtEur(r.avg)} · ${fmt(r.pct)}%` : `${fmt(r.pct, 1)}% · ${fmtEur(r.avg)}`} />
            ))}
          </div>
        )}
      </Section>

      {/* Cost by tier */}
      <Section
        title="Custos por tier (nº de pax)"
        sub={costView === "abs" ? "Custo médio por serviço em cada tier, dividido por tipo" : "Peso de cada tipo no custo da tour, por tier"}
        right={<Toggle value={costView} onChange={setCostView} options={[{ id: "abs", label: "€" }, { id: "pct", label: "%" }]} />}
      >
        {tierRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Sem serviços no período</p> : (
          <div className="space-y-4">
            {tierRows.map((r) => {
              const widthPct = costView === "abs" ? (r.avgCost / maxTierAvg) * 100 : 100;
              return (
                <div key={r.tier} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#32373c]">{r.tier} <span className="font-normal text-gray-400">· {r.tours} serviços</span></span>
                    <span className="text-gray-500 tabular-nums">
                      custo médio <span className="font-semibold text-gray-700">{fmtEur(r.avgCost)}</span>
                      {r.costPctOfRevenue != null && <> · {fmt(r.costPctOfRevenue)}% da faturação</>}
                    </span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-md overflow-hidden">
                    <div className="h-full flex gap-[2px]" style={{ width: `${Math.max(widthPct, 2)}%` }}>
                      {r.segs.map((s) => (
                        <div key={s.label} className="h-full first:rounded-l-md last:rounded-r-md"
                          style={{ width: `${s.pct}%`, background: s.label === "Outros (resto)" ? OTHER_COLOR : data.colorOf(s.label) }}
                          title={`${s.label}: ${fmtEur(s.avg)} · ${fmt(s.pct, 1)}%`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                    {r.segs.filter((s) => s.pct >= 3).map((s) => (
                      <span key={s.label}>{s.label} <span className="text-gray-600 font-medium tabular-nums">
                        {costView === "abs" ? fmtEur(s.avg) : `${fmt(s.pct)}%`}
                      </span></span>
                    ))}
                  </div>
                </div>
              );
            })}
            <Legend items={legendItems} />
          </div>
        )}
      </Section>

      {/* Clients */}
      <Section
        title="Maiores clientes"
        sub={clientView === "valor" ? "Por faturação neste serviço" : "Por nº de serviços deste tipo"}
        right={<Toggle value={clientView} onChange={setClientView} options={[{ id: "valor", label: "Valor" }, { id: "tours", label: "Nº tours" }]} />}
      >
        {clientRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Sem clientes no período</p> : (
          <div className="space-y-2">
            {clientRows.map((c) => (
              <Bar key={c.name} label={c.name} color="#667470"
                value={clientView === "valor" ? c.revenue : c.tours} max={maxClient}
                display={clientView === "valor" ? fmtEur(c.revenue) : `${c.tours} · ${fmtEur(c.revenue)}`} />
            ))}
          </div>
        )}
      </Section>

      {/* Fornecedores */}
      <Section title="Custos por fornecedor" sub="Custo por serviço em que o fornecedor aparece · média e mediana">
        {cur.fornecedores.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Sem despesas no período</p> : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-100">
                  <th className="font-medium py-2 pl-4 sm:pl-0">Fornecedor</th>
                  <th className="font-medium py-2 text-right">Serviços</th>
                  <th className="font-medium py-2 text-right">Média</th>
                  <th className="font-medium py-2 text-right">Mediana</th>
                  <th className="font-medium py-2 text-right">Total</th>
                  <th className="font-medium py-2 text-right pr-4 sm:pr-0">Média homóloga</th>
                </tr>
              </thead>
              <tbody>
                {cur.fornecedores.map((f) => {
                  const pf = prevForn.get(f.name);
                  return (
                    <tr key={f.name} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pl-4 sm:pl-0">
                        <span className="font-medium text-[#32373c]">{f.name}</span>
                        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${categoriaBadgeClass(f.categoria)}`}>{f.label}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-500">{f.tours} <span className="text-gray-300">({fmt(f.share)}%)</span></td>
                      <td className="py-2 text-right tabular-nums font-semibold text-gray-700">{fmtEur(f.avg)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">{fmtEur(f.median)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-500">{fmtEur(f.total)}</td>
                      <td className="py-2 text-right tabular-nums pr-4 sm:pr-0 text-gray-500">
                        {pf ? <>{fmtEur(pf.avg)} <Delta cur={f.avg} prev={pf.avg} higherIsBetter={false} /></> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
