"use server";

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";

async function getEmail() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");
  return session.user.email;
}

export type Conversation = {
  id: string;
  title: string | null;
  context_key?: string | null;
  context_label?: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function listConversations(): Promise<Conversation[]> {
  const email = await getEmail();
  const { data } = await supabase
    .from("ai_chat_conversations")
    .select("id, title, created_at, updated_at, context_key, context_label")
    .eq("user_email", email)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Conversation[];
}

export async function createConversation(): Promise<string> {
  const email = await getEmail();
  const { data, error } = await supabase
    .from("ai_chat_conversations")
    .insert({ id: crypto.randomUUID(), user_email: email })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const email = await getEmail();
  // Verify ownership
  const { data: conv } = await supabase
    .from("ai_chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_email", email)
    .maybeSingle();
  if (!conv) throw new Error("Not found");

  const { data } = await supabase
    .from("ai_chat_messages")
    .select("id, conversation_id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ChatMessage[];
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const email = await getEmail();
  // Verify ownership
  const { data: conv } = await supabase
    .from("ai_chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_email", email)
    .maybeSingle();
  if (!conv) throw new Error("Not found");

  await supabase.from("ai_chat_messages").insert({
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    role,
    content,
  });
}

export async function setConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const email = await getEmail();
  await supabase
    .from("ai_chat_conversations")
    .update({ title: title.slice(0, 80) })
    .eq("id", conversationId)
    .eq("user_email", email);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const email = await getEmail();
  await supabase
    .from("ai_chat_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_email", email);
}

/**
 * The conversation tied to what's open (an email "thread:<id>" or a sale
 * "sale:<id>"): the latest one, or a new one named after it.
 */
export async function openContextConversation(contextKey: string): Promise<{ conversation: Conversation; messages: ChatMessage[] } | null> {
  const email = await getEmail();
  const m = /^(thread|sale):([0-9a-f-]{36})$/i.exec(contextKey);
  if (!m) return null;
  const [, kind, id] = m;
  let label: string | null = null;
  if (kind === "thread") {
    const { data } = await supabase.from("inbox_threads").select("subject, from_name").eq("id", id).maybeSingle();
    if (!data) return null;
    label = `Email: ${data.subject || data.from_name || "conversa"}`;
  } else {
    const { data } = await supabase.from("sales").select("notion_id, date, services(name)").eq("id", id).maybeSingle();
    if (!data) return null;
    const svc = (data.services as unknown as { name?: string } | null)?.name;
    label = `Venda: ${[data.notion_id, data.date, svc].filter(Boolean).join(" · ")}`;
  }
  const { data: existing } = await supabase
    .from("ai_chat_conversations")
    .select("id, title, created_at, updated_at, context_key, context_label")
    .eq("user_email", email)
    .eq("context_key", contextKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let conversation = existing as Conversation | null;
  if (!conversation) {
    const { data, error } = await supabase
      .from("ai_chat_conversations")
      .insert({ id: crypto.randomUUID(), user_email: email, title: label, context_key: contextKey, context_label: label })
      .select("id, title, created_at, updated_at, context_key, context_label")
      .single();
    if (error) throw new Error(error.message);
    conversation = data as Conversation;
  }
  const { data: msgs } = await supabase
    .from("ai_chat_messages")
    .select("id, conversation_id, role, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });
  return { conversation, messages: (msgs ?? []) as ChatMessage[] };
}
