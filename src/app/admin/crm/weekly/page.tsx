import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWeeklyActions, getLatestWeeklyActionsWeek } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
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
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/crm" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Ações da Semana</span>
        </div>
      </header>

      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Ações da Semana" }]} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <WeeklyActionsClient actions={actions} weekOf={weekOf} />
      </main>
    </div>
  );
}
