"use server";

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getServiceTypesList, getClientsList, createNewClient, createSale } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import NewServiceForm from "./NewServiceForm";

export default async function NovoServicoPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin") redirect("/admin/gestao-servicos");

  const [serviceTypes, clients] = await Promise.all([
    getServiceTypesList(),
    getClientsList(),
  ]);

  async function handleCreate(formData: FormData) {
    "use server";

    const serviceId   = (formData.get("serviceId")   as string)?.trim();
    const date        = (formData.get("date")         as string)?.trim();
    if (!serviceId || !date) return;

    const startTime   = (formData.get("startTime")   as string)?.trim() || undefined;
    const endTime     = (formData.get("endTime")      as string)?.trim() || undefined;
    const numGuests   = parseInt(formData.get("numGuests") as string);
    const newClientName = (formData.get("newClientName") as string)?.trim();
    let clientId      = (formData.get("clientId")    as string)?.trim() || undefined;

    if (newClientName) {
      clientId = await createNewClient(newClientName);
    }

    await createSale({
      serviceId,
      date,
      startTime,
      endTime,
      clientId,
      status:       (formData.get("status")       as string) || "Pending",
      notionId:     (formData.get("notionId")      as string)?.trim() || undefined,
      numGuests:    isNaN(numGuests) ? null : numGuests,
      meetingPoint: (formData.get("meetingPoint")  as string)?.trim() || undefined,
      notes:        (formData.get("notes")         as string)?.trim() || undefined,
      phoneNumber:  (formData.get("phoneNumber")   as string)?.trim() || undefined,
      names:        (formData.get("names")         as string)?.trim() || undefined,
    });

    redirect("/admin/servicos");
  }

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/gestao-servicos" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Novo Serviço</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <NewServiceForm serviceTypes={serviceTypes} clients={clients} action={handleCreate} />
      </main>
    </div>
  );
}
