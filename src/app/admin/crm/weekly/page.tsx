import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWeeklyActions, getLatestWeeklyActionsWeek } from "@/lib/notion";
import { WeeklyActionsClient } from "@/components/crm/WeeklyActionsClient";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";

function getMondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

export default async function WeeklyActionsPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const thisMonday = getMondayOfThisWeek();
  const latestWeek = await getLatestWeeklyActionsWeek();
  const weekOf = latestWeek ?? thisMonday;

  const actions = await getWeeklyActions(weekOf);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Ações da Semana" }]} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <WeeklyActionsClient actions={actions} weekOf={weekOf} />
      </main>
    </div>
  );
}
