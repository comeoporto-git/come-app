import Link from "next/link";

type Crumb = { label: string; href?: string };

export function SocialBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-1.5 text-xs text-white/50">
      <Link href="/admin" className="hover:text-white/80 transition-colors">Admin</Link>
      <span className="text-white/30">/</span>
      <Link href="/admin/social" className="hover:text-white/80 transition-colors">Redes Sociais</Link>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-white/30">/</span>
          {c.href ? (
            <Link href={c.href} className="hover:text-white/80 transition-colors">{c.label}</Link>
          ) : (
            <span className="text-white/70">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
