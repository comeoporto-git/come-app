export type EmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export async function getCRMContactEmails(contactEmail: string): Promise<EmailMessage[]> {
  const baseUrl = process.env.INTEGRATION_API_URL;
  const secret  = process.env.ADDON_SECRET;
  if (!baseUrl || !secret) return [];

  const url = `${baseUrl}/api/addon/edit-context?emails=true&contactEmail=${encodeURIComponent(contactEmail)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.emails ?? []) as EmailMessage[];
  } catch {
    return [];
  }
}

export async function getRecentInboxEmails(limit = 15): Promise<EmailMessage[]> {
  const baseUrl = process.env.INTEGRATION_API_URL;
  const secret  = process.env.ADDON_SECRET;
  if (!baseUrl || !secret) return [];
  const url = `${baseUrl}/api/addon/edit-context?emails=true&inbox=true&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.emails ?? []) as EmailMessage[];
  } catch {
    return [];
  }
}

export async function getSaleEmails(saleId: string): Promise<EmailMessage[]> {
  const baseUrl = process.env.INTEGRATION_API_URL;
  const secret  = process.env.ADDON_SECRET;
  if (!baseUrl || !secret) return [];

  const url = `${baseUrl}/api/addon/edit-context?emails=true&saleId=${saleId}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[getSaleEmails] ${res.status} from ${url}: ${text}`);
      return [];
    }
    const data = await res.json();
    return (data.emails ?? []) as EmailMessage[];
  } catch (err) {
    console.error(`[getSaleEmails] fetch failed for ${url}:`, err);
    return [];
  }
}
