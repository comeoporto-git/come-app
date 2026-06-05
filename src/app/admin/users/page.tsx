import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTeamMembers } from "@/lib/notion";
import { UserManagement } from "@/components/UserManagement";
import Link from "next/link";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const teamMembers = await getTeamMembers();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4">
        {/* Permissions link */}
        <Link href="/admin/permissoes">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:border-[#667470]/30 active:scale-[0.98] transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-xl shrink-0">🔐</div>
            <div className="flex-1">
              <p className="font-semibold text-[#32373c] text-sm">Permissões</p>
              <p className="text-xs text-gray-400 mt-0.5">Ver e editar o que cada role pode aceder</p>
            </div>
            <span className="text-gray-300 text-lg">→</span>
          </div>
        </Link>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#32373c]">Equipa</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {teamMembers.length} membros
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
        </div>
      </main>

    </div>
  );
}
