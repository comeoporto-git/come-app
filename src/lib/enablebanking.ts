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
  transaction_id: string | null; // null seen in practice for some credit entries
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  transaction_date: string | null; // some ASPSPs omit this
  booking_date: string | null;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string | string[]; // API may return array or string
  status: string;
};

/** Safely extract a plain string from remittance_information (string | string[]) */
export function remittanceText(txn: EBTransaction): string {
  if (!txn.remittance_information) return "";
  if (Array.isArray(txn.remittance_information)) {
    return txn.remittance_information.join(" ").trim();
  }
  return txn.remittance_information;
}

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

// ── Stored transactions ───────────────────────────────────────────────────────

export type StoredTransaction = {
  id: number;
  transaction_id: string;
  account_uid: string;
  institution_name: string;
  amount: number;
  currency: string;
  credit_debit: "CRDT" | "DBIT";
  transaction_date: string;
  booking_date: string | null;
  merchant_name: string | null;
  remittance_info: string | null;
  created_at: string;
};

/** Upsert a batch of raw transactions fetched from Enable Banking */
/** Generate a stable synthetic ID when the ASPSP doesn't provide one */
export function syntheticId(t: EBTransaction, accountUid: string): string {
  const parts = [
    accountUid,
    t.transaction_date ?? t.booking_date ?? "",
    t.booking_date ?? "",
    t.transaction_amount.amount,
    t.transaction_amount.currency,
    t.credit_debit_indicator,
    t.creditor?.name ?? "",
    remittanceText(t),
  ];
  // Simple stable hash — good enough for dedup within an account
  let h = 0;
  for (const s of parts.join("|")) {
    h = ((h << 5) - h + s.charCodeAt(0)) | 0;
  }
  return `synth-${accountUid.slice(0, 8)}-${(h >>> 0).toString(16)}`;
}

export async function upsertBankTransactions(
  txns: EBTransaction[],
  accountUid: string,
  institutionName: string,
): Promise<void> {
  const sql = getDb();
  for (const t of txns) {
    const txDate = t.transaction_date ?? t.booking_date;
    if (!txDate) continue; // skip if we have no date at all
    const txId = t.transaction_id ?? syntheticId(t, accountUid);
    const remit = remittanceText(t);
    const merchantName =
      t.credit_debit_indicator === "DBIT"
        ? (t.creditor?.name ?? (remit || null))
        : (t.debtor?.name ?? (remit || null));

    await sql`
      INSERT INTO bank_transactions
        (transaction_id, account_uid, institution_name, amount, currency,
         credit_debit, transaction_date, booking_date, merchant_name,
         remittance_info, raw)
      VALUES (
        ${txId},
        ${accountUid},
        ${institutionName},
        ${parseFloat(t.transaction_amount.amount)},
        ${t.transaction_amount.currency},
        ${t.credit_debit_indicator},
        ${txDate},
        ${t.booking_date ?? t.transaction_date ?? null},
        ${merchantName},
        ${remit || null},
        ${JSON.stringify(t)}
      )
      ON CONFLICT (transaction_id) DO NOTHING
    `;
  }
}

// ── Sync log ──────────────────────────────────────────────────────────────────

export type SyncLog = {
  id: number;
  ran_at: string;
  trigger: string;
  fetched: number;
  matched: number;
  unmatched: number;
  flagged: number;
  errors: string[];
  fatal_error: string | null;
};

/** Write a sync result to the persistent log table (creates table if needed) */
export async function writeSyncLog(entry: {
  trigger: string;
  fetched: number;
  matched: number;
  unmatched: number;
  flagged: number;
  errors: string[];
  fatalError?: string;
}): Promise<void> {
  const sql = getDb();
  // Create table if it doesn't exist yet (idempotent)
  await sql`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id           SERIAL PRIMARY KEY,
      ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trigger      TEXT NOT NULL,
      fetched      INT  NOT NULL DEFAULT 0,
      matched      INT  NOT NULL DEFAULT 0,
      unmatched    INT  NOT NULL DEFAULT 0,
      flagged      INT  NOT NULL DEFAULT 0,
      errors       JSONB NOT NULL DEFAULT '[]',
      fatal_error  TEXT
    )
  `;
  await sql`
    INSERT INTO sync_logs (trigger, fetched, matched, unmatched, flagged, errors, fatal_error)
    VALUES (
      ${entry.trigger},
      ${entry.fetched},
      ${entry.matched},
      ${entry.unmatched},
      ${entry.flagged},
      ${JSON.stringify(entry.errors)},
      ${entry.fatalError ?? null}
    )
  `;
}

/** Read the most recent sync logs */
export async function getRecentSyncLogs(limit = 5): Promise<SyncLog[]> {
  const sql = getDb();
  try {
    const rows = await sql`
      SELECT * FROM sync_logs ORDER BY ran_at DESC LIMIT ${limit}
    `;
    return rows as SyncLog[];
  } catch {
    return []; // table may not exist yet
  }
}

/** Read stored transactions (newest first, up to limit) */
export async function getStoredTransactions(
  days = 30,
  limit = 500,
): Promise<StoredTransaction[]> {
  const sql = getDb();
  const dateFrom = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = await sql`
    SELECT * FROM bank_transactions
    WHERE transaction_date >= ${dateFrom}
    ORDER BY transaction_date DESC, id DESC
    LIMIT ${limit}
  `;
  return rows as StoredTransaction[];
}
