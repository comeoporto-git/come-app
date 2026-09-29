import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTasksForSale } from "@/lib/notion";
import { GeneralTasksBoard } from "@/components/GeneralTasksBoard";

export default async function TarefasPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  // saleId null = general tasks: assigned to a partner, not tied to a booking.
  const tasks = await getTasksForSale(null, session.user.role);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <h1 className="text-sm font-semibold text-[#32373c]">Tarefas</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Tarefas gerais do António, Manel e Bernardo, fora dos serviços
          </p>
        </div>
        <GeneralTasksBoard tasks={tasks} />
      </main>
    </div>
  );
}
