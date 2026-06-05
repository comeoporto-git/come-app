import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getUnmatchedBankTransactions,
  getFlaggedTransactions,
  getGuideExpenses,
  getServicesWithMissingInfo,
  getPendingServices,
  getServicesWithMissingStaff,
  getAiScanFailedTransactions,
  getFinalisedSalesCount,
  getAllUpcomingTours,
  getCRMAccounts,
  getWeeklyActions,
  getDashboardMonthlyStats,
  getStaleProspects,
  getCRMMonthlyActivity,
  getTransactionsNeedingInvoice,
} from "@/lib/notion";
import { getRecentInboxEmails } from "@/lib/integration";
import { getFornecedores } from "@/lib/notion";

function getMondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function formatServiceDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00Z");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const label = d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
  if (tDay.getTime() === today.getTime()) return "Hoje";
  if (tDay.getTime() === tomorrow.getTime()) return "Amanhã";
  return label;
}

function emailAge(dateStr: string): string {
  const sent = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - sent.getTime();
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor(diffMs / 3600000);
  if (days === 0 && hours < 1) return "há menos de 1h";
  if (days === 0) return `há ${hours}h`;
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

function emailAgeClass(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days >= 3) return "text-red-600 font-semibold";
  if (days >= 1) return "text-amber-600 font-medium";
  return "text-gray-400";
}

function avgResponseTime(emails: { date: string }[]): string | null {
  if (emails.length < 2) return null;
  const sorted = [...emails].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let totalMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalMs += new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime();
  }
  const avgHours = Math.round(totalMs / (sorted.length - 1) / 3600000);
  if (avgHours < 24) return `${avgHours}h`;
  return `${Math.round(avgHours / 24)} dias`;
}

function trend(current: number, previous: number): { text: string; up: boolean } {
  if (previous === 0) return { text: "—", up: true };
  const pct = ((current - previous) / previous) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, up: pct >= 0 };
}

