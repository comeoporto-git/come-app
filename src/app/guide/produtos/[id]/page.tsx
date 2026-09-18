import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getServiceDetail } from "@/lib/notion";
import { ServiceCatalogDetail } from "@/components/ServiceCatalogDetail";
import Link from "next/link";
import Image from "next/image";

export default async function GuideProdutoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const service = await getServiceDetail(id);
  if (!service) notFound();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/guide/produtos" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-white mb-6">{service.name}</h1>
        <ServiceCatalogDetail service={service} canEdit={false} showAdminSections={false} />
      </main>
    </div>
  );
}
