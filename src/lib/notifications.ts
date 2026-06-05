import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = "comeoporto@gmail.com";
const FROM = process.env.AUTH_EMAIL_FROM ?? "noreply@comeoporto.com";
const BASE_URL = process.env.NEXTAUTH_URL ?? "https://comeoporto.com";

export async function notifyInvoiceAdded({
  guideName,
  supplier,
  totalCost,
  tourId,
  tourName,
  invoiceId,
}: {
  guideName: string;
  supplier: string;
  totalCost: number;
  tourId: string | null;
  tourName?: string;
  invoiceId?: string;
}): Promise<void> {
  const tourLabel = tourName ?? tourId ?? "—";
  const adminUrl = `${BASE_URL}/admin/invoices`;

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `Nova fatura adicionada por ${guideName}`,
    html: `
      <p>O guia <strong>${guideName}</strong> submeteu uma nova fatura.</p>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td><strong>Fornecedor</strong></td><td>${supplier}</td></tr>
        <tr><td><strong>Total</strong></td><td>${totalCost.toFixed(2)} €</td></tr>
        <tr><td><strong>Tour</strong></td><td>${tourLabel}</td></tr>
        ${invoiceId ? `<tr><td><strong>Nº Fatura</strong></td><td>${invoiceId}</td></tr>` : ""}
      </table>
      <p><a href="${adminUrl}">Ver faturas no admin</a></p>
    `,
  });
}
