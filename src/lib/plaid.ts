import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { getDb } from "@/lib/db";

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments ?? "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
    },
  },
});

export const plaidClient = new PlaidApi(config);

// ── Link Token ────────────────────────────────────────────────────────────────

export async function createLinkToken(userId: string): Promise<string> {
  const webhookUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/plaid/webhook`
    : undefined;

  const res = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "COME Porto Food Tours",
    products: [Products.Transactions],
    country_codes: [CountryCode.Pt],
    language: "pt",
    ...(webhookUrl ? { webhook: webhookUrl } : {}),
  });
  return res.data.link_token;
}

// ── Exchange public token → access token ─────────────────────────────────────

export async function exchangePublicToken(
  publicToken: string,
  institutionName: string
): Promise<void> {
  const res = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = res.data;

  const sql = getDb();
  await sql`
    INSERT INTO plaid_items (access_token, item_id, institution_name)
    VALUES (${access_token}, ${item_id}, ${institutionName})
    ON CONFLICT (item_id) DO UPDATE SET access_token = ${access_token}
  `;
}

// ── Fetch stored items ────────────────────────────────────────────────────────

export type PlaidItem = {
  id: string;
  access_token: string;
  item_id: string;
  institution_name: string;
  cursor: string | null;
};

export async function getPlaidItems(): Promise<PlaidItem[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM plaid_items ORDER BY created_at ASC`;
  return rows as PlaidItem[];
}

export async function updateCursor(itemId: string, cursor: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE plaid_items SET cursor = ${cursor} WHERE item_id = ${itemId}`;
}

export async function removePlaidItem(itemId: string): Promise<void> {
  const sql = getDb();
  const rows = await sql`SELECT access_token FROM plaid_items WHERE item_id = ${itemId}`;
  if (!rows.length) return;
  try {
    await plaidClient.itemRemove({ access_token: rows[0].access_token as string });
  } catch {
    // proceed with local deletion even if Plaid call fails (e.g. token already invalid)
  }
  await sql`DELETE FROM plaid_items WHERE item_id = ${itemId}`;
}
