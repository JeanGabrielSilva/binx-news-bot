"use server";

import { revalidatePath } from "next/cache";
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
  await supabase
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
}
