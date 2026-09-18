"use server";

import { auth } from "@/lib/auth";
import { updateTaskStatus } from "@/lib/notion";
import { revalidatePath } from "next/cache";

const ALLOWED_ROLES: ReadonlyArray<string> = ["Guide", "Super Guide", "Admin", "Chef", "Driver", "Logistics"];

export async function updateTaskStatusAction(tourId: string, taskId: string, status: string): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return { error: "Unauthorized" };
    }
    await updateTaskStatus(taskId, status);
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
