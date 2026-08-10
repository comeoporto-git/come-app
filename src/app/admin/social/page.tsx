import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { SyncButton } from "@/components/social/SyncButton";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";

export default async function SocialDashboardPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [
    { data: connection },
    { count: pendingCount },
    { count: approvedCount },
    { count: rejectedCount },
    { count: inReviewPostCount },
    { count: approvedPostCount },
  ] = await Promise.all([
    supabase
      .from("social_drive_connection")
      .select("folder_id, folder_name, last_synced_at")
      .eq("id", DRIVE_CONNECTION_ID)
      .maybeSingle(),
    supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
    supabase.from("social_photos").select("id", { count: "exact", head: true }).eq("review_status", "rejected"),
    supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "in_review"),
    supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "approved"),
  ]);

  const connected = Boolean(connection?.folder_id);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[]} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white font-bold text-lg">Redes Sociais</h1>
            <p className="text-white/60 text-sm mt-0.5">
              {connected
                ? `Ligado a "${connection?.folder_name ?? connection?.folder_id}"`
                : "Nenhuma pasta do Google Drive ligada ainda"}
            </p>
          </div>
          {connected && <SyncButton />}
        </div>

        {!connected && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-3">
            <p className="text-sm text-gray-500">
              Liga a pasta do Google Drive com as fotos do negócio para começar.
            </p>
            <Link
              href="/admin/social/connect"
              className="inline-block text-sm font-medium bg-[#32373c] text-white px-5 py-2.5 rounded-xl hover:bg-[#202427] transition-colors"
            >
              Ligar Google Drive →
            </Link>
          </div>
        )}

        {connected && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/admin/social/photos?tab=pending"
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-bold text-[#32373c]">{pendingCount ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Fotos pendentes de revisão</p>
            </Link>
            <Link
              href="/admin/social/photos?tab=approved"
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-bold text-emerald-600">{approvedCount ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Fotos aprovadas</p>
            </Link>
            <Link
              href="/admin/social/photos?tab=rejected"
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-bold text-gray-400">{rejectedCount ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Fotos rejeitadas</p>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/admin/social/posts"
            className="bg-white/10 hover:bg-white/15 rounded-2xl border border-white/10 p-5 transition-colors"
          >
            <p className="text-sm font-semibold text-white">Copy Sugerida</p>
            <p className="text-xs text-white/60 mt-1">
              {(inReviewPostCount ?? 0) > 0
                ? `${inReviewPostCount} por rever${(approvedPostCount ?? 0) > 0 ? ` · ${approvedPostCount} aprovada(s)` : ""}`
                : "Fotos aprovadas ganham legenda automaticamente."}
            </p>
          </Link>
          <div className="bg-white/10 rounded-2xl border border-white/10 p-5 opacity-50">
            <p className="text-sm font-semibold text-white">Calendário</p>
            <p className="text-xs text-white/60 mt-1">Em breve — publicações agendadas.</p>
          </div>
          <div className="bg-white/10 rounded-2xl border border-white/10 p-5 opacity-50">
            <p className="text-sm font-semibold text-white">Analytics</p>
            <p className="text-xs text-white/60 mt-1">Em breve — métricas do Instagram e análise AI.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
