import { getDb } from "./db";

export type GoogleContact = {
  resourceName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  photoUrl: string | null;
};

export type GoogleContactsResult =
  | { status: "ok"; contacts: GoogleContact[] }
  | { status: "no_token" }   // user signed in via email, no Google token
  | { status: "no_scope" }   // token exists but contacts scope not granted yet
  | { status: "error" };

type AccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

async function loadToken(userId: string): Promise<AccountRow | null> {
  const sql = getDb();
  const rows = await sql<AccountRow[]>`
    SELECT access_token, refresh_token, expires_at
    FROM accounts
    WHERE "userId" = ${userId} AND provider = 'google'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function refreshToken(row: AccountRow, userId: string): Promise<string | null> {
  if (!row.refresh_token) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    const newToken = data.access_token;
    const newExpiry = Math.floor(Date.now() / 1000) + data.expires_in;
    const sql = getDb();
    await sql`
      UPDATE accounts
      SET access_token = ${newToken}, expires_at = ${newExpiry}
      WHERE "userId" = ${userId} AND provider = 'google'
    `;
    return newToken;
  } catch {
    return null;
  }
}

async function getValidToken(userId: string): Promise<string | null> {
  const row = await loadToken(userId);
  if (!row?.access_token) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const isExpired = row.expires_at != null && nowSeconds >= row.expires_at - 60;

  if (isExpired) return await refreshToken(row, userId);
  return row.access_token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPerson(person: any): GoogleContact {
  const names: { displayName: string }[] = person.names ?? [];
  const emails: { value: string }[] = person.emailAddresses ?? [];
  const phones: { value: string }[] = person.phoneNumbers ?? [];
  const orgs: { name?: string; title?: string }[] = person.organizations ?? [];
  const photos: { url: string; default: boolean }[] = person.photos ?? [];
  return {
    resourceName: person.resourceName ?? "",
    displayName: names[0]?.displayName ?? "",
    email: emails[0]?.value ?? null,
    phone: phones[0]?.value ?? null,
    company: orgs[0]?.name ?? null,
    jobTitle: orgs[0]?.title ?? null,
    photoUrl: photos.find((p) => !p.default)?.url ?? null,
  };
}

export async function getGoogleContacts(userId: string): Promise<GoogleContactsResult> {
  const token = await getValidToken(userId);
  if (!token) return { status: "no_token" };

  const url =
    "https://people.googleapis.com/v1/people/me/connections" +
    "?personFields=names,emailAddresses,phoneNumbers,organizations,photos" +
    "&pageSize=1000&sortOrder=FIRST_NAME_ASCENDING";

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (res.status === 401) return { status: "no_token" };
    if (res.status === 403) return { status: "no_scope" };
    if (!res.ok) return { status: "error" };

    const data = await res.json() as { connections?: unknown[] };
    const contacts = (data.connections ?? [])
      .map(mapPerson)
      .filter((c) => c.displayName.trim().length > 0);

    return { status: "ok", contacts };
  } catch {
    return { status: "error" };
  }
}
