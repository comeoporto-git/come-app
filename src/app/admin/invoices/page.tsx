import { auth } from "@/lib/auth";
import { getTransactionsNeedingInvoice, getTransactionsTreated, getFornecedores } from "@/lib/notion";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { InvoiceQueue } from "@/components/InvoiceQueue";

export default async function AdminInvoicesPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [needingInvoice, treated, fornecedores] = await Promise.all([
    getTransactionsNeedingInvoice(),
    getTransactionsTreated(),
    getFornecedores(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin/em-falta" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
          <Link href="/">
            <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME" width={72} height={28} className="object-contain invert"
          />
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Faturas em Falta</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-white font-bold text-lg">Faturas em Falta</h1>
          <p className="text-white/60 text-sm mt-1">Despesas que precisam de fatura</p>
        </div>
        <InvoiceQueue needingInvoice={needingInvoice} treated={treated} fornecedores={fornecedores} />
      </main>
    </div>
  );
}
