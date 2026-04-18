"use client";

import { useState, useMemo } from "react";
import { AnalyticsPeriodPicker } from "@/components/AnalyticsPeriodPicker";
import type { Tour, Transaction } from "@/lib/notion";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtEur(n: number) {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function isCancelled(t: Tour) {
  return t.status === "Cancelled" || t.status === "Canceled";
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

// ── UI components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${
      accent ? "bg-[#32373c] border-[#32373c] text-white" : "bg-white border-gray-100 shadow-sm"
    }`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${accent ? "text-white/50" : "text-gray-400"}`}>{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-white" : "text-[#32373c]"}`}>{value}</p>
      {sub && <p className={`text-xs ${accent ? "text-white/40" : "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}

function HBar({ label, value, max, color = "bg-[#667470]", labelWidth = "w-36", formatValue }: {
  label: string; value: number; max: number; color?: string; labelWidth?: string;
  formatValue?: (v: number) => string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const displayed = formatValue ? formatValue(value) : fmt(value);
  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs text-gray-500 shrink-0 ${labelWidth} truncate text-right`}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-16 text-right shrink-0">{displayed}</span>
    </div>
  );
}

function SectionCard({ title, sub, children }: {
  title: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-[#32373c]">{title}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
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

function VBars({
  entries,
  max,
  color,
  formatValue,
  barHeight = 88,
}: {
  entries: [string, number][];
  max: number;
  color: string;
  formatValue?: (v: number) => string;
  barHeight?: number;
}) {
  return (
    <div className="flex items-end gap-2" style={{ height: `${barHeight + 32}px` }}>
      {entries.map(([label, value]) => {
        const pct = (value / max) * 100;
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {value > 0 && (
              <span className="text-xs font-semibold text-gray-500 leading-none">
                {formatValue ? formatValue(value) : fmt(value)}
              </span>
            )}
            <div className="w-full relative" style={{ height: `${barHeight}px` }}>
              <div
                className={`absolute bottom-0 w-full ${color} rounded-t-lg`}
                style={{ height: `${pct}%`, minHeight: value > 0 ? "4px" : "0" }}
              />
            </div>
            <span className="text-xs text-gray-400 capitalize leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
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
  const [period, setPeriod] = useState(180);

  // ── By year (always uses full history, ignores period picker) ──────────────
  const yearlyData = useMemo(() => {
    const map: Record<number, { services: number; revenue: number }> = {};

    for (const t of allTours) {
      if (!t.date || isCancelled(t)) continue;
      const y = new Date(t.date).getFullYear();
      if (!map[y]) map[y] = { services: 0, revenue: 0 };
      map[y].services++;
    }
    for (const t of allTransactions) {
      if (!t.date || !t.supplier.startsWith("IN -")) continue;
      const y = new Date(t.date).getFullYear();
      if (!map[y]) map[y] = { services: 0, revenue: 0 };
      map[y].revenue += t.totalCost;
    }

    return Object.entries(map)
      .map(([year, d]) => ({ year: Number(year), ...d }))
      .sort((a, b) => a.year - b.year);
  }, [allTours, allTransactions]);

  const maxYearlyServices = Math.max(...yearlyData.map((d) => d.services), 1);
  const maxYearlyRevenue  = Math.max(...yearlyData.map((d) => d.revenue), 1);
  const hasYearlyRevenue  = yearlyData.some((d) => d.revenue > 0);

  // ── Period-filtered analytics ─────────────────────────────────────────────
  const analytics = useMemo(() => {
    const cutoff = period === 0 ? new Date(0) : new Date(Date.now() - period * 86_400_000);

    const tours        = allTours.filter((t) => t.date && new Date(t.date) >= cutoff);
    const transactions = allTransactions.filter((t) => t.date && new Date(t.date) >= cutoff);

    const completed = tours.filter((t) => !isCancelled(t));
    const cancelled = tours.filter((t) => isCancelled(t));

    // KPIs
    const totalGuests = completed.reduce((s, t) => s + t.numGuests, 0);
    const avgGroup    = completed.length > 0 ? totalGuests / completed.length : 0;
    const cancelRate  = tours.length > 0 ? (cancelled.length / tours.length) * 100 : 0;

    // Monthly trend (cap at 12 bars; for "Tudo" show last 12 months)
    const numMonths = period === 0 ? 12 : period <= 30 ? 1 : period <= 90 ? 3 : period <= 180 ? 6 : 12;
    const monthlyMap: Record<string, number> = {};
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      monthlyMap[monthKey(d)] = 0;
    }
    for (const t of completed) {
      if (!t.date) continue;
      const k = monthKey(new Date(t.date));
      if (k in monthlyMap) monthlyMap[k]++;
    }
    const monthlyEntries = Object.entries(monthlyMap);
    const maxMonthly     = Math.max(...monthlyEntries.map(([, v]) => v), 1);

    // By service type
    const byService: Record<string, number> = {};
    for (const t of completed) {
      const name = t.serviceName || t.type || "Outro";
      byService[name] = (byService[name] ?? 0) + 1;
    }
    const topServices = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxService  = Math.max(...topServices.map(([, v]) => v), 1);

    // By day of week
    const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const byDay   = [0, 0, 0, 0, 0, 0, 0];
    for (const t of completed) {
      if (!t.date) continue;
      byDay[new Date(t.date).getDay()]++;
    }
    const maxDay = Math.max(...byDay, 1);

    // Team workload
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

    // Expenses & earnings
    const expenses      = transactions.filter((t) => !t.supplier.startsWith("IN -"));
    const earnings      = transactions.filter((t) => t.supplier.startsWith("IN -"));
    const totalExpenses = expenses.reduce((s, t) => s + t.totalCost, 0);
    const totalEarnings = earnings.reduce((s, t) => s + t.totalCost, 0);
    const expPerTour    = completed.length > 0 ? totalExpenses / completed.length : 0;

    const byMethod: Record<string, number> = {};
    for (const t of expenses) {
      const m = t.paymentMethod || "Outro";
      byMethod[m] = (byMethod[m] ?? 0) + t.totalCost;
    }
    const topMethods = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
    const maxMethod  = Math.max(...topMethods.map(([, v]) => v), 1);

    // Client analytics
    const byClient: Record<string, number> = {};
    for (const t of completed) {
      if (!t.client) continue;
      byClient[t.client] = (byClient[t.client] ?? 0) + 1;
    }
    const uniqueClientCount  = Object.keys(byClient).length;
    const repeatClientCount  = Object.values(byClient).filter((n) => n > 1).length;
    const repeatRate         = uniqueClientCount > 0 ? (repeatClientCount / uniqueClientCount) * 100 : 0;
    const topClients         = Object.entries(byClient)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id, count]) => [clientNameMap[id] || "—", count] as [string, number]);
    const maxClientCount     = Math.max(...topClients.map(([, v]) => v), 1);

    // Revenue by client — join earnings transactions to tours to get clientId
    const tourClientMap: Record<string, string> = {};
    for (const t of allTours) { if (t.id && t.client) tourClientMap[t.id] = t.client; }
    const revenueByClient: Record<string, number> = {};
    for (const tx of transactions) {
      if (!tx.supplier.startsWith("IN -") || !tx.tourId) continue;
      const cid = tourClientMap[tx.tourId];
      if (!cid) continue;
      revenueByClient[cid] = (revenueByClient[cid] ?? 0) + tx.totalCost;
    }
    const topClientsByRevenue = Object.entries(revenueByClient)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id, rev]) => [clientNameMap[id] || "—", rev] as [string, number]);
    const maxClientRevenue = Math.max(...topClientsByRevenue.map(([, v]) => v), 1);

    // Range label
    const now      = new Date();
    const fromDate = new Date(Date.now() - period * 86_400_000);
    const rangeLbl = period === 0
      ? `Todo o histórico · ${allTours.length} serviços carregados`
      : `${fromDate.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })} – ${now.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}`;

    return {
      completed, cancelled, totalGuests, avgGroup, cancelRate,
      monthlyEntries, maxMonthly,
      topServices, maxService,
      DAYS_PT, byDay, maxDay,
      guideWork, chefWork, driverWork, maxTeam,
      totalExpenses, totalEarnings, expPerTour, topMethods, maxMethod,
      uniqueClientCount, repeatClientCount, repeatRate,
      topClients, maxClientCount,
      topClientsByRevenue, maxClientRevenue,
      rangeLbl,
    };
  }, [allTours, allTransactions, teamMap, clientNameMap, period]);

  const {
    completed, cancelled, totalGuests, avgGroup, cancelRate,
    monthlyEntries, maxMonthly,
    topServices, maxService,
    DAYS_PT, byDay, maxDay,
    guideWork, chefWork, driverWork, maxTeam,
    totalExpenses, totalEarnings, expPerTour, topMethods, maxMethod,
    uniqueClientCount, repeatClientCount, repeatRate,
    topClients, maxClientCount,
    topClientsByRevenue, maxClientRevenue,
    rangeLbl,
  } = analytics;

  return (
    <div className="space-y-6">
      {/* Period picker + range label */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <AnalyticsPeriodPicker current={period} onChange={setPeriod} />
        <p className="text-xs text-white/40 font-medium">{rangeLbl}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Serviços"      value={fmt(completed.length)}    sub="realizados"           accent />
        <KpiCard label="Hóspedes"      value={fmt(totalGuests)}         sub="total de pax" />
        <KpiCard label="Média Pax"     value={fmt(avgGroup, 1)}         sub="por serviço" />
        <KpiCard label="Cancelamentos" value={`${fmt(cancelRate, 0)}%`} sub={`${cancelled.length} serviços`} />
      </div>

      {/* ── Por Ano (always full history) ── */}
      <SectionCard title="Por Ano" sub="Todo o histórico disponível · independente do filtro">
        <div className="space-y-8">
          {/* Services per year */}
          <div>
            <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide mb-3">Serviços realizados</p>
            <VBars
              entries={yearlyData.map((d) => [String(d.year), d.services])}
              max={maxYearlyServices}
              color="bg-[#667470]"
            />
          </div>

          {/* Revenue per year — only if data exists */}
          {hasYearlyRevenue && (
            <>
              <div className="border-t border-gray-50" />
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">Receita</p>
                <VBars
                  entries={yearlyData.map((d) => [String(d.year), d.revenue])}
                  max={maxYearlyRevenue}
                  color="bg-emerald-400"
                  formatValue={(v) => fmtEur(v)}
                />
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Monthly trend */}
      <SectionCard
        title="Tendência Mensal"
        sub={period === 0 ? "Últimos 12 meses" : "Serviços realizados por mês"}
      >
        <VBars entries={monthlyEntries.map(([k, v]) => [monthLabel(k), v])} max={maxMonthly} color="bg-[#667470]" />
      </SectionCard>

      {/* Clients */}
      <SectionCard
        title="Clientes"
        sub={`${period === 0 ? "Todo o histórico" : `Últimos ${period} dias`} · campo "💼 Client"`}
      >
        <div className="space-y-5">
          {uniqueClientCount === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados de clientes</p>
          ) : (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Únicos" value={fmt(uniqueClientCount)} />
                <MiniStat label="Recorrentes" value={fmt(repeatClientCount)} />
                <MiniStat label="Taxa repetição" value={`${fmt(repeatRate, 0)}%`} />
              </div>

              {/* Top by bookings */}
              {topClients.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top clientes · por nº de serviços</p>
                  {topClients.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={maxClientCount} color="bg-blue-400" labelWidth="w-32" />
                  ))}
                </div>
              )}

              {/* Top by revenue */}
              {topClientsByRevenue.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Faturação por cliente</p>
                  {topClientsByRevenue.map(([name, revenue]) => (
                    <HBar
                      key={name}
                      label={name}
                      value={revenue}
                      max={maxClientRevenue}
                      color="bg-emerald-400"
                      labelWidth="w-32"
                      formatValue={fmtEur}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {/* Service type + Day of week */}
      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Por Tipo de Serviço" sub="Serviços completados">
          {topServices.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {topServices.map(([name, count]) => (
                <HBar key={name} label={name} value={count} max={maxService} labelWidth="w-28" />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Por Dia da Semana" sub="Volume de serviços">
          <div className="flex items-end gap-1.5" style={{ height: "110px" }}>
            {byDay.map((count, i) => {
              const pct = (count / maxDay) * 100;
              const isWeekend = i === 0 || i === 6;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  {count > 0 && <span className="text-[10px] font-semibold text-gray-500">{count}</span>}
                  <div className="w-full relative" style={{ height: "72px" }}>
                    <div
                      className={`absolute bottom-0 w-full rounded-t-md ${isWeekend ? "bg-[#667470]" : "bg-[#667470]/60"}`}
                      style={{ height: `${pct}%`, minHeight: count > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{DAYS_PT[i]}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Team workload */}
      <SectionCard title="Carga da Equipa" sub={`Serviços por pessoa · ${period === 0 ? "todo o histórico" : `últimos ${period} dias`}`}>
        <div className="space-y-6">
          {guideWork.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide mb-2.5">Guias</p>
              <div className="space-y-2.5">
                {guideWork.map(([name, count]) => (
                  <HBar key={name} label={name} value={count} max={maxTeam} color="bg-[#667470]" />
                ))}
              </div>
            </div>
          )}
          {chefWork.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2.5">Chefs</p>
              <div className="space-y-2.5">
                {chefWork.map(([name, count]) => (
                  <HBar key={name} label={name} value={count} max={maxTeam} color="bg-red-400" />
                ))}
              </div>
            </div>
          )}
          {driverWork.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Drivers</p>
              <div className="space-y-2.5">
                {driverWork.map(([name, count]) => (
                  <HBar key={name} label={name} value={count} max={maxTeam} color="bg-slate-400" />
                ))}
              </div>
            </div>
          )}
          {guideWork.length === 0 && chefWork.length === 0 && driverWork.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados de equipa</p>
          )}
        </div>
      </SectionCard>

      {/* Expenses & Revenue */}
      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Despesas" sub={`${period === 0 ? "Todo o histórico" : `Últimos ${period} dias`} · registadas no sistema`}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Total despesas</p>
                <p className="text-lg font-bold text-[#32373c] mt-0.5">{fmtEur(totalExpenses)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Média p/ serviço</p>
                <p className="text-lg font-bold text-[#32373c] mt-0.5">{fmtEur(expPerTour)}</p>
              </div>
            </div>
            {topMethods.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Por método</p>
                {topMethods.map(([method, total]) => (
                  <HBar key={method} label={method} value={total} max={maxMethod} color="bg-orange-400" labelWidth="w-28" />
                ))}
              </div>
            )}
            {totalExpenses === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">Sem despesas registadas</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Receita" sub={`${period === 0 ? "Todo o histórico" : `Últimos ${period} dias`} · registada no sistema`}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1">
              <p className="text-xs text-gray-400">Total receita registada</p>
              <p className="text-3xl font-bold text-[#32373c]">{fmtEur(totalEarnings)}</p>
              {totalExpenses > 0 && totalEarnings > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Margem estimada:{" "}
                  <span className={`font-semibold ${totalEarnings - totalExpenses >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {fmtEur(totalEarnings - totalExpenses)}
                  </span>
                </p>
              )}
            </div>
            {totalEarnings === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">
                Receita não registada no sistema ou com prefixo diferente de &quot;IN -&quot;
              </p>
            )}
            {totalEarnings > 0 && completed.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Receita média p/ serviço</p>
                <p className="text-lg font-bold text-[#32373c] mt-0.5">
                  {fmtEur(totalEarnings / completed.length)}
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <p className="text-xs text-white/30 text-center pb-4">
        Dados calculados a partir do Notion · atualizado a cada página carregada
      </p>
    </div>
  );
}
