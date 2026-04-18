import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import {
  getAnalyticsTours,
  getAnalyticsTransactions,
  getTeamMembers,
} from "@/lib/notion";
import type { Tour } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtEur(n: number) {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function isCancelled(t: Tour) {
  return t.status === "Cancelled" || t.status === "Canceled";
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("pt-PT", { month: "short" })
    .replace(".", "");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${accent ? "bg-[#32373c] border-[#32373c] text-white" : "bg-white border-gray-100 shadow-sm"}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${accent ? "text-white/50" : "text-gray-400"}`}>{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-white" : "text-[#32373c]"}`}>{value}</p>
      {sub && <p className={`text-xs ${accent ? "text-white/40" : "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}

function HBar({ label, value, max, color = "bg-[#667470]", labelWidth = "w-36" }: {
  label: string; value: number; max: number; color?: string; labelWidth?: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs text-gray-500 shrink-0 ${labelWidth} truncate text-right`}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{fmt(value)}</span>
    </div>
  );
}

function SectionCard({ title, sub, badge, badgeColor = "bg-[#667470]", children }: {
  title: string; sub?: string; badge?: number; badgeColor?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#32373c]">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {badge !== undefined && badge > 0 && (
          <span className={`text-xs text-white font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  const backHref = role === "Admin" ? "/admin" : "/super-guide";

  const [tours, transactions, teamMembers] = await Promise.all([
    getAnalyticsTours(),
    getAnalyticsTransactions(),
    getTeamMembers(),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  // ── Split tours ────────────────────────────────────────────────────────────
  const completed = tours.filter((t) => !isCancelled(t));
  const cancelled = tours.filter((t) => isCancelled(t));

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalGuests = completed.reduce((s, t) => s + t.numGuests, 0);
  const avgGroup    = completed.length > 0 ? totalGuests / completed.length : 0;
  const cancelRate  = tours.length > 0 ? (cancelled.length / tours.length) * 100 : 0;

  // ── Monthly trend (last 6 months) ─────────────────────────────────────────
  const monthlyMap: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = 0;
  }
  for (const t of completed) {
    if (!t.date) continue;
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthlyMap) monthlyMap[key]++;
  }
  const monthlyEntries = Object.entries(monthlyMap);
  const maxMonthly     = Math.max(...monthlyEntries.map(([, v]) => v), 1);

  // ── By service type ────────────────────────────────────────────────────────
  const byService: Record<string, number> = {};
  for (const t of completed) {
    const name = t.serviceName || t.type || "Outro";
    byService[name] = (byService[name] ?? 0) + 1;
  }
  const topServices = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxService  = Math.max(...topServices.map(([, v]) => v), 1);

  // ── By day of week ─────────────────────────────────────────────────────────
  const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const byDay   = [0, 0, 0, 0, 0, 0, 0];
  for (const t of completed) {
    if (!t.date) continue;
    byDay[new Date(t.date).getDay()]++;
  }
  const maxDay = Math.max(...byDay, 1);

  // ── Team workload ──────────────────────────────────────────────────────────
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
    ...driverWork.map(([, v]) => v),
    1
  );

  // ── Expenses & Earnings ────────────────────────────────────────────────────
  const expenses = transactions.filter((t) => !t.supplier.startsWith("IN -"));
  const earnings = transactions.filter((t) => t.supplier.startsWith("IN -"));

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

  // ── Date range label ──────────────────────────────────────────────────────
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const rangeLbl = `${sixMonthsAgo.toLocaleDateString("pt-PT", { month: "short", year: "numeric" })} – ${now.toLocaleDateString("pt-PT", { month: "short", year: "numeric" })}`;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      {/* Header */}
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={backHref} className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME" width={72} height={28} className="object-contain invert" unoptimized
          />
          <div className="flex-1" />
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Analytics</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Period label */}
        <p className="text-xs text-white/50 uppercase tracking-widest font-medium">{rangeLbl}</p>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Serviços" value={fmt(completed.length)} sub="realizados" accent />
          <KpiCard label="Hóspedes" value={fmt(totalGuests)} sub="total de pax" />
          <KpiCard label="Média Pax" value={fmt(avgGroup, 1)} sub="por serviço" />
          <KpiCard label="Cancelamentos" value={`${fmt(cancelRate, 0)}%`} sub={`${cancelled.length} serviços`} />
        </div>

        {/* ── Monthly trend ── */}
        <SectionCard title="Tendência Mensal" sub="Serviços realizados por mês">
          <div className="flex items-end gap-2" style={{ height: "120px" }}>
            {monthlyEntries.map(([key, count]) => {
              const pct = (count / maxMonthly) * 100;
              return (
                <div key={key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  {count > 0 && (
                    <span className="text-xs font-semibold text-gray-500">{count}</span>
                  )}
                  <div className="w-full relative" style={{ height: "88px" }}>
                    <div
                      className="absolute bottom-0 w-full bg-[#667470] rounded-t-lg transition-all"
                      style={{ height: `${pct}%`, minHeight: count > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 capitalize">{monthLabel(key)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Service type + Day of week ── */}
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
                    {count > 0 && (
                      <span className="text-[10px] font-semibold text-gray-500">{count}</span>
                    )}
                    <div className="w-full relative" style={{ height: "72px" }}>
                      <div
                        className={`absolute bottom-0 w-full rounded-t-md transition-all ${isWeekend ? "bg-[#667470]" : "bg-[#667470]/60"}`}
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

        {/* ── Team workload ── */}
        <SectionCard title="Carga da Equipa" sub="Serviços por pessoa · últimos 6 meses">
          <div className="space-y-6">
            {/* Guides */}
            {guideWork.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide mb-2">Guias</p>
                <div className="space-y-2.5">
                  {guideWork.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={maxTeam} color="bg-[#667470]" />
                  ))}
                </div>
              </div>
            )}

            {/* Chefs */}
            {chefWork.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Chefs</p>
                <div className="space-y-2.5">
                  {chefWork.map(([name, count]) => (
                    <HBar key={name} label={name} value={count} max={maxTeam} color="bg-red-400" />
                  ))}
                </div>
              </div>
            )}

            {/* Drivers */}
            {driverWork.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Drivers</p>
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

        {/* ── Expenses & Revenue ── */}
        <div className="grid md:grid-cols-2 gap-6">

          <SectionCard title="Despesas" sub="Últimos 90 dias · registadas no sistema">
            <div className="space-y-4">
              {/* Summary */}
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

              {/* By method */}
              {topMethods.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Por método</p>
                  {topMethods.map(([method, total]) => (
                    <HBar
                      key={method}
                      label={method}
                      value={total}
                      max={maxMethod}
                      color="bg-orange-400"
                      labelWidth="w-28"
                    />
                  ))}
                </div>
              )}

              {totalExpenses === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">Sem despesas registadas</p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Receita" sub="Últimos 90 dias · registada no sistema">
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

              {/* Receipts per tour when available */}
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

        {/* Footer note */}
        <p className="text-xs text-white/30 text-center pb-4">
          Dados calculados a partir do Notion · atualizado a cada página carregada
        </p>
      </main>
    </div>
  );
}
