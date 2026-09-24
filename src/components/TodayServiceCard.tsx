"use client";

import Link from "next/link";
import type { Tour, TaskCount } from "@/lib/notion";
import { roleNames } from "@/lib/tourTeam";
import { useServiceTasks, ServiceTaskBadge, ServiceTaskPanel } from "@/components/ServiceCardTasks";

const STATUS_COLORS: Record<string, string> = {
  Confirmed: "bg-green-100 text-green-700",
  Pending:   "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
  Canceled:  "bg-red-100 text-red-700",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Lisbon",
  });
}

/** The "Hoje" card, shared by the admin/super-guide/guide services pages so the task badge + expand logic lives in one place. */
export function TodayServiceCard({
  tour,
  guideName,
  chefName,
  driverName,
  logisticsName,
  isMyTour,
  taskCount,
  canManageTasks,
}: {
  tour: Tour;
  guideName?: string;
  chefName?: string;
  driverName?: string;
  logisticsName?: string;
  isMyTour?: boolean;
  taskCount?: TaskCount;
  canManageTasks: boolean;
}) {
  const isCancelled = tour.status === "Cancelled" || tour.status === "Canceled";
  const guides    = roleNames(tour, "Guide", guideName);
  const chefs     = roleNames(tour, "Chef", chefName);
  const drivers   = roleNames(tour, "Driver", driverName);
  const logistics = roleNames(tour, "Logistics", logisticsName);
  const { expanded, tasks, loading, count, toggle, updateTasks } = useServiceTasks(
    tour.id,
    taskCount ?? { done: 0, total: 0 },
  );

  return (
    <li
      className={`rounded-2xl overflow-hidden shadow-sm border ${
        isCancelled
          ? "bg-gray-100 border-gray-200 opacity-60 text-[#32373c]"
          : "bg-[#32373c] border-[#32373c] text-white"
      }`}
    >
      <Link href={`/guide/tours/${tour.id}`} className="block transition-all active:scale-[0.98] cursor-pointer">
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="font-semibold text-sm">{tour.saleId}</p>
            <p className="text-xs opacity-60">
              {formatDate(tour.date)}
              {tour.startTime && <span> {tour.startTime}{tour.endTime ? ` - ${tour.endTime}` : ""}</span>}
            </p>
            {tour.serviceName && <p className="text-xs opacity-60">{tour.serviceName}</p>}
            {guides ? (
              <p className={`text-xs ${isMyTour ? "font-bold" : "opacity-50"}`}>
                🧭 {guides}{tour.numGuests > 0 ? ` · ${tour.numGuests} pax` : ""}
              </p>
            ) : tour.numGuests > 0 ? (
              <p className="text-xs opacity-50">{tour.numGuests} pax</p>
            ) : null}
            {(chefs || drivers || logistics) && (
              <p className="text-xs opacity-50">
                {[
                  chefs ? `🧑‍🍳 ${chefs}` : null,
                  drivers ? `🚗 ${drivers}` : null,
                  logistics ? `📦 ${logistics}` : null,
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
            {count.total > 0 && (
              <ServiceTaskBadge done={count.done} total={count.total} expanded={expanded} onClick={toggle} dark={!isCancelled} />
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
