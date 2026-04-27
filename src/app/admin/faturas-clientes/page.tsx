import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getFinalisedSales } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { FaturasClientesList } from "@/components/FaturasClientesList";

export default async function FaturasClientesPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const sales = await getFinalisedSales();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/em-falta" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28} className="object-contain invert"
              />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Faturas a Emitir</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {sales.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            <p className="text-lg">Sem faturas a emitir</p>
            <p className="text-sm mt-1">Nenhum serviço com estado "Finalised"</p>
          </div>
        ) : (
          <FaturasClientesList sales={sales} />
        )}
      </main>
    </div>
  );
}
