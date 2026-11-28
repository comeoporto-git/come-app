import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/notion";
import { getGoogleToken, GMAIL_SCOPE, CALENDAR_SCOPE, INBOX_SCOPES } from "@/lib/google-token";
import { getThread, type GmailMessage } from "@/lib/gmail";
import { InboxClient, type InboxThread, type InboxSuggestion, type SaleOption, type ThreadMessage, type AgentTaskView } from "@/components/inbox/InboxClient";

export const dynamic = "force-dynamic";
// Syncing reads emails and asks the AI for drafts — give server actions room.
export const maxDuration = 300;

async function connectGmail() {
  "use server";
  // Incremental consent: Gmail (read, send after approval) + Calendar (read-only).
  // prompt=consent returns a refresh token so the cron job can sync later.
  await signIn(
    "google",
    { redirectTo: "/admin/inbox" },
    { prompt: "consent", access_type: "offline", include_granted_scopes: "true", scope: INBOX_SCOPES },
  );
}

const FILTERS = ["pendentes", "todos", "tratados"] as const;
type Filter = (typeof FILTERS)[number];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ t?: string; f?: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");
  const { t, f } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(f ?? "") ? (f as Filter) : "pendentes";

  const { data: settings } = await supabase.from("inbox_settings").select("*").eq("id", 1).maybeSingle();
  const mine = await getGoogleToken(session.user.id, [GMAIL_SCOPE]);
  const ownerId = mine.status === "ok" ? session.user.id : (settings?.owner_user_id as string | null);
  const tok = ownerId ? await getGoogleToken(ownerId, [GMAIL_SCOPE]) : mine;
  const connected = tok.status === "ok";
  const calendarConnected = tok.status === "ok" && tok.scopes.includes(CALENDAR_SCOPE);

  let q = supabase
    .from("inbox_threads")
    .select("*, sale:sales(id, date, notion_id, status, number_of_guests, services(name), clients(name))")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (filter === "pendentes") q = q.in("status", ["attention", "needs_reply", "awaiting_approval"]);
  if (filter === "tratados") q = q.in("status", ["replied", "done", "no_reply"]);
  const [{ data: threads }, { data: pending }, { data: chatSuggestions }, { data: sales }] = await Promise.all([
    q,
    supabase.from("inbox_suggestions").select("thread_id").eq("status", "pending"),
    supabase.from("inbox_suggestions").select("*").is("thread_id", null).in("status", ["pending", "failed"]).order("created_at", { ascending: false }),
    supabase
      .from("sales")
      .select("id, date, notion_id, services(name), clients(name)")
      .gte("date", new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10))
      .neq("status", "Cancelled")
      .order("date")
      .limit(300),
  ]);

  const pendingByThread: Record<string, number> = {};
  for (const p of pending ?? []) if (p.thread_id) pendingByThread[p.thread_id] = (pendingByThread[p.thread_id] ?? 0) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapThread = (r: any): InboxThread => ({
    id: r.id,
    gmailThreadId: r.gmail_thread_id,
    subject: r.subject ?? "",
    fromName: r.from_name ?? "",
    fromEmail: r.from_email ?? "",
    snippet: r.snippet ?? "",
    lastMessageAt: r.last_message_at,
    lastFromUs: r.last_from_us,
    status: r.status,
    category: r.category,
    summary: r.summary,
    error: r.error,
    pendingCount: pendingByThread[r.id] ?? 0,
    sale: r.sale
      ? {
          id: r.sale.id,
          date: r.sale.date,
          label: [r.sale.services?.name, r.sale.clients?.name ?? r.sale.notion_id].filter(Boolean).join(" · "),
          status: r.sale.status,
          guests: r.sale.number_of_guests,
        }
      : null,
  });

  const list = (threads ?? []).map(mapThread);
  let selected: InboxThread | null = null;
  let suggestions: InboxSuggestion[] = [];
  let agentTasks: AgentTaskView[] = [];
  let messages: ThreadMessage[] = [];
  let messagesError: string | null = null;
  if (t) {
    const { data: row } = await supabase
      .from("inbox_threads")
      .select("*, sale:sales(id, date, notion_id, status, number_of_guests, services(name), clients(name))")
      .eq("id", t)
      .maybeSingle();
    if (row) {
      selected = mapThread(row);
      const { data: sugg } = await supabase.from("inbox_suggestions").select("*").eq("thread_id", t).order("created_at", { ascending: false });
      suggestions = (sugg ?? []) as InboxSuggestion[];
      const { data: links } = await supabase.from("inbox_tasks").select("task_id").eq("thread_id", t);
      const taskIds = (links ?? []).map((l) => l.task_id as string);
      if (taskIds.length) {
        const { data: tk } = await supabase.from("tasks").select("id, name, status, due_date, role").in("id", taskIds);
        agentTasks = (tk ?? []).map((x) => ({ id: x.id, name: x.name, status: x.status, dueDate: x.due_date, role: x.role }));
      }
      if (tok.status === "ok") {
        try {
          const thread = await getThread(tok.token, row.gmail_thread_id);
          const me = (settings?.owner_email as string | null) ?? "";
          messages = thread.messages.map((m: GmailMessage) => ({
            id: m.id,
            from: m.from,
            to: m.to,
            date: m.date,
            body: m.body,
            fromUs: m.fromEmail === me || m.labelIds.includes("SENT"),
            attachments: m.attachments.map((a) => a.filename),
          }));
        } catch (e) {
          messagesError = e instanceof Error ? e.message : String(e);
        }
      }
    }
  }

  const saleOptions: SaleOption[] = (sales ?? []).map((s) => ({
    id: s.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    label: `${s.date} · ${(s as any).services?.name ?? ""} · ${(s as any).clients?.name ?? s.notion_id ?? ""}`,
  }));

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-white">Caixa de Entrada</h1>
            <p className="text-[13px] text-white/60 mt-0.5">
              O AI lê os emails, prepara respostas com preços, cria vendas e despesas — tudo fica à espera da tua aprovação.
            </p>
          </div>
          {!connected || !calendarConnected ? (
            <form action={connectGmail}>
              <button type="submit" className="text-sm font-semibold bg-white text-[#32373c] px-4 py-2 rounded-xl shadow-sm hover:bg-gray-50">
                {connected ? "Autorizar também o Calendário" : "Ligar Gmail e Calendário"}
              </button>
            </form>
          ) : null}
        </div>

        {!connected ? (
          <div className="bg-white rounded-2xl p-6 text-sm text-gray-600 space-y-2 max-w-xl">
            <p className="font-semibold text-[#32373c]">Liga a conta Google da COME</p>
            <p>
              A app vai pedir acesso ao Gmail (ler emails e enviar respostas <strong>só depois de aprovadas</strong>) e ao Calendário (só leitura,
              para ver os dias &quot;OUT&quot; do Bernardo e outros eventos).
            </p>
            <p className="text-xs text-gray-400">
              Se aparecer &quot;Gmail API has not been used&quot;, ativa a Gmail API e a Google Calendar API no Google Cloud Console do projeto.
            </p>
          </div>
        ) : (
          <InboxClient
            threads={list}
            filter={filter}
            selected={selected}
            suggestions={suggestions}
            agentTasks={agentTasks}
            chatSuggestions={(chatSuggestions ?? []) as InboxSuggestion[]}
            messages={messages}
            messagesError={messagesError}
            saleOptions={saleOptions}
            lastSyncedAt={(settings?.last_synced_at as string | null) ?? null}
            lastSyncError={(settings?.last_sync_error as string | null) ?? null}
            settings={{
              gmailQuery: (settings?.gmail_query as string) ?? "",
              calendarId: (settings?.calendar_id as string) ?? "primary",
              autoArchive: settings?.auto_archive_notifications !== false,
              notificationsLabel: (settings?.notifications_label as string) ?? "Notificações",
            }}
            calendarConnected={calendarConnected}
          />
        )}
      </main>
    </div>
  );
}
