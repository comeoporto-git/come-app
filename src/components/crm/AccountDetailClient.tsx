"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CRMAccount, CRMActivity, CRMContact } from "@/lib/notion";
import type { EmailMessage } from "@/lib/integration";
import { AddContactModal } from "./AddContactModal";
import { LogActivityModal } from "./LogActivityModal";
import { StageSelect, StageBadge } from "./StageSelect";
import { SaleEmails } from "@/components/SaleEmails";
import { deleteCRMActivity, deleteCRMContact } from "@/actions/crm";

const TYPE_ICONS: Record<string, string> = {
  call: "📞", email: "✉️", linkedin: "💼", meeting: "🤝", note: "📝",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

function ActivityItem({ activity, accountId }: { activity: CRMActivity; accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  const icon = TYPE_ICONS[activity.type] ?? "📝";
  const isTodo = activity.status === "todo";
  const gmailUrl = activity.thread_link
    ? `https://mail.google.com/mail/u/0/#all/${activity.thread_link}`
    : null;

  return (
    <div className={`flex gap-3 ${isTodo ? "opacity-70" : ""}`}>
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-sm">{icon}</div>
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-[#32373c]">{activity.activitie}</p>
            {activity.contact_name && <p className="text-xs text-gray-400 mt-0.5">{activity.contact_name}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400">{formatDate(activity.date)}</span>
            {isTodo && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">a fazer</span>}
            <button
              onClick={() => startTransition(async () => { await deleteCRMActivity(activity.id, accountId); setDeleted(true); })}
              disabled={isPending}
              className="text-gray-300 hover:text-red-400 transition-colors text-xs"
            >×</button>
          </div>
        </div>
        {activity.description && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{activity.description}</p>}
        {gmailUrl && (
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1">
            ✉️ Ver no Gmail
          </a>
        )}
      </div>
    </div>
  );
}

function ContactCard({ contact, accountId }: { contact: CRMContact; accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  return (
    <div className="bg-gray-50 rounded-xl p-3 relative group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#32373c] truncate">
            {contact.name}
            {contact.is_primary && <span className="ml-1.5 text-xs bg-[#667470]/10 text-[#667470] px-1.5 py-0.5 rounded-full">principal</span>}
          </p>
          {contact.role && <p className="text-xs text-gray-500 mt-0.5">{contact.role}</p>}
        </div>
        <button
          onClick={() => startTransition(async () => { await deleteCRMContact(contact.id, accountId); setDeleted(true); })}
          disabled={isPending}
          className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs shrink-0"
        >×</button>
      </div>
      <div className="mt-2 space-y-1">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#667470]">
            <span>✉️</span> <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#667470]">
            <span>📞</span> {contact.phone}
          </a>
        )}
        {contact.linkedin_url && (
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
            <span>💼</span> LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

export function AccountDetailClient({
  account,
  activities,
  emailsPerContact = {},
}: {
  account: CRMAccount;
  activities: CRMActivity[];
  emailsPerContact?: Record<string, EmailMessage[]>;
}) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  const contacts = account.contacts ?? [];

  async function handleEnrich() {
    setIsEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await fetch(`/api/crm/enrich/${account.id}`, { method: "POST" });
      const data = await res.json();
      setEnrichMsg(data.message ?? (res.ok ? "Enriquecido!" : data.error ?? "Erro"));
      if (res.ok) setTimeout(() => window.location.reload(), 1500);
    } catch {
      setEnrichMsg("Erro ao enriquecer");
    } finally {
      setIsEnriching(false);
    }
  }

  return (
    <>
      {showAddContact && <AddContactModal accountId={account.id} onClose={() => setShowAddContact(false)} />}
      {showLogActivity && (
        <LogActivityModal accountId={account.id} contacts={contacts} onClose={() => setShowLogActivity(false)} />
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[#32373c]">{account.name}</h1>
              <StageBadge stage={account.stage} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
              {account.industry && <span>{account.industry}</span>}
              {account.company_size && <span>{account.company_size} colaboradores</span>}
              {account.country && <span>{account.country}</span>}
              {account.website && (
                <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{account.website}</a>
              )}
              {account.linkedin_url && (
                <a href={account.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">LinkedIn</a>
              )}
            </div>
            {account.notes && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{account.notes}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <StageSelect accountId={account.id} currentStage={account.stage} />
            <button
              onClick={handleEnrich}
              disabled={isEnriching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
            >
              {isEnriching ? "A pesquisar…" : "✨ Enriquecer com IA"}
            </button>
          </div>
        </div>
        {enrichMsg && (
          <p className="mt-2 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">{enrichMsg}</p>
        )}
        {account.enriched_at && (
          <p className="mt-1 text-xs text-gray-400">Enriquecido a {formatDate(account.enriched_at)}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Contacts panel */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#32373c]">Contactos</h2>
              <button
                onClick={() => setShowAddContact(true)}
                className="text-xs text-[#667470] hover:text-[#556360] font-medium"
              >+ Adicionar</button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sem contactos</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => <ContactCard key={c.id} contact={c} accountId={account.id} />)}
              </div>
            )}
          </div>

          {/* Email threads per contact */}
          {contacts.filter((c) => c.email && emailsPerContact[c.id]?.length).map((c) => {
            const emails = emailsPerContact[c.id] ?? [];
            const threadIds = [...new Set(emails.map((e) => e.threadId))];
            return (
              <SaleEmails key={c.id} emails={emails} threadIds={threadIds} />
            );
          })}
        </div>

        {/* Activity timeline */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#32373c]">Atividade</h2>
              <button
                onClick={() => setShowLogActivity(true)}
                className="bg-[#667470] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#556360] transition-colors"
              >+ Registar</button>
            </div>
            {activities.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Sem atividades registadas</p>
            ) : (
              <div>
                {activities.map((a) => <ActivityItem key={a.id} activity={a} accountId={account.id} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enrichment data */}
      {account.enrichment_data && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-[#32373c] mb-3">Dados de Enriquecimento IA</h2>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 overflow-auto max-h-48">
            {JSON.stringify(account.enrichment_data, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}
