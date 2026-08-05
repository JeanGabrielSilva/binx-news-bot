import { config } from "./config";
import { fetchAllFeeds } from "./feeds";
import { insertNewArticles, createPendingPost, attachTelegramMessageId } from "./db";
import { summarizeArticle } from "./summarize";
import { buildPostText, sendToChannel } from "./telegram";

/**
 * Um ciclo completo: busca feeds → dedupe no Supabase → resume via Claude →
 * publica no canal os que passarem no filtro de importância.
 */
export async function runCycle(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Iniciando ciclo...`);

  const items = await fetchAllFeeds();
  console.log(`Feeds retornaram ${items.length} itens.`);

  const newArticles = await insertNewArticles(items);
  console.log(`${newArticles.length} artigos novos após dedupe.`);
  if (newArticles.length === 0) return;

  const snippetByGuid = new Map(items.map((item) => [item.guid, item.snippet]));
  let posted = 0;

  for (const article of newArticles) {
    if (posted >= config.maxPostsPerCycle) break;

    try {
      const summary = await summarizeArticle(article, snippetByGuid.get(article.guid) ?? "");
      if (!summary.relevante || summary.importancia < config.minImportance) {
        console.log(`Pulado (${summary.importancia}/5): ${article.title}`);
        continue;
      }

      const postId = await createPendingPost(article.id, summary.ativo);
      const text = buildPostText(article, summary, postId);
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
