"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverSupabase } from "../lib/supabase";

export async function toggleBot(): Promise<void> {
  const supabase = serverSupabase();
  const { data } = await supabase.from("settings").select("bot_enabled").eq("id", 1).single();
  await supabase
    .from("settings")
    .update({ bot_enabled: !(data?.bot_enabled ?? true), updated_at: new Date().toISOString() })
    .eq("id", 1);
  revalidatePath("/");
}

export async function saveSettings(formData: FormData): Promise<void> {
  const minImportance = Number(formData.get("min_importance") ?? 3);
  const maxPosts = Number(formData.get("max_posts_per_cycle") ?? 3);

  const supabase = serverSupabase();
  const { error } = await supabase
    .from("settings")
    .update({
      min_importance: Math.min(5, Math.max(1, minImportance)),
      max_posts_per_cycle: Math.min(10, Math.max(1, maxPosts)),
      affiliate_url: String(formData.get("affiliate_url") ?? "").trim(),
      post_template: String(formData.get("post_template") ?? ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  revalidatePath("/");
  redirect(error ? "/?aba=config&salvo=erro" : "/?aba=config&salvo=ok");
}

async function setArticleStatus(formData: FormData, status: string, backTo: string): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = serverSupabase();
  await supabase.from("articles").update({ status }).eq("id", id);
  revalidatePath("/");
  redirect(backTo);
}

/** Move uma notícia avaliada/descartada para a fila de publicação. */
export async function queueArticle(formData: FormData): Promise<void> {
  await setArticleStatus(formData, "fila", "/?aba=avaliadas");
}

/** Tira da fila (volta para avaliadas). */
export async function unqueueArticle(formData: FormData): Promise<void> {
  await setArticleStatus(formData, "avaliado", "/?aba=fila");
}

/** Descarta uma notícia avaliada. */
export async function discardArticle(formData: FormData): Promise<void> {
  await setArticleStatus(formData, "descartado", "/?aba=avaliadas");
}
