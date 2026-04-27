"use server";

import { updateTransaction, updateSaleStatus } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

export async function markSaleInvoicedAction(
  saleNotionId: string,
  existingTransactionId: string,
  data: {
    date: string;
    taxFree: number;
    iva23: number;
    totalAmount: number;
    invoiceImageUrl?: string;
  }
): Promise<{ error?: string }> {
  try {
    const session = await auth();
    if (!session || (session.user.role !== "Admin" && session.user.role !== "Super Guide")) {
      return { error: "Forbidden" };
    }

    await updateTransaction(existingTransactionId, {
      date: data.date,
      taxFree: data.taxFree,
      iva23: data.iva23,
      totalCost: data.totalAmount,
      ...(data.invoiceImageUrl ? { invoiceImageUrl: data.invoiceImageUrl } : {}),
    });

    await updateSaleStatus(saleNotionId, "Invoiced");

    revalidatePath("/admin/faturas-clientes");
    revalidatePath("/admin/em-falta");

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}
