import { auth } from "@/lib/auth";
import { getAllUpcomingTours, getAllPastTours, getTeamMembers, getTaskCountsForSales } from "@/lib/notion";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/lib/auth";
import { TourTabs } from "@/components/TourTabs";
import { TodayServiceCard } from "@/components/TodayServiceCard";

function isToday(iso: string | null): boolean {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}

export default async function SuperGuideServicosPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") redirect("/");

  const [tours, pastTours, teamMembers] = await Promise.all([
    getAllUpcomingTours(),
    getAllPastTours(),
    getTeamMembers(),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));
  const todays   = tours.filter((t) => isToday(t.date));
  const upcoming = tours.filter((t) => !isToday(t.date));

  const taskCounts = await getTaskCountsForSales(
    [...tours, ...pastTours].map((t) => t.id),
    session.user.role,
  );

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/super-guide/gestao-servicos" className="text-white/40 hover:text-white transition-colors text-lg leading-none">
              ←
            </Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME"
                width={72}
                height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Serviços</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {todays.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/80 mb-3">
              Hoje · {todays.length}
            </h2>
            <ul className="flex flex-col gap-4">
              {todays.map((tour) => (
                <TodayServiceCard
                  key={tour.id}
                  tour={tour}
                  guideName={teamMap[tour.teamId ?? ""]}
                  taskCount={taskCounts[tour.id]}
                  canManageTasks
                />
              ))}
            </ul>
          </section>
        )}

        <section>
          <TourTabs today={todays} upcoming={upcoming} past={pastTours} teamMap={teamMap} taskCounts={taskCounts} canManageTasks />
        </section>
      </main>
    </div>
  );
}
