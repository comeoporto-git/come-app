"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PERIODS = [
  { value: 30,  label: "30 dias" },
  { value: 90,  label: "3 meses" },
  { value: 180, label: "6 meses" },
  { value: 365, label: "12 meses" },
] as const;

export function AnalyticsPeriodPicker({ current }: { current: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pick(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", String(days));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 bg-black/10 p-1 rounded-xl w-fit">
      {PERIODS.map(({ value, label }) => {
        const active = current === value;
        return (
          <button
            key={value}
            onClick={() => pick(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              active
                ? "bg-white text-[#32373c] shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
