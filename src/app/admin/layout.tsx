import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getFornecedores } from "@/lib/notion";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin" && session.user.role !== "Accountant") redirect("/");

  const fornecedores = await getFornecedores();

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        userName={session.user.name ?? ""}
        userEmail={session.user.email ?? ""}
        userImage={session.user.image ?? null}
        fornecedores={fornecedores}
      />
      <div className="flex-1 md:ml-[220px] pt-12 md:pt-0 min-h-screen bg-[#667470] text-[#32373c]">
        {children}
      </div>
    </div>
  );
}
