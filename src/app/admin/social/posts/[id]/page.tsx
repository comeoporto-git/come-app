import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { PostReviewPanel, type PostComment } from "@/components/social/PostReviewPanel";
import { PostPublishPanel } from "@/components/social/PostPublishPanel";

type PostRow = {
  id: string;
  caption: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  ig_permalink: string | null;
  photo: { blob_url: string; filename: string | null; parent_folder_name: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Por rever",
  approved: "Copy aprovada",
  scheduled: "Agendada",
  published: "Publicada",
  archived: "Arquivada",
};

export default async function SocialPostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { id } = await params;

  const [{ data: post }, { data: comments }] = await Promise.all([
    supabase
      .from("social_posts")
      .select(
        "id, caption, status, scheduled_for, published_at, ig_permalink, photo:social_photos(blob_url, filename, parent_folder_name)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("social_post_comments")
      .select("id, author_type, body, created_at")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!post) notFound();
  const typedPost = post as unknown as PostRow;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Copy", href: "/admin/social/posts" }, { label: typedPost.photo?.filename ?? "Publicação" }]} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="relative aspect-square bg-black/20 rounded-2xl overflow-hidden">
              {typedPost.photo?.blob_url && (
                <Image
                  src={typedPost.photo.blob_url}
                  alt={typedPost.photo.filename ?? ""}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/50">
                {typedPost.photo?.filename}
                {typedPost.photo?.parent_folder_name && ` · ${typedPost.photo.parent_folder_name}`}
              </p>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                {STATUS_LABEL[typedPost.status] ?? typedPost.status}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Legenda atual</p>
              <p className="text-sm text-[#32373c] whitespace-pre-wrap leading-relaxed">
                {typedPost.caption ?? "Ainda sem legenda."}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <PostPublishPanel
              postId={typedPost.id}
              status={typedPost.status}
              scheduledFor={typedPost.scheduled_for}
              publishedAt={typedPost.published_at}
              igPermalink={typedPost.ig_permalink}
            />
            <PostReviewPanel
              postId={typedPost.id}
              status={typedPost.status}
              comments={(comments ?? []) as PostComment[]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
