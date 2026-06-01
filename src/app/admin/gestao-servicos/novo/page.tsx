"use server";

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createService } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import NewServiceForm from "./NewServiceForm";

export default async function NovoServicoPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  async function handleCreate(formData: FormData) {
    "use server";

    const name = (formData.get("name") as string)?.trim();
    if (!name) return;

    const toNum = (key: string) => {
      const v = (formData.get(key) as string)?.trim();
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    const equipaRaw = (formData.get("equipa") as string) ?? "";
    const equipa = equipaRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    await createService({
      name,
      type:            (formData.get("type") as string)?.trim() || undefined,
      equipa:          equipa.length ? equipa : undefined,
      pax_2_3:         toNum("pax_2_3"),
      pax_4_6:         toNum("pax_4_6"),
      pax_7_plus:      toNum("pax_7_plus"),
      valor_chef_2_3:  toNum("valor_chef_2_3"),
      valor_chef_4_6:  toNum("valor_chef_4_6"),
      valor_chef_7_10: toNum("valor_chef_7_10"),
      valor_copa:      toNum("valor_copa"),
      valor_driver:    toNum("valor_driver"),
      processo:        (formData.get("processo") as string)?.trim() || undefined,
    });

    redirect("/admin/gestao-servicos");
  }

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/gestao-servicos" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Novo Serviço</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <NewServiceForm action={handleCreate} />
      </main>
    </div>
  );
}
