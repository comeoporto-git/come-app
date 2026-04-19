import { auth } from "@/lib/auth";
import {
  getToursForGuide,
  getPastToursForGuide,
  getToursForChef,
  getPastToursForChef,
  getAllUpcomingTours,
  getAllPastTours,
  getTeamMembers,
} from "@/lib/notion";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import Image from "next/image";
import { TourTabs } from "@/components/TourTabs";

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
}

const STATUS_COLORS: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending:   "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default async function GuideDashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  const isSuperGuide = role === "Super Guide";
  const isChef = role === "Chef";
  const email = session.user?.email ?? "";
  const currentNotionId = session.user?.notionId ?? "";

  // Super Guide sees all tours; Chef sees chef-assigned; Guide sees own tours
  const [tours, pastTours, teamMembers] = await Promise.all([
    isSuperGuide ? getAllUpcomingTours()  :
    isChef       ? getToursForChef(email) :
                   getToursForGuide(email),
    isSuperGuide ? getAllPastTours()          :
    isChef       ? getPastToursForChef(email) :
                   getPastToursForGuide(email),
    isSuperGuide ? getTeamMembers() : Promise.resolve([]),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  const todays   = tours.filter((t) => isToday(t.date));
  const upcoming = tours.filter((t) => !isToday(t.date));

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      {/* Header */}
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
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

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Today */}
        {todays.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/80 mb-3">
              Hoje · {todays.length} {todays.length === 1 ? "serviço" : "serviços"}
            </h2>
            <ul className="flex flex-col gap-4">
              {todays.map((tour) => {
                const guideName = teamMap[tour.teamId ?? ""];
                const isMyTour = tour.teamId === currentNotionId;
                return (
                  <Link key={tour.id} href={`/guide/tours/${tour.id}`}>
                    <li className="rounded-2xl p-5 shadow-sm border bg-[#32373c] border-[#32373c] text-white transition-all active:scale-[0.98] cursor-pointer">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="font-semibold text-sm text-white">{tour.saleId}</p>
                          <p className="text-xs text-white/60">{formatDate(tour.date)}</p>
                          {tour.serviceName && (
                            <p className="text-xs text-white/60">{tour.serviceName}</p>
                          )}
                          {guideName && (
                            <p className={`text-xs ${isMyTour ? "text-white font-bold" : "text-white/50"}`}>
                              🧭 {guideName}{tour.numGuests > 0 ? ` · ${tour.numGuests} pax` : ""}
                            </p>
                          )}
                          {!guideName && tour.numGuests > 0 && (
                            <p className="text-xs text-white/50">{tour.numGuests} pax</p>
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
            teamMap={isSuperGuide ? teamMap : undefined}
            currentUserId={isSuperGuide ? currentNotionId : undefined}
          />
        </section>
      </main>
    </div>
  );
}
