import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTeamMemberById } from "@/lib/notion";
import { ProfileForm } from "@/components/ProfileForm";
import Link from "next/link";
import Image from "next/image";

function backHref(role: string) {
  if (role === "Admin")       return "/admin";
  if (role === "Super Guide") return "/super-guide";
  if (role === "Accountant")  return "/accountant";
  return "/guide"; // Guide, Chef
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const member = await getTeamMemberById(session.user.notionId);
  if (!member) redirect("/login");

  const back = backHref(session.user.role);

  return (
    <div className="min-h-screen bg-[#667470]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={back} className="text-white/40 hover:text-white transition-colors text-lg leading-none">
            ←
          </Link>
          <Link href="/">
            <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
           
          />
          </Link>
          <span className="ml-auto text-xs text-white/50 font-medium uppercase tracking-widest">
            Perfil
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <ProfileForm member={member} />
      </main>
    </div>
  );
}
