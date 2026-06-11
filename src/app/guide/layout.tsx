import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getFornecedores } from "@/lib/notion";
import { AiChat } from "@/components/AiChat";

export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin = session.user.role === "Admin";

  const fornecedores = isAdmin ? await getFornecedores() : [];

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {isAdmin && (
        <AdminSidebar
          userName={session.user.name ?? ""}
          userEmail={session.user.email ?? ""}
          userImage={session.user.image ?? null}
          fornecedores={fornecedores}
        />
      )}
      <div className={`flex-1 min-w-0 ${isAdmin ? "md:ml-[220px] pt-12 md:pt-0" : ""} min-h-screen`}>
        {children}
      </div>
      {isAdmin && <AiChat />}
    </div>
  );
}
