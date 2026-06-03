import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ProspectingClient } from "@/components/crm/ProspectingClient";

export default async function ProspectingPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

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
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Prospecção IA</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <ProspectingClient />
      </main>
    </div>
  );
}
