import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAnalyticsTours } from "@/lib/notion";

/** Opens the deep dive of the most-booked service. */
export default async function ServiceDeepDiveIndex() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");
  const tours = await getAnalyticsTours();
  const counts = new Map<string, number>();
  for (const t of tours) if (t.service) counts.set(t.service, (counts.get(t.service) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  redirect(top ? `/admin/analytics/servicos/${top}` : "/admin/analytics");
}
