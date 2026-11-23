"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  VAT_RATE,
  costFor,
  costTierLabel,
  eur,
  pct,
  tierLabel,
  type PriceTier,
  type ServiceCost,
} from "@/lib/pricing";
import {
  saveServiceAvailableUntilAction,
  saveServiceCostsAction,
  saveServiceTiersAction,
  saveServiceTransportHoursAction,
} from "@/actions/pricing";

const inputCls =
  "w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-[#32373c] bg-white placeholder:text-gray-300 focus:outline-none focus:border-[#667470] transition-colors";
const btnPrimary =
  "bg-[#32373c] text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50 hover:bg-[#1a2018] transition-colors";
const btnSecondary =
  "border border-gray-200 text-gray-600 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors";
const linkBtn = "text-xs text-[#667470] hover:text-[#32373c] font-medium";

type Props = {
  serviceId: string;
  tiers: PriceTier[];
  costs: ServiceCost[];
  transportHours: number | null;
  availableUntil: number | null;
  canEdit: boolean;
};

const numOrNull = (v: string): number | null => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));

export function ServicePricingSection({ serviceId, tiers, costs, transportHours, availableUntil, canEdit }: Props) {
  const savedYears = useMemo(
    () => [...new Set([...tiers.map((t) => t.year), ...costs.map((c) => c.year)])].sort((a, b) => b - a),
    [tiers, costs],
  );
  const [extraYear, setExtraYear] = useState<number | null>(null);
  const years = extraYear && !savedYears.includes(extraYear) ? [extraYear, ...savedYears] : savedYears;
  const [year, setYear] = useState<number | null>(years[0] ?? null);

  const yearTiers = tiers.filter((t) => t.year === year).sort((a, b) => a.minPax - b.minPax);
  const yearCosts = costs.filter((c) => c.year === year).sort((a, b) => a.sortOrder - b.sortOrder);
  const isNewYear = year !== null && !savedYears.includes(year);
  // A new year starts from a copy of the latest saved year.
  const sourceYear = savedYears[0] ?? null;
  const seedTiers = isNewYear ? tiers.filter((t) => t.year === sourceYear) : yearTiers;
  const seedCosts = isNewYear ? costs.filter((c) => c.year === sourceYear) : yearCosts;

  function addYear() {
    const next = savedYears.length ? Math.max(...savedYears) + 1 : new Date().getFullYear();
    setExtraYear(next);
    setYear(next);
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#32373c]">Preços e custos</h2>
          <p className="text-xs text-gray-400 mt-0.5">Preços por pessoa s/ IVA · custos estimados c/ IVA</p>
        </div>
        {canEdit && !isNewYear && (
          <button type="button" onClick={addYear} className={linkBtn}>+ Novo ano</button>
        )}
      </div>

      {years.length > 0 && (
        <div className="px-5 pt-3 flex flex-wrap gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                y === year ? "bg-[#32373c] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {year === null ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">Sem preços definidos</p>
      ) : (
        <div className="px-5 py-4 space-y-6">
          {isNewYear && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
              Novo ano {year}: começa com uma cópia de {sourceYear ?? "—"}. Ajusta e guarda os preços e os custos.
            </p>
          )}
          <TiersBlock key={`t-${year}`} serviceId={serviceId} year={year} tiers={seedTiers} startEditing={isNewYear} canEdit={canEdit} />
          <CostsBlock key={`c-${year}`} serviceId={serviceId} year={year} costs={seedCosts} tiers={isNewYear ? seedTiers : yearTiers} startEditing={isNewYear} canEdit={canEdit} />
          {!isNewYear && yearTiers.length > 0 && <MarginBlock tiers={yearTiers} costs={yearCosts} year={year} />}
          <TransportHoursBlock serviceId={serviceId} hours={transportHours} canEdit={canEdit} />
          <AvailableUntilBlock serviceId={serviceId} year={availableUntil} canEdit={canEdit} />
        </div>
      )}
    </section>
  );
}

// ── Price tiers ──────────────────────────────────────────────────────────────

type TierDraft = { minPax: string; maxPax: string; price: string; minCharged: string };

