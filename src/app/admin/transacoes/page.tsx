import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllTransactionsAdmin, getFornecedores } from "@/lib/notion";
import { TransactionsList } from "@/components/TransactionsList";

function defaultRange() {
  const now = new Date();
  const to   = now.toISOString().split("T")[0];
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return { from, to };
}

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;
  const def = defaultRange();
  const from = params.from ?? def.from;
  const to   = params.to   ?? def.to;

  const [transactions, fornecedores] = await Promise.all([
    getAllTransactionsAdmin(from, to),
    getFornecedores(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-6">
        <TransactionsList
          transactions={transactions}
          fornecedores={fornecedores}
          from={from}
          to={to}
        />
      </main>
    </div>
  );
}
