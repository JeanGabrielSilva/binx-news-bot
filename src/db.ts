import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import type { FeedItem } from "./feeds";

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export interface ArticleRow {
  id: string;
  guid: string;
  source: string;
  title: string;
  url: string;
  published_at: string | null;
}

/**
 * Insere os itens ignorando GUIDs já vistos e devolve apenas os que são novos.
 * É o mecanismo de dedupe: sem isso o bot repostaria tudo a cada ciclo.
 */
export async function insertNewArticles(items: FeedItem[]): Promise<ArticleRow[]> {
  if (items.length === 0) return [];

  const { data, error } = await supabase
    .from("articles")
    .upsert(
      items.map((item) => ({
        guid: item.guid,
        source: item.source,
        title: item.title,
        url: item.url,
        published_at: item.publishedAt,
      })),
      { onConflict: "guid", ignoreDuplicates: true },
    )
    .select("id, guid, source, title, url, published_at");

  if (error) throw new Error(`Supabase (insertNewArticles): ${error.message}`);
  return data ?? [];
}

/** Registra um post publicado no canal e devolve o id (usado no link /go). */
export async function recordPost(params: {
  articleId: string;
  telegramMessageId: number | null;
  asset: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      article_id: params.articleId,
      telegram_message_id: params.telegramMessageId,
      asset: params.asset || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Supabase (recordPost): ${error.message}`);
  return data.id as string;
}

/** Cria a linha do post antes do envio, para o link /go já existir no texto. */
export async function createPendingPost(articleId: string, asset: string): Promise<string> {
  return recordPost({ articleId, telegramMessageId: null, asset });
}

export async function attachTelegramMessageId(postId: string, messageId: number): Promise<void> {
  const { error } = await supabase
    .from("posts")
    .update({ telegram_message_id: messageId })
    .eq("id", postId);
  if (error) console.warn(`Supabase (attachTelegramMessageId): ${error.message}`);
}

export interface BotSettings {
  bot_enabled: boolean;
  min_importance: number;
  max_posts_per_cycle: number;
  affiliate_url: string;
  post_template: string;
}

/**
 * Lê as configurações editáveis pelo painel (tabela settings, linha única).
 * Devolve null se a tabela ainda não existir — o bot cai no fallback do .env.
 */
export async function getSettings(): Promise<BotSettings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("bot_enabled, min_importance, max_posts_per_cycle, affiliate_url, post_template")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn(`Supabase (getSettings): ${error.message} — usando fallback do .env`);
    return null;
  }
  return data;
}

/** Loga um clique no link de afiliado vindo do redirect /go/:postId. */
export async function recordClick(postId: string, userAgent: string, referer: string): Promise<void> {
  const { error } = await supabase.from("clicks").insert({
    post_id: postId,
    user_agent: userAgent.slice(0, 500),
    referer: referer.slice(0, 500),
  });
  if (error) console.warn(`Supabase (recordClick): ${error.message}`);
}