const toTierDraft = (t: PriceTier): TierDraft => ({
  minPax: String(t.minPax),
  maxPax: t.maxPax === null ? "" : String(t.maxPax),
  price: String(t.pricePerPax),
  minCharged: t.minChargedPax === null ? "" : String(t.minChargedPax),
});

function TiersBlock({ serviceId, year, tiers, startEditing, canEdit }: {
  serviceId: string; year: number; tiers: PriceTier[]; startEditing: boolean; canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const [rows, setRows] = useState<TierDraft[]>(tiers.map(toTierDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<TierDraft>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function save() {
    setError(null);
    const parsed = rows.map((r) => ({
      minPax: Number(r.minPax),
      maxPax: numOrNull(r.maxPax),
      pricePerPax: Number(r.price),
      minChargedPax: numOrNull(r.minCharged),
    }));
    if (rows.some((r) => r.minPax.trim() === "" || !Number.isInteger(Number(r.minPax)) || Number(r.minPax) < 1 || r.price.trim() === "" || isNaN(Number(r.price)))) {
      setError("Preenche o mínimo de pessoas e o preço de cada escalão");
      return;
    }
    setSaving(true);
    const res = await saveServiceTiersAction(serviceId, year, parsed);
    setSaving(false);
    if (res.error) setError(res.error);
    else { setEditing(false); router.refresh(); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preço por pessoa {year}</p>
        {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className={linkBtn}>Editar</button>}
      </div>

      {!editing ? (
        tiers.length === 0 ? (
          <p className="text-sm text-gray-400">Sem preços para {year}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-medium py-1 pr-3">Pessoas</th>
                  <th className="font-medium py-1 pr-3 text-right">s/ IVA</th>
                  <th className="font-medium py-1 pr-3 text-right">c/ IVA</th>
                  <th className="font-medium py-1 text-right">Mín. cobrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tiers.map((t) => (
                  <tr key={t.minPax}>
                    <td className="py-1.5 pr-3 font-medium text-[#32373c]">{tierLabel(t)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold text-[#32373c]">{eur(t.pricePerPax)}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-500">{eur(t.pricePerPax * (1 + VAT_RATE))}</td>
                    <td className="py-1.5 text-right text-gray-500">{t.minChargedPax ? `${t.minChargedPax} pax` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1.3fr_1fr_auto] gap-2 text-[11px] text-gray-400 font-medium">
            <span>De (pax)</span><span>Até (pax)</span><span>€/pax s/ IVA</span><span>Mín. cobrado</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_1fr_auto] gap-2 items-center">
              <input aria-label="De" type="number" min={1} value={r.minPax} onChange={(e) => update(i, { minPax: e.target.value })} className={inputCls} />
              <input aria-label="Até" type="number" min={1} placeholder="sem limite" value={r.maxPax} onChange={(e) => update(i, { maxPax: e.target.value })} className={inputCls} />
              <input aria-label="Preço por pessoa" type="number" min={0} step="0.01" value={r.price} onChange={(e) => update(i, { price: e.target.value })} className={inputCls} />
              <input aria-label="Mínimo cobrado" type="number" min={1} placeholder="—" value={r.minCharged} onChange={(e) => update(i, { minCharged: e.target.value })} className={inputCls} />
              <button type="button" aria-label="Remover escalão" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 px-1 text-lg leading-none">×</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((rs) => {
              const last = rs[rs.length - 1];
              const start = last?.maxPax ? Number(last.maxPax) + 1 : 1;
              return [...rs, { minPax: String(start), maxPax: "", price: "", minCharged: "" }];
            })}
            className={linkBtn}
          >
            + Escalão
          </button>
          <p className="text-[11px] text-gray-400">
            Grupos abaixo do 1.º escalão pagam pelas pessoas que vêm, ao preço do 1.º escalão. &quot;Mín. cobrado&quot; obriga a cobrar pelo menos esse número de pessoas.
          </p>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className={btnPrimary}>{saving ? "A guardar…" : "Guardar preços"}</button>
            {!startEditing && (
              <button type="button" onClick={() => { setEditing(false); setRows(tiers.map(toTierDraft)); setError(null); }} className={btnSecondary}>Cancelar</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Costs ────────────────────────────────────────────────────────────────────

type CostDraft = { item: string; tierMin: string; tierMax: string; costType: "Fixed" | "Variable"; amount: string };

const toCostDraft = (c: ServiceCost): CostDraft => ({
  item: c.item,
  tierMin: c.tierMin === null ? "" : String(c.tierMin),
  tierMax: c.tierMax === null ? "" : String(c.tierMax),
  costType: c.costType,
  amount: String(c.amount),
});

function CostsBlock({ serviceId, year, costs, tiers, startEditing, canEdit }: {
  serviceId: string; year: number; costs: ServiceCost[]; tiers: PriceTier[]; startEditing: boolean; canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const [rows, setRows] = useState<CostDraft[]>(costs.map(toCostDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<CostDraft>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const tierKey = (r: CostDraft) => (r.tierMin === "" ? "" : `${r.tierMin}|${r.tierMax}`);
  const tierOptions = tiers.map((t) => ({ key: `${t.minPax}|${t.maxPax ?? ""}`, label: tierLabel(t) }));

  async function save() {
    setError(null);
    if (rows.some((r) => !r.item.trim() || r.amount.trim() === "" || isNaN(Number(r.amount)))) {
      setError("Preenche a descrição e o valor de cada custo");
      return;
    }
    setSaving(true);
    const res = await saveServiceCostsAction(
      serviceId,
      year,
      rows.map((r, i) => ({
        item: r.item,
        tierMin: numOrNull(r.tierMin),
        tierMax: numOrNull(r.tierMax),
        costType: r.costType,
        amount: Number(r.amount),
        sortOrder: i + 1,
      })),
    );
    setSaving(false);
    if (res.error) setError(res.error);
    else { setEditing(false); router.refresh(); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custos estimados {year} (c/ IVA)</p>
        {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className={linkBtn}>Editar</button>}
      </div>

      {!editing ? (
        costs.length === 0 ? (
          <p className="text-sm text-gray-400">Sem custos para {year}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-medium py-1 pr-3">Custo</th>
                  <th className="font-medium py-1 pr-3">Escalão</th>
                  <th className="font-medium py-1 pr-3">Tipo</th>
                  <th className="font-medium py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {costs.map((c, i) => (
                  <tr key={c.id ?? i}>
                    <td className="py-1.5 pr-3 font-medium text-[#32373c]">{c.item}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{costTierLabel(c)}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{c.costType === "Fixed" ? "Fixo / serviço" : "Por pessoa"}</td>
                    <td className="py-1.5 text-right font-semibold text-[#32373c]">{eur(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1.6fr_1fr_1.1fr_1fr_auto] gap-2 text-[11px] text-gray-400 font-medium">
            <span>Custo</span><span>Escalão</span><span>Tipo</span><span>€ c/ IVA</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.6fr_1fr_1.1fr_1fr_auto] gap-2 items-center">
              <input aria-label="Custo" value={r.item} onChange={(e) => update(i, { item: e.target.value })} className={inputCls} placeholder="Guia" />
              <select
                aria-label="Escalão"
                value={tierKey(r)}
                onChange={(e) => {
                  const [min, max] = e.target.value ? e.target.value.split("|") : ["", ""];
                  update(i, { tierMin: min, tierMax: max });
                }}
                className={inputCls}
              >
                <option value="">Todos</option>
                {tierOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                {tierKey(r) && !tierOptions.some((o) => o.key === tierKey(r)) && (
                  <option value={tierKey(r)}>{costTierLabel({ tierMin: numOrNull(r.tierMin), tierMax: numOrNull(r.tierMax) })}</option>
                )}
              </select>
              <select aria-label="Tipo" value={r.costType} onChange={(e) => update(i, { costType: e.target.value as "Fixed" | "Variable" })} className={inputCls}>
                <option value="Fixed">Fixo / serviço</option>
                <option value="Variable">Por pessoa</option>
              </select>
              <input aria-label="Valor" type="number" min={0} step="0.01" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} className={inputCls} />
              <button type="button" aria-label="Remover custo" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 px-1 text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { item: "", tierMin: "", tierMax: "", costType: "Fixed", amount: "" }])} className={linkBtn}>
            + Custo
          </button>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className={btnPrimary}>{saving ? "A guardar…" : "Guardar custos"}</button>
            {!startEditing && (
              <button type="button" onClick={() => { setEditing(false); setRows(costs.map(toCostDraft)); setError(null); }} className={btnSecondary}>Cancelar</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Margin per tier ──────────────────────────────────────────────────────────

function MarginBlock({ tiers, costs, year }: { tiers: PriceTier[]; costs: ServiceCost[]; year: number }) {
  if (!costs.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Margem {year}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-gray-400 text-left">
              <th className="font-medium py-1 pr-3">Pessoas</th>
              <th className="font-medium py-1 pr-3 text-right">Custo/pax</th>
              <th className="font-medium py-1 pr-3 text-right">Preço s/ IVA</th>
              <th className="font-medium py-1 text-right">Margem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tiers.map((t) => {
              const pax = t.minPax;
              const charged = Math.max(pax, t.minChargedPax ?? 0);
              const revenue = t.pricePerPax * charged;
              const cost = costFor(costs, year, pax);
              const margin = revenue > 0 ? (revenue - cost.total) / revenue : 0;
              const color = margin < 0 ? "text-red-600" : margin < 0.35 ? "text-amber-600" : "text-green-700";
              return (
                <tr key={t.minPax}>
                  <td className="py-1.5 pr-3 font-medium text-[#32373c]">{tierLabel(t)} <span className="text-xs text-gray-400">(a {pax})</span></td>
                  <td className="py-1.5 pr-3 text-right text-gray-500">{eur(cost.perPax)}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-500">{eur(t.pricePerPax)}</td>
                  <td className={`py-1.5 text-right font-semibold ${color}`}>{pct(margin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Calculada com o número mínimo de pessoas de cada escalão. Abaixo de 35% fica a laranja.</p>
    </div>
  );
}

// ── Transport add-on hours ───────────────────────────────────────────────────

function TransportHoursBlock({ serviceId, hours, canEdit }: { serviceId: string; hours: number | null; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hours === null ? "" : String(hours));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveServiceTransportHoursAction(serviceId, numOrNull(value));
    setSaving(false);
    if (res.error) setError(res.error);
    else { setEditing(false); router.refresh(); }
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap border-t border-gray-50 pt-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transporte (extra)</p>
        {!editing && (
          <p className="text-sm text-[#32373c] mt-0.5">
            {hours ? `Disponível · preço de ${hours} horas` : "Não disponível neste serviço"}
          </p>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input aria-label="Horas de transporte" type="number" min={1} placeholder="sem transporte" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} w-32`} />
          <button type="button" onClick={save} disabled={saving} className={btnPrimary}>{saving ? "…" : "Guardar"}</button>
          <button type="button" onClick={() => { setEditing(false); setValue(hours === null ? "" : String(hours)); }} className={btnSecondary}>Cancelar</button>
        </div>
      ) : (
        canEdit && <button type="button" onClick={() => setEditing(true)} className={linkBtn}>Editar</button>
      )}
      {error && <p className="w-full text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

// ── Last year offered ───────────────────────────────────────────────────────

function AvailableUntilBlock({ serviceId, year, canEdit }: { serviceId: string; year: number | null; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(year === null ? "" : String(year));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveServiceAvailableUntilAction(serviceId, numOrNull(value));
    setSaving(false);
    if (res.error) setError(res.error);
    else { setEditing(false); router.refresh(); }
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap border-t border-gray-50 pt-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Oferecido até</p>
        {!editing && (
          <p className={`text-sm mt-0.5 ${year ? "text-amber-700" : "text-[#32373c]"}`}>
            {year ? `${year} — já não aparece na tabela de preços nem na calculadora para anos seguintes` : "Sem data de fim"}
          </p>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input aria-label="Último ano oferecido" type="number" min={2000} max={2100} placeholder="sem fim" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} w-32`} />
          <button type="button" onClick={save} disabled={saving} className={btnPrimary}>{saving ? "…" : "Guardar"}</button>
          <button type="button" onClick={() => { setEditing(false); setValue(year === null ? "" : String(year)); }} className={btnSecondary}>Cancelar</button>
        </div>
      ) : (
        canEdit && <button type="button" onClick={() => setEditing(true)} className={linkBtn}>Editar</button>
      )}
      {error && <p className="w-full text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}
