import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { SOCIAL_CATEGORIES } from "@/lib/social-categories";
import { PostsGrid, type PostRow } from "@/components/social/PostsGrid";

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
          <PostsGrid posts={posts} />
        )}
      </main>
    </div>
  );
}
