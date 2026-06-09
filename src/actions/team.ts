"use server";

import { updateTeamMemberRole, updateTeamMemberProfile, adminUpdateTeamMemberContact, createTeamMember } from "@/lib/notion";
import type { TeamMember } from "@/lib/notion";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";

export async function updateTeamMemberProfileAction(
  memberId: string,
  data: { name: string; phone: string; nif: string; iban: string },
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
    revalidateTag("team-members");
    revalidatePath("/admin");
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function adminUpdateTeamMemberContactAction(
  memberId: string,
  data: { email: string; phone: string; iban: string },
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return { error: "Forbidden: apenas Admin pode editar membros" };
  }
  try {
    await adminUpdateTeamMemberContact(memberId, data);
    revalidatePath("/admin/users");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createTeamMemberAction(
  data: { name: string; email: string; phone: string; iban: string; role: TeamMember["role"] },
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return { error: "Forbidden: apenas Admin pode criar membros" };
  }
  if (!data.name.trim() || !data.email.trim()) {
    return { error: "Nome e email são obrigatórios" };
  }
  try {
    await createTeamMember(data);
    revalidatePath("/admin/users");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
