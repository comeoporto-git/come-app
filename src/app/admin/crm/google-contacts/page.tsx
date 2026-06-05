import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGoogleContacts } from "@/lib/google-contacts";
import { getAllCRMContacts } from "@/lib/notion";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";
import Link from "next/link";
import Image from "next/image";

async function authorizeContacts() {
  "use server";
  // prompt:consent forces Google to show the scope screen and return a
  // fresh token that includes contacts.readonly even for returning users.
  await signIn("google", { redirectTo: "/admin/crm/google-contacts" }, { prompt: "consent" });
}

export default async function GoogleContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const params = await searchParams;
  const query = params.q?.toLowerCase().trim() ?? "";

  const [result, crmContacts] = await Promise.all([
    getGoogleContacts(session.user.googleAccessToken, session.user.id),
    getAllCRMContacts(),
  ]);

  // Build a set of emails already in CRM for O(1) lookup
  const crmEmailMap = new Map(
    crmContacts
      .filter((c) => c.email)
      .map((c) => [c.email!.toLowerCase(), c])
  );

  // ── State: People API not enabled ────────────────────────────────────────
  if (result.status === "api_disabled") {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Google Contacts" }]} />
        <main className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm text-3xl">⚙️</div>
          <div>
            <h1 className="text-xl font-bold text-white">People API não está ativa</h1>
            <p className="text-white/70 text-sm mt-2 max-w-sm">
              A Google People API precisa de ser ativada no Google Cloud Console para este projeto.
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 text-left text-sm text-[#32373c] space-y-2 w-full max-w-sm">
            <p className="font-semibold">Como ativar:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Vai a <a href="https://console.cloud.google.com/apis/library/people.googleapis.com?project=come-app-493117" target="_blank" className="text-blue-600 underline">Google Cloud Console → People API</a></li>
              <li>Clica em <strong>Enable</strong></li>
              <li>Volta aqui e clica em Re-autorizar</li>
            </ol>
          </div>
          <form action={authorizeContacts}>
            <button type="submit" className="text-sm font-medium bg-white text-[#32373c] px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors">
              Re-autorizar após ativar API
            </button>
          </form>
        </main>
      </div>
    );
  }

  // ── State: not authorized yet ─────────────────────────────────────────────
  if (result.status === "no_token" || result.status === "no_scope") {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Google Contacts" }]} />
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
            <h1 className="text-xl font-bold text-white">Autorizar acesso ao Google Contacts</h1>
            <p className="text-white/70 text-sm mt-2 max-w-sm">
              {result.status === "no_scope"
                ? "A tua sessão Google não inclui permissão para ler contactos. Clica em autorizar para adicionar o acesso."
                : "Nenhum token Google encontrado. Inicia sessão com Google para ligar os teus contactos."}
            </p>
          </div>

          <form action={authorizeContacts}>
            <button
              type="submit"
              className="flex items-center gap-2 bg-white hover:bg-gray-50 text-[#32373c] text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 transition-colors"
            >
              <svg viewBox="0 0 48 48" className="w-4 h-4">
                <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Autorizar Google Contacts
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="min-h-screen bg-[#667470] text-[#32373c]">
        <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Google Contacts" }]} />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-white/70 text-sm">Erro ao carregar contactos Google. Tenta novamente mais tarde.</p>
        </main>
      </div>
    );
  }

  // ── Status: ok ────────────────────────────────────────────────────────────
  const allContacts = result.contacts;

  const filtered = query
    ? allContacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(query) ||
          (c.email?.toLowerCase().includes(query) ?? false) ||
          (c.company?.toLowerCase().includes(query) ?? false)
      )
    : allContacts;

  const inCRM    = filtered.filter((c) => c.email && crmEmailMap.has(c.email.toLowerCase()));
  const notInCRM = filtered.filter((c) => !c.email || !crmEmailMap.has(c.email.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Google Contacts" }]} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg">Google Contacts</h1>
            <p className="text-white/60 text-sm mt-0.5">
              {allContacts.length} contactos · {inCRM.length} já no CRM
            </p>
          </div>
          <form action={authorizeContacts}>
            <button
              type="submit"
              title="Re-sincronizar / re-autorizar"
              className="text-xs text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15"
            >
              Re-autorizar
            </button>
          </form>
        </div>

        {/* Search */}
        <form method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Pesquisar por nome, email ou empresa…"
            className="flex-1 bg-white rounded-xl px-4 py-2.5 text-sm border border-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/30 placeholder:text-gray-300"
          />
          {query && (
            <Link href="/admin/crm/google-contacts" className="px-4 py-2.5 bg-white/20 text-white text-sm rounded-xl hover:bg-white/30 transition-colors">
              ✕
            </Link>
          )}
        </form>

        {/* Stats chips */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium bg-white/15 text-white px-3 py-1 rounded-full">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
          {inCRM.length > 0 && (
            <span className="text-xs font-medium bg-emerald-500/20 text-emerald-100 px-3 py-1 rounded-full">
              {inCRM.length} já no CRM
            </span>
          )}
          {notInCRM.length > 0 && (
            <span className="text-xs font-medium bg-white/10 text-white/60 px-3 py-1 rounded-full">
              {notInCRM.length} por importar
            </span>
          )}
        </div>

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
            Nenhum contacto corresponde à pesquisa
          </div>
        )}

        {/* Already in CRM */}
        {inCRM.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 bg-emerald-50/60">
              <p className="text-xs font-semibold text-emerald-700">Já no CRM ({inCRM.length})</p>
            </div>
            <div className="divide-y divide-gray-50">
              {inCRM.map((contact) => {
                const crmEntry = contact.email ? crmEmailMap.get(contact.email.toLowerCase()) : null;
                return (
                  <div key={contact.resourceName} className="flex items-center gap-3 px-5 py-3">
                    {contact.photoUrl ? (
                      <Image src={contact.photoUrl} alt="" width={36} height={36} className="rounded-full shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 shrink-0">
                        {contact.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#32373c] truncate">{contact.displayName}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0 mr-3">
                      {contact.email && <p className="text-xs text-gray-500 truncate max-w-[180px]">{contact.email}</p>}
                      {contact.phone && <p className="text-xs text-gray-400">{contact.phone}</p>}
                    </div>
                    {crmEntry && (
                      <Link
                        href={`/admin/crm/accounts/${crmEntry.account_id}`}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-full transition-colors shrink-0"
                      >
                        Ver no CRM →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Not yet in CRM */}
        {notInCRM.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-gray-500">Por importar ({notInCRM.length})</p>
            </div>
            <div className="divide-y divide-gray-50">
              {notInCRM.map((contact) => (
                <div key={contact.resourceName} className="flex items-center gap-3 px-5 py-3">
                  {contact.photoUrl ? (
                    <Image src={contact.photoUrl} alt="" width={36} height={36} className="rounded-full shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#667470]/10 flex items-center justify-center text-sm font-bold text-[#667470] shrink-0">
                      {contact.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#32373c] truncate">{contact.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {contact.email && <p className="text-xs text-gray-500 truncate max-w-[180px]">{contact.email}</p>}
                    {contact.phone && <p className="text-xs text-gray-400">{contact.phone}</p>}
                  </div>
                  <Link
                    href={`/admin/crm?prefill=${encodeURIComponent(JSON.stringify({
                      name: contact.company ?? contact.displayName,
                      email: contact.email ?? "",
                    }))}`}
                    className="text-xs font-medium text-[#667470] hover:text-[#32373c] bg-[#667470]/10 hover:bg-[#667470]/20 px-2.5 py-1 rounded-full transition-colors shrink-0"
                  >
                    + Criar conta
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
