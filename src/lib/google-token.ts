import { getDb } from "./db";

/**
 * Google OAuth access tokens for server-side Gmail / Calendar calls.
 *
 * The login flow only asks for openid/email/profile. The inbox asks for Gmail
 * and Calendar on top of that (incremental consent, see /admin/inbox), and the
 * jwt callback in lib/auth.ts keeps accounts.access_token / refresh_token /
 * scope up to date, so the cron job can use the same account later without a
 * browser session.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const INBOX_SCOPES = ["openid", "email", "profile", GMAIL_SCOPE, CALENDAR_SCOPE].join(" ");

type AccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | string | null;
  scope: string | null;
};

export type GoogleTokenResult =
  | { status: "ok"; token: string; scopes: string[] }
  | { status: "no_token" }
  | { status: "no_scope"; scopes: string[] }
  | { status: "error"; message: string };

async function refresh(refreshToken: string, userId: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  await getDb()`
    UPDATE accounts SET access_token = ${data.access_token}, expires_at = ${expiresAt}
    WHERE "userId" = ${userId} AND provider = 'google'
  `;
  return data.access_token;
}

/** A fresh access token for the user's Google account, checked for the scopes asked. */
export async function getGoogleToken(userId: string, required: string[] = [GMAIL_SCOPE]): Promise<GoogleTokenResult> {
  if (!userId) return { status: "no_token" };
  try {
    const rows = await getDb()<AccountRow[]>`
      SELECT access_token, refresh_token, expires_at, scope
      FROM accounts WHERE "userId" = ${userId} AND provider = 'google' LIMIT 1
    `;
    const row = rows[0];
    if (!row?.access_token) return { status: "no_token" };
    const scopes = (row.scope ?? "").split(/\s+/).filter(Boolean);
    if (required.some((s) => !scopes.includes(s))) return { status: "no_scope", scopes };

    const expiresAt = row.expires_at === null ? null : Number(row.expires_at);
    if (expiresAt && Math.floor(Date.now() / 1000) >= expiresAt - 60) {
      if (!row.refresh_token) return { status: "no_token" };
      const token = await refresh(row.refresh_token, userId);
      return token ? { status: "ok", token, scopes } : { status: "no_token" };
    }
    return { status: "ok", token: row.access_token, scopes };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** The Google account the inbox runs on (set the first time an admin connects Gmail). */
export async function getInboxOwnerUserId(): Promise<string | null> {
  const { supabase } = await import("./notion");
  const { data } = await supabase.from("inbox_settings").select("owner_user_id").eq("id", 1).maybeSingle();
  return (data?.owner_user_id as string | null) ?? null;
}
