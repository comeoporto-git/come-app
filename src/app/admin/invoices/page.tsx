import { auth } from "@/lib/auth";
import { getTransactionsNeedingInvoice, getTransactionsTreated, getAiScanFailedTransactions, getFornecedores } from "@/lib/notion";
import { redirect } from "next/navigation";
import { InvoiceQueue } from "@/components/InvoiceQueue";

export default async function AdminInvoicesPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [needingInvoice, treated, aiScanFailed, fornecedores] = await Promise.all([
    getTransactionsNeedingInvoice(),
    getTransactionsTreated(),
    getAiScanFailedTransactions(),
    getFornecedores(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470]">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-white font-bold text-lg">Faturas em Falta</h1>
          <p className="text-white/60 text-sm mt-1">Despesas que precisam de fatura</p>
        </div>
        <InvoiceQueue needingInvoice={needingInvoice} treated={treated} aiScanFailed={aiScanFailed} fornecedores={fornecedores} />
      </main>
    </div>
  );
}
