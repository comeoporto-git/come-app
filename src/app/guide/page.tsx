import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";

export default async function GuideHome() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  const firstName = session.user?.name?.split(" ")[0] ?? "";

  // Super Guides have their own home at /super-guide
  if (role === "Super Guide") redirect("/guide/services");

  return (
    <div className="min-h-screen bg-[#667470]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME"
            width={72}
            height={28}
            className="object-contain invert"
            unoptimized
          />
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70 font-medium">{firstName}</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10">
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/guide/services", icon: "🗓️", label: "Os meus Serviços" },
            { href: "/profile",        icon: "👤", label: "Perfil" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center gap-3 hover:border-[#667470]/30 active:scale-[0.98] transition-all text-center"
            >
              <span className="text-3xl">{item.icon}</span>
              <span className="text-sm font-semibold text-[#32373c]">{item.label}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
