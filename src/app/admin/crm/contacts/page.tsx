import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllCRMContacts } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";

export default async function CRMContactsPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const contacts = await getAllCRMContacts();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/crm" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Contactos</span>
        </div>
      </header>

      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Contactos" }]} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h1 className="font-bold text-[#32373c]">Todos os Contactos</h1>
            <p className="text-xs text-gray-400 mt-0.5">{contacts.length} contacto{contacts.length !== 1 ? "s" : ""}</p>
          </div>
          {contacts.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Sem contactos ainda</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {contacts.map((c) => (
                <Link key={c.id} href={`/admin/crm/accounts/${c.account_id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-[#667470]/10 flex items-center justify-center text-sm font-bold text-[#667470] shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#32373c] truncate">{c.name}</p>
                      {c.is_primary && <span className="text-xs bg-[#667470]/10 text-[#667470] px-1.5 py-0.5 rounded-full shrink-0">principal</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{c.account_name}{c.role ? ` · ${c.role}` : ""}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    {c.email && <p className="text-xs text-gray-500 truncate max-w-[160px]">{c.email}</p>}
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
