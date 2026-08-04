import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPartnerBalances, getSocioPersonalExpenses } from "@/lib/notion";
import type { PartnerBalance } from "@/lib/notion";
import { OWNERSHIP_BEFORE, OWNERSHIP_AFTER } from "@/lib/constants";
import { SocioPersonalExpenseList } from "@/components/SocioPersonalExpenseList";

export default async function SociosPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [{ before, after }, personalExpenses] = await Promise.all([
    getPartnerBalances(),
    getSocioPersonalExpenses(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <h1 className="text-sm font-semibold text-[#32373c]">Sócios</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Saldo de faturação e despesas por conta de pagamento (António, Bernardo, Manel)
          </p>
        </div>

        <PartnerSection
          title="Até 30 de Setembro de 2025"
          subtitle="Bernardo 50% · António 50%"
          balances={before}
          ownership={OWNERSHIP_BEFORE}
        />

        <PartnerSection
          title="A partir de 1 de Outubro de 2025"
          subtitle="Bernardo 40% · António 40% · Manel 20%"
          balances={after}
          ownership={OWNERSHIP_AFTER}
        />

        <SocioPersonalExpenseList expenses={personalExpenses} />
      </main>
    </div>
  );
}

function PartnerSection({
  title,
  subtitle,
  balances,
  ownership,
}: {
  title: string;
  subtitle: string;
  balances: PartnerBalance[];
  ownership: Record<string, number>;
}) {
  const totalSaldo = balances.reduce((s, p) => s + p.balance, 0);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-[#32373c]">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-50">
        {balances.map((p) => {
          const actualPct = totalSaldo !== 0 ? (p.balance / totalSaldo) * 100 : 0;
          const contractPct = ownership[p.name] ?? 0;
          const fairShare = (contractPct / 100) * totalSaldo;
          const adjustment = p.balance - fairShare;
          return (
            <PartnerCard
              key={p.name}
              balance={p}
              actualPct={actualPct}
              adjustment={adjustment}
            />
          );
        })}
      </div>
    </section>
  );
}

function PartnerCard({
  balance,
  actualPct,
  adjustment,
}: {
  balance: PartnerBalance;
  actualPct: number;
  adjustment: number;
}) {
  const { name, earnings, expenses, balance: net } = balance;
  const owes = adjustment > 0.005;
  const owed = adjustment < -0.005;
  return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-sm font-semibold text-[#32373c]">{name}</p>
      <div className="space-y-1.5">
        <Row label="Faturação" value={earnings} color="text-emerald-600" />
        <Row label="Despesas" value={-expenses} color="text-red-500" />
        <div className="pt-1.5 border-t border-gray-50 flex items-center justify-between gap-2">
          <Row label="Saldo" value={net} color={net >= 0 ? "text-emerald-600" : "text-red-500"} bold className="flex-1" />
          <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full shrink-0">
            {actualPct.toFixed(1)}%
          </span>
        </div>
        {(owes || owed) && (
          <div className="pt-1.5 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">{owes ? "Deve aos outros" : "A receber dos outros"}</span>
            <span className={`text-sm font-bold ${owes ? "text-red-500" : "text-emerald-600"}`}>
              €{Math.abs(adjustment).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
  bold = false,
  className = "",
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  className?: string;
}) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span className={`text-xs ${bold ? "font-semibold text-[#32373c]" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-bold" : "font-medium"} ${color}`}>
        {sign}€{Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}
