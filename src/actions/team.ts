"use server";

import { updateTeamMemberRole } from "@/lib/notion";
import type { TeamMember } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

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
