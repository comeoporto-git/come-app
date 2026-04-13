"use server";

import {
  createTransaction,
  updateTransaction,
  verifyTransaction,
  closeTour,
} from "@/lib/notion";
import type { Transaction } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

async function requireAuth() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function logExpenseAction(
  data: Omit<Transaction, "id" | "accountantVerified">
): Promise<string> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  const id = await createTransaction(data);
  revalidatePath(`/guide/tours/${data.tourId}`);
  return id;
}

export async function finishPendingExpenseAction(
  transactionId: string,
  invoiceId: string,
  taxFree: number,
  iva6: number,
  iva13: number,
  iva23: number,
  totalCost: number,
  tourId: string,
  invoiceImageUrl?: string,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await updateTransaction(transactionId, {
    invoiceId,
    taxFree,
    iva6,
    iva13,
    iva23,
    totalCost,
    status: "Paid",
    ...(invoiceImageUrl ? { invoiceImageUrl } : {}),
  });
  revalidatePath(`/guide/tours/${tourId}`);
}

export async function closeTourAction(tourId: string): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await closeTour(tourId);
  revalidatePath("/guide");
  revalidatePath(`/guide/tours/${tourId}`);
}

export async function verifyTransactionAction(
  transactionId: string,
  verified: boolean,
  tourId?: string
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Accountant" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await verifyTransaction(transactionId, verified);
  revalidatePath("/accountant");
  if (tourId) revalidatePath(`/guide/tours/${tourId}`);
}
