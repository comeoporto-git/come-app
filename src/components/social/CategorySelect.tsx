"use client";

import { useTransition } from "react";
import { SOCIAL_CATEGORIES } from "@/lib/social-categories";

export function CategorySelect({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: string | null;
  onChange: (category: string | null) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value || null;
        startTransition(() => {
          onChange(next);
        });
      }}
      disabled={disabled || isPending}
      className={`text-[11px] bg-gray-50 border border-gray-200 rounded-full px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 disabled:opacity-50 ${className}`}
    >
      <option value="">Sem categoria</option>
      {SOCIAL_CATEGORIES.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
