import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { CategoryBadge } from "@/components/social/CategoryBadge";
import { SOCIAL_CATEGORIES } from "@/lib/social-categories";

type PostRow = {
  id: string;
  caption: string | null;
  status: string;
  category: string | null;
  updated_at: string;
  photo: { blob_url: string; filename: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Por rever",
  approved: "Copy aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  archived: "Arquivada",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-600 text-white",
  archived: "bg-gray-100 text-gray-400",
};

export default async function SocialPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;
  const categoryFilter = params.category ?? "";

  let query = supabase
    .from("social_posts")
    .select("id, caption, status, category, updated_at, photo:social_photos(blob_url, filename)")
    .order("updated_at", { ascending: false });
  if (categoryFilter) query = query.eq("category", categoryFilter);

  const { data } = await query;
  const posts = (data ?? []) as unknown as PostRow[];

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Copy" }]} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-white font-bold text-lg">Copy Sugerida</h1>
          <p className="text-white/60 text-sm mt-0.5">
            Fotos aprovadas com legenda gerada por AI. Clica numa para rever e melhorar.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/social/posts"
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              !categoryFilter ? "bg-white text-[#32373c]" : "bg-white/10 text-white/60 hover:bg-white/15"
            }`}
          >
            Todas
          </Link>
          {SOCIAL_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/admin/social/posts?category=${c.slug}`}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                categoryFilter === c.slug ? "bg-white text-[#32373c]" : "bg-white/10 text-white/60 hover:bg-white/15"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
            {categoryFilter ? (
              "Nenhuma publicação nesta categoria."
            ) : (
              <>
                Ainda sem publicações. Aprova fotos em{" "}
                <Link href="/admin/social/photos" className="text-[#667470] underline">
                  Revisão de Fotos
                </Link>{" "}
                para gerar copy automaticamente.
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/admin/social/posts/${post.id}`}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-square bg-gray-50">
                  {post.photo?.blob_url && (
                    <Image
                      src={post.photo.blob_url}
                      alt={post.photo.filename ?? ""}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  )}
                  <span
                    className={`absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm ${STATUS_CLASS[post.status] ?? "bg-gray-100 text-gray-500"}`}
                  >
                    {STATUS_LABEL[post.status] ?? post.status}
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  <CategoryBadge category={post.category} />
                  <p className="text-xs text-gray-600 line-clamp-3">{post.caption ?? "Sem legenda ainda."}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
