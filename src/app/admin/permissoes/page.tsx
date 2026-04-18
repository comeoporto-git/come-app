import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { FEATURES, ALL_ROLES, getRolePermissions } from "@/lib/permissions";
import { PermissionsMatrix } from "@/components/PermissionsMatrix";
import Image from "next/image";
import Link from "next/link";

/** Build the "defaults" map (what permissions would be without any DB overrides). */
function buildDefaults() {
  const defaults: Record<string, Record<string, boolean>> = {};
  for (const feature of FEATURES) {
    defaults[feature.key] = {};
    for (const role of ALL_ROLES) {
      defaults[feature.key][role] = feature.defaultRoles.includes(role);
    }
  }
  return defaults;
}

export default async function PermissoesPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const permissions = await getRolePermissions();
  const defaults = buildDefaults();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin/users" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME" width={72} height={28} className="object-contain invert" unoptimized
          />
          <div className="flex-1" />
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Permissões</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Role legend */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Roles</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              { role: "Admin",       color: "bg-purple-100 text-purple-700", desc: "Acesso total à plataforma" },
              { role: "Guide",       color: "bg-[#667470]/10 text-[#667470]", desc: "Tour do dia e despesas" },
              { role: "Super Guide", color: "bg-blue-100 text-blue-700",    desc: "Guide + faturas em falta" },
              { role: "Accountant",  color: "bg-orange-100 text-orange-700", desc: "Portal de contabilidade" },
              { role: "Chef",        color: "bg-red-100 text-red-700",       desc: "Igual ao Guide" },
              { role: "Driver",      color: "bg-slate-100 text-slate-700",   desc: "Igual ao Guide" },
            ] as const).map(({ role, color, desc }) => (
              <div key={role} className="rounded-xl border border-gray-100 p-3">
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${color}`}>{role}</span>
                <p className="text-xs text-gray-400 leading-tight">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Permissions matrix */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-gray-700">Matriz de Permissões</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Clica nos círculos para dar ou revogar acesso. As alterações são guardadas imediatamente.
            </p>
          </div>
          <PermissionsMatrix
            features={FEATURES}
            roles={ALL_ROLES}
            permissions={permissions}
            defaults={defaults}
          />
        </section>
      </main>
    </div>
  );
}
