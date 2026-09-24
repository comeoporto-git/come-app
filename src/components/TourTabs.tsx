"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Tour, TaskCount } from "@/lib/notion";
import { roleNames } from "@/lib/tourTeam";
import { useServiceTasks, ServiceTaskBadge, ServiceTaskPanel } from "@/components/ServiceCardTasks";
import { ServiceCalendar } from "@/components/ServiceCalendar";

type Tab = "upcoming" | "past";
type View = "list" | "calendar";

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
  taskCount,
  canManageTasks,
}: {
  tour: Tour;
  past?: boolean;
  guideName?: string;
  isMyTour?: boolean;
  hasDuplicate?: boolean;
  taskCount?: TaskCount;
  canManageTasks: boolean;
}) {
  const ts = typeStyle(tour.serviceType);
  const isCanceled = tour.status === "Cancelled";
  const guides    = roleNames(tour, "Guide", guideName);
  const chefs     = roleNames(tour, "Chef", tour.chefName);
  const drivers   = roleNames(tour, "Driver", tour.driverName);
  const logistics = roleNames(tour, "Logistics", tour.logisticsName);
  const { expanded, tasks, loading, count, toggle, updateTasks } = useServiceTasks(
    tour.id,
    taskCount ?? { done: 0, total: 0 },
  );
  return (
    <li
      className={`rounded-2xl overflow-hidden shadow-sm border ${
        isCanceled
          ? "bg-gray-100 border-gray-200 opacity-60"
          : past
            ? "bg-white/60 border-white/20"
            : "bg-white border-gray-100"
      } text-[#32373c] ${isCanceled ? "" : (ts?.border ?? "")} ${hasDuplicate && !isCanceled ? "ring-2 ring-amber-400" : ""}`}
    >
      <Link href={`/guide/tours/${tour.id}`} className="block transition-all active:scale-[0.98] cursor-pointer">
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
            {guides ? (
              <p className={`text-xs ${isMyTour ? "text-[#32373c] font-bold" : "text-gray-400"}`}>
                🧭 {guides}{tour.numGuests > 0 ? ` · ${tour.numGuests} pax` : ""}
              </p>
            ) : tour.numGuests > 0 ? (
              <p className="text-xs text-gray-400">{tour.numGuests} pax</p>
            ) : null}
            {(chefs || drivers || logistics) && (
              <p className="text-xs text-gray-400">
                {[
                  chefs ? `🧑‍🍳 ${chefs}` : null,
                  drivers ? `🚗 ${drivers}` : null,
                  logistics ? `📦 ${logistics}` : null,
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
            {count.total > 0 && (
              <ServiceTaskBadge done={count.done} total={count.total} expanded={expanded} onClick={toggle} />
            )}
          </div>
        </div>
      </Link>
      {expanded && (
        <ServiceTaskPanel
          tourId={tour.id}
          tasks={tasks}
          loading={loading}
          canManage={canManageTasks}
          onTasksChange={updateTasks}
        />
      )}
    </li>
  );
}

type Filters = {
  status: string[];
  team: string[];
  serviceType: string[];
};

const EMPTY_FILTERS: Filters = { status: [], team: [], serviceType: [] };

function filterTours(
  tours: Tour[],
  query: string,
  filters: Filters,
  teamMap?: Record<string, string>,
): Tour[] {
  const q = query.trim().toLowerCase();
  return tours.filter((t) => {
    if (filters.status.length && !filters.status.includes(t.status)) return false;
    if (filters.team.length && !tourMemberIds(t).some((id) => filters.team.includes(id))) return false;
    if (filters.serviceType.length && !filters.serviceType.includes(t.serviceType)) return false;
    if (!q) return true;
    const guideName = teamMap?.[t.teamId ?? ""] ?? "";
    return (
      t.saleId.toLowerCase().includes(q) ||
      (t.serviceName ?? "").toLowerCase().includes(q) ||
      (t.clientName ?? "").toLowerCase().includes(q) ||
      guideName.toLowerCase().includes(q) ||
      (t.chefName ?? "").toLowerCase().includes(q) ||
      (t.driverName ?? "").toLowerCase().includes(q) ||
      (t.logisticsName ?? "").toLowerCase().includes(q) ||
      t.extraTeam.some((m) => m.name.toLowerCase().includes(q))
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

// Everyone assigned to the service, whatever their role (guide, chef, driver, logistics).
function tourMemberIds(t: Tour): string[] {
  return [t.guideId, t.chefId, t.driverId, t.logisticsId, ...t.extraTeam.map((m) => m.teamId)]
    .filter((id): id is string => !!id);
}

function uniqueTeamMembers(tours: Tour[], teamMap?: Record<string, string>): { value: string; label: string }[] {
  // Start from the full team roster so every member is selectable, then add anyone
  // assigned on a service who isn't in the roster.
  const names = new Map<string, string>(Object.entries(teamMap ?? {}));
  for (const t of tours) {
    const roleNames: [string | null, string][] = [
      [t.guideId, t.guideName],
      [t.chefId, t.chefName],
      [t.driverId, t.driverName],
      [t.logisticsId, t.logisticsName],
      ...t.extraTeam.map((m): [string, string] => [m.teamId, m.name]),
    ];
    for (const [id, name] of roleNames) {
      if (id && !names.has(id)) names.set(id, teamMap?.[id] ?? (name || id));
    }
  }
  return Array.from(names, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

// Lowercase and strip accents so "antao" matches "Antão".
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const needle = normalize(search.trim());
  const visibleOptions = needle
    ? options.filter((o) => normalize(o.label).includes(needle))
    : options;

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  const buttonText =
    selected.length === 0
      ? `${label}: Todos`
      : selected.length === 1
        ? `${label}: ${options.find((o) => o.value === selected[0])?.label ?? selected[0]}`
        : `${label}: ${selected.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setSearch("");
        }}
        className={`flex items-center gap-1.5 text-sm rounded-xl px-3 py-2 transition-colors ${
          selected.length > 0
            ? "bg-white text-[#32373c]"
            : "bg-white/15 text-white hover:bg-white/25"
        }`}
      >
        {buttonText}
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 min-w-[10rem] bg-white text-[#32373c] rounded-xl shadow-lg border border-gray-100 py-1 max-h-64 overflow-y-auto">
          {searchable && (
            <div className="sticky top-0 bg-white px-2 pt-1 pb-1.5 border-b border-gray-100">
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar…"
                className="w-full text-sm rounded-lg bg-gray-50 px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          )}
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-1.5 text-sm text-gray-400">{options.length === 0 ? "Sem opções" : "Sem resultados"}</p>
          ) : (
            visibleOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="accent-[#32373c]"
                />
                {opt.label}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TourTabs({
  today = [],
  upcoming,
  past,
  teamMap,
  currentUserId,
  showFilters = false,
  taskCounts,
  canManageTasks = false,
}: {
  /** Today's services — rendered separately above the list, but included in the calendar. */
  today?: Tour[];
  upcoming: Tour[];
  past: Tour[];
  teamMap?: Record<string, string>;
  currentUserId?: string;
  showFilters?: boolean;
  taskCounts?: Record<string, TaskCount>;
  canManageTasks?: boolean;
}) {
  const [tab, setTab]       = useState<Tab>("upcoming");
  const [query, setQuery]   = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showCancelled, setShowCancelled] = useState(false);
  const [view, setView] = useState<View>("list");

  const allTours = [...upcoming, ...past];
  const statusOptions      = uniqueValues(allTours, "status");
  const serviceTypeOptions = uniqueValues(allTours, "serviceType");
  const teamOptions        = uniqueTeamMembers(allTours, teamMap);

  const activeFilters = showFilters ? filters : EMPTY_FILTERS;
  const hideCancelled = showFilters && !showCancelled;
  function excludeCancelledIfHidden(list: Tour[]): Tour[] {
    return hideCancelled ? list.filter((t) => t.status !== "Cancelled" && t.status !== "Canceled") : list;
  }

  const baseUpcoming = excludeCancelledIfHidden(upcoming);
  const basePast     = excludeCancelledIfHidden(past);
  const visibleUpcoming = filterTours(baseUpcoming, query, activeFilters, teamMap);
  const visiblePast     = filterTours(basePast,     query, activeFilters, teamMap);

  const calendarTours = filterTours(excludeCancelledIfHidden([...today, ...upcoming, ...past]), query, activeFilters, teamMap);

  const duplicateUpcoming = getDuplicateDates(baseUpcoming);
  const duplicatePast     = getDuplicateDates(basePast);

  const hasActiveFilters =
    filters.status.length > 0 || filters.team.length > 0 || filters.serviceType.length > 0;

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      {view === "list" && (
      <div className="flex gap-2">
        <button
          onClick={() => setTab("upcoming")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "upcoming"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Próximas{baseUpcoming.length > 0 ? ` · ${baseUpcoming.length}` : ""}
        </button>
        <button
          onClick={() => setTab("past")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "past"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Anteriores{basePast.length > 0 ? ` · ${basePast.length}` : ""}
        </button>
      </div>
      )}

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

      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-white/15 rounded-xl p-0.5" role="group" aria-label="Vista">
          {([
            ["list", "Lista", <path key="p" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />],
            ["calendar", "Calendário", <g key="g"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></g>],
          ] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={`flex items-center gap-1.5 text-sm rounded-[10px] px-3 py-1.5 transition-colors ${
                view === value ? "bg-white text-[#32373c] shadow-sm" : "text-white/80 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
              {label}
            </button>
          ))}
        </div>

      {showFilters && (
        <>
          <MultiSelectDropdown
            label="Status"
            options={statusOptions.map((s) => ({ value: s, label: s }))}
            selected={filters.status}
            onChange={(values) => setFilters((f) => ({ ...f, status: values }))}
          />

          <MultiSelectDropdown
            label="Equipa"
            options={teamOptions}
            searchable
            selected={filters.team}
            onChange={(values) => setFilters((f) => ({ ...f, team: values }))}
          />

          <MultiSelectDropdown
            label="Tipo"
            options={serviceTypeOptions.map((t) => ({ value: t, label: t }))}
            selected={filters.serviceType}
            onChange={(values) => setFilters((f) => ({ ...f, serviceType: values }))}
          />

          <label className="flex items-center gap-1.5 text-sm text-white/70 pl-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="accent-white"
            />
            Mostrar Serviços Cancelados
          </label>

          {hasActiveFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-xs text-white/60 hover:text-white/90 underline"
            >
              Limpar filtros
            </button>
          )}
        </>
      )}
      </div>

      {/* List / calendar */}
      {view === "calendar" ? (
        <ServiceCalendar tours={calendarTours} />
      ) : tab === "upcoming" ? (
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
                taskCount={taskCounts?.[tour.id]}
                canManageTasks={canManageTasks}
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
              taskCount={taskCounts?.[tour.id]}
              canManageTasks={canManageTasks}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
