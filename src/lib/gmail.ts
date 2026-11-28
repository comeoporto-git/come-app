/**
 * Thin Gmail REST client (users.threads / users.messages) used by the inbox agent.
 * Uses an OAuth access token from lib/google-token.ts.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailAttachment = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  fromName: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  /** RFC 822 Message-ID header, used for In-Reply-To. */
  messageIdHeader: string;
  references: string;
  labelIds: string[];
  snippet: string;
  /** Plain text, with quoted previous messages cut off. */
  body: string;
  attachments: GmailAttachment[];
};

export type GmailThread = { id: string; messages: GmailMessage[] };

export class GmailError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GmailError(res.status, `Gmail ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * The Gmail add-on stores thread ids as "thread-f:<decimal>"; the REST API uses
 * the same number in hex. Accepts either form.
 */
export function toApiThreadId(id: string): string {
  const m = id.trim().match(/^thread-[a-z]:(\d+)$/);
  if (m) return BigInt(m[1]).toString(16);
  return id.trim();
}

export async function getMyEmail(token: string): Promise<string> {
  const p = await gmail<{ emailAddress: string }>(token, "/profile");
  return p.emailAddress.toLowerCase();
}

export async function listThreadIds(token: string, q: string, max = 40): Promise<string[]> {
  const data = await gmail<{ threads?: { id: string }[] }>(
    token,
    `/threads?maxResults=${max}&q=${encodeURIComponent(q)}`,
  );
  return (data.threads ?? []).map((t) => t.id);
}

/** Latest message id + count without downloading bodies. */
export async function getThreadMeta(token: string, id: string): Promise<{ lastMessageId: string; count: number; historyId: string }> {
  const data = await gmail<{ historyId: string; messages: { id: string }[] }>(
    token,
    `/threads/${id}?format=minimal`,
  );
  const msgs = data.messages ?? [];
  return { lastMessageId: msgs[msgs.length - 1]?.id ?? "", count: msgs.length, historyId: data.historyId };
}

type Part = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
};

type RawMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: Part;
};

function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function header(p: Part | undefined, name: string): string {
  return p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<td[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cut the quoted history ("On … wrote:", "De: …", "-----Original Message-----"). */
export function stripQuoted(text: string): string {
  const markers = [
    /\n\s*On .{5,200}wrote:\s*\n/i,
    /\n\s*No dia .{5,200}escreveu:\s*\n/i,
    /\n\s*Em .{5,200}escreveu:\s*\n/i,
    /\n\s*Le .{5,200}a écrit\s*:\s*\n/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*-{2,}\s*Mensagem original\s*-{2,}/i,
    /\n\s*From:\s.+\n\s*Sent:\s/i,
    /\n\s*De:\s.+\n\s*(Enviado|Enviada|Data):\s/i,
    /\n>.*\n>/,
  ];
  let cut = text.length;
  for (const m of markers) {
    const r = text.match(m);
    if (r?.index !== undefined && r.index > 20) cut = Math.min(cut, r.index);
  }
  return text.slice(0, cut).trim();
}

function walk(p: Part | undefined, out: { plain: string[]; html: string[]; atts: Omit<GmailAttachment, "messageId">[] }) {
  if (!p) return;
  const mime = (p.mimeType ?? "").toLowerCase();
  if (p.filename && p.body?.attachmentId) {
    out.atts.push({ attachmentId: p.body.attachmentId, filename: p.filename, mimeType: mime, size: p.body.size ?? 0 });
  } else if (mime === "text/plain" && p.body?.data) {
    out.plain.push(b64urlDecode(p.body.data));
  } else if (mime === "text/html" && p.body?.data) {
    out.html.push(b64urlDecode(p.body.data));
  }
  for (const c of p.parts ?? []) walk(c, out);
}

export function parseAddress(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  return { name: v.trim(), email: v.trim().toLowerCase() };
}

function mapMessage(m: RawMessage): GmailMessage {
  const out = { plain: [] as string[], html: [] as string[], atts: [] as Omit<GmailAttachment, "messageId">[] };
  walk(m.payload, out);
  const raw = out.plain.length ? out.plain.join("\n") : htmlToText(out.html.join("\n"));
  const from = header(m.payload, "From");
  const addr = parseAddress(from);
  return {
    id: m.id,
    threadId: m.threadId,
    from,
    fromEmail: addr.email,
    fromName: addr.name,
    to: header(m.payload, "To"),
    cc: header(m.payload, "Cc"),
    subject: header(m.payload, "Subject"),
    date: header(m.payload, "Date"),
    messageIdHeader: header(m.payload, "Message-ID") || header(m.payload, "Message-Id"),
    references: header(m.payload, "References"),
    labelIds: m.labelIds ?? [],
    snippet: m.snippet ?? "",
    body: stripQuoted(raw.replace(/\r\n/g, "\n")).slice(0, 8000),
    attachments: out.atts.map((a) => ({ ...a, messageId: m.id })),
  };
}

export async function getThread(token: string, id: string): Promise<GmailThread> {
  const data = await gmail<{ id: string; messages: RawMessage[] }>(token, `/threads/${id}?format=full`);
  return { id: data.id, messages: (data.messages ?? []).map(mapMessage) };
}

/** Attachment bytes as standard base64. */
export async function getAttachment(token: string, messageId: string, attachmentId: string): Promise<string> {
  const data = await gmail<{ data: string }>(token, `/messages/${messageId}/attachments/${attachmentId}`);
  return data.data.replace(/-/g, "+").replace(/_/g, "/");
}

function encodeHeader(v: string): string {
  // RFC 2047 for anything outside ASCII (accents in Portuguese subjects/names).
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trim();
}

export type OutgoingReply = {
  threadId: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
};

/** Sends a reply in the same Gmail thread. Only ever called after a person accepts it. */
export async function sendReply(token: string, r: OutgoingReply): Promise<{ id: string; threadId: string }> {
  const boundary = `come_${crypto.randomUUID().replace(/-/g, "")}`;
  const subject = /^re:/i.test(r.subject.trim()) ? r.subject.trim() : `Re: ${r.subject.trim()}`;
  const text = htmlToText(r.html);
  const lines = [
    `To: ${r.to}`,
    ...(r.cc ? [`Cc: ${r.cc}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    ...(r.inReplyTo ? [`In-Reply-To: ${r.inReplyTo}`] : []),
    ...(r.references || r.inReplyTo ? [`References: ${[r.references, r.inReplyTo].filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(text, "utf8").toString("base64")),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(r.html, "utf8").toString("base64")),
    `--${boundary}--`,
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
  return gmail<{ id: string; threadId: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, threadId: r.threadId }),
  });
}

/** Mark the thread read once it has been handled in the app. */
export async function markThreadRead(token: string, threadId: string): Promise<void> {
  await gmail(token, `/threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

export function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}
