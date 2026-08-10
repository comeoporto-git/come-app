export type SocialCategorySlug =
  | "tours"
  | "cooking_classes"
  | "events"
  | "chefs"
  | "guides"
  | "dishes"
  | "decoration"
  | "wines";

export const SOCIAL_CATEGORIES: { slug: SocialCategorySlug; label: string }[] = [
  { slug: "tours", label: "Tours" },
  { slug: "cooking_classes", label: "Aulas de Culinária" },
  { slug: "events", label: "Eventos" },
  { slug: "chefs", label: "Chefs" },
  { slug: "guides", label: "Guias" },
  { slug: "dishes", label: "Pratos" },
  { slug: "decoration", label: "Decoração" },
  { slug: "wines", label: "Vinhos" },
];

const SLUGS = SOCIAL_CATEGORIES.map((c) => c.slug) as string[];

export function isValidCategory(value: string | null | undefined): value is SocialCategorySlug {
  return !!value && SLUGS.includes(value);
}

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return "Sem categoria";
  return SOCIAL_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}
