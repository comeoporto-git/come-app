import { auth } from "@/lib/auth";
import { getAllUpcomingTours, getTeamMembers } from "@/lib/notion";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/lib/auth";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default async function AdminToursPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [tours, teamMembers] = await Promise.all([
    getAllUpcomingTours(),
    getTeamMembers(),
  ]);

  // Build a lookup map: teamMember Notion page ID → name
  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  const todays = tours.filter((t) => isToday(t.date));
  const upcoming = tours.filter((t) => !isToday(t.date));

  return (
    <div className="min-h-screen bg-[#EDE6DA] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-lg leading-none">
              ←
            </Link>
            <Image
              src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME"
              width={72}
              height={28}
              className="object-contain invert"
              unoptimized
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Tours</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Today */}
        {todays.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#7b8b87] mb-3">
              Hoje · {todays.length} tour{todays.length !== 1 ? "s" : ""}
            </h2>
            <ul className="space-y-3">
              {todays.map((tour) => (
                <TourCard key={tour.id} tour={tour} guideName={teamMap[tour.teamId ?? ""] ?? "—"} highlight />
              ))}
            </ul>
          </section>
        )}

        {/* Upcoming */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#32373c]/40 mb-3">
            Próximos · {upcoming.length} tour{upcoming.length !== 1 ? "s" : ""}
          </h2>
          {upcoming.length === 0 && todays.length === 0 ? (
            <div className="text-center py-12 text-[#32373c]/40">
              <div className="text-4xl mb-2">🗓️</div>
              <p className="text-sm">Sem tours agendados</p>
            </div>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-[#32373c]/40">Sem tours futuros</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((tour) => (
                <TourCard key={tour.id} tour={tour} guideName={teamMap[tour.teamId ?? ""] ?? "—"} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function TourCard({
  tour,
  guideName,
  highlight,
}: {
  tour: Awaited<ReturnType<typeof getAllUpcomingTours>>[0];
  guideName: string;
  highlight?: boolean;
}) {
  return (
    <Link href={`/guide/tours/${tour.id}`}>
      <li
        className={`rounded-2xl p-4 shadow-sm border transition-all active:scale-[0.98] cursor-pointer ${
          highlight
            ? "bg-[#32373c] text-white border-[#32373c]"
            : "bg-white border-gray-100 text-[#32373c]"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${highlight ? "text-white" : "text-[#32373c]"}`}>
              {tour.saleId}
            </p>
            <p className={`text-xs mt-0.5 ${highlight ? "text-white/60" : "text-gray-500"}`}>
              {formatDate(tour.date)}
            </p>
            {tour.serviceName && (
              <p className={`text-xs mt-0.5 ${highlight ? "text-white/50" : "text-gray-400"}`}>
                {tour.serviceName}
              </p>
            )}
            <p className={`text-xs mt-1 ${highlight ? "text-white/50" : "text-gray-400"}`}>
              🧭 {guideName}
              {tour.numGuests > 0 && ` · ${tour.numGuests} pax`}
            </p>
          </div>
          <div className="ml-3 flex flex-col items-end gap-1">
            {highlight && (
              <span className="text-xs bg-[#7b8b87] text-white px-2 py-0.5 rounded-full font-semibold">
                Hoje
              </span>
            )}
          </div>
        </div>
      </li>
    </Link>
  );
}
