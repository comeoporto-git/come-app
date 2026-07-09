"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CRMAccount, CRMActivity, CRMContact } from "@/lib/notion";
import type { EmailMessage } from "@/lib/integration";
import { AddContactModal } from "./AddContactModal";
import { LogActivityModal } from "./LogActivityModal";
import { StageSelect, StageBadge } from "./StageSelect";
import { SaleEmails } from "@/components/SaleEmails";
import { deleteCRMActivity, deleteCRMContact, updateCRMContact, updateCRMAccount, clearAccountEnrichment, deleteClient } from "@/actions/crm";
import { AccountStatsPanel } from "./AccountStatsPanel";
import { ClientSalesKanban } from "./ClientSalesKanban";
import type { CRMAccountStats, ClientSale } from "@/lib/notion";

const CATEGORIES = ["DMC", "Events", "Hotel", "Corporate", "Other"];
const CATEGORY_COLORS: Record<string, string> = {
  DMC:       "bg-blue-100 text-blue-700",
  Events:    "bg-orange-100 text-orange-700",
  Hotel:     "bg-teal-100 text-teal-700",
  Corporate: "bg-indigo-100 text-indigo-700",
  Other:     "bg-gray-100 text-gray-500",
};

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
  const [editing, setEditing] = useState(false);

  if (deleted) return null;

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string)?.trim() || undefined;
    startTransition(async () => {
      await updateCRMContact(contact.id, accountId, {
        name: get("name") ?? contact.name,
        email: get("email"),
        phone: get("phone"),
        role: get("role"),
        linkedin_url: get("linkedin_url"),
        is_primary: fd.get("is_primary") === "on",
      });
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="bg-gray-50 rounded-xl p-3 space-y-2">
        {[
          { name: "name",         label: "Nome",     defaultValue: contact.name,         required: true },
          { name: "role",         label: "Cargo",    defaultValue: contact.role ?? "" },
          { name: "email",        label: "Email",    defaultValue: contact.email ?? "" },
          { name: "phone",        label: "Telefone", defaultValue: contact.phone ?? "" },
          { name: "linkedin_url", label: "LinkedIn", defaultValue: contact.linkedin_url ?? "" },
        ].map(({ name, label, defaultValue, required }) => (
          <div key={name}>
            <label className="block text-[10px] text-gray-400 mb-0.5">{label}</label>
            <input
              name={name}
              defaultValue={defaultValue}
              required={required}
              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" name="is_primary" defaultChecked={contact.is_primary} className="rounded" />
          Contacto principal
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-[#667470] text-white rounded-lg text-xs font-medium hover:bg-[#556360] transition-colors disabled:opacity-50">
            Guardar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="bg-gray-50 rounded-xl p-3 relative group cursor-pointer hover:bg-gray-100 transition-colors"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#32373c] truncate">
            {contact.name}
            {contact.is_primary && <span className="ml-1.5 text-xs bg-[#667470]/10 text-[#667470] px-1.5 py-0.5 rounded-full">principal</span>}
          </p>
          {contact.role && <p className="text-xs text-gray-500 mt-0.5">{contact.role}</p>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); startTransition(async () => { await deleteCRMContact(contact.id, accountId); setDeleted(true); }); }}
          disabled={isPending}
          className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs shrink-0"
        >×</button>
      </div>
      <div className="mt-2 space-y-1">
        {contact.email && (
          <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#667470]">
            <span>✉️</span> <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#667470]">
            <span>📞</span> {contact.phone}
          </a>
        )}
        {contact.linkedin_url && (
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
            <span>💼</span> LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

export function ActivityPanel({
  activities,
  accountId,
  onLog,
  className = "",
}: {
  activities: CRMActivity[];
  accountId: string;
  onLog: () => void;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col flex-1 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#32373c]">Atividade</h2>
        <button
          onClick={onLog}
          className="bg-[#667470] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#556360] transition-colors"
        >+ Registar</button>
      </div>
      {activities.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">Sem atividades registadas</p>
      ) : (
        <div>
          {activities.map((a) => <ActivityItem key={a.id} activity={a} accountId={accountId} />)}
        </div>
      )}
    </div>
  );
}

export function AccountDetailClient({
  account,
  activities,
  emailsPerContact = {},
  stats,
  sales,
}: {
  account: CRMAccount;
  activities: CRMActivity[];
  emailsPerContact?: Record<string, EmailMessage[]>;
  stats?: CRMAccountStats;
  sales?: ClientSale[];
}) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [isEnrichingContacts, setIsEnrichingContacts] = useState(false);
  const [enrichContactsMsg, setEnrichContactsMsg] = useState<string | null>(null);
  const [isImportingGmail, setIsImportingGmail] = useState(false);
  const [category, setCategory] = useState(account.category ?? "");
  const [editingDetails, setEditingDetails] = useState(false);
  const [, startCategoryTransition] = useTransition();
  const [, startDetailsTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();

  const contacts = account.contacts ?? [];

  async function handleDelete() {
    if (!confirm(`Eliminar "${account.name}"? Esta ação não pode ser desfeita.`)) return;
    setIsDeleting(true);
    setDeleteError(null);
    const res = await deleteClient(account.id);
    if (res.error) {
      setDeleteError(res.error);
      setIsDeleting(false);
    } else {
      router.push("/admin/crm/clients");
    }
  }

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

  async function handleEnrichContacts() {
    setIsEnrichingContacts(true);
    setEnrichContactsMsg(null);
    try {
      const res = await fetch(`/api/crm/enrich-contacts/${account.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEnrichContactsMsg(
          data.count > 0
            ? `${data.count} contacto${data.count !== 1 ? "s" : ""} adicionado${data.count !== 1 ? "s" : ""}! A recarregar…`
            : "Nenhum contacto novo encontrado"
        );
        if (data.count > 0) setTimeout(() => window.location.reload(), 1500);
      } else {
        setEnrichContactsMsg(data.error ?? "Erro");
      }
    } catch {
      setEnrichContactsMsg("Erro de rede");
    } finally {
      setIsEnrichingContacts(false);
    }
  }

  async function handleImportGmail() {
    setIsImportingGmail(true);
    setEnrichContactsMsg(null);
    try {
      const res = await fetch(`/api/crm/import-gmail-contacts/${account.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.message === "no_threads") {
          // No linked Gmail threads — fall back to AI automatically
          setEnrichContactsMsg("Sem emails ligados a este cliente. A pesquisar com IA…");
          setIsImportingGmail(false);
          await handleEnrichContacts();
          return;
        }
        setEnrichContactsMsg(
          data.count > 0
            ? `${data.count} contacto${data.count !== 1 ? "s" : ""} importado${data.count !== 1 ? "s" : ""} do Gmail! A recarregar…`
            : "Nenhum contacto novo encontrado nos emails"
        );
        if (data.count > 0) setTimeout(() => window.location.reload(), 1500);
      } else {
        setEnrichContactsMsg(data.error ?? "Erro");
      }
    } catch {
      setEnrichContactsMsg("Erro de rede");
    } finally {
      setIsImportingGmail(false);
    }
  }

  function handleSaveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string)?.trim() || undefined;
    startDetailsTransition(async () => {
      await updateCRMAccount(account.id, {
        website:       get("website"),
        phone:         get("phone"),
        email:         get("email"),
        nif:           get("nif"),
        nome_fiscal:   get("nome_fiscal"),
        morada_fiscal: get("morada_fiscal"),
        industry:      get("industry"),
        company_size:  get("company_size"),
        country:       get("country"),
        linkedin_url:  get("linkedin_url"),
        notes:         get("notes"),
      });
      setEditingDetails(false);
    });
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setCategory(val);
    startCategoryTransition(async () => {
      await updateCRMAccount(account.id, { category: val || undefined });
    });
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
              {category && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other}`}>
                  {category}
                </span>
              )}
            </div>
            {!editingDetails ? (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {account.industry && <span>{account.industry}</span>}
                  {account.company_size && <span>{account.company_size} colaboradores</span>}
                  {account.country && <span>{account.country}</span>}
                  {account.phone && <a href={`tel:${account.phone}`} className="hover:text-[#667470]">{account.phone}</a>}
                  {account.email && <a href={`mailto:${account.email}`} className="hover:text-[#667470]">{account.email}</a>}
                  {account.website && (
                    <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{account.website}</a>
                  )}
                  {account.linkedin_url && (
                    <a href={account.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">LinkedIn</a>
                  )}
                </div>
                {(account.nif || account.nome_fiscal || account.morada_fiscal) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-400">
                    {account.nif && <span>NIF: <span className="text-gray-600 font-medium">{account.nif}</span></span>}
                    {account.nome_fiscal && <span>{account.nome_fiscal}</span>}
                    {account.morada_fiscal && <span>{account.morada_fiscal}</span>}
                  </div>
                )}
                {account.notes && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{account.notes}</p>}
                <button onClick={() => setEditingDetails(true)} className="mt-2 text-xs text-gray-400 hover:text-[#667470] transition-colors">Editar detalhes</button>
              </>
            ) : (
              <form onSubmit={handleSaveDetails} className="mt-3 space-y-2 w-full max-w-lg">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "website",       label: "Website",       defaultValue: account.website },
                    { name: "phone",         label: "Telefone",      defaultValue: account.phone },
                    { name: "email",         label: "Email",         defaultValue: account.email },
                    { name: "industry",      label: "Indústria",     defaultValue: account.industry },
                    { name: "company_size",  label: "Dimensão",      defaultValue: account.company_size },
                    { name: "country",       label: "País",          defaultValue: account.country },
                    { name: "linkedin_url",  label: "LinkedIn",      defaultValue: account.linkedin_url },
                    { name: "nif",           label: "NIF",           defaultValue: account.nif },
                    { name: "nome_fiscal",   label: "Nome Fiscal",   defaultValue: account.nome_fiscal },
                    { name: "morada_fiscal", label: "Morada Fiscal", defaultValue: account.morada_fiscal },
                  ].map(({ name, label, defaultValue }) => (
                    <div key={name}>
                      <label className="block text-[10px] text-gray-400 mb-0.5">{label}</label>
                      <input
                        name={name}
                        defaultValue={defaultValue ?? ""}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Notas</label>
                  <textarea name="notes" defaultValue={account.notes ?? ""} rows={2} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#667470]/30 resize-none" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-3 py-1.5 bg-[#667470] text-white rounded-lg text-xs font-medium hover:bg-[#556360] transition-colors">Guardar</button>
                  <button type="button" onClick={() => setEditingDetails(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
                </div>
              </form>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={handleCategoryChange}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
            >
              <option value="">Categoria…</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <StageSelect accountId={account.id} currentStage={account.stage} />
            <button
              onClick={handleEnrich}
              disabled={isEnriching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
            >
              {isEnriching ? "A pesquisar…" : "✨ Enriquecer com IA"}
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "A eliminar…" : "🗑 Eliminar"}
            </button>
          </div>
        </div>
        {enrichMsg && (
          <p className="mt-2 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">{enrichMsg}</p>
        )}
        {deleteError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteError}</p>
        )}
        {account.enriched_at && (
          <p className="mt-1 text-xs text-gray-400">Enriquecido a {formatDate(account.enriched_at)}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        {/* Contacts panel */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#32373c]">Contactos</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImportGmail}
                  disabled={isImportingGmail}
                  title="Importar contactos dos emails trocados no Gmail"
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
                >
                  {isImportingGmail ? "A importar…" : "✉ Gmail"}
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={handleEnrichContacts}
                  disabled={isEnrichingContacts}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50 transition-colors"
                >
                  {isEnrichingContacts ? "A pesquisar…" : "✨ IA"}
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => setShowAddContact(true)}
                  className="text-xs text-[#667470] hover:text-[#556360] font-medium"
                >+ Adicionar</button>
              </div>
            </div>
            {enrichContactsMsg && (
              <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2 mb-3">{enrichContactsMsg}</p>
            )}
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

        {/* Right column: Histórico de Vendas for clients, Atividade for others */}
        <div className="lg:col-span-3 flex flex-col">
          {account.stage === "Client" && stats ? (
            <AccountStatsPanel stats={stats} />
          ) : (
            <ActivityPanel activities={activities} accountId={account.id} onLog={() => setShowLogActivity(true)} />
          )}
        </div>
      </div>

      {/* Client accounts: Kanban then Atividade below */}
      {account.stage === "Client" && sales && <ClientSalesKanban sales={sales} />}
      {account.stage === "Client" && (
        <ActivityPanel activities={activities} accountId={account.id} onLog={() => setShowLogActivity(true)} className="mt-4" />
      )}

      {/* Enrichment data */}
      {account.enrichment_data && (() => {
        const d = account.enrichment_data as Record<string, unknown>;
        const contacts = (d.key_contacts as Array<Record<string, string>> ?? []).filter((c) => c.name?.trim());
        return (
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#32373c]">Insights IA</h2>
                <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">✨ Enriquecido</span>
              </div>
              <button
                onClick={() => startCategoryTransition(async () => {
                  await clearAccountEnrichment(account.id);
                  window.location.reload();
                })}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >Remover</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!!d.description && (
                <div className="sm:col-span-2 bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Sobre</p>
                  <p className="text-sm text-gray-700">{String(d.description)}</p>
                </div>
              )}
              {!!d.why_fit && (
                <div className="sm:col-span-2 bg-purple-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-purple-500 mb-1">Porquê COME Porto</p>
                  <p className="text-sm text-purple-800">{String(d.why_fit)}</p>
                </div>
              )}
              {!!d.recent_news && (
                <div className="sm:col-span-2 bg-blue-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-blue-500 mb-1">Notícias recentes</p>
                  <p className="text-sm text-blue-800">{String(d.recent_news)}</p>
                </div>
              )}
            </div>
            {contacts.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Contactos sugeridos pela IA</p>
                <div className="space-y-2">
                  {contacts.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                      <div className="w-8 h-8 rounded-full bg-[#667470]/10 text-[#667470] flex items-center justify-center text-xs font-bold shrink-0">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#32373c]">{c.name} {c.role && <span className="text-xs text-gray-400 font-normal">· {c.role}</span>}</p>
                        <div className="flex gap-3 flex-wrap mt-0.5">
                          {c.email && <span className="text-xs text-gray-500">{c.email}</span>}
                          {c.linkedin_url && (
                            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">LinkedIn</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
