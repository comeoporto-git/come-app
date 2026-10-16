import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getTasksForSale, getPartnerServiceTasks } from "@/lib/notion";
import { GeneralTasksBoard } from "@/components/GeneralTasksBoard";

export default async function SuperGuideTarefasPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") redirect("/");

  const [tasks, serviceTasks] = await Promise.all([
    // saleId null = general tasks: assigned to a partner, not tied to a booking.
    getTasksForSale(null, session.user.role),
    getPartnerServiceTasks(),
  ]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/super-guide" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Tarefas</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <h1 className="text-sm font-semibold text-[#32373c]">Tarefas</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Tarefas do António, Manel e Bernardo: gerais e dos serviços
          </p>
        </div>
        <GeneralTasksBoard tasks={tasks} serviceTasks={serviceTasks} />
      </main>
    </div>
  );
}
