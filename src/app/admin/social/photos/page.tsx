import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { PhotoReviewGrid } from "@/components/social/PhotoReviewGrid";
import { SyncButton } from "@/components/social/SyncButton";
import type { ReviewPhoto } from "@/components/social/PhotoCard";
import { SOCIAL_CATEGORIES } from "@/lib/social-categories";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";
const TABS = [
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovadas" },
  { key: "rejected", label: "Rejeitadas" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function SocialPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === params.tab) ? (params.tab as TabKey) : "pending";
  const categoryFilter = params.category ?? "";

  const { data: connection } = await supabase
    .from("social_drive_connection")
    .select("folder_id, folder_name, last_synced_at, last_sync_error")
    .eq("id", DRIVE_CONNECTION_ID)
    .maybeSingle();

  if (!connection?.folder_id) {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <SocialBreadcrumb crumbs={[{ label: "Fotos" }]} />
        <main className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm text-3xl">📁</div>
          <div>
            <h1 className="text-xl font-bold text-white">Nenhuma pasta do Drive ligada</h1>
            <p className="text-white/70 text-sm mt-2 max-w-sm">
              Liga a pasta do Google Drive com as fotos do negócio para começar a rever e aprovar fotos.
            </p>
          </div>
          <Link
            href="/admin/social/connect"
            className="text-sm font-medium bg-white text-[#32373c] px-5 py-2.5 rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Ligar Google Drive →
          </Link>
        </main>
      </div>
    );
  }

  let photosQuery = supabase
    .from("social_photos")
    .select(
      "id, filename, blob_url, parent_folder_name, review_status, ai_score, ai_score_reason, ai_tags, category, missing_since"
    )
    .eq("review_status", tab)
    .order("ai_score", { ascending: false, nullsFirst: false });
  if (categoryFilter) photosQuery = photosQuery.eq("category", categoryFilter);

  const [{ count: pendingCount }, { count: approvedCount }, { count: rejectedCount }, { data: photos }] =
    await Promise.all([
      supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
      supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
      supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "rejected"),
      photosQuery,
    ]);

  const counts: Record<TabKey, number> = {
    pending: pendingCount ?? 0,
    approved: approvedCount ?? 0,
    rejected: rejectedCount ?? 0,
  };

  const tabHref = (t: TabKey) => `/admin/social/photos?tab=${t}${categoryFilter ? `&category=${categoryFilter}` : ""}`;
  const categoryHref = (c: string) => `/admin/social/photos?tab=${tab}${c ? `&category=${c}` : ""}`;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Fotos" }]} />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white font-bold text-lg">Revisão de Fotos</h1>
            <p className="text-white/60 text-sm mt-0.5">
              {connection.folder_name ?? "Pasta ligada"}
              {connection.last_synced_at && (
                <> · última sincronização {new Date(connection.last_synced_at).toLocaleString("pt-PT")}</>
              )}
            </p>
            {connection.last_sync_error && (
              <p className="text-red-200 text-xs mt-0.5">Erro na última sincronização: {connection.last_sync_error}</p>
            )}
          </div>
          <SyncButton />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                tab === t.key ? "bg-white text-[#32373c]" : "bg-white/10 text-white/60 hover:bg-white/15"
              }`}
            >
              {t.label} ({counts[t.key]})
            </Link>
          ))}
          <Link
            href="/admin/social/connect"
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 text-white/40 hover:bg-white/15 hover:text-white/70 transition-colors ml-auto"
          >
            Gerir ligação Drive
          </Link>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link
            href={categoryHref("")}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
              !categoryFilter ? "bg-white text-[#32373c]" : "bg-white/10 text-white/50 hover:bg-white/15"
            }`}
          >
            Todas as categorias
          </Link>
          {SOCIAL_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={categoryHref(c.slug)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                categoryFilter === c.slug ? "bg-white text-[#32373c]" : "bg-white/10 text-white/50 hover:bg-white/15"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        <PhotoReviewGrid photos={(photos ?? []) as ReviewPhoto[]} showSuggestions={tab === "pending" && !categoryFilter} />
      </main>
    </div>
  );
}
