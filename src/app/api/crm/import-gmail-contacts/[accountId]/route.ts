import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";

// Domains/addresses belonging to COME Porto — filter these out
const OWN_DOMAINS = ["comeoporto.com", "gmail.com"];
const OWN_KEYWORDS = ["come porto", "comeoporto"];

function parseFrom(from: string): { name: string; email: string } | null {
  // "Name <email@domain.com>" or just "email@domain.com"
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim().toLowerCase() };
  if (from.includes("@")) return { name: "", email: from.trim().toLowerCase() };
  return null;
}

function isOwnEmail(email: string, name: string): boolean {
  const domain = email.split("@")[1] ?? "";
  if (OWN_DOMAINS.some((d) => domain === d)) return true;
  if (OWN_KEYWORDS.some((k) => email.toLowerCase().includes(k) || name.toLowerCase().includes(k))) return true;
  return false;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await params;
  const baseUrl = process.env.INTEGRATION_API_URL;
  const secret = process.env.ADDON_SECRET;

  if (!baseUrl || !secret) {
    return NextResponse.json({ error: "Gmail integration not configured" }, { status: 400 });
  }

  // Get all sales for this client
  const { data: sales } = await supabase
    .from("sales")
    .select("id, thread_ids")
    .eq("client_id", accountId)
    .not("thread_ids", "is", null);

  if (!sales?.length) {
    return NextResponse.json({ message: "Sem vendas com threads de email associadas", count: 0 });
  }

  // Existing contacts to avoid duplicates
  const { data: existingContacts } = await supabase
    .from("crm_contacts")
    .select("email, name")
    .eq("account_id", accountId);

  const existingEmails = new Set((existingContacts ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean));

  // Collect unique contacts from Gmail threads across all sales
  const discovered = new Map<string, { name: string; email: string; saleId: string }>();

  for (const sale of sales) {
    try {
      const url = `${baseUrl}/api/addon/edit-context?emails=true&saleId=${sale.id}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const data = await res.json();
      const emails: Array<{ from: string; threadId: string }> = data.emails ?? [];

      for (const msg of emails) {
        const parsed = parseFrom(msg.from);
        if (!parsed) continue;
        if (isOwnEmail(parsed.email, parsed.name)) continue;
        if (existingEmails.has(parsed.email)) continue;
        if (!discovered.has(parsed.email)) {
          discovered.set(parsed.email, { ...parsed, saleId: sale.id });
        }
      }
    } catch {
      // Skip failed fetches silently
    }
  }

  if (discovered.size === 0) {
    return NextResponse.json({ message: "Nenhum contacto novo encontrado nos emails", count: 0 });
  }

  // Save discovered contacts
  const added: string[] = [];
  let isPrimary = existingContacts?.length === 0;

  for (const c of discovered.values()) {
    await supabase.from("crm_contacts").insert({
      account_id: accountId,
      name: c.name || c.email.split("@")[0],
      email: c.email,
      is_primary: isPrimary,
    });
    added.push(c.name || c.email);
    isPrimary = false;
  }

  return NextResponse.json({ count: added.length, added });
}
