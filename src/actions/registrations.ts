"use server";

import { auth } from "@/lib/auth";
import {
  createSaleRegistrations,
  updateSaleRegistration,
  deleteSaleRegistration,
  type SaleRegistrationInput,
} from "@/lib/notion";
import { revalidatePath } from "next/cache";

const CAN_MANAGE_ROLES: ReadonlyArray<string> = ["Admin", "Super Guide"];
// Only Admin sees or sets payment status/method/date.
const CAN_SEE_PAYMENT_ROLE = "Admin";

function clean(data: SaleRegistrationInput): SaleRegistrationInput {
  return {
    ...data,
    name: data.name.trim(),
    paymentMethod: data.paymentMethod.trim(),
    dietaryRestrictions: data.dietaryRestrictions.trim(),
    email: data.email.trim(),
    phone: data.phone.trim(),
    notes: data.notes.trim(),
  };
}

export async function addSaleRegistrationsAction(
  tourId: string,
  items: SaleRegistrationInput[],
): Promise<{ ids?: string[]; error?: string }> {
  try {
    const session = await auth();
    if (!session || !CAN_MANAGE_ROLES.includes(session.user.role)) {
      return { error: "Unauthorized" };
    }
    const canSetPayment = session.user.role === CAN_SEE_PAYMENT_ROLE;
    const cleaned = items.map(clean).map((r) => canSetPayment
      ? r
      : { ...r, paymentStatus: "Não Feito" as const, paymentMethod: "", paymentDate: null });
    if (!cleaned.length || cleaned.some((r) => !r.name)) return { error: "Nome obrigatório" };
    const ids = await createSaleRegistrations(tourId, cleaned);
    revalidatePath(`/guide/tours/${tourId}`);
    return { ids };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateSaleRegistrationAction(
  tourId: string,
  registrationId: string,
  data: SaleRegistrationInput,
): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !CAN_MANAGE_ROLES.includes(session.user.role)) {
      return { error: "Unauthorized" };
    }
    const cleaned = clean(data);
    if (!cleaned.name) return { error: "Nome obrigatório" };
    await updateSaleRegistration(tourId, registrationId, cleaned, {
      includePayment: session.user.role === CAN_SEE_PAYMENT_ROLE,
    });
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSaleRegistrationAction(tourId: string, registrationId: string): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || !CAN_MANAGE_ROLES.includes(session.user.role)) {
      return { error: "Unauthorized" };
    }
    await deleteSaleRegistration(tourId, registrationId);
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
