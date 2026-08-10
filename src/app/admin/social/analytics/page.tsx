import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { InstagramConnectForm } from "@/components/social/InstagramConnectForm";
import { InstagramSyncButton } from "@/components/social/InstagramSyncButton";
import { InstagramReconnectButton } from "@/components/social/InstagramReconnectButton";
import { AnalysisPanel } from "@/components/social/AnalysisPanel";

const IG_CONNECTION_ID = "00000000-0000-0000-0000-000000000003";

type InsightRow = {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  fetched_at: string;
};

type PublishedPostRow = {
  id: string;
  caption: string | null;
  published_at: string | null;
  photo: { blob_url: string; filename: string | null } | null;
  social_ig_insights: InsightRow[];
};

function latestInsight(insights: InsightRow[]): InsightRow | null {
  if (insights.length === 0) return null;
  return [...insights].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0];
}

export default async function SocialAnalyticsPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { data: connection } = await supabase
    .from("social_ig_connection")
    .select("ig_business_account_id, fb_page_id, page_access_token")
    .eq("id", IG_CONNECTION_ID)
    .maybeSingle();

  const connected = Boolean(connection?.page_access_token && connection?.ig_business_account_id);

  if (!connected) {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <SocialBreadcrumb crumbs={[{ label: "Analytics" }]} />
        <main className="max-w-xl mx-auto px-4 py-10 space-y-5">
          <div>
            <h1 className="text-white font-bold text-lg">Ligar Instagram</h1>
            <p className="text-white/60 text-sm mt-1">
              Liga a conta Instagram Business do negócio para veres métricas das publicações e uma análise gerada por
              AI. Isto nunca publica nada automaticamente — apenas lê dados.
            </p>
          </div>
          <InstagramConnectForm />
        </main>
      </div>
    );
  }

  const [{ data: posts }, { data: latestAnalysis }] = await Promise.all([
    supabase
      .from("social_posts")
      .select(
        "id, caption, published_at, photo:social_photos(blob_url, filename), social_ig_insights(impressions, reach, likes, comments, saves, fetched_at)"
      )
      .eq("status", "published")
      .order("published_at", { ascending: false }),
    supabase.from("social_ai_analysis").select("summary").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const typedPosts = (posts ?? []) as unknown as PublishedPostRow[];

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Analytics" }]} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white font-bold text-lg">Analytics</h1>
            <p className="text-white/60 text-sm mt-0.5">{typedPosts.length} publicação(ões) publicada(s)</p>
            <p className="text-[11px] text-white/30 mt-1">
              IG Business Account: {connection?.ig_business_account_id} · Page: {connection?.fb_page_id}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <InstagramSyncButton />
            <InstagramReconnectButton />
          </div>
        </div>

        <AnalysisPanel initialSummary={latestAnalysis?.summary ?? null} />

        {typedPosts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
            Ainda sem publicações marcadas como publicadas. Marca uma em Copy → detalhe da publicação depois de
            publicares manualmente no Instagram.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
            {typedPosts.map((post) => {
              const insight = latestInsight(post.social_ig_insights);
              return (
                <div key={post.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                    {post.photo?.blob_url && (
                      <Image src={post.photo.blob_url} alt="" fill sizes="48px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#32373c] truncate">{post.caption ?? "Sem legenda"}</p>
                    <p className="text-xs text-gray-400">
                      {post.published_at ? new Date(post.published_at).toLocaleDateString("pt-PT") : ""}
                    </p>
                  </div>
                  <div className="flex gap-4 text-right shrink-0">
                    <Metric label="Impr." value={insight?.impressions} />
                    <Metric label="Alcance" value={insight?.reach} />
                    <Metric label="Gostos" value={insight?.likes} />
                    <Metric label="Coment." value={insight?.comments} />
                    <Metric label="Guardados" value={insight?.saves} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="w-14">
      <p className="text-sm font-semibold text-[#32373c]">{value ?? "–"}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}
