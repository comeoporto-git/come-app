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
  | { status: "no_token" }       // no Google token — need to sign in
  | { status: "no_scope" }       // token exists but contacts scope not granted
  | { status: "api_disabled" }   // People API not enabled in Google Cloud project
  | { status: "error"; message?: string };

type AccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

async function getTokenFromDb(userId: string): Promise<string | null> {
  try {
    const sql = getDb();
    const rows = await sql<AccountRow[]>`
      SELECT access_token, refresh_token, expires_at
      FROM accounts
      WHERE "userId" = ${userId} AND provider = 'google'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row?.access_token) return null;

    // If expired, try to refresh
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (row.expires_at && nowSeconds >= row.expires_at - 60) {
      if (!row.refresh_token) return null;
      return await refreshAndStore(row.refresh_token, userId);
    }
    return row.access_token;
  } catch {
    return null;
  }
}

async function refreshAndStore(refreshToken: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    const newExpiry = Math.floor(Date.now() / 1000) + data.expires_in;
    const sql = getDb();
    await sql`
      UPDATE accounts
      SET access_token = ${data.access_token}, expires_at = ${newExpiry}
      WHERE "userId" = ${userId} AND provider = 'google'
    `;
    return data.access_token;
  } catch {
    return null;
  }
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

async function callPeopleApi(token: string): Promise<GoogleContactsResult> {
  const url =
    "https://people.googleapis.com/v1/people/me/connections" +
    "?personFields=names,emailAddresses,phoneNumbers,organizations,photos" +
    "&pageSize=1000&sortOrder=FIRST_NAME_ASCENDING";

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 401) return { status: "no_token" };
  if (res.status === 403) {
    // Parse the error body to distinguish "scope missing" from "API not enabled"
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = body?.error?.message ?? "";
    if (msg.includes("has not been used") || msg.includes("disabled") || msg.includes("SERVICE_DISABLED")) {
      return { status: "api_disabled" };
    }
    return { status: "no_scope" };
  }
  if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };

  const data = await res.json() as { connections?: unknown[] };
  const contacts = (data.connections ?? [])
    .map(mapPerson)
    .filter((c) => c.displayName.trim().length > 0);

  return { status: "ok", contacts };
}

/**
 * sessionToken: the googleAccessToken stored in the JWT (fresh after re-auth).
 * userId: used as fallback to query the accounts table.
 */
export async function getGoogleContacts(
  sessionToken: string | undefined,
  userId: string,
): Promise<GoogleContactsResult> {
  // 1. Try the JWT token first — it's always fresh after an OAuth flow
  if (sessionToken) {
    try {
      const result = await callPeopleApi(sessionToken);
      if (result.status !== "no_token") return result; // covers ok, no_scope, error
    } catch {
      // fall through to DB fallback
    }
  }

  // 2. Fall back to the accounts table (handles cases where JWT token expired)
  const dbToken = await getTokenFromDb(userId);
  if (!dbToken) return { status: "no_token" };

  try {
    return await callPeopleApi(dbToken);
  } catch {
    return { status: "error" };
  }
}
