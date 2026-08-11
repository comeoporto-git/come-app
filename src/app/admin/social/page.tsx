import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { SyncButton } from "@/components/social/SyncButton";
import { getCategorySuggestion, getCategoryBalance } from "@/lib/social-planning";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";
const IG_CONNECTION_ID = "00000000-0000-0000-0000-000000000003";

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
    { count: scheduledPostCount },
    { count: publishedPostCount },
    { data: igConnection },
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
    supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("social_ig_connection").select("page_access_token").eq("id", IG_CONNECTION_ID).maybeSingle(),
  ]);

  const igConnected = Boolean(igConnection?.page_access_token);

  const connected = Boolean(connection?.folder_id);

  const [suggestion, categoryBalance] = connected
    ? await Promise.all([getCategorySuggestion(), getCategoryBalance()])
    : [null, []];

  const maxBalanceCount = Math.max(1, ...categoryBalance.map((c) => c.approvedPhotos + c.drafts + c.scheduled + c.published));

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

        {connected && suggestion && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-[#667470] uppercase tracking-wide">Publicar a seguir</p>
                <p className="text-lg font-bold text-[#32373c] mt-1">{suggestion.label}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {suggestion.recentCount === 0
                    ? "Ainda não publicaste nada nesta categoria recentemente."
                    : `Só ${suggestion.recentCount} publicação(ões) recente(s) nesta categoria — a menos representada.`}
                  {" "}
                  {suggestion.readyToScheduleCount > 0
                    ? `Tens ${suggestion.readyToScheduleCount} publicação(ões) pronta(s) a agendar.`
                    : "Ainda sem copy pronta nesta categoria — aprova fotos dela em Fotos."}
                </p>
              </div>
              <Link
                href={`/admin/social/posts?category=${suggestion.category}`}
                className="text-xs font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-4 py-2 rounded-xl transition-colors shrink-0"
              >
                Ver categoria →
              </Link>
            </div>

            <div className="space-y-1.5">
              {categoryBalance.map((c) => {
                const total = c.approvedPhotos + c.drafts + c.scheduled + c.published;
                return (
                  <div key={c.slug} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-32 shrink-0 truncate">{c.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#667470] rounded-full"
                        style={{ width: `${(total / maxBalanceCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-400 w-6 text-right shrink-0">{total}</span>
                  </div>
                );
              })}
            </div>
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
          <Link
            href="/admin/social/calendar"
            className="bg-white/10 hover:bg-white/15 rounded-2xl border border-white/10 p-5 transition-colors"
          >
            <p className="text-sm font-semibold text-white">Calendário</p>
            <p className="text-xs text-white/60 mt-1">
              {(scheduledPostCount ?? 0) > 0 ? `${scheduledPostCount} agendada(s)` : "Sem publicações agendadas."}
            </p>
          </Link>
          <Link
            href="/admin/social/analytics"
            className="bg-white/10 hover:bg-white/15 rounded-2xl border border-white/10 p-5 transition-colors"
          >
            <p className="text-sm font-semibold text-white">Analytics</p>
            <p className="text-xs text-white/60 mt-1">
              {!igConnected
                ? "Instagram ainda não ligado."
                : (publishedPostCount ?? 0) > 0
                  ? `${publishedPostCount} publicação(ões) com métricas`
                  : "Instagram ligado — sem publicações ainda."}
            </p>
          </Link>
        </div>

        <Link href="/admin/social/brand-brief" className="inline-block text-xs text-white/50 hover:text-white/80 transition-colors">
          Editar Brand Brief →
        </Link>
      </main>
    </div>
  );
}
