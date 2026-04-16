"use server";

import { updateTeamMemberRole, updateTeamMemberProfile } from "@/lib/notion";
import type { TeamMember } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

export async function updateTeamMemberProfileAction(
  memberId: string,
  data: { name: string; phone: string },
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) return { error: "Não autenticado" };
  // Users can only edit their own profile
  if (session.user.notionId !== memberId) return { error: "Forbidden" };
  try {
    await updateTeamMemberProfile(memberId, data);
    revalidatePath("/profile");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateTeamMemberRoleAction(
  memberId: string,
  role: TeamMember["role"],
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return { error: "Forbidden: apenas Admin pode alterar roles" };
  }
  try {
    await updateTeamMemberRole(memberId, role);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}
