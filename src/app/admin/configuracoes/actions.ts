"use server";

import { auth } from "@/lib/auth";
import { supabase } from "@/lib/notion";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") throw new Error("Unauthorized");
}

export async function updateBusinessRule(name: string, value: string) {
  await requireAdmin();
  const { error } = await supabase
    .from("business_rules")
    .update({ value: value.trim() })
    .eq("name", name);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/configuracoes");
}

export async function createBusinessRule(name: string, value: string, notes: string) {
  await requireAdmin();
  const cleanName = name.trim().toLowerCase().replace(/\s+/g, "_");
  const { error } = await supabase.from("business_rules").insert({
    id: crypto.randomUUID(),
    name: cleanName,
    value: value.trim(),
    notes: notes.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/configuracoes");
}

export async function deleteBusinessRule(name: string) {
  await requireAdmin();
  const { error } = await supabase.from("business_rules").delete().eq("name", name);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/configuracoes");
}
