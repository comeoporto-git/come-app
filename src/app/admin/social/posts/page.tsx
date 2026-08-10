import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";

type PostRow = {
  id: string;
  caption: string | null;
  status: string;
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

export default async function SocialPostsPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { data } = await supabase
    .from("social_posts")
    .select("id, caption, status, updated_at, photo:social_photos(blob_url, filename)")
    .order("updated_at", { ascending: false });

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

        {posts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
            Ainda sem publicações. Aprova fotos em{" "}
            <Link href="/admin/social/photos" className="text-[#667470] underline">
              Revisão de Fotos
            </Link>{" "}
            para gerar copy automaticamente.
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
                <div className="p-3">
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