function fmtEur(n: number): string {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function stageDot(stage: string): string {
  const m: Record<string, string> = {
    Lead: "bg-gray-400",
    Qualified: "bg-blue-400",
    Prospect: "bg-indigo-400",
    Proposal: "bg-amber-400",
    Client: "bg-emerald-500",
    Lost: "bg-red-400",
  };
  return m[stage] ?? "bg-gray-300";
}

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ bank_connected?: string; bank_error?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;
  const thisMonday = getMondayOfThisWeek();

  const [
    monthlyStats,
    unmatchedBank,
    flaggedTxns,
    guideExpenses,
    incompleteServices,
    pendingServices,
    missingStaffServices,
    failedOCR,
    invoicesNeeded,
    finalisedCount,
    upcomingTours,
    crmAccounts,
    weeklyActions,
    staleProspects,
    crmActivity,
    inboxEmails,
    fornecedores,
  ] = await Promise.all([
    getDashboardMonthlyStats(),
    getUnmatchedBankTransactions(),
    getFlaggedTransactions(),
    getGuideExpenses(),
    getServicesWithMissingInfo(),
    getPendingServices(),
    getServicesWithMissingStaff(),
    getAiScanFailedTransactions(),
    getTransactionsNeedingInvoice(),
    getFinalisedSalesCount(),
    getAllUpcomingTours(),
    getCRMAccounts(),
    getWeeklyActions(thisMonday),
    getStaleProspects(30),
    getCRMMonthlyActivity(),
    getRecentInboxEmails(15),
    getFornecedores(),
  ]);

  // ── Derived values ────────────────────────────────────────────────────────
  const revTrend = trend(monthlyStats.revenue, monthlyStats.lastMonthRevenue);
  const svcTrend = trend(monthlyStats.serviceCount, monthlyStats.lastMonthServiceCount);

  const financeAlerts = unmatchedBank.length + flaggedTxns.length + guideExpenses.length + invoicesNeeded.length + failedOCR.length + finalisedCount;
  const opsAlerts = incompleteServices.length + missingStaffServices.length + pendingServices.length;
  const crmAlerts = staleProspects.length;
  const totalAlerts = financeAlerts + opsAlerts + crmAlerts;

  const weeklyOpen = weeklyActions.filter((a) => a.status !== "done").slice(0, 5);

  const sevenDaysOut = new Date(); sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const nextWeekTours = upcomingTours
    .filter((t) => t.date && new Date(t.date + "T12:00:00Z") <= sevenDaysOut)
    .slice(0, 10);

  const pipelineStages = { Lead: 0, Qualified: 0, Prospect: 0, Proposal: 0 } as Record<string, number>;
  for (const acc of crmAccounts) {
    if (acc.stage in pipelineStages) pipelineStages[acc.stage]++;
  }
  const clientCount = crmAccounts.filter((a) => a.stage === "Client").length;

  const avgResp = avgResponseTime(inboxEmails);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-5">

        {/* ── Status banners ─────────────────────────────────────────────── */}
        {params.bank_connected && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 text-sm text-green-700 font-medium">
            ✅ Conta bancária ligada com sucesso!
          </div>
        )}
        {params.bank_error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-sm text-red-600">
            ❌ Erro ao ligar conta: {params.bank_error}
          </div>
        )}

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Revenue */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Receita (mês)</p>
            <p className="text-2xl font-bold text-[#32373c] tabular-nums">{fmtEur(monthlyStats.revenue)}</p>
            <p className={`text-xs mt-1 font-medium ${revTrend.up ? "text-emerald-600" : "text-red-500"}`}>
              {revTrend.text} vs mês passado
            </p>
          </div>

          {/* Services */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Serviços (mês)</p>
            <p className="text-2xl font-bold text-[#32373c] tabular-nums">{monthlyStats.serviceCount}</p>
            <p className="text-xs text-gray-400 mt-1">
              {monthlyStats.totalPax} pax
              <span className={`ml-2 font-medium ${svcTrend.up ? "text-emerald-600" : "text-red-500"}`}>
                {svcTrend.text}
              </span>
            </p>
          </div>

          {/* CRM Activity */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">CRM (mês)</p>
            <p className="text-2xl font-bold text-[#32373c] tabular-nums">
              {crmActivity.emailCount + crmActivity.callCount}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {crmActivity.emailCount} emails · {crmActivity.callCount} calls
              {crmActivity.newContacts > 0 && ` · +${crmActivity.newContacts} contactos`}
            </p>
          </div>

          {/* Alerts */}
          <div className={`rounded-2xl shadow-sm border p-5 ${totalAlerts > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mb-1">Alertas</p>
            <p className={`text-2xl font-bold tabular-nums ${totalAlerts > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {totalAlerts > 0 ? totalAlerts : "✓"}
            </p>
            {totalAlerts > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                {financeAlerts > 0 && `${financeAlerts} fin. `}
                {opsAlerts > 0 && `${opsAlerts} ops `}
                {crmAlerts > 0 && `${crmAlerts} crm`}
              </p>
            ) : (
              <p className="text-xs text-emerald-600 mt-1">Tudo em dia</p>
            )}
          </div>
        </div>

        {/* ── Tasks + Upcoming ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

          {/* Tarefas Ativas */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-[#32373c] mb-4">Tarefas Ativas</h2>
            <div className="space-y-5">

              {/* Financeiro */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-2">Financeiro</p>
                <div className="space-y-1">
                  {unmatchedBank.length + flaggedTxns.length > 0 && (
                    <Link href="/admin/reconciliation" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Transações bancárias por reconciliar</span>
                      <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unmatchedBank.length + flaggedTxns.length}</span>
                    </Link>
                  )}
                  {guideExpenses.length > 0 && (
                    <Link href="/admin/transferencias" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Transferências para guias pendentes</span>
                      <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{guideExpenses.length}</span>
                    </Link>
                  )}
                  {invoicesNeeded.length > 0 && (
                    <Link href="/admin/invoices" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Faturas de fornecedores em falta</span>
                      <span className="text-xs font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">{invoicesNeeded.length}</span>
                    </Link>
                  )}
                  {failedOCR.length > 0 && (
                    <Link href="/admin/invoices" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Faturas com OCR falhado</span>
                      <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{failedOCR.length}</span>
                    </Link>
                  )}
                  {finalisedCount > 0 && (
                    <Link href="/admin/faturas-clientes" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Faturas a emitir a clientes</span>
                      <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{finalisedCount}</span>
                    </Link>
                  )}
                  {financeAlerts === 0 && (
                    <p className="text-sm text-emerald-600 px-3 py-2">✓ Sem alertas financeiros</p>
                  )}
                </div>
              </div>

              {/* Operacional */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Operacional</p>
                <div className="space-y-1">
                  {incompleteServices.length > 0 && (
                    <Link href="/admin/gestao-servicos" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Serviços com dados incompletos</span>
                      <span className="text-xs font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">{incompleteServices.length}</span>
                    </Link>
                  )}
                  {missingStaffServices.length > 0 && (
                    <Link href="/admin/gestao-servicos" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Serviços sem equipa definida</span>
                      <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{missingStaffServices.length}</span>
                    </Link>
                  )}
                  {pendingServices.length > 0 && (
                    <Link href="/admin/servicos" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Serviços com estado Pendente</span>
                      <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{pendingServices.length}</span>
                    </Link>
                  )}
                  {opsAlerts === 0 && (
                    <p className="text-sm text-emerald-600 px-3 py-2">✓ Sem alertas operacionais</p>
                  )}
                </div>
              </div>

              {/* CRM */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-2">CRM & Vendas</p>
                <div className="space-y-1">
                  {staleProspects.length > 0 && (
                    <Link href="/admin/crm" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Prospects sem contacto há 30+ dias</span>
                      <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{staleProspects.length}</span>
                    </Link>
                  )}
                  {weeklyOpen.length > 0 && (
                    <Link href="/admin/crm/weekly" className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm text-[#32373c] group-hover:text-[#667470]">Ações CRM desta semana por fazer</span>
                      <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{weeklyOpen.length}</span>
                    </Link>
                  )}
                  {weeklyOpen.slice(0, 3).map((action) => (
                    <Link key={action.id} href="/admin/crm/weekly" className="flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                      <span className="text-[10px] mt-0.5 font-bold uppercase tracking-wide text-blue-400 w-8 shrink-0">
                        {action.action_type === "email" ? "✉" : "📞"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#32373c] truncate">{action.account_name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{action.subject ?? action.action_type}</p>
                      </div>
                      <span className="text-[10px] font-bold text-gray-300 shrink-0">P{action.priority}</span>
                    </Link>
                  ))}
                  {crmAlerts === 0 && weeklyOpen.length === 0 && (
                    <p className="text-sm text-emerald-600 px-3 py-2">✓ CRM em dia</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Próximos Serviços */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#32373c]">Próximos 7 Dias</h2>
              <Link href="/admin/servicos" className="text-xs text-[#667470] hover:underline">Ver todos →</Link>
            </div>
            {nextWeekTours.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Sem serviços nos próximos 7 dias</p>
            ) : (
              <div className="space-y-1">
                {nextWeekTours.map((tour) => (
                  <Link key={tour.id} href="/admin/servicos" className="flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="shrink-0 text-center w-14">
                      <p className="text-[10px] font-bold text-[#667470] uppercase">{formatServiceDate(tour.date)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#32373c] truncate">{tour.serviceName || tour.service}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {tour.guideName || "Sem guia"}{tour.numGuests > 0 ? ` · ${tour.numGuests} pax` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      tour.status === "Confirmed" ? "bg-emerald-100 text-emerald-700" :
                      tour.status === "Pending"   ? "bg-amber-100 text-amber-600"     :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {tour.status === "Confirmed" ? "Conf." : tour.status === "Pending" ? "Pend." : tour.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Gmail Inbox ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#32373c]">Emails Recentes — Gmail</h2>
              {avgResp && (
                <p className="text-xs text-gray-400 mt-0.5">Tempo médio entre emails: <span className="font-semibold text-[#32373c]">{avgResp}</span></p>
              )}
            </div>
            {inboxEmails.length > 0 && (
              <span className="text-xs text-gray-400">{inboxEmails.length} emails</span>
            )}
          </div>

          {inboxEmails.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400">Sem dados de inbox disponíveis</p>
              <p className="text-xs text-gray-300 mt-1">A integração Gmail requer configuração do endpoint <code className="bg-gray-100 px-1 rounded">INTEGRATION_API_URL</code></p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {inboxEmails.map((email) => (
                <div key={email.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="w-6 h-6 rounded-full bg-[#667470]/10 flex items-center justify-center text-[10px] font-bold text-[#667470] shrink-0 mt-0.5">
                    {(email.from.match(/^([^<@]+)/)?.[1]?.trim() ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-[#32373c] truncate">
                        {email.from.replace(/<[^>]+>/, "").trim() || email.from}
                      </p>
                      <span className={`text-[10px] shrink-0 ${emailAgeClass(email.date)}`}>{emailAge(email.date)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{email.subject}</p>
                    <p className="text-[11px] text-gray-300 truncate mt-0.5">{email.snippet}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CRM Pipeline ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* Pipeline stages */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#32373c]">Pipeline CRM</h2>
              <Link href="/admin/crm" className="text-xs text-[#667470] hover:underline">Ver pipeline →</Link>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {(["Lead", "Qualified", "Prospect", "Proposal"] as const).map((stage) => (
                <div key={stage} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1">
                  <span className={`w-2 h-2 rounded-full ${stageDot(stage)}`} />
                  <span className="text-xs font-medium text-gray-600">{stage}</span>
                  <span className="text-xs font-bold text-[#32373c]">{pipelineStages[stage] ?? 0}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 bg-emerald-50 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-emerald-700">Clientes</span>
                <span className="text-xs font-bold text-emerald-700">{clientCount}</span>
              </div>
            </div>

            <div className="space-y-1">
              {staleProspects.length === 0 ? (
                <p className="text-sm text-emerald-600">✓ Todos os prospects contactados recentemente</p>
              ) : (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Sem contacto há 30+ dias</p>
                  {staleProspects.slice(0, 6).map((p) => (
                    <Link key={p.id} href={`/admin/crm/accounts/${p.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                      <span className={`w-2 h-2 rounded-full ${stageDot(p.stage)} shrink-0`} />
                      <span className="text-xs font-medium text-[#32373c] flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{p.stage}</span>
                      <span className={`text-[10px] font-bold shrink-0 ${daysSince(p.last_contacted_at) >= 60 ? "text-red-500" : "text-amber-500"}`}>
                        {p.last_contacted_at ? `${daysSince(p.last_contacted_at)}d` : "nunca"}
                      </span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* CRM Activity stats */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-[#32373c] mb-4">Atividade CRM (mês)</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-600">✉ Emails enviados</span>
                <span className="text-sm font-bold text-[#32373c]">{crmActivity.emailCount}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-600">📞 Calls feitas</span>
                <span className="text-sm font-bold text-[#32373c]">{crmActivity.callCount}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-600">👤 Novos contactos</span>
                <span className="text-sm font-bold text-[#32373c]">{crmActivity.newContacts}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600">🏢 Novos prospects</span>
                <span className="text-sm font-bold text-[#32373c]">{crmActivity.newProspects}</span>
              </div>
            </div>
            <Link href="/admin/crm/weekly" className="mt-4 block text-center text-xs text-[#667470] hover:underline">
              Ver ações da semana →
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
