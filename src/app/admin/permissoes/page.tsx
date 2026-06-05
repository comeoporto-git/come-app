import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FEATURES, ALL_ROLES, getRolePermissions } from "@/lib/permissions";
import { PermissionsMatrix } from "@/components/PermissionsMatrix";

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
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Role legend */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Roles</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
