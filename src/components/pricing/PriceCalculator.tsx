"use client";

import { useMemo, useState } from "react";
import {
  VAT_RATE,
  eur,
  quote,
  tierLabel,
  tiersForYear,
  yearsOf,
  type PriceTier,
  type TransportOption,
} from "@/lib/pricing";

export type CalculatorService = {
  id: string;
  name: string;
  type: string;
  transportHours: number | null;
  tiers: PriceTier[];
};

const fieldCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] bg-white focus:outline-none focus:border-[#667470] transition-colors";

export function PriceCalculator({ services, transport }: { services: CalculatorService[]; transport: TransportOption[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId) ?? null;
  const years = useMemo(() => (service ? yearsOf(service.tiers) : []), [service]);
  const thisYear = new Date().getFullYear();
  const defaultYear = (ys: number[]) => (ys.includes(thisYear + 1) ? thisYear + 1 : ys[0] ?? thisYear);
  const [year, setYear] = useState<number>(defaultYear(years));
  const [guests, setGuests] = useState("4");
  const [vehicle, setVehicle] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");

  const vehicles = [...new Set(transport.map((t) => t.vehicle))];
  const hasTransport = !!service?.transportHours;
  const guestsNum = Math.max(0, Math.floor(Number(guests) || 0));

  const q = service
    ? quote({
        tiers: service.tiers,
        year,
        guests: guestsNum,
        transportVehicle: hasTransport ? vehicle : null,
        transportHours: service.transportHours,
        transportOptions: transport,
      })
    : null;

  const transportMissingPrice =
    !!q?.transportVehicle && !transport.find((t) => t.vehicle === q.transportVehicle && t.hours === q.transportHours)?.price;

  const groups = useMemo(() => {
    const m = new Map<string, CalculatorService[]>();
    for (const s of services) m.set(s.type || "Outros", [...(m.get(s.type || "Outros") ?? []), s]);
    return [...m.entries()];
  }, [services]);

  function onServiceChange(id: string) {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    const ys = s ? yearsOf(s.tiers) : [];
    if (!ys.includes(year)) setYear(defaultYear(ys));
    if (!s?.transportHours) setVehicle("");
  }

  const rows = q && service ? buildRows(service, q) : null;

  async function copy() {
    if (!rows || !service || !q) return;
    const { html, text } = renderForEmail(service, q, rows);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(""), 2500);
  }

  if (!services.length) {
    return <p className="bg-white rounded-2xl p-6 text-sm text-gray-400 text-center">Ainda não há serviços com preços.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr] items-start">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <label htmlFor="calc-service" className="block text-xs font-medium text-gray-500 mb-1">Serviço</label>
          <select id="calc-service" value={serviceId} onChange={(e) => onServiceChange(e.target.value)} className={fieldCls}>
            {groups.map(([type, items]) => (
              <optgroup key={type} label={type}>
                {items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="calc-year" className="block text-xs font-medium text-gray-500 mb-1">Ano dos preços</label>
            <select id="calc-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={fieldCls}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="calc-guests" className="block text-xs font-medium text-gray-500 mb-1">Nº de pessoas</label>
            <input id="calc-guests" type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} className={fieldCls} />
          </div>
        </div>
        {hasTransport && (
          <div>
            <label htmlFor="calc-transport" className="block text-xs font-medium text-gray-500 mb-1">Transporte ({service?.transportHours}h)</label>
            <select id="calc-transport" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={fieldCls}>
              <option value="">Sem transporte</option>
              {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        {service && (
          <div className="pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400 mb-1">Escalões {year}</p>
            <div className="flex flex-wrap gap-1.5">
              {tiersForYear(service.tiers, year).map((t) => (
                <span
                  key={t.minPax}
                  className={`text-xs px-2 py-1 rounded-lg tabular-nums ${q?.tier?.minPax === t.minPax ? "bg-[#32373c] text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  {tierLabel(t)} pax · {eur(t.pricePerPax)}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#32373c] truncate">{service?.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {guestsNum} {guestsNum === 1 ? "pessoa" : "pessoas"} · preços {year}
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            disabled={!rows || guestsNum === 0}
            className="bg-[#32373c] text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-40 hover:bg-[#1a2018] transition-colors"
          >
            {copied === "ok" ? "Copiado ✓" : copied === "fail" ? "Não foi possível copiar" : "Copiar tabela"}
          </button>
        </div>
        {rows && guestsNum > 0 ? (
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-medium py-2 pr-4" />
                  <th className="font-medium py-2 pr-4 text-right">s/ IVA</th>
                  <th className="font-medium py-2 text-right">c/ IVA ({Math.round(VAT_RATE * 100)}%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.label} className={r.strong ? "font-semibold text-[#32373c]" : "text-gray-600"}>
                    <td className="py-2 pr-4">{r.label}</td>
                    <td className="py-2 pr-4 text-right">{eur(r.excl)}</td>
                    <td className="py-2 text-right">{eur(r.incl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {q && q.chargedPax > q.guests && (
              <p className="text-xs text-gray-500 mt-3">Este escalão é cobrado a um mínimo de {q.chargedPax} pessoas.</p>
            )}
            {transportMissingPrice && (
              <p className="text-xs text-amber-600 mt-3">O transporte {q?.transportVehicle} de {q?.transportHours}h ainda não tem preço. Define-o na Tabela de preços.</p>
            )}
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Indica o número de pessoas.</p>
        )}
      </section>
    </div>
  );
}

type Row = { label: string; excl: number; incl: number; strong?: boolean };

function buildRows(service: CalculatorService, q: NonNullable<ReturnType<typeof quote>>): Row[] {
  const inc = (n: number) => n * (1 + VAT_RATE);
  const rows: Row[] = [
    { label: `Preço por pessoa (${q.tier ? tierLabel(q.tier) : "—"} pessoas)`, excl: q.pricePerPax, incl: inc(q.pricePerPax) },
    { label: `${service.name} · ${q.chargedPax} ${q.chargedPax === 1 ? "pessoa" : "pessoas"}`, excl: q.serviceTotal, incl: inc(q.serviceTotal) },
  ];
  if (q.transportVehicle) {
    rows.push({ label: `Transporte ${q.transportVehicle} (${q.transportHours}h)`, excl: q.transportTotal, incl: inc(q.transportTotal) });
  }
  if (q.guests > 0 && q.transportVehicle) {
    rows.push({ label: "Total por pessoa", excl: q.totalExclVat / q.guests, incl: q.totalInclVat / q.guests });
  }
  rows.push({ label: "Total", excl: q.totalExclVat, incl: q.totalInclVat, strong: true });
  return rows;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Email-ready table (inline styles survive pasting into Gmail/Outlook) plus a plain-text fallback. */
function renderForEmail(service: CalculatorService, q: NonNullable<ReturnType<typeof quote>>, rows: Row[]) {
  const td = "padding:6px 12px;border:1px solid #d9dedc;font-family:Arial,sans-serif;font-size:14px;color:#32373c;";
  const th = `${td}background:#f2f4f3;font-weight:bold;`;
  const people = `${q.guests} ${q.guests === 1 ? "pessoa" : "pessoas"}`;
  const html = [
    `<table style="border-collapse:collapse;">`,
    `<tr><th colspan="3" style="${th}text-align:left;">${esc(service.name)} · ${people} · ${q.year ?? ""}</th></tr>`,
    `<tr><th style="${th}text-align:left;"></th><th style="${th}text-align:right;">Sem IVA</th><th style="${th}text-align:right;">Com IVA (23%)</th></tr>`,
    ...rows.map((r) => {
      const w = r.strong ? "font-weight:bold;" : "";
      return `<tr><td style="${td}${w}">${esc(r.label)}</td><td style="${td}${w}text-align:right;">${esc(eur(r.excl))}</td><td style="${td}${w}text-align:right;">${esc(eur(r.incl))}</td></tr>`;
    }),
    `</table>`,
  ].join("");
  const text = [
    `${service.name} · ${people} · ${q.year ?? ""}`,
    `\tSem IVA\tCom IVA (23%)`,
    ...rows.map((r) => `${r.label}\t${eur(r.excl)}\t${eur(r.incl)}`),
  ].join("\n");
  return { html, text };
}
