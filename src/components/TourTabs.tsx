"use client";

import { useState } from "react";
import Link from "next/link";
import type { Tour } from "@/lib/notion";

type Tab = "upcoming" | "past";

const STATUS_COLORS: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending:   "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
  Canceled:  "bg-red-100 text-red-700",
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
    timeZone: "Europe/Lisbon",
  });
}

function dateKey(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-PT", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getDuplicateDates(tours: Tour[]): Set<string> {
  const counts = new Map<string, number>();
  for (const t of tours) {
    const key = dateKey(t.date);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

function TourCard({
  tour,
  past,
  guideName,
  isMyTour,
  hasDuplicate,
}: {
  tour: Tour;
  past?: boolean;
  guideName?: string;
  isMyTour?: boolean;
  hasDuplicate?: boolean;
}) {
  const ts = typeStyle(tour.serviceType);
  const isCanceled = tour.status === "Cancelled";
  return (
    <Link href={`/guide/tours/${tour.id}`}>
      <li
        className={`rounded-2xl overflow-hidden shadow-sm border transition-all active:scale-[0.98] cursor-pointer ${
          isCanceled
            ? "bg-gray-100 border-gray-200 opacity-60"
            : past
              ? "bg-white/60 border-white/20"
              : "bg-white border-gray-100"
        } text-[#32373c] ${isCanceled ? "" : (ts?.border ?? "")} ${hasDuplicate && !isCanceled ? "ring-2 ring-amber-400" : ""}`}
      >
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="flex-1 min-w-0 space-y-1">
            <p className={`text-xs ${past ? "text-[#32373c]/50" : "text-gray-400"}`}>
              {tour.saleId}
            </p>
            <p className={`font-bold text-xs flex items-center gap-1 ${past ? "text-[#32373c]/70" : "text-[#32373c]"}`}>
              {formatDate(tour.date)}
              {tour.startTime && (
                <span>{tour.startTime}{tour.endTime ? ` - ${tour.endTime}` : ""}</span>
              )}
              {hasDuplicate && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold bg-amber-50 px-1.5 py-0 rounded-full text-[10px] leading-5">
                  ⚠ same day
                </span>
              )}
            </p>
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
            {(tour.chefName || tour.driverName) && (
              <p className="text-xs text-gray-400">
                {[
                  tour.chefName ? `🧑‍🍳 ${tour.chefName}` : null,
                  tour.driverName ? `🚗 ${tour.driverName}` : null,
                ].filter(Boolean).join("  ·  ")}
              </p>
            )}
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

type Filters = {
  status: string;
  team: string;
  serviceType: string;
};

const EMPTY_FILTERS: Filters = { status: "", team: "", serviceType: "" };

function filterTours(
  tours: Tour[],
  query: string,
  filters: Filters,
  teamMap?: Record<string, string>,
): Tour[] {
  const q = query.trim().toLowerCase();
  return tours.filter((t) => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.team && (t.teamId ?? "") !== filters.team) return false;
    if (filters.serviceType && t.serviceType !== filters.serviceType) return false;
    if (!q) return true;
    const guideName = teamMap?.[t.teamId ?? ""] ?? "";
    return (
      t.saleId.toLowerCase().includes(q) ||
      (t.serviceName ?? "").toLowerCase().includes(q) ||
      (t.clientName ?? "").toLowerCase().includes(q) ||
      guideName.toLowerCase().includes(q) ||
      (t.chefName ?? "").toLowerCase().includes(q) ||
      (t.driverName ?? "").toLowerCase().includes(q)
    );
  });
}

function uniqueValues(tours: Tour[], key: "status" | "serviceType"): string[] {
  const set = new Set<string>();
  for (const t of tours) {
    if (t[key]) set.add(t[key]);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function uniqueTeamIds(tours: Tour[]): string[] {
  const set = new Set<string>();
  for (const t of tours) {
    if (t.teamId) set.add(t.teamId);
  }
  return Array.from(set);
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
  const [tab, setTab]       = useState<Tab>("upcoming");
  const [query, setQuery]   = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const allTours = [...upcoming, ...past];
  const statusOptions      = uniqueValues(allTours, "status");
  const serviceTypeOptions = uniqueValues(allTours, "serviceType");
  const teamIdOptions      = uniqueTeamIds(allTours);

  const visibleUpcoming = filterTours(upcoming, query, filters, teamMap);
  const visiblePast     = filterTours(past,     query, filters, teamMap);

  const duplicateUpcoming = getDuplicateDates(upcoming);
  const duplicatePast     = getDuplicateDates(past);

  const hasActiveFilters = !!(filters.status || filters.team || filters.serviceType);

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

      {/* Search box */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar serviços…"
          className="w-full bg-white/15 text-white placeholder-white/40 text-sm rounded-xl pl-9 pr-9 py-2.5 focus:outline-none focus:bg-white/25 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="bg-white/15 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:bg-white/25 transition-colors [&>option]:text-[#32373c]"
        >
          <option value="">Status: Todos</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filters.team}
          onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}
          className="bg-white/15 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:bg-white/25 transition-colors [&>option]:text-[#32373c]"
        >
          <option value="">Equipa: Todas</option>
          {teamIdOptions.map((id) => (
            <option key={id} value={id}>{teamMap?.[id] ?? id}</option>
          ))}
        </select>

        <select
          value={filters.serviceType}
          onChange={(e) => setFilters((f) => ({ ...f, serviceType: e.target.value }))}
          className="bg-white/15 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:bg-white/25 transition-colors [&>option]:text-[#32373c]"
        >
          <option value="">Tipo: Todos</option>
          {serviceTypeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-xs text-white/60 hover:text-white/90 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* List */}
      {tab === "upcoming" ? (
        visibleUpcoming.length === 0 ? (
          <p className="text-sm text-white/50 text-center py-8">
            {query ? "Sem resultados" : "Sem serviços futuros"}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {visibleUpcoming.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                guideName={teamMap?.[tour.teamId ?? ""]}
                isMyTour={!!currentUserId && tour.teamId === currentUserId}
                hasDuplicate={duplicateUpcoming.has(dateKey(tour.date))}
              />
            ))}
          </ul>
        )
      ) : visiblePast.length === 0 ? (
        <p className="text-sm text-white/30 text-center py-8">
          {query ? "Sem resultados" : "Sem serviços anteriores"}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visiblePast.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              past
              guideName={teamMap?.[tour.teamId ?? ""]}
              isMyTour={!!currentUserId && tour.teamId === currentUserId}
              hasDuplicate={duplicatePast.has(dateKey(tour.date))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
