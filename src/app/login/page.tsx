import { signIn } from "@/lib/auth";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session) {
    const role = session.user?.role;
    if (role === "Guide") redirect("/guide");
    if (role === "Chef") redirect("/guide");
    if (role === "Super Guide") redirect("/super-guide");
    if (role === "Accountant") redirect("/accountant");
    if (role === "Admin") redirect("/admin");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#111010] p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-7">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <Image
              src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME Porto Food Tours"
              width={140}
              height={56}
              className="object-contain"
              unoptimized
            />
            <p className="text-xs tracking-widest uppercase text-gray-400 font-semibold">
              Business OS
            </p>
          </div>

          {params.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {params.error === "AccessDenied"
                ? "Acesso negado. O teu email não está registado."
                : "Ocorreu um erro. Tenta novamente."}
            </div>
          )}

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-[#32373c] hover:bg-[#1a2018] transition-colors rounded-xl px-4 py-3.5 text-sm font-semibold text-white shadow-sm"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#fff" fillOpacity=".9" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#fff" fillOpacity=".75" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#fff" fillOpacity=".6" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#fff" fillOpacity=".5" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com Google
            </button>
          </form>

          <p className="text-center text-xs text-gray-400">
            Apenas contas autorizadas têm acesso.
          </p>
        </div>
      </div>
    </main>
  );
}
