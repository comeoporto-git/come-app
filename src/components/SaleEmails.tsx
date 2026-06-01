import type { EmailMessage } from "@/lib/integration";

function formatEmailDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("pt-PT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Lisbon",
    });
  } catch {
    return dateStr;
  }
}

function parseFromName(from: string): string {
  const match = from.match(/^(.*?)\s*<.+>$/);
  return match ? match[1].trim() || from : from;
}

function senderInitial(from: string): string {
  const name = parseFromName(from);
  return (name[0] || "?").toUpperCase();
}

type ThreadGroup = { threadId: string; messages: EmailMessage[] };

function groupByThread(emails: EmailMessage[]): ThreadGroup[] {
  const map = new Map<string, EmailMessage[]>();
  for (const email of emails) {
    const arr = map.get(email.threadId) ?? [];
    arr.push(email);
    map.set(email.threadId, arr);
  }
  return [...map.entries()].map(([threadId, messages]) => ({ threadId, messages }));
}

export function SaleEmails({ emails, threadIds }: { emails: EmailMessage[]; threadIds: string[] }) {
  if (threadIds.length === 0) return null;

  if (emails.length === 0) {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Emails</h2>
        </div>
        <div className="px-4 py-4 text-xs text-gray-400">
          {threadIds.length} thread{threadIds.length !== 1 ? "s" : ""} linked — não foi possível carregar
        </div>
      </section>
    );
  }

  const threads = groupByThread(emails);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Emails</h2>
        <span className="text-xs text-gray-400">
          {threads.length} thread{threads.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ul className="divide-y divide-gray-50">
        {threads.map(({ threadId, messages }) => {
          const first = messages[0];
          const gmailUrl = `https://mail.google.com/mail/u/0/#all/${threadId}`;
          return (
            <li key={threadId}>
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {senderInitial(first.from)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {first.subject || "(sem assunto)"}
                    </p>
                    {messages.length > 1 && (
                      <span className="text-xs text-gray-400 shrink-0">{messages.length}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{parseFromName(first.from)}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{first.snippet}</p>
                </div>
                <p className="text-xs text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">
                  {formatEmailDate(first.date)}
                </p>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
