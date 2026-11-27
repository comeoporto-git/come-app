"use client";

import { CHILD_RATES, type Children } from "@/lib/pricing";

const FIELD_NAMES: Record<keyof Children, string> = {
  children1018: "children1018",
  children39: "children39",
  children02: "children02",
};

/** Children by age band, counted within the total number of people. */
export function ChildrenInputs({
  value,
  onChange,
  inputClassName,
  totalGuests,
}: {
  value: Children;
  onChange: (next: Children) => void;
  inputClassName: string;
  /** Total number of people, to warn when children outnumber it. */
  totalGuests?: number | null;
}) {
  const sum = value.children1018 + value.children39 + value.children02;
  const tooMany = totalGuests != null && totalGuests > 0 && sum > totalGuests;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">Crianças (incluídas no nº de pessoas)</p>
      <div className="grid grid-cols-3 gap-2">
        {CHILD_RATES.map((c) => (
          <label key={c.key} className="block">
            <span className="block text-[11px] text-gray-400 mb-0.5">
              {c.short} anos · {c.rate === 0 ? "grátis" : `${Math.round(c.rate * 100)}%`}
            </span>
            <input
              type="number"
              min={0}
              name={FIELD_NAMES[c.key]}
              value={value[c.key] || ""}
              placeholder="0"
              onChange={(e) => onChange({ ...value, [c.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className={inputClassName}
            />
          </label>
        ))}
      </div>
      {tooMany && <p className="text-xs text-amber-700 mt-1">Há mais crianças do que pessoas no total.</p>}
    </div>
  );
}
