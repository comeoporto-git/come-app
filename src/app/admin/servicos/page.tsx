import { auth } from "@/lib/auth";
import { getAllUpcomingTours, getAllPastTours, getTeamMembers } from "@/lib/notion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TourTabs } from "@/components/TourTabs";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Lisbon",
  });
}

function isToday(iso: string | null): boolean {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}

const STATUS_COLORS: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending:   "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
};

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
              {todays.map((tour) => {
                const guideName = teamMap[tour.teamId ?? ""];
                return (
                  <Link key={tour.id} href={`/guide/tours/${tour.id}`}>
                    <li className={`rounded-2xl p-5 shadow-sm border transition-all active:scale-[0.98] cursor-pointer ${
                      tour.status === "Cancelled"
                        ? "bg-gray-100 border-gray-200 opacity-60 text-[#32373c]"
                        : "bg-[#32373c] border-[#32373c] text-white"
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="font-semibold text-sm">{tour.saleId}</p>
                          <p className="text-xs opacity-60">
                            {formatDate(tour.date)}
                            {tour.startTime && <span> {tour.startTime}{tour.endTime ? ` - ${tour.endTime}` : ""}</span>}
                          </p>
                          {tour.serviceName && (
                            <p className="text-xs opacity-60">{tour.serviceName}</p>
                          )}
                          {guideName && (
                            <p className="text-xs opacity-50">
                              🧭 {guideName}{tour.numGuests > 0 ? ` · ${tour.numGuests} pax` : ""}
                            </p>
                          )}
                          {(tour.chefName || tour.driverName) && (
                            <p className="text-xs opacity-50">
                              {[
                                tour.chefName ? `🧑‍🍳 ${tour.chefName}` : null,
                                tour.driverName ? `🚗 ${tour.driverName}` : null,
                              ].filter(Boolean).join("  ·  ")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="text-xs bg-[#7b8b87] text-white px-2 py-0.5 rounded-full font-semibold">
                            Hoje
                          </span>
                          {tour.status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[tour.status] ?? "bg-gray-100 text-gray-500"}`}>
                              {tour.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  </Link>
                );
              })}
            </ul>
          </section>
        )}

        {/* Tabs: Próximas / Anteriores */}
        <section>
          <TourTabs
            upcoming={upcoming}
            past={pastTours}
            teamMap={teamMap}
            showFilters={session.user.role === "Admin"}
          />
        </section>
      </main>
    </div>
  );
}
