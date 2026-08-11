import { categoryLabel } from "@/lib/social-categories";

export function CategoryBadge({ category, className = "" }: { category: string | null; className?: string }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#667470]/10 text-[#667470] whitespace-nowrap ${className}`}
    >
      {categoryLabel(category)}
    </span>
  );
}
