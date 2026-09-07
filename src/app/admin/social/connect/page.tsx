import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/notion";
import { getDriveToken } from "@/lib/google-drive";
import { connectDriveFolder } from "@/actions/social";
import { SocialBreadcrumb } from "@/components/social/SocialBreadcrumb";

const DRIVE_CONNECTION_ID = "00000000-0000-0000-0000-000000000002";

async function authorizeDrive() {
  "use server";
  // prompt:consent forces Google to show the scope screen and return a
  // fresh token that includes drive.readonly even for returning users.
  // scope is passed explicitly here since the base login flow only requests
  // openid/email/profile (drive.readonly is a sensitive scope requiring
  // Google verification, so it's only requested for admins who need it).
  await signIn(
    "google",
    { redirectTo: "/admin/social/connect" },
    { prompt: "consent", scope: "openid email profile https://www.googleapis.com/auth/drive.readonly" }
  );
}

export default async function SocialConnectPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [tokenResult, { data: connection }] = await Promise.all([
    getDriveToken(session.user.googleAccessToken, session.user.id),
    supabase
      .from("social_drive_connection")
      .select("folder_id, folder_name")
      .eq("id", DRIVE_CONNECTION_ID)
      .maybeSingle(),
  ]);

  if (tokenResult.status === "api_disabled") {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <SocialBreadcrumb crumbs={[{ label: "Ligar Google Drive" }]} />
        <main className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm text-3xl">⚙️</div>
          <div>
            <h1 className="text-xl font-bold text-white">Google Drive API não está ativa</h1>
            <p className="text-white/70 text-sm mt-2 max-w-sm">
              A Google Drive API precisa de ser ativada no Google Cloud Console para este projeto.
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 text-left text-sm text-[#32373c] space-y-2 w-full max-w-sm">
            <p className="font-semibold">Como ativar:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Vai a <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" className="text-blue-600 underline">Google Cloud Console → Drive API</a></li>
              <li>Clica em <strong>Enable</strong></li>
              <li>Volta aqui e clica em Re-autorizar</li>
            </ol>
          </div>
          <form action={authorizeDrive}>
            <button type="submit" className="text-sm font-medium bg-white text-[#32373c] px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors">
              Re-autorizar após ativar API
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (tokenResult.status === "no_token" || tokenResult.status === "no_scope") {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <SocialBreadcrumb crumbs={[{ label: "Ligar Google Drive" }]} />
        <main className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 48 48" className="w-9 h-9">
              <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Autorizar acesso ao Google Drive</h1>
            <p className="text-white/70 text-sm mt-2 max-w-sm">
              {tokenResult.status === "no_scope"
                ? "A tua sessão Google não inclui permissão para ler o Drive. Clica em autorizar para adicionar o acesso."
                : "Nenhum token Google encontrado. Inicia sessão com Google para ligar o Drive."}
            </p>
          </div>
          <form action={authorizeDrive}>
            <button
              type="submit"
              className="flex items-center gap-2 bg-white hover:bg-gray-50 text-[#32373c] text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 transition-colors"
            >
              Autorizar Google Drive
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (tokenResult.status === "error") {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <SocialBreadcrumb crumbs={[{ label: "Ligar Google Drive" }]} />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-white/70 text-sm">Erro ao ligar ao Google Drive. Tenta novamente mais tarde.</p>
        </main>
      </div>
    );
  }

  // ── Status: ok — token works, show the folder form ─────────────────────────
  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <SocialBreadcrumb crumbs={[{ label: "Ligar Google Drive" }]} />
      <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="text-white font-bold text-lg">Ligar pasta do Google Drive</h1>
          <p className="text-white/60 text-sm mt-1">
            As fotos desta pasta (e todas as subpastas) serão analisadas e mostradas no ecrã de revisão.
          </p>
        </div>

        <form action={saveFolder} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">ID da pasta</label>
            <input
              name="folderId"
              required
              defaultValue={connection?.folder_id ?? ""}
              placeholder="ex: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
              className="mt-1 w-full bg-gray-50 rounded-xl px-4 py-2.5 text-sm border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              O ID está no URL da pasta no Google Drive: drive.google.com/drive/folders/<strong>ID</strong>
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Nome (opcional, só para referência)</label>
            <input
              name="folderName"
              defaultValue={connection?.folder_name ?? ""}
              placeholder="ex: Fotos COME"
              className="mt-1 w-full bg-gray-50 rounded-xl px-4 py-2.5 text-sm border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#32373c] hover:bg-[#202427] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {connection?.folder_id ? "Atualizar pasta" : "Ligar pasta"}
          </button>
        </form>

        <a href="/admin/social/photos" className="block text-center text-sm text-white/60 hover:text-white transition-colors">
          Ir para revisão de fotos →
        </a>
      </main>
    </div>
  );
}

async function saveFolder(formData: FormData) {
  "use server";
  const folderId = String(formData.get("folderId") ?? "");
  const folderName = String(formData.get("folderName") ?? "");
  await connectDriveFolder(folderId, folderName);
  redirect("/admin/social/photos");
}
