import { quote, tierLabel, eur, childrenSummary, type Quote, type Children } from "@/lib/pricing";
import { getPricedServices, getTransportOptions, type PricedService } from "@/lib/pricingData";

/**
 * Proposed-price tables for client emails. Prices always come from the app's
 * price list (the same quote() used by faturação), never from the AI.
 */

export type PriceRequest = {
  serviceId: string;
  guests: number;
  date?: string | null;
  children?: Partial<Children>;
  transportVehicle?: string | null;
};

export type PricedLine = {
  serviceId: string;
  serviceName: string;
  date: string | null;
  quote: Quote;
};

export async function priceLines(reqs: PriceRequest[]): Promise<PricedLine[]> {
  if (!reqs.length) return [];
  const [services, transport] = await Promise.all([getPricedServices(), getTransportOptions()]);
  const byId = new Map<string, PricedService>(services.map((s) => [s.id, s]));
  const out: PricedLine[] = [];
  for (const r of reqs) {
    const s = byId.get(r.serviceId);
    if (!s || !r.guests) continue;
    out.push({
      serviceId: s.id,
      serviceName: s.name,
      date: r.date ?? null,
      quote: quote({
        tiers: s.tiers,
        date: r.date ?? null,
        guests: r.guests,
        children: r.children,
        transportVehicle: r.transportVehicle ?? null,
        transportHours: s.transportHours,
        transportOptions: transport,
      }),
    });
  }
  return out;
}

const L = {
  pt: { service: "Serviço", date: "Data", people: "Pessoas", perPax: "Preço por pessoa", transport: "Transporte", net: "Total s/ IVA", vat: "IVA (23%)", total: "Total c/ IVA", children: "crianças", min: "mínimo" },
  en: { service: "Service", date: "Date", people: "Guests", perPax: "Price per person", transport: "Transport", net: "Total excl. VAT", vat: "VAT (23%)", total: "Total incl. VAT", children: "children", min: "minimum" },
};

function fmtDate(d: string | null, lang: "pt" | "en"): string {
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "pt" ? "pt-PT" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const TH = 'style="text-align:left;padding:8px 10px;border-bottom:2px solid #32373c;font-size:13px;color:#32373c"';
const TD = 'style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;color:#32373c"';
const TDR = 'style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;color:#32373c;text-align:right;white-space:nowrap"';
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Email-safe HTML table (inline styles) with one row per priced option. */
export function priceTableHtml(lines: PricedLine[], lang: "pt" | "en" = "pt"): string {
  if (!lines.length) return "";
  const t = L[lang];
  const showTransport = lines.some((l) => l.quote.transportTotal > 0);
  const rows = lines.map((l) => {
    const q = l.quote;
    const kids = childrenSummary(q.children);
    const people = `${q.guests}${kids ? ` (${kids.replace(/anos/g, lang === "pt" ? "anos" : "yrs")})` : ""}${q.minimumTopUp > 0 ? ` — ${t.min} ${q.chargedPax}` : ""}`;
    return `<tr>
<td ${TD}>${esc(l.serviceName)}</td>
<td ${TD}>${fmtDate(l.date, lang)}</td>
<td ${TD}>${esc(people)}</td>
<td ${TDR}>${eur(q.pricePerPax)}</td>
${showTransport ? `<td ${TDR}>${q.transportTotal ? `${esc(q.transportVehicle ?? "")} ${eur(q.transportTotal)}` : "—"}</td>` : ""}
<td ${TDR}>${eur(q.totalExclVat)}</td>
<td ${TDR}>${eur(q.vat)}</td>
<td ${TDR}><strong>${eur(q.totalInclVat)}</strong></td>
</tr>`;
  });
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-family:Arial,Helvetica,sans-serif">
<thead><tr>
<th ${TH}>${t.service}</th><th ${TH}>${t.date}</th><th ${TH}>${t.people}</th><th ${TH}>${t.perPax}</th>${showTransport ? `<th ${TH}>${t.transport}</th>` : ""}<th ${TH}>${t.net}</th><th ${TH}>${t.vat}</th><th ${TH}>${t.total}</th>
</tr></thead>
<tbody>
${rows.join("\n")}
</tbody></table>`;
}

/** Short text version for prompts and the AI chat. */
export function priceLinesText(lines: PricedLine[]): string {
  return lines
    .map((l) => {
      const q = l.quote;
      return `${l.serviceName} | ${l.date ?? "sem data"} | ${q.guests} pax (escalão ${q.tier ? tierLabel(q.tier) : "?"}, ano ${q.year ?? "?"}) | ${eur(q.pricePerPax)}/pax | s/IVA ${eur(q.totalExclVat)} | c/IVA ${eur(q.totalInclVat)}`;
    })
    .join("\n");
}
