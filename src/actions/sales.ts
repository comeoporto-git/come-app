"use server";

import { createTransaction, updateSaleStatus } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

export async function markSaleInvoicedAction(
  saleNotionId: string,
  data: {
    saleId: string;
    clientName: string;
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

    await createTransaction({
      supplier: `IN - ${data.clientName}`,
      fornecedorId: null,
      date: data.date,
      invoiceId: data.saleId,
      taxFree: data.taxFree,
      iva6: 0,
      iva13: 0,
      iva23: data.iva23,
      totalCost: data.totalAmount,
      whoPaid: "Company",
      paymentMethod: "Transferência Bancária COME",
      status: "Paid",
      tourId: saleNotionId,
      bankReference: "",
      invoiceImageUrl: data.invoiceImageUrl,
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
