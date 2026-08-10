import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { BrandBriefForm } from "@/components/social/BrandBriefForm";

const BRAND_BRIEF_ID = "00000000-0000-0000-0000-000000000001";

export default async function BrandBriefPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { data } = await supabase
    .from("social_brand_brief")
    .select("tone, offerings, website_summary, audience, guidelines")
    .eq("id", BRAND_BRIEF_ID)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Marca" }]} />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-white font-bold text-lg">Brand Brief</h1>
          <p className="text-white/60 text-sm mt-0.5">
            Este contexto é usado em todas as sugestões de AI — pontuação de fotos, legendas e análise de desempenho.
          </p>
        </div>
        <BrandBriefForm
          initial={{
            tone: data?.tone ?? "",
            offerings: data?.offerings ?? "",
            websiteSummary: data?.website_summary ?? "",
            audience: data?.audience ?? "",
            guidelines: data?.guidelines ?? "",
          }}
        />
      </main>
    </div>
  );
}
