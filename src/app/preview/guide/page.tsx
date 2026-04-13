/**
 * PREVIEW ONLY — remove before deploying to production.
 * Shows the Guide dashboard with mock data, no auth required.
 */
import Image from "next/image";
import Link from "next/link";

const MOCK_TOURS = [
  {
    id: "tour-1",
    service: "Porto Food & Wine Tour",
    date: new Date().toISOString(),
    saleId: "FT-2024-089",
    client: "Smith Family",
    numUsers: 4,
    restrictions: ["Sem Glúten", "Vegetariano"],
    highlight: true,
  },
  {
    id: "tour-2",
    service: "Hidden Gems Tasting",
    date: new Date(Date.now() + 86400000).toISOString(),
    saleId: "FT-2024-090",
    client: "Johnson Group",
    numUsers: 6,
    restrictions: [],
    highlight: false,
  },
  {
    id: "tour-3",
    service: "Francesinha & Beer Tour",
    date: new Date(Date.now() + 2 * 86400000).toISOString(),
    saleId: "FT-2024-091",
    client: "Müller",
    numUsers: 2,
    restrictions: ["Halal"],
    highlight: false,
  },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PreviewGuidePage() {
  const todays = MOCK_TOURS.filter((t) => t.highlight);
  const upcoming = MOCK_TOURS.filter((t) => !t.highlight);

  return (
    <div className="min-h-screen bg-[#EDE6DA]">
      {/* Header */}
      <header className="bg-[#667470] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
            unoptimized
          />
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70 font-medium">Ana</span>
            <span className="text-xs text-white/40">Sair</span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Today */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#667470] mb-3">
            Hoje
          </h2>
          <ul className="space-y-3">
            {todays.map((tour) => (
              <li
                key={tour.id}
                className="rounded-2xl p-4 shadow-sm border bg-[#32373c] text-white border-[#32373c] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white">{tour.service}</p>
                    <p className="text-xs mt-0.5 text-white/60">{formatDate(tour.date)}</p>
                    <p className="text-xs mt-1 truncate text-white/60">
                      {tour.client} · {tour.numUsers} pax
                    </p>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-1">
                    {tour.restrictions.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                        ⚠️ {tour.restrictions.length} restrição
                      </span>
                    )}
                    <span className="text-xs bg-[#667470] text-white px-2 py-0.5 rounded-full font-semibold">
                      Hoje
                    </span>
                    <span className="text-xs text-white/40">{tour.saleId}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Upcoming */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#32373c]/40 mb-3">
            Próximos
          </h2>
          <ul className="space-y-3">
            {upcoming.map((tour) => (
              <li
                key={tour.id}
                className="rounded-2xl p-4 shadow-sm border bg-white border-gray-100 text-[#32373c] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#32373c]">{tour.service}</p>
                    <p className="text-xs mt-0.5 text-gray-500">{formatDate(tour.date)}</p>
                    <p className="text-xs mt-1 truncate text-gray-500">
                      {tour.client} · {tour.numUsers} pax
                    </p>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-1">
                    {tour.restrictions.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                        ⚠️ {tour.restrictions.length} restrição
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{tour.saleId}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Preview banner */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#667470] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
        Preview Mode — Guide Dashboard
      </div>
    </div>
  );
}
