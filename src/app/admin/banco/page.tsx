import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEBSessions, getRecentSyncLogs } from "@/lib/enablebanking";
import { EnableBankingConnectButton } from "@/components/EnableBankingConnectButton";
import { DisconnectEnableBankingButton } from "@/components/DisconnectEnableBankingButton";
import { BankSyncButton } from "@/components/BankSyncButton";

export default async function BancoPage({
  searchParams,
}: {
  searchParams: Promise<{ bank_connected?: string; bank_error?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;
  const [ebSessions, syncLogs] = await Promise.all([
    getEBSessions(),
    getRecentSyncLogs(5),
  ]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-4">
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

        {/* Contas Bancárias */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Contas Bancárias</h2>
              <p className="text-xs text-gray-400 mt-0.5">Open Banking via Enable Banking · PSD2</p>
            </div>
            <EnableBankingConnectButton />
          </div>
          {ebSessions.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400">
              <div className="text-3xl mb-2">🏦</div>
              <p className="text-sm">Nenhuma conta ligada ainda</p>
              <p className="text-xs mt-1">Clica em &quot;+ Ligar Conta&quot; para conectar o Crédito Agrícola</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {ebSessions.map((s) => {
                const expired = !!s.valid_until && new Date(s.valid_until) < new Date();
                return (
                  <li key={s.session_id} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${expired ? "bg-red-100" : "bg-green-100"}`}>🏦</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#32373c]">{s.institution_name}</p>
                      <p className="text-xs text-gray-400">
                        {s.last_fetched_at
                          ? `Último sync: ${new Date(s.last_fetched_at).toLocaleDateString("pt-PT")}`
                          : "Aguarda primeira sincronização"}
                        {s.valid_until && <span className="ml-2">· Válido até {new Date(s.valid_until).toLocaleDateString("pt-PT")}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {expired ? (
                        <>
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">Expirado</span>
                          <EnableBankingConnectButton />
                        </>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Ligado</span>
                      )}
                      <DisconnectEnableBankingButton sessionId={s.session_id} name={s.institution_name} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Sincronização Manual */}
        {ebSessions.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#32373c]">Sincronização Manual</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sincroniza automaticamente todas as noites. Clica para forçar agora.</p>
            </div>
            <BankSyncButton />
          </section>
        )}

        {/* Histórico de Sincronizações */}
        {syncLogs.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-[#32373c]">Histórico de Sincronizações</h2>
              <p className="text-xs text-gray-400 mt-0.5">Últimas {syncLogs.length} sincronizações</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {syncLogs.map((log) => {
                const errors = Array.isArray(log.errors) ? log.errors : [];
                const hasError = !!log.fatal_error || errors.length > 0;
                const date = new Date(log.ran_at).toLocaleString("pt-PT", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
                });
                return (
                  <li key={log.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${hasError ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                          {hasError ? "Erro" : "OK"}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{date}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400 capitalize">{log.trigger}</span>
                      </div>
                      {!hasError && (
                        <div className="flex gap-3 text-xs text-gray-500 flex-shrink-0">
                          <span><span className="font-medium text-blue-600">{log.fetched}</span> importados</span>
                          <span><span className="font-medium text-green-600">{log.matched}</span> matched</span>
                          {log.unmatched > 0 && <span><span className="font-medium text-orange-500">{log.unmatched}</span> sem fatura</span>}
                        </div>
                      )}
                    </div>
                    {log.fatal_error && (
                      <p className="text-xs text-red-500 mt-1.5 font-mono break-all">{log.fatal_error}</p>
                    )}
                    {errors.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {errors.map((e, i) => (
                          <li key={i} className="text-xs text-orange-500 font-mono break-all">• {e}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
