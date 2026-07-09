import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getFornecedorById, getFornecedores, getTransactionsByFornecedor } from "@/lib/notion";
import { FornecedorDetailClient } from "@/components/fornecedores/FornecedorDetailClient";

export default async function FornecedorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { id } = await params;

  const [fornecedor, fornecedores, transactions] = await Promise.all([
    getFornecedorById(id),
    getFornecedores(),
    getTransactionsByFornecedor(id),
  ]);

  if (!fornecedor) notFound();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <FornecedorDetailClient
          fornecedor={fornecedor}
          transactions={transactions}
          fornecedores={fornecedores}
        />
      </main>
    </div>
  );
}
