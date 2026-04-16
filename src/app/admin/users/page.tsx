import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTeamMembers } from "@/lib/notion";
import { UserManagement } from "@/components/UserManagement";
import Link from "next/link";
import Image from "next/image";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const teamMembers = await getTeamMembers();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-lg leading-none">
            ←
          </Link>
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
            unoptimized
          />
          <span className="ml-auto text-xs text-white/50 font-medium uppercase tracking-widest">
            Utilizadores
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#32373c]">Equipa</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Clica no role para alterar · {teamMembers.length} membros
            </p>
          </div>
          {teamMembers.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              Sem membros registados
            </div>
          ) : (
            <UserManagement members={teamMembers} />
          )}
        </section>
      </main>
    </div>
  );
}
