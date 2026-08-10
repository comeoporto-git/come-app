import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/notion";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";
import { PostCalendar, type CalendarPost } from "@/components/social/PostCalendar";

export default async function SocialCalendarPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { data } = await supabase
    .from("social_posts")
    .select("id, caption, scheduled_for, photo:social_photos(blob_url, filename)")
    .eq("status", "scheduled")
    .not("scheduled_for", "is", null)
    .order("scheduled_for", { ascending: true });

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Calendário" }]} />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-white font-bold text-lg">Calendário</h1>
          <p className="text-white/60 text-sm mt-0.5">Publicações agendadas.</p>
        </div>
        <PostCalendar posts={(data ?? []) as unknown as CalendarPost[]} />
      </main>
    </div>
  );
}
