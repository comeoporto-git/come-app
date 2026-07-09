"use server";

import { supabase } from "@/lib/notion";
import { revalidatePath } from "next/cache";

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function createCRMAccount(data: {
  name: string;
  pessoa?: string;
  email?: string;
  phone_number?: string;
  website?: string;
  stage?: string;
  company_size?: string;
  country?: string;
  industry?: string;
  linkedin_url?: string;
  notes?: string;
}): Promise<{ id?: string; error?: string }> {
  const { data: row, error } = await supabase
    .from("sales_pipeline")
    .insert({
      id: crypto.randomUUID(),
      name: data.name,
      pessoa: data.pessoa || null,
      email: data.email || null,
      phone_number: data.phone_number || null,
      website: data.website || null,
      stage: data.stage || "Prospect",
      company_size: data.company_size || null,
      country: data.country || null,
      industry: data.industry || null,
      linkedin_url: data.linkedin_url || null,
      notes: data.notes || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/crm");
  return { id: row.id };
}

export async function updateCRMAccount(
  id: string,
  data: Partial<{
    name: string;
    pessoa: string;
    email: string;
    phone_number: string;
    website: string;
    stage: string;
    category: string;
    company_size: string;
    country: string;
    industry: string;
    linkedin_url: string;
    notes: string;
    phone: string;
    nif: string;
    nome_fiscal: string;
    morada_fiscal: string;
    last_contacted_at: string;
    enriched_at: string;
    enrichment_data: Record<string, unknown>;
  }>
): Promise<{ error?: string }> {
  const { error } = await supabase.from("sales_pipeline").update(data).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/accounts/${id}`);
  return {};
}

export async function clearAccountEnrichment(id: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("sales_pipeline")
    .update({ enrichment_data: null, enriched_at: null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/crm/accounts/${id}`);
  return {};
}

export async function deleteCRMAccount(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("sales_pipeline").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/crm");
  return {};
}

// Deletes an account across both sales_pipeline and clients (they share the
// same id — see supabase/migrations/sync_clients_to_pipeline.sql). Refuses to
// delete if the client has real sales/transactions/activity/tasks attached,
// instead of silently cascading and losing financial history.
export async function deleteClient(id: string): Promise<{ error?: string }> {
  const [{ count: salesCount }, { count: txCount }, { count: activityCount }, { count: taskCount }] = await Promise.all([
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabase.from("sales_activities").select("id", { count: "exact", head: true }).eq("sales_pipeline_id", id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("sales_pipeline_id", id),
  ]);

  if ((salesCount ?? 0) > 0 || (txCount ?? 0) > 0) {
    return { error: "Não é possível eliminar: este cliente tem vendas ou transações registadas." };
  }
  if ((activityCount ?? 0) > 0 || (taskCount ?? 0) > 0) {
    return { error: "Não é possível eliminar: este cliente tem atividades ou tarefas associadas." };
  }

  const { error: pipelineError } = await supabase.from("sales_pipeline").delete().eq("id", id);
  if (pipelineError) return { error: pipelineError.message };

  const { error: clientError } = await supabase.from("clients").delete().eq("id", id);
  if (clientError) return { error: clientError.message };

  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/clients");
  return {};
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function createCRMContact(data: {
  account_id: string;
  name: string;
  email?: string;
  phone?: string;
  country?: string;
  linkedin_url?: string;
  role?: string;
  is_primary?: boolean;
}): Promise<{ id?: string; error?: string }> {
  if (data.is_primary) {
    await supabase.from("crm_contacts").update({ is_primary: false }).eq("account_id", data.account_id);
  }
  const { data: row, error } = await supabase
    .from("crm_contacts")
    .insert({
      account_id: data.account_id,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      country: data.country || null,
      linkedin_url: data.linkedin_url || null,
      role: data.role || null,
      is_primary: data.is_primary ?? false,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/admin/crm/accounts/${data.account_id}`);
  return { id: row.id };
}

export async function updateCRMContact(
  id: string,
  accountId: string,
  data: Partial<{
    name: string;
    email: string;
    phone: string;
    country: string;
    linkedin_url: string;
    role: string;
    is_primary: boolean;
  }>
): Promise<{ error?: string }> {
  if (data.is_primary) {
    await supabase.from("crm_contacts").update({ is_primary: false }).eq("account_id", accountId);
  }
  const { error } = await supabase.from("crm_contacts").update(data).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/crm/accounts/${accountId}`);
  revalidatePath("/admin/crm/contacts");
  return {};
}

export async function deleteCRMContact(id: string, accountId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("crm_contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/crm/accounts/${accountId}`);
  revalidatePath("/admin/crm/contacts");
  return {};
}

// ── Activities ────────────────────────────────────────────────────────────────

export async function createCRMActivity(data: {
  account_id: string;
  title: string;
  description?: string;
  thread_link?: string;
  type?: string;
  status?: string;
  contact_id?: string;
  date?: string;
  scheduled_at?: string;
}): Promise<{ id?: string; error?: string }> {
  const { data: row, error } = await supabase
    .from("sales_activities")
    .insert({
      id: crypto.randomUUID(),
      sales_pipeline_id: data.account_id,
      activitie: data.title,
      description: data.description || null,
      thread_link: data.thread_link || null,
      type: data.type || "note",
      status: data.status || "done",
      contact_id: data.contact_id || null,
      date: data.date || new Date().toISOString().split("T")[0],
      scheduled_at: data.scheduled_at || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // update last_contacted_at on the account
  if (data.status !== "todo") {
    await supabase
      .from("sales_pipeline")
      .update({ last_contacted_at: data.date || new Date().toISOString().split("T")[0] })
      .eq("id", data.account_id);
  }

  revalidatePath(`/admin/crm/accounts/${data.account_id}`);
  return { id: row.id };
}

export async function deleteCRMActivity(id: string, accountId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("sales_activities").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/crm/accounts/${accountId}`);
  return {};
}

// ── Weekly Actions ────────────────────────────────────────────────────────────

export async function updateWeeklyActionStatus(
  id: string,
  status: "pending" | "done" | "skipped",
  weekOf: string
): Promise<{ error?: string }> {
  const { error } = await supabase.from("crm_weekly_actions").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/crm/weekly");
  return {};
}

export async function clearWeeklyActions(weekOf: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("crm_weekly_actions").delete().eq("week_of", weekOf);
  if (error) return { error: error.message };
  revalidatePath("/admin/crm/weekly");
  return {};
}
