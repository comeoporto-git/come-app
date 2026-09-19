"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  updateServiceCore,
  updateServicePricing,
  addServiceStep,
  updateServiceStep,
  deleteServiceStep,
  reorderServiceSteps,
  addServiceTask,
  updateServiceTask,
  deleteServiceTask,
  reorderServiceTasks,
  createRestaurant,
  updateRestaurantHours,
  updateRestaurantDetails,
  linkServiceRestaurant,
  unlinkServiceRestaurant,
  reorderServiceRestaurants,
  type RestaurantHourInput,
} from "@/lib/notion";

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (session.user.role !== "Admin") throw new Error("Forbidden: apenas Admin");
  return session;
}

function revalidateService(id: string) {
  revalidatePath(`/admin/produtos/${id}`);
  revalidatePath(`/guide/produtos/${id}`);
  revalidatePath("/admin/produtos");
}

export async function updateServiceCoreAction(
  id: string,
  data: { name: string; type: string; description: string; durationMinutes: number | null; equipa: string[] },
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await updateServiceCore(id, data);
    revalidateService(id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateServicePricingAction(
  id: string,
  data: {
    pax_2_3: number | null;
    pax_4_6: number | null;
    pax_7_plus: number | null;
    valor_chef_2_3: number | null;
    valor_chef_4_6: number | null;
    valor_chef_7_10: number | null;
    valor_copa: number | null;
    valor_driver: number | null;
  },
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await updateServicePricing(id, data);
    revalidateService(id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addServiceStepAction(serviceId: string, title: string, description: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!title.trim()) return { error: "Título obrigatório" };
    await addServiceStep(serviceId, title.trim(), description.trim());
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateServiceStepAction(serviceId: string, stepId: string, title: string, description: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!title.trim()) return { error: "Título obrigatório" };
    await updateServiceStep(stepId, title.trim(), description.trim());
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteServiceStepAction(serviceId: string, stepId: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await deleteServiceStep(stepId);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reorderServiceStepsAction(serviceId: string, orderedIds: string[]): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await reorderServiceSteps(orderedIds);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addServiceTaskAction(serviceId: string, name: string, description: string, role: string | null): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!name.trim()) return { error: "Nome obrigatório" };
    await addServiceTask(serviceId, name.trim(), description.trim(), role);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateServiceTaskAction(serviceId: string, taskId: string, name: string, description: string, role: string | null): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!name.trim()) return { error: "Nome obrigatório" };
    await updateServiceTask(taskId, name.trim(), description.trim(), role);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteServiceTaskAction(serviceId: string, taskId: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await deleteServiceTask(taskId);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reorderServiceTasksAction(serviceId: string, orderedIds: string[]): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await reorderServiceTasks(orderedIds);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createRestaurantAction(
  serviceId: string,
  data: { name: string; address: string; phone: string; notes: string; googleUrl?: string; hours: RestaurantHourInput[] },
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!data.name.trim()) return { error: "Nome obrigatório" };
    const restaurantId = await createRestaurant(data);
    await linkServiceRestaurant(serviceId, restaurantId);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateRestaurantHoursAction(
  serviceId: string,
  restaurantId: string,
  hours: RestaurantHourInput[],
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await updateRestaurantHours(restaurantId, hours);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateRestaurantDetailsAction(
  serviceId: string,
  restaurantId: string,
  data: { name: string; address: string; phone: string; notes: string; googleUrl: string },
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!data.name.trim()) return { error: "Nome obrigatório" };
    await updateRestaurantDetails(restaurantId, data);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function unlinkServiceRestaurantAction(serviceId: string, restaurantId: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await unlinkServiceRestaurant(serviceId, restaurantId);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reorderServiceRestaurantsAction(serviceId: string, orderedRestaurantIds: string[]): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await reorderServiceRestaurants(serviceId, orderedRestaurantIds);
    revalidateService(serviceId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
