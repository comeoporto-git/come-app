import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEventServices, getQuoteList } from "@/lib/eventQuotesData";
import { QuotesHome } from "@/components/quotes/QuotesHome";

export default async function OrcamentosPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin") redirect("/");

  const [quotes, services] = await Promise.all([getQuoteList(), getEventServices()]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <QuotesHome quotes={quotes} services={services} />
      </main>
    </div>
  );
}
