"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VAT_RATE, eur, tierLabel, type PriceTier, type TransportOption } from "@/lib/pricing";
import { saveTransportPricesAction } from "@/actions/pricing";

export type PriceListService = {
  id: string;
  name: string;
  type: string;
  description: string;
  durationMinutes: number | null;
  transportHours: number | null;
  tiers: PriceTier[];
};

function duration(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Order of the sections in the price list, and of services inside a section
// (matched by a word in the name). Anything not listed goes last, by name.
const TYPE_ORDER = ["tour", "cooking class", "chef + sommelier em casa"];
const SERVICE_ORDER: Record<string, string[]> = {
  "cooking class": ["chefs house", "capucine", "barro"],
};

function rank(list: string[], match: (item: string) => boolean) {
  const i = list.findIndex(match);
  return i === -1 ? list.length : i;
}

function byListOrder(a: PriceListService, b: PriceListService) {
  const ta = a.type.trim().toLowerCase();
  const tb = b.type.trim().toLowerCase();
  const byType = rank(TYPE_ORDER, (t) => t === ta) - rank(TYPE_ORDER, (t) => t === tb);
  if (byType) return byType;
  if (ta !== tb) return ta.localeCompare(tb);
  const order = SERVICE_ORDER[ta] ?? [];
  const na = a.name.toLowerCase();
  const nb = b.name.toLowerCase();
  const byName = rank(order, (w) => na.includes(w)) - rank(order, (w) => nb.includes(w));
  return byName || a.name.localeCompare(b.name);
}

// Prints only the price list: the app's sidebar, chat and buttons are hidden,
// and the browser's "Save as PDF" produces the shareable file.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  body * { visibility: hidden !important; }
  #price-list, #price-list * { visibility: visible !important; }
  #price-list { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; }
  #price-list section { break-inside: avoid; }
  html, body { background: #fff !important; }
}`;

export function PriceList({ year, years, services, transport }: {
  year: number;
  years: number[];
  services: PriceListService[];
  transport: TransportOption[];
}) {
  const groups = new Map<string, PriceListService[]>();
  for (const s of [...services].sort(byListOrder)) groups.set(s.type || "Outros", [...(groups.get(s.type || "Outros") ?? []), s]);

  const vehicles = [...new Set(transport.map((t) => t.vehicle))];
  const hours = [...new Set(transport.map((t) => t.hours))].sort((a, b) => a - b);
  const transportServices = services.filter((s) => s.transportHours);
  const showTransport = transportServices.length > 0 && transport.some((t) => t.price !== null);

  function makePdf() {
    const previous = document.title;
    document.title = `COME - Tabela de Preços ${year}`;
    window.print();
    document.title = previous;
  }

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex flex-wrap gap-1.5">
          {years.map((y) => (
            <Link
              key={y}
              href={`/admin/precos?ano=${y}`}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                y === year ? "bg-[#32373c] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
        <button type="button" onClick={makePdf} className="bg-[#32373c] text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-[#1a2018] transition-colors">
          Gerar PDF
        </button>
      </div>

      <TransportEditor transport={transport} vehicles={vehicles} hours={hours} />

      <div id="price-list" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 text-[#32373c]">
        <header className="flex items-end justify-between gap-4 border-b border-gray-200 pb-4 mb-6">
          <div>
            <p className="text-2xl font-bold tracking-wide">COME</p>
            <p className="text-xs text-gray-500 uppercase tracking-[0.2em] mt-1">Food experiences · Porto &amp; Douro</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Tabela de preços {year}</p>
            <p className="text-xs text-gray-500">Preços por pessoa</p>
          </div>
        </header>

        {services.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sem preços para {year}.</p>
        ) : (
          <div className="space-y-8">
            {[...groups.entries()].map(([type, items]) => (
              <div key={type} className="space-y-4">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-[0.15em]">{type}</h2>
                {items.map((s) => (
                  <section key={s.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold">{s.name}</h3>
                      {duration(s.durationMinutes) && <span className="text-xs text-gray-500 shrink-0">{duration(s.durationMinutes)}</span>}
                    </div>
                    <table className="w-full text-sm tabular-nums">
                      <thead>
                        <tr className="text-xs text-gray-500 text-left">
                          <th className="font-medium px-4 py-2">Grupo</th>
                          <th className="font-medium px-4 py-2 text-right">Por pessoa s/ IVA</th>
                          <th className="font-medium px-4 py-2 text-right">Por pessoa c/ IVA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {s.tiers.map((t) => (
                          <tr key={t.minPax}>
                            <td className="px-4 py-2">
                              {tierLabel(t)} {t.maxPax === 1 ? "pessoa" : "pessoas"}
                              {t.minChargedPax && t.minChargedPax > t.minPax && (
                                <span className="text-xs text-gray-500"> (mínimo {t.minChargedPax} pessoas)</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">{eur(t.pricePerPax)}</td>
                            <td className="px-4 py-2 text-right font-semibold">{eur(t.pricePerPax * (1 + VAT_RATE))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {s.transportHours && showTransport && (
                      <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">Transporte não incluído. Disponível como extra ({s.transportHours}h).</p>
                    )}
                  </section>
                ))}
              </div>
            ))}

            {showTransport && (
              <section className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50">
                  <h3 className="font-semibold">Transporte (extra)</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Preço por veículo. {transportServices.map((s) => `${s.name}: ${s.transportHours}h`).join(" · ")}
                  </p>
                </div>
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs text-gray-500 text-left">
                      <th className="font-medium px-4 py-2">Veículo</th>
                      {hours.map((h) => (
                        <th key={h} className="font-medium px-4 py-2 text-right">{h}h s/ IVA · c/ IVA</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vehicles.map((v) => (
                      <tr key={v}>
                        <td className="px-4 py-2">{v}</td>
                        {hours.map((h) => {
                          const p = transport.find((t) => t.vehicle === v && t.hours === h)?.price ?? null;
                          return (
                            <td key={h} className="px-4 py-2 text-right">
                              {p === null ? "—" : <>{eur(p)} · <span className="font-semibold">{eur(p * (1 + VAT_RATE))}</span></>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <p>Crianças dos 10 aos 18 anos pagam 75%, dos 3 aos 9 anos 50%, e até aos 2 anos não pagam. Contam para o tamanho do grupo.</p>
          <p>IVA à taxa de {Math.round(VAT_RATE * 100)}%. Grupos maiores ou serviços à medida sob consulta.</p>
        </footer>
      </div>
    </div>
  );
}

function TransportEditor({ transport, vehicles, hours }: { transport: TransportOption[]; vehicles: string[]; hours: number[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(transport.map((t) => [t.id, t.price === null ? "" : String(t.price)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveTransportPricesAction(
      transport.map((t) => {
        const v = (values[t.id] ?? "").trim();
        return { id: t.id, price: v === "" ? null : Number(v) };
      }),
    );
    setSaving(false);
    if (res.error) setError(res.error);
    else { setOpen(false); router.refresh(); }
  }

  const missing = transport.filter((t) => t.price === null).length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:hidden">
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[#32373c]">Preços de transporte</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {missing === transport.length ? "Ainda sem preços — o transporte não aparece na tabela." : missing > 0 ? `${missing} preço(s) por definir` : "Preço por veículo, s/ IVA"}
          </p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">Editar</button>
        )}
      </div>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-medium py-1 pr-4">Veículo</th>
                  {hours.map((h) => <th key={h} className="font-medium py-1 pr-4">{h} horas (€ s/ IVA)</th>)}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v}>
                    <td className="py-1 pr-4 font-medium text-[#32373c]">{v}</td>
                    {hours.map((h) => {
                      const opt = transport.find((t) => t.vehicle === v && t.hours === h);
                      return (
                        <td key={h} className="py-1 pr-4">
                          {opt ? (
                            <input
                              aria-label={`${v} ${h} horas`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={values[opt.id] ?? ""}
                              onChange={(e) => setValues((s) => ({ ...s, [opt.id]: e.target.value }))}
                              className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-[#32373c] focus:outline-none focus:border-[#667470]"
                            />
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="bg-[#32373c] text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "A guardar…" : "Guardar"}</button>
            <button type="button" onClick={() => setOpen(false)} className="border border-gray-200 text-gray-600 text-xs font-semibold px-4 py-2 rounded-xl">Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
