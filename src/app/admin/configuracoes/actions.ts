"use server";

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Unauthorized");
}

export async function updateBusinessRule(key: string, value: string) {
  await requireAdmin();
  const { error } = await supabase
    .from("business_rules")
    .update({ value: value.trim() })
    .eq("key", key);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/configuracoes");
}

export async function createBusinessRule(key: string, value: string, description: string) {
  await requireAdmin();
  const cleanKey = key.trim().toLowerCase().replace(/\s+/g, "_");
  const { error } = await supabase.from("business_rules").insert({
    id: crypto.randomUUID(),
    key: cleanKey,
    value: value.trim(),
    description: description.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/configuracoes");
}

export async function deleteBusinessRule(key: string) {
  await requireAdmin();
  const { error } = await supabase.from("business_rules").delete().eq("key", key);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/configuracoes");
}
