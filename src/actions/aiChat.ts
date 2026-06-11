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
    .select("id, title, created_at, updated_at")
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
