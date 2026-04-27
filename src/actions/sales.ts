"use server";

import { notion, updateSaleStatus } from "@/lib/notion";
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

    // Update earnings transaction directly — Valor must be positive (income, not expense)
    await notion.pages.update({
      page_id: existingTransactionId,
      properties: {
        Data: { date: { start: data.date } },
        "Valor Sem IVA": { number: data.taxFree },
        "IVA 23%": { number: data.iva23 },
        Valor: { number: data.totalAmount }, // positive for earnings
        ...(data.invoiceImageUrl
          ? { Fatura: { files: [{ type: "external", name: "fatura", external: { url: data.invoiceImageUrl } }] } }
          : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
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
