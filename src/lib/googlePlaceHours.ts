// Best-effort extraction of a business's weekly opening hours from a Google
// Maps / Business share link. This is NOT the Google Places API — there is
// no API key for that in this project — it fetches the public page and
// looks for structured data Google embeds for search-engine indexing.
//
// This is inherently fragile: Google can change page markup at any time,
// and results are not guaranteed. Always let the admin review/edit the
// fetched hours before saving.

export type ParsedHour = { dayOfWeek: number; openTime: string | null; closeTime: string | null; closed: boolean };

const SCHEMA_DAY_TO_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

export async function fetchRestaurantHoursFromUrl(url: string): Promise<{ hours: ParsedHour[]; resolvedUrl: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL inválido");
  }
  if (!/(^|\.)google\.[a-z.]+$/.test(parsed.hostname) && parsed.hostname !== "share.google" && parsed.hostname !== "goo.gl" && parsed.hostname !== "maps.app.goo.gl") {
    throw new Error("Só são aceites links do Google Maps/Business");
  }

  const res = await fetch(url, { redirect: "follow", headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`O Google respondeu com o estado ${res.status}`);
  const html = await res.text();
  const resolvedUrl = res.url;

  const fromJsonLd = parseJsonLdHours(html);
  if (fromJsonLd && fromJsonLd.length) return { hours: fromJsonLd, resolvedUrl };

  const fromEmbedded = parseEmbeddedHours(html);
  if (fromEmbedded && fromEmbedded.length) return { hours: fromEmbedded, resolvedUrl };

  throw new Error("Não foi possível encontrar o horário nesta página — preenche manualmente");
}

// ── Strategy 1: schema.org JSON-LD (OpeningHoursSpecification) ────────────────

function parseJsonLdHours(html: string): ParsedHour[] | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const specs = findOpeningHoursSpecs(json);
    if (specs.length) return specsToHours(specs);
  }
  return null;
}

type OpeningSpec = { dayOfWeek: string | string[]; opens?: string; closes?: string };

function findOpeningHoursSpecs(node: unknown, depth = 0): OpeningSpec[] {
  if (depth > 6 || node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findOpeningHoursSpecs(n, depth + 1));

  const obj = node as Record<string, unknown>;
  if (obj.openingHoursSpecification) {
    const spec = obj.openingHoursSpecification;
    const list = Array.isArray(spec) ? spec : [spec];
    return list.filter((s): s is OpeningSpec => !!s && typeof s === "object" && "dayOfWeek" in s);
  }
  return Object.values(obj).flatMap((v) => findOpeningHoursSpecs(v, depth + 1));
}

function specsToHours(specs: OpeningSpec[]): ParsedHour[] {
  const byDay = new Map<number, ParsedHour>();
  for (const spec of specs) {
    const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
    for (const raw of days) {
      const name = String(raw).split("/").pop()?.toLowerCase() ?? "";
      const dayOfWeek = SCHEMA_DAY_TO_INDEX[name];
      if (dayOfWeek === undefined) continue;
      const openTime = spec.opens ? normalizeTime(spec.opens) : null;
      const closeTime = spec.closes ? normalizeTime(spec.closes) : null;
      byDay.set(dayOfWeek, { dayOfWeek, openTime, closeTime, closed: !openTime || !closeTime });
    }
  }
  return fillMissingDaysClosed(byDay);
}

function normalizeTime(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// ── Strategy 2: the day-name + time-range text Google embeds for indexing ─────

const DAY_NAME_PATTERN = "(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)";

function parseEmbeddedHours(html: string): ParsedHour[] | null {
  // Normalize the narrow no-break space / en dash Google uses in hour ranges
  // (both literal unicode and escaped \uXXXX forms can appear in inline JS).
  const normalized = html
    .replace(/\\u202f/gi, " ")
    .replace(/ /g, " ")
    .replace(/\\u2013/gi, "-")
    .replace(/[–‐‒]/g, "-")
    .replace(/\\u2009/gi, " ");

  const re = new RegExp(`"${DAY_NAME_PATTERN}"\\s*,\\s*\\[\\s*"([^"]*)"`, "g");
  const byDay = new Map<number, ParsedHour>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const dayOfWeek = SCHEMA_DAY_TO_INDEX[match[1].toLowerCase()];
    const range = parseTimeRangeText(match[2]);
    byDay.set(dayOfWeek, { dayOfWeek, ...range });
  }
  return byDay.size ? fillMissingDaysClosed(byDay) : null;
}

function parseTimeRangeText(text: string): { openTime: string | null; closeTime: string | null; closed: boolean } {
  const t = text.trim().toLowerCase();
  if (!t || t.includes("closed") || t.includes("fechado")) return { openTime: null, closeTime: null, closed: true };
  if (t.includes("24 hours") || t.includes("open 24")) return { openTime: "00:00", closeTime: "23:59", closed: false };

  const parts = t.split("-").map((p) => p.trim());
  if (parts.length !== 2) return { openTime: null, closeTime: null, closed: true };
  const openTime = parseClockTime(parts[0]);
  const closeTime = parseClockTime(parts[1]);
  if (!openTime || !closeTime) return { openTime: null, closeTime: null, closed: true };
  return { openTime, closeTime, closed: false };
}

function parseClockTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ?? "00";
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function fillMissingDaysClosed(byDay: Map<number, ParsedHour>): ParsedHour[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => byDay.get(dayOfWeek) ?? { dayOfWeek, openTime: null, closeTime: null, closed: true });
}
