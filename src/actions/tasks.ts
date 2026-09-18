"use server";

import { auth } from "@/lib/auth";
import { updateTaskStatus, createSaleTask } from "@/lib/notion";
import { revalidatePath } from "next/cache";

const ALLOWED_ROLES: ReadonlyArray<string> = ["Guide", "Super Guide", "Admin", "Chef", "Driver", "Logistics"];
const CAN_MANAGE_ROLES: ReadonlyArray<string> = ["Admin", "Super Guide"];

export async function updateTaskStatusAction(tourId: string, taskId: string, status: string): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return { error: "Unauthorized" };
    }
    await updateTaskStatus(tourId, taskId, status, session.user.role);
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addSaleTaskAction(
  tourId: string,
  data: { name: string; description: string; role: string | null; priority: string | null; dueDate: string | null },
): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !CAN_MANAGE_ROLES.includes(session.user.role)) {
      return { error: "Unauthorized" };
    }
    if (!data.name.trim()) return { error: "Nome obrigatório" };
    await createSaleTask(tourId, { ...data, name: data.name.trim(), description: data.description.trim() });
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
