"use server";

import { auth } from "@/lib/auth";
import { updateTaskStatus, createSaleTask, updateSaleTask, deleteSaleTask, reorderSaleTasks, getTasksForSale, type SaleTask } from "@/lib/notion";
import { revalidatePath } from "next/cache";

const ALLOWED_ROLES: ReadonlyArray<string> = ["Guide", "Super Guide", "Admin", "Chef", "Driver", "Logistics"];
const CAN_MANAGE_ROLES: ReadonlyArray<string> = ["Admin", "Super Guide"];

// Every action takes the booking's id, or null for the general (partner)
// tasks on /admin/tarefas — those are Admin-only, to read and to change.
const GENERAL_TASKS_PATH = "/admin/tarefas";

function allowed(role: string, roles: ReadonlyArray<string>, tourId: string | null): boolean {
  return tourId === null ? role === "Admin" : roles.includes(role);
}

function revalidateTasks(tourId: string | null) {
  revalidatePath(tourId === null ? GENERAL_TASKS_PATH : `/guide/tours/${tourId}`);
}

export async function getSaleTasksAction(tourId: string): Promise<{ tasks?: SaleTask[]; error?: string }> {
  try {
    const session = await auth();
    if (!session || !allowed(session.user.role, ALLOWED_ROLES, tourId)) {
      return { error: "Unauthorized" };
    }
    const tasks = await getTasksForSale(tourId, session.user.role);
    return { tasks };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateTaskStatusAction(tourId: string | null, taskId: string, status: string): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !allowed(session.user.role, ALLOWED_ROLES, tourId)) {
      return { error: "Unauthorized" };
    }
    await updateTaskStatus(tourId, taskId, status, session.user.role);
    revalidateTasks(tourId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addSaleTaskAction(
  tourId: string | null,
  data: { name: string; description: string; role: string | null; priority: string | null; dueDate: string | null; parentId?: string | null },
): Promise<{ id?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session || !allowed(session.user.role, CAN_MANAGE_ROLES, tourId)) {
      return { error: "Unauthorized" };
    }
    if (!data.name.trim()) return { error: "Nome obrigatório" };
    const id = await createSaleTask(tourId, { ...data, name: data.name.trim(), description: data.description.trim() });
    revalidateTasks(tourId);
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateSaleTaskAction(
  tourId: string | null,
  taskId: string,
  data: { name: string; description: string; role: string | null; priority: string | null; dueDate: string | null },
): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !allowed(session.user.role, CAN_MANAGE_ROLES, tourId)) {
      return { error: "Unauthorized" };
    }
    if (!data.name.trim()) return { error: "Nome obrigatório" };
    await updateSaleTask(tourId, taskId, { ...data, name: data.name.trim(), description: data.description.trim() });
    revalidateTasks(tourId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSaleTaskAction(tourId: string | null, taskId: string): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !allowed(session.user.role, CAN_MANAGE_ROLES, tourId)) {
      return { error: "Unauthorized" };
    }
    await deleteSaleTask(tourId, taskId);
    revalidateTasks(tourId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reorderSaleTasksAction(tourId: string | null, orderedIds: string[]): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !allowed(session.user.role, CAN_MANAGE_ROLES, tourId)) {
      return { error: "Unauthorized" };
    }
    await reorderSaleTasks(tourId, orderedIds);
    revalidateTasks(tourId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
