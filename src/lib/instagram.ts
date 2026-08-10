const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type IgMedia = {
  id: string;
  caption: string | null;
  mediaType: string | null;
  permalink: string | null;
  timestamp: string | null;
};

type GraphMediaRaw = {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
};

export type IgConnectionResult =
  | { status: "ok"; token: string; igBusinessAccountId: string }
  | { status: "not_connected" };

/** Recent media on the connected IG business account (used to resolve a pasted permalink → media id). */
export async function fetchRecentMedia(
  token: string,
  igBusinessAccountId: string,
  limit = 25
): Promise<IgMedia[]> {
  const url =
    `${GRAPH_BASE}/${igBusinessAccountId}/media` +
    `?fields=id,caption,media_type,permalink,timestamp&limit=${limit}&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Instagram media.list failed: HTTP ${res.status} ${body}`);
  }
  const data = (await res.json()) as { data?: GraphMediaRaw[] };
  return (data.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    mediaType: m.media_type ?? null,
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
  }));
}

export type IgInsightMetrics = {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  raw: Record<string, unknown>;
};

// NOTE: metric availability varies by media type (image/video/reel/carousel)
// and Graph API version — a metric this account's media doesn't support
// simply fails silently (per-metric) rather than erroring the whole call,
// so this stays best-effort and tolerant of partial data.
const INSIGHT_METRICS = ["impressions", "reach", "likes", "comments", "saved", "shares"];

export async function fetchMediaInsights(token: string, igMediaId: string): Promise<IgInsightMetrics> {
  const url =
    `${GRAPH_BASE}/${igMediaId}/insights` +
    `?metric=${INSIGHT_METRICS.join(",")}&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const raw: Record<string, unknown> = {};
  if (!res.ok) {
    // A metric request that's entirely unsupported for this media type
    // returns a 400 — treat as "no insights available yet" rather than throw,
    // since the rest of the sync (permalink matching etc) should still work.
    return { impressions: null, reach: null, likes: null, comments: null, saves: null, shares: null, raw };
  }

  const data = (await res.json()) as { data?: { name: string; values?: { value: number }[] }[] };
  const byName = new Map<string, number>();
  for (const entry of data.data ?? []) {
    raw[entry.name] = entry.values;
    const value = entry.values?.[0]?.value;
    if (typeof value === "number") byName.set(entry.name, value);
  }

  return {
    impressions: byName.get("impressions") ?? null,
    reach: byName.get("reach") ?? null,
    likes: byName.get("likes") ?? null,
    comments: byName.get("comments") ?? null,
    saves: byName.get("saved") ?? null,
    shares: byName.get("shares") ?? null,
    raw,
  };
}
