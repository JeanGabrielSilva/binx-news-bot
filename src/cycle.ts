import { config } from "./config";
import { fetchAllFeeds } from "./feeds";
import {
  insertNewArticles,
  createPendingPost,
  attachTelegramMessageId,
  getSettings,
} from "./db";
import { summarizeArticle } from "./summarize";
import { buildPostText, sendToChannel, DEFAULT_TEMPLATE } from "./telegram";

/**
 * Um ciclo completo: busca feeds → dedupe no Supabase → resume via Claude →
 * publica no canal os que passarem no filtro de importância.
 * As configurações vêm do painel (tabela settings), com fallback no .env.
 */
export async function runCycle(): Promise<void> {
  const settings = await getSettings();

  const enabled = config.botEnabled && (settings?.bot_enabled ?? true);
  if (!enabled) {
    console.log(`[${new Date().toISOString()}] Publicações pausadas (painel ou BOT_ENABLED).`);
    return;
  }

  const minImportance = settings?.min_importance ?? config.minImportance;
  const maxPosts = settings?.max_posts_per_cycle ?? config.maxPostsPerCycle;
  const affiliateUrl = settings?.affiliate_url || config.binxAffiliateUrl;
  const template = settings?.post_template || DEFAULT_TEMPLATE;

  console.log(`[${new Date().toISOString()}] Iniciando ciclo...`);

  const items = await fetchAllFeeds();
  console.log(`Feeds retornaram ${items.length} itens.`);

  const newArticles = await insertNewArticles(items);
  console.log(`${newArticles.length} artigos novos após dedupe.`);
  if (newArticles.length === 0) return;

  const snippetByGuid = new Map(items.map((item) => [item.guid, item.snippet]));
  let posted = 0;

  for (const article of newArticles) {
    if (posted >= maxPosts) break;

    try {
      const summary = await summarizeArticle(article, snippetByGuid.get(article.guid) ?? "");
      if (!summary.relevante || summary.importancia < minImportance) {
        console.log(`Pulado (${summary.importancia}/5): ${article.title}`);
        continue;
      }

      const postId = await createPendingPost(article.id, summary.ativo);
      const text = buildPostText(article, summary, postId, { template, affiliateUrl });
      const messageId = await sendToChannel(text);
      await attachTelegramMessageId(postId, messageId);

      posted++;
      console.log(`Publicado (${summary.importancia}/5): ${summary.titulo}`);
    } catch (err) {
      console.error(`Erro ao processar "${article.title}":`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Ciclo concluído: ${posted} post(s) publicados.`);
}
