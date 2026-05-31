"use server";

import { supabase, updateSaleStatus } from "@/lib/notion";
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

    // Earnings transactions have a positive Valor — do not negate
    const updates: Record<string, unknown> = {
      data:          data.date,
      valor_sem_iva: data.taxFree,
      iva_23:        data.iva23,
      valor:         data.totalAmount,
    };
    if (data.invoiceImageUrl) updates.fatura_url = data.invoiceImageUrl;

    const { error } = await supabase.from("transactions").update(updates).eq("id", existingTransactionId);
    if (error) throw new Error(error.message);

    await updateSaleStatus(saleNotionId, "Invoiced");

    revalidatePath("/admin/faturas-clientes");
    revalidatePath("/admin/em-falta");

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}
