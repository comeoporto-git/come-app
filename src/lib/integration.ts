export type EmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export async function getSaleEmails(saleId: string): Promise<EmailMessage[]> {
  const baseUrl = process.env.INTEGRATION_API_URL;
  const secret  = process.env.ADDON_SECRET;
  if (!baseUrl || !secret) return [];

  try {
    const res = await fetch(`${baseUrl}/api/addon/sale-emails?saleId=${saleId}`, {
      headers: { Authorization: `Bearer ${secret}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.emails ?? []) as EmailMessage[];
  } catch {
    return [];
  }
}
