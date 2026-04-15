import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { getDb } from "@/lib/db";

const BASE_URL = "https://api.enablebanking.com";

/** Load the raw PEM — prefer a file path (local dev), fall back to inline env var */
function loadPrivateKeyPem(): string {
  const path = process.env.ENABLEBANKING_PRIVATE_KEY_PATH;
  if (path) return readFileSync(path, "utf8");
  return process.env.ENABLEBANKING_PRIVATE_KEY ?? "";
}

export function getRedirectUrl() {
  return `${process.env.NEXT_PUBLIC_BASE_URL}/api/enablebanking/callback`;
}

// ── JWT ───────────────────────────────────────────────────────────────────────

/** Normalise a PEM key that may have been mangled by env-var storage */
function normalisePem(raw: string): string {
  // 1. Replace literal \n and \r\n (Vercel / dotenv single-line storage)
  let pem = raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // 2. Strip ALL whitespace from the base64 body and re-wrap at 64 chars.
  //    This fixes every variant: no newlines, wrong-length lines, CRLF, etc.
  const m = pem.match(/^(-----BEGIN [^-]+-----)([\s\S]*?)(-----END [^-]+-----)$/);
  if (m) {
    const header = m[1];
    const body   = m[2].replace(/[\s=]/g, ""); // strip whitespace (keep base64 chars)
    const footer = m[3];
    // re-add = padding if stripped
    const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
    const wrapped = padded.match(/.{1,64}/g)!.join("\n");
    pem = `${header}\n${wrapped}\n${footer}`;
  }
  return pem;
}

async function jwt(): Promise<string> {
  const appId = process.env.ENABLEBANKING_APP_ID!;
  const pem = normalisePem(loadPrivateKeyPem());
  // Log first line so we can confirm the PEM type in server logs
  console.log("[EnableBanking] APP_ID:", JSON.stringify(appId), "| PEM header:", pem.split("\n")[0]);
  // createPrivateKey accepts both PKCS#1 (BEGIN RSA PRIVATE KEY) and
  // PKCS#8 (BEGIN PRIVATE KEY) — no need to pre-convert the downloaded key
  const key = createPrivateKey(pem);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: appId })
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
  // Enable Banking requires a full ISO-8601 datetime with timezone (not date-only)
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const data = await api<{ url: string }>("POST", "/auth", {
    aspsp: { name: aspspName, country },
    state: crypto.randomUUID(),
    redirect_url: getRedirectUrl(),
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
    accounts?: { uid: string; account_id?: unknown; account_servicer?: { name?: string } }[];
    access?: { valid_until?: string };
  }>("POST", "/sessions", { code });

  // `uid` is the UUID used in API paths (/accounts/{uid}/transactions)
  // `account_id` is the bank account identifier object (IBAN etc.) — not for API calls
  const accountIds = (data.accounts ?? []).map((a) => a.uid).filter(Boolean);
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
