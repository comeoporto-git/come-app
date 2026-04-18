"use client";

const PERIODS = [
  { value: 30,  label: "30 dias"  },
  { value: 90,  label: "3 meses"  },
  { value: 180, label: "6 meses"  },
  { value: 365, label: "12 meses" },
  { value: 0,   label: "Tudo"     },
] as const;

export function AnalyticsPeriodPicker({
  current,
  onChange,
}: {
  current: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className="flex gap-1 bg-black/10 p-1 rounded-xl w-fit">
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            current === value
              ? "bg-white text-[#32373c] shadow-sm"
              : "text-white/60 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
