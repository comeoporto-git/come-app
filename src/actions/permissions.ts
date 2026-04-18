"use server";

import { auth } from "@/lib/auth";
import { setPermission, resetPermission, FEATURES, ALL_ROLES } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Forbidden");
}

export async function togglePermissionAction(
  featureKey: string,
  role: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    // Validate inputs
    const feature = FEATURES.find((f) => f.key === featureKey);
    if (!feature) return { error: "Feature inválida" };
    if (!ALL_ROLES.includes(role as (typeof ALL_ROLES)[number])) return { error: "Role inválida" };

    // Admins always keep access to permissions — can't lock themselves out
    if (featureKey === "permissions" && role === "Admin" && !enabled) {
      return { error: "Não é possível remover o acesso Admin às Permissões" };
    }

    await setPermission(featureKey, role, enabled);
    revalidatePath("/admin/permissoes");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resetPermissionAction(
  featureKey: string,
  role: string,
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await resetPermission(featureKey, role);
    revalidatePath("/admin/permissoes");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
