"use server";

import {
  createTransaction,
  updateTransaction,
  updateTourTeam,
  updateTourServiceInfo,
  verifyTransaction,
  archiveTransaction,
  closeTour,
  createFornecedor,
  updateFornecedor,
  markTransferenciaFeita,
  setComprovativoUrl,
  getFornecedores,
  supabase,
} from "@/lib/notion";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { notifyInvoiceAdded } from "@/lib/notifications";
import { analyzeInvoice } from "@/actions/invoice";

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
): Promise<{ error?: string }> {
  const session = await requireAuth();
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    return { error: "Forbidden: apenas Super Guide ou Admin podem editar a equipa" };
  }
  try {
    await updateTourTeam(tourId, guideId, chefId, driverId);
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function updateTourServiceInfoAction(
  tourId: string,
  data: {
    numGuests: number | null;
    names: string;
    phoneNumber: string;
    notes: string;
    meetingPoint: string;
    status?: string;
    type?: string;
    notionId?: string;
    serviceId?: string;
    clientId?: string;
    date?: string;
    startTime?: string | null;
    endTime?: string | null;
  },
): Promise<{ error?: string }> {
  const session = await requireAuth();
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    return { error: "Forbidden: apenas Super Guide ou Admin podem editar esta informação" };
  }
  try {
    await updateTourServiceInfo(tourId, data);
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function createFornecedorAction(name: string): Promise<Fornecedor> {
  await requireAuth();
  return createFornecedor(name);
}

export async function updateFornecedorAction(
  id: string,
  data: { name?: string; email?: string; contact?: string; iban?: string; contribuinte?: string; categoria?: string },
): Promise<{ error?: string }> {
  const session = await requireAuth();
  if (session.user.role !== "Admin") return { error: "Forbidden" };
  try {
    await updateFornecedor(id, data);
    revalidatePath(`/admin/fornecedores/${id}`);
    revalidatePath("/admin/fornecedores");
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
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
    fornecedorId?: string | null;
    supplier?: string;
  }
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  const { fornecedorId, supplier, ...rest } = data;
  await updateTransaction(transactionId, {
    ...rest,
    ...(fornecedorId !== undefined ? { fornecedorId } : {}),
    ...(supplier ? { supplier } : {}),
    precisaDeFatura: "Sim tratado",
    status: data.invoiceId ? "Paid" : "Pending Receipt",
  });
  revalidatePath("/super-guide/invoices");
}

export async function markAiScanFailedAction(
  transactionId: string,
  invoiceImageUrl: string,
): Promise<void> {
  await requireAuth();
  await updateTransaction(transactionId, {
    invoiceImageUrl,
    precisaDeFatura: "AI Scan Falhou",
  });
  revalidatePath("/admin/em-falta");
  revalidatePath("/admin/invoices");
  revalidatePath("/super-guide/invoices");
}

export async function markNoInvoiceNeededAction(
  transactionId: string,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await updateTransaction(transactionId, { precisaDeFatura: "Não" });
  revalidatePath("/admin/invoices");
  revalidatePath("/super-guide/invoices");
}

export async function logExpenseAction(
  data: Omit<Transaction, "id" | "accountantVerified">
): Promise<{ id?: string; error?: string }> {
  try {
    const session = await requireAuth();
    const role = session.user.role;
    if (
      role !== "Guide" &&
      role !== "Admin" &&
      role !== "Super Guide" &&
      role !== "Chef" &&
      role !== "Driver"
    ) {
      return { error: "Forbidden" };
    }
    const id = await createTransaction(data);
    if (data.tourId) {
      revalidatePath(`/guide/tours/${data.tourId}`);
    } else {
      revalidatePath("/admin");
    }
    if (role === "Guide" || role === "Chef" || role === "Driver") {
      notifyInvoiceAdded({
        guideName: session.user.name ?? session.user.email ?? "Guia",
        supplier: data.supplier,
        totalCost: data.totalCost,
        tourId: data.tourId,
        tourName: data.tourName,
        invoiceId: data.invoiceId || undefined,
      }).catch(() => {});
    }
    return { id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[logExpenseAction]", msg);
    return { error: msg };
  }
}

export async function finishPendingExpenseAction(
  transactionId: string,
  invoiceId: string,
  taxFree: number,
  iva6: number,
  iva13: number,
  iva23: number,
  totalCost: number,
  tourId: string | null,
  invoiceImageUrl?: string,
  originalStatus?: string,
  paymentMethod?: string,
  supplier?: string,
): Promise<{ error?: string }> {
  try {
    const session = await requireAuth();
    const role = session.user.role;
    if (
      role !== "Guide" &&
      role !== "Admin" &&
      role !== "Super Guide" &&
      role !== "Chef" &&
      role !== "Driver"
    ) {
      return { error: "Forbidden" };
    }
    const newStatus =
      (paymentMethod === "Honorários" && originalStatus === "Pending Receipt")
        ? "Pending Payment"
        : originalStatus === "Pending Payment"
        ? "Pending Payment"
        : "Paid";
    await updateTransaction(transactionId, {
      invoiceId,
      taxFree,
      iva6,
      iva13,
      iva23,
      totalCost,
      status: newStatus,
      ...(invoiceImageUrl ? { invoiceImageUrl } : {}),
    });
    revalidatePath(`/guide/tours/${tourId}`);
    if (supplier && (role === "Guide" || role === "Chef" || role === "Driver")) {
      notifyInvoiceAdded({
        guideName: session.user.name ?? session.user.email ?? "Guia",
        supplier,
        totalCost,
        tourId,
        invoiceId: invoiceId || undefined,
      }).catch(() => {});
    }
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[finishPendingExpenseAction]", msg);
    return { error: msg };
  }
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
  if (
    session.user.role !== "Guide" &&
    session.user.role !== "Admin" &&
    session.user.role !== "Super Guide" &&
    session.user.role !== "Chef"
  ) {
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

export async function uploadComprovantivoAction(
  transactionId: string,
  fileUrl: string,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Admin" && session.user.role !== "Super Guide") {
    throw new Error("Forbidden");
  }
  await setComprovativoUrl(transactionId, fileUrl);
  revalidatePath("/admin/em-falta");
}

export async function markTransferenciaFeitaAction(
  transactionId: string,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Admin" && session.user.role !== "Super Guide") {
    throw new Error("Forbidden");
  }
  await markTransferenciaFeita(transactionId);
  revalidatePath("/admin/em-falta");
  revalidatePath("/admin/transferencias");
  revalidatePath("/super-guide/transferencias");
}

export async function deleteExpenseAction(
  transactionId: string,
  tourId: string,
): Promise<void> {
  const session = await requireAuth();
  if (
    session.user.role !== "Guide" &&
    session.user.role !== "Admin" &&
    session.user.role !== "Super Guide" &&
    session.user.role !== "Chef"
  ) {
    throw new Error("Forbidden");
  }
  await archiveTransaction(transactionId);
  revalidatePath(`/guide/tours/${tourId}`);
  revalidatePath("/accountant");
}

// ── Earning actions ───────────────────────────────────────────────────────────

export async function createEarningAction(
  tourId: string,
  data: {
    reference: string;
    date: string;
    invoiceId: string;
    contaPagamento?: string;
    taxFree: number;
    iva6: number;
    iva13: number;
    iva23: number;
    totalCost: number;
    invoiceImageUrl?: string;
  }
): Promise<{ error?: string }> {
  const session = await requireAuth();
  if (session.user.role !== "Admin") {
    return { error: "Forbidden" };
  }
  try {
    await createTransaction({
      supplier:      "IN - " + (data.reference || ""),
      fornecedorId:  null,
      date:          data.date,
      invoiceId:     data.invoiceId,
      contaPagamento: data.contaPagamento,
      taxFree:       data.taxFree,
      iva6:          data.iva6,
      iva13:         data.iva13,
      iva23:         data.iva23,
      totalCost:     data.totalCost,
      whoPaid:       "Company",
      paymentMethod: "COME",
      status:        "Pending Payment",
      tourId,
      bankReference: "",
      invoiceImageUrl: data.invoiceImageUrl,
      precisaDeFatura: "",
    });
    revalidatePath(`/guide/tours/${tourId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createStandaloneEarningAction(data: {
  reference: string;
  date: string;
  invoiceId: string;
  taxFree: number;
  iva6: number;
  iva13: number;
  iva23: number;
  totalCost: number;
  invoiceImageUrl?: string;
}): Promise<{ error?: string }> {
  const session = await requireAuth();
  if (session.user.role !== "Admin") return { error: "Forbidden" };
  try {
    await createTransaction({
      supplier:        "IN - " + (data.reference || ""),
      fornecedorId:    null,
      date:            data.date,
      invoiceId:       data.invoiceId,
      taxFree:         data.taxFree,
      iva6:            data.iva6,
      iva13:           data.iva13,
      iva23:           data.iva23,
      totalCost:       data.totalCost,
      whoPaid:         "Company",
      paymentMethod:   "COME",
      status:          "Pending Payment",
      tourId:          null,
      bankReference:   "",
      invoiceImageUrl: data.invoiceImageUrl,
      precisaDeFatura: "",
    });
    revalidatePath("/admin");
    revalidatePath("/admin/transacoes");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function editEarningAction(
  transactionId: string,
  tourId: string,
  data: {
    reference: string;
    date: string;
    invoiceId: string;
    taxFree: number;
    iva6: number;
    iva13: number;
    iva23: number;
    totalCost: number;
    contaPagamento?: string;
    invoiceImageUrl?: string;
  }
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await updateTransaction(transactionId, {
    supplier:       "IN - " + (data.reference || ""),
    date:           data.date,
    invoiceId:      data.invoiceId,
    taxFree:        data.taxFree,
    iva6:           data.iva6,
    iva13:          data.iva13,
    iva23:          data.iva23,
    totalCost:      data.totalCost,
    contaPagamento: data.contaPagamento,
    ...(data.invoiceImageUrl ? { invoiceImageUrl: data.invoiceImageUrl } : {}),
  });
  revalidatePath(`/guide/tours/${tourId}`);
}

export async function deleteEarningAction(
  transactionId: string,
  tourId: string,
): Promise<void> {
  const session = await requireAuth();
  if (session.user.role !== "Admin") {
    throw new Error("Forbidden");
  }
  await archiveTransaction(transactionId);
  revalidatePath(`/guide/tours/${tourId}`);
}

export async function retryAiScanAction(
  transactionId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAuth();

  const { data: row } = await supabase
    .from("transactions")
    .select("fatura_url")
    .eq("id", transactionId)
    .maybeSingle();

  const imageUrl = row?.fatura_url as string | null;
  if (!imageUrl) return { success: false, error: "Sem imagem guardada para re-scan." };

  let base64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf";
  try {
    const res = await fetch(imageUrl);
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("pdf")) mediaType = "application/pdf";
    else if (ct.includes("png")) mediaType = "image/png";
    else if (ct.includes("webp")) mediaType = "image/webp";
    else mediaType = "image/jpeg";
    const buf = await res.arrayBuffer();
    base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  } catch {
    return { success: false, error: "Erro ao carregar a imagem." };
  }

  try {
    const fornecedores = await getFornecedores();
    const result = await analyzeInvoice(base64, mediaType, fornecedores.map((f: Fornecedor) => f.name));
    await updateTransaction(transactionId, {
      supplier: result.supplier || undefined,
      invoiceId: result.invoiceId || "",
      taxFree: result.taxFree,
      iva6: result.iva6,
      iva13: result.iva13,
      iva23: result.iva23,
      totalCost: result.totalCost,
      precisaDeFatura: "Sim",
    });
    revalidatePath("/admin/invoices");
    revalidatePath("/super-guide/invoices");
    return { success: true };
  } catch {
    return { success: false, error: "O scan de AI falhou novamente." };
  }
}
