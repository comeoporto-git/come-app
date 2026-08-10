import { getDb } from "./db";

export type DriveImage = {
  id: string;
  name: string;
  modifiedTime: string;
  parentFolderName: string | null;
};

export type DriveTokenResult =
  | { status: "ok"; token: string }
  | { status: "no_token" } // no Google token — need to sign in
  | { status: "no_scope" } // token exists but drive.readonly scope not granted
  | { status: "api_disabled" } // Drive API not enabled in Google Cloud project
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
    const data = (await res.json()) as { access_token: string; expires_in: number };
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

async function callDriveApi(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

async function probeToken(token: string): Promise<DriveTokenResult> {
  const res = await callDriveApi(
    "https://www.googleapis.com/drive/v3/about?fields=user",
    token
  );

  if (res.status === 401) return { status: "no_token" };
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = body?.error?.message ?? "";
    if (msg.includes("has not been used") || msg.includes("disabled") || msg.includes("SERVICE_DISABLED")) {
      return { status: "api_disabled" };
    }
    return { status: "no_scope" };
  }
  if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
  return { status: "ok", token };
}

/**
 * sessionToken: the googleAccessToken stored in the JWT (fresh after re-auth).
 * userId: used as fallback to query the accounts table.
 */
export async function getDriveToken(
  sessionToken: string | undefined,
  userId: string
): Promise<DriveTokenResult> {
  if (sessionToken) {
    try {
      const result = await probeToken(sessionToken);
      if (result.status !== "no_token") return result; // covers ok, no_scope, api_disabled, error
    } catch {
      // fall through to DB fallback
    }
  }

  const dbToken = await getTokenFromDb(userId);
  if (!dbToken) return { status: "no_token" };

  try {
    return await probeToken(dbToken);
  } catch {
    return { status: "error" };
  }
}

const MAX_TRAVERSAL_DEPTH = 5;

/**
 * Recursively walks rootFolderId and every subfolder beneath it, collecting
 * image files. When modifiedAfter is set, only images modified after that
 * timestamp are returned — folders themselves are always traversed (a new
 * image could exist in an otherwise-unmodified subfolder listing) but this
 * keeps re-syncs cheap after the first full crawl.
 */
export async function listDriveImagesRecursive(
  token: string,
  rootFolderId: string,
  modifiedAfter?: string
): Promise<DriveImage[]> {
  const images: DriveImage[] = [];
  let queue: { id: string; name: string | null }[] = [{ id: rootFolderId, name: null }];
  let depth = 0;

  while (queue.length > 0 && depth <= MAX_TRAVERSAL_DEPTH) {
    const nextQueue: { id: string; name: string | null }[] = [];

    for (const folder of queue) {
      const subfolders = await listChildren(token, folder.id, "mimeType = 'application/vnd.google-apps.folder'");
      for (const sub of subfolders) {
        nextQueue.push({ id: sub.id, name: sub.name });
      }

      const modifiedClause = modifiedAfter ? ` and modifiedTime > '${modifiedAfter}'` : "";
      const files = await listChildren(
        token,
        folder.id,
        `mimeType contains 'image/'${modifiedClause}`
      );
      for (const file of files) {
        images.push({
          id: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime ?? new Date(0).toISOString(),
          parentFolderName: folder.name,
        });
      }
    }

    queue = nextQueue;
    depth++;
  }

  return images;
}

type DriveFileRaw = { id: string; name: string; modifiedTime?: string };

async function listChildren(token: string, folderId: string, extraQuery: string): Promise<DriveFileRaw[]> {
  const results: DriveFileRaw[] = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and (${extraQuery})`);
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=nextPageToken,files(id,name,modifiedTime)` +
      `&pageSize=1000` +
      (pageToken ? `&pageToken=${pageToken}` : "");

    const res = await callDriveApi(url, token);
    if (!res.ok) throw new Error(`Drive files.list failed: HTTP ${res.status}`);
    const data = (await res.json()) as { files?: DriveFileRaw[]; nextPageToken?: string };
    results.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

export async function downloadDriveFile(
  token: string,
  fileId: string
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await callDriveApi(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, token);
  if (!res.ok) throw new Error(`Drive file download failed: HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}
