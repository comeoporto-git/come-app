import { SignJWT, importPKCS8 } from "jose";
import { getDb } from "@/lib/db";

const APP_ID        = process.env.ENABLEBANKING_APP_ID!;
const PRIVATE_KEY   = process.env.ENABLEBANKING_PRIVATE_KEY!;
const BASE_URL      = "https://api.enablebanking.com";

export const EB_REDIRECT_URL =
  `${process.env.NEXT_PUBLIC_BASE_URL}/api/enablebanking/callback`;

// ── JWT ───────────────────────────────────────────────────────────────────────

async function jwt(): Promise<string> {
  const key = await importPKCS8(PRIVATE_KEY, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: APP_ID })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

// ── Raw API calls ─────────────────────────────────────────────────────────────

async function api<T = unknown>(
  method: string,
  path: string,
  body?: object,
): Promise<T> {
  const token = await jwt();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null as T;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`EnableBanking ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data as T;
}

// ── Auth flow ─────────────────────────────────────────────────────────────────

/** Step 1 – Create an auth URL to redirect the user to their bank */
export async function createAuthUrl(
  aspspName: string,
  country = "PT",
): Promise<string> {
  const validUntil = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const data = await api<{ url: string }>("POST", "/auth", {
    aspsp: { name: aspspName, country },
    state: crypto.randomUUID(),
    redirect_url: EB_REDIRECT_URL,
    access: { valid_until: validUntil },
    psu_type: "business",
  });
  return data.url;
}

/** Step 2 – Exchange the code from the callback for a session + account IDs */
export async function exchangeCode(code: string): Promise<{
  sessionId: string;
  accountIds: string[];
  institutionName: string;
  validUntil: string | null;
}> {
  const data = await api<{
    session_id: string;
    accounts?: { account_id: string; account_servicer?: { name?: string } }[];
    access?: { valid_until?: string };
  }>("POST", "/sessions", { code });

  const accountIds = (data.accounts ?? []).map((a) => a.account_id);
  const institutionName =
    data.accounts?.[0]?.account_servicer?.name ?? "Crédito Agrícola";
  const validUntil = data.access?.valid_until ?? null;
  return { sessionId: data.session_id, accountIds, institutionName, validUntil };
}

// ── Transactions ──────────────────────────────────────────────────────────────

export type EBTransaction = {
  transaction_id: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  transaction_date: string;
  booking_date: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string;
  status: string;
};

/** Fetch booked transactions for an account within a date range */
export async function getAccountTransactions(
  accountId: string,
  dateFrom: string, // YYYY-MM-DD
  dateTo: string,   // YYYY-MM-DD
): Promise<EBTransaction[]> {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    transaction_status: "BOOK",
  });
  const all: EBTransaction[] = [];
  let path: string | null =
    `/accounts/${encodeURIComponent(accountId)}/transactions?${params}`;

  type TxPage = { transactions?: EBTransaction[]; continuation_key?: string };
  while (path) {
    // eslint-disable-next-line no-await-in-loop
    const page: TxPage = await api<TxPage>("GET", path);
    all.push(...(page.transactions ?? []));
    path = page.continuation_key
      ? `/accounts/${encodeURIComponent(accountId)}/transactions?continuation_key=${page.continuation_key}`
      : null;
  }
  return all;
}

// ── Session revocation ────────────────────────────────────────────────────────

export async function revokeSession(sessionId: string): Promise<void> {
  await api("DELETE", `/sessions/${sessionId}`);
}

// ── DB ────────────────────────────────────────────────────────────────────────

export type EBSession = {
  id: number;
  session_id: string;
  institution_name: string;
  account_ids: string; // JSON-encoded string[]
  valid_until: string | null;
  last_fetched_at: string | null;
};

export type EBSessionParsed = Omit<EBSession, "account_ids"> & {
  accountIds: string[];
};

function parse(row: EBSession): EBSessionParsed {
  return { ...row, accountIds: JSON.parse(row.account_ids ?? "[]") };
}

export async function saveEBSession(
  sessionId: string,
  institutionName: string,
  accountIds: string[],
  validUntil: string | null,
): Promise<void> {
  const sql = getDb();
  const ids = JSON.stringify(accountIds);
  await sql`
    INSERT INTO enablebanking_sessions
      (session_id, institution_name, account_ids, valid_until)
    VALUES (${sessionId}, ${institutionName}, ${ids}, ${validUntil})
    ON CONFLICT (session_id) DO UPDATE
      SET institution_name = ${institutionName},
          account_ids      = ${ids},
          valid_until      = ${validUntil}
  `;
}

export async function getEBSessions(): Promise<EBSessionParsed[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM enablebanking_sessions ORDER BY created_at ASC
  `) as EBSession[];
  return rows.map(parse);
}

export async function updateEBLastFetched(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE enablebanking_sessions
    SET last_fetched_at = NOW()
    WHERE session_id = ${sessionId}
  `;
}

export async function removeEBSession(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM enablebanking_sessions WHERE session_id = ${sessionId}`;
}
