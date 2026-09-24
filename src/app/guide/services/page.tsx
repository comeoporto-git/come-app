import { auth } from "@/lib/auth";
import {
  getToursForPerson,
  getPastToursForPerson,
  getAllUpcomingTours,
  getAllPastTours,
  getTeamMembers,
  getTaskCountsForSales,
} from "@/lib/notion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import Image from "next/image";
import { TourTabs } from "@/components/TourTabs";
import { TodayServiceCard } from "@/components/TodayServiceCard";

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default async function GuideDashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  const isSuperGuide = role === "Super Guide";
  const isChef = role === "Chef";
  const canManageTasks = isSuperGuide || role === "Admin";
  const email = session.user?.email ?? "";
  const currentNotionId = session.user?.notionId ?? "";

  // Super Guide sees every tour; everyone else sees every tour they're
  // assigned to in ANY role slot (guide, chef, driver, logistics) — a
  // person's `role` only picks their default view, not what they can be
  // booked as.
  const [tours, pastTours, teamMembers] = await Promise.all([
    isSuperGuide ? getAllUpcomingTours()  : getToursForPerson(email),
    isSuperGuide ? getAllPastTours()      : getPastToursForPerson(email),
    isSuperGuide ? getTeamMembers() : Promise.resolve([]),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  const todays   = tours.filter((t) => isToday(t.date));
  const upcoming = tours.filter((t) => !isToday(t.date));

  const taskCounts = await getTaskCountsForSales([...tours, ...pastTours].map((t) => t.id), role);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      {/* Header */}
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {isSuperGuide && (
            <Link href="/super-guide" className="text-white/40 hover:text-white transition-colors text-lg leading-none mr-2">
              ←
            </Link>
          )}
          {isChef && (
            <span className="text-xs text-white/50 font-semibold uppercase tracking-widest">Chef</span>
          )}
          <Link href="/">
            <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
           
          />
          </Link>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-sm text-white/70 font-medium">{session.user?.name?.split(" ")[0]}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-xs text-white/40 hover:text-white transition-colors">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Today */}
        {todays.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/80 mb-3">
              Hoje · {todays.length} {todays.length === 1 ? "serviço" : "serviços"}
            </h2>
            <ul className="flex flex-col gap-4">
              {todays.map((tour) => (
                <TodayServiceCard
                  key={tour.id}
                  tour={tour}
                  guideName={teamMap[tour.teamId ?? ""]}
                  isMyTour={tour.teamId === currentNotionId}
                  taskCount={taskCounts[tour.id]}
                  canManageTasks={canManageTasks}
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
            teamMap={isSuperGuide ? teamMap : undefined}
            currentUserId={isSuperGuide ? currentNotionId : undefined}
            taskCounts={taskCounts}
            canManageTasks={canManageTasks}
          />
        </section>
      </main>
    </div>
  );
}
