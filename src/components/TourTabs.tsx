"use client";

import { useState } from "react";
import Link from "next/link";
import type { Tour } from "@/lib/notion";

type Tab = "upcoming" | "past";

const STATUS_COLORS: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending:   "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
};

const TYPE_PALETTE = [
  { border: "border-l-4 border-l-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
  { border: "border-l-4 border-l-orange-400",  badge: "bg-orange-100 text-orange-700" },
  { border: "border-l-4 border-l-blue-400",    badge: "bg-blue-100 text-blue-700" },
  { border: "border-l-4 border-l-violet-400",  badge: "bg-violet-100 text-violet-700" },
  { border: "border-l-4 border-l-rose-400",    badge: "bg-rose-100 text-rose-700" },
  { border: "border-l-4 border-l-amber-400",   badge: "bg-amber-100 text-amber-700" },
];

function typeStyle(type: string) {
  if (!type) return null;
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return TYPE_PALETTE[h % TYPE_PALETTE.length];
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

function TourCard({
  tour,
  past,
  guideName,
  isMyTour,
}: {
  tour: Tour;
  past?: boolean;
  guideName?: string;
  isMyTour?: boolean;
}) {
  const ts = typeStyle(tour.serviceType);
  return (
    <Link href={`/guide/tours/${tour.id}`}>
      <li
        className={`rounded-2xl overflow-hidden shadow-sm border transition-all active:scale-[0.98] cursor-pointer ${
          past ? "bg-white/60 border-white/20" : "bg-white border-gray-100"
        } text-[#32373c] ${ts?.border ?? ""}`}
      >
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="flex-1 min-w-0 space-y-1">
            <p className={`font-semibold text-sm ${past ? "text-[#32373c]/70" : "text-[#32373c]"}`}>
              {tour.saleId}
            </p>
            <p className="text-xs text-gray-500">{formatDate(tour.date)}</p>
            {tour.serviceName && (
              <p className="text-xs text-gray-600">{tour.serviceName}</p>
            )}
            {guideName && guideName !== "—" ? (
              <p className={`text-xs ${isMyTour ? "text-[#32373c] font-bold" : "text-gray-400"}`}>
                🧭 {guideName}{tour.numGuests > 0 ? ` · ${tour.numGuests} pax` : ""}
              </p>
            ) : tour.numGuests > 0 ? (
              <p className="text-xs text-gray-400">{tour.numGuests} pax</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {ts && tour.serviceType && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ts.badge}`}>
                {tour.serviceType}
              </span>
            )}
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
}

export function TourTabs({
  upcoming,
  past,
  teamMap,
  currentUserId,
}: {
  upcoming: Tour[];
  past: Tour[];
  teamMap?: Record<string, string>;
  currentUserId?: string;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("upcoming")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "upcoming"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Próximas{upcoming.length > 0 ? ` · ${upcoming.length}` : ""}
        </button>
        <button
          onClick={() => setTab("past")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "past"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Anteriores{past.length > 0 ? ` · ${past.length}` : ""}
        </button>
      </div>

      {/* List */}
      {tab === "upcoming" ? (
        upcoming.length === 0 ? (
          <p className="text-sm text-white/50 text-center py-8">Sem serviços futuros</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {upcoming.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                guideName={teamMap?.[tour.teamId ?? ""]}
                isMyTour={!!currentUserId && tour.teamId === currentUserId}
              />
            ))}
          </ul>
        )
      ) : past.length === 0 ? (
        <p className="text-sm text-white/30 text-center py-8">Sem serviços anteriores</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {past.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              past
              guideName={teamMap?.[tour.teamId ?? ""]}
              isMyTour={!!currentUserId && tour.teamId === currentUserId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
