import { auth } from "@/lib/auth";
import { getAllUpcomingTours, getAllPastTours, getTeamMembers, getTaskCountsForSales } from "@/lib/notion";
import { redirect } from "next/navigation";
import { TourTabs } from "@/components/TourTabs";
import { TodayServiceCard } from "@/components/TodayServiceCard";

function isToday(iso: string | null): boolean {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}

export default async function AdminToursPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin" && session.user.role !== "Super Guide") redirect("/");

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
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Today */}
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
                  chefName={tour.chefName}
                  driverName={tour.driverName}
                  logisticsName={tour.logisticsName}
                  taskCount={taskCounts[tour.id]}
                  canManageTasks
                />
              ))}
            </ul>
          </section>
        )}

        {/* Tabs: Próximas / Anteriores */}
        <section>
          <TourTabs
            today={todays}
            upcoming={upcoming}
            past={pastTours}
            teamMap={teamMap}
            showFilters={session.user.role === "Admin"}
            taskCounts={taskCounts}
            canManageTasks
          />
        </section>
      </main>
    </div>
  );
}
