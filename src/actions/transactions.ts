"use server";

import {
  createTransaction,
  updateTransaction,
  updateTourTeam,
  verifyTransaction,
  archiveTransaction,
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

export async function updateTourTeamAction(
  tourId: string,
  guideId: string | null,
  chefId: string | null,
  driverId: string | null,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await updateTourTeam(tourId, guideId, chefId, driverId);
  revalidatePath(`/guide/tours/${tourId}`);
}

export async function markInvoiceCollectedAction(
  transactionId: string,
  data: {
    invoiceId: string;
    taxFree: number;
    iva6: number;
    iva13: number;
    iva23: number;
    totalCost: number;
    invoiceImageUrl?: string;
  }
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await updateTransaction(transactionId, {
    ...data,
    precisaDeFatura: "Sim tratado",
    status: data.invoiceId ? "Paid" : "Pending Receipt",
  });
  revalidatePath("/super-guide/invoices");
}

export async function logExpenseAction(
  data: Omit<Transaction, "id" | "accountantVerified">
): Promise<string> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin" && session.user.role !== "Super Guide") {
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
  if (session.user.role !== "Guide" && session.user.role !== "Admin" && session.user.role !== "Super Guide") {
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

export async function editExpenseAction(
  transactionId: string,
  tourId: string,
  data: {
    supplier: string;
    fornecedorId: string | null;
    date: string;
    invoiceId: string;
    taxFree: number;
    iva6: number;
    iva13: number;
    iva23: number;
    totalCost: number;
    whoPaid: string;
    paymentMethod: string;
    invoiceImageUrl?: string;
  }
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin" && session.user.role !== "Super Guide") {
    throw new Error("Forbidden");
  }
  await updateTransaction(transactionId, {
    supplier: data.supplier,
    fornecedorId: data.fornecedorId,
    date: data.date,
    invoiceId: data.invoiceId,
    taxFree: data.taxFree,
    iva6: data.iva6,
    iva13: data.iva13,
    iva23: data.iva23,
    totalCost: data.totalCost,
    whoPaid: data.whoPaid,
    paymentMethod: data.paymentMethod,
    ...(data.invoiceImageUrl ? { invoiceImageUrl: data.invoiceImageUrl } : {}),
  });
  revalidatePath(`/guide/tours/${tourId}`);
}

export async function closeTourAction(tourId: string): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin" && session.user.role !== "Super Guide") {
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

export async function deleteExpenseAction(
  transactionId: string,
  tourId: string,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Guide" && session.user.role !== "Admin" && session.user.role !== "Super Guide") {
    throw new Error("Forbidden");
  }
  await archiveTransaction(transactionId);
  revalidatePath(`/guide/tours/${tourId}`);
  revalidatePath("/accountant");
}
