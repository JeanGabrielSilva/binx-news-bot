import { config } from "./config";
import { fetchAllFeeds } from "./feeds";
import {
  insertNewArticles,
  createPendingPost,
  attachTelegramMessageId,
  getSettings,
  saveEvaluation,
  getPendingEvaluation,
  getQueue,
  markPublished,
} from "./db";
import { summarizeArticle } from "./summarize";
import { buildPostText, sendToChannel, DEFAULT_TEMPLATE } from "./telegram";

/**
 * Ciclo em duas etapas:
 * 1. Avaliação — notícias novas são resumidas pelo Claude e classificadas:
 *    descartado (irrelevante), avaliado (abaixo da nota mínima, revisável no
 *    painel) ou fila (entra na fila de publicação).
 * 2. Publicação — os primeiros N da fila são postados no canal.
 * O painel pode mover artigos entre avaliado <-> fila a qualquer momento.
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

  // Etapa 1: buscar e avaliar notícias novas
  const items = await fetchAllFeeds();
  console.log(`Feeds retornaram ${items.length} itens.`);

  const newArticles = await insertNewArticles(items);
  console.log(`${newArticles.length} artigos novos após dedupe.`);

  // Avalia tudo que está pendente (novos + eventuais presos de ciclos anteriores)
  const pending = await getPendingEvaluation(30);
  const snippetByGuid = new Map(items.map((item) => [item.guid, item.snippet]));

  for (const article of pending) {
    try {
      const summary = await summarizeArticle(article, snippetByGuid.get(article.guid) ?? "");
      const status = !summary.relevante
        ? "descartado"
        : summary.importancia >= minImportance
          ? "fila"
          : "avaliado";
      await saveEvaluation(article.id, summary, status);
      console.log(`Avaliado (${summary.importancia}/5 → ${status}): ${article.title}`);
    } catch (err) {
      console.error(`Erro ao avaliar "${article.title}":`, err instanceof Error ? err.message : err);
    }
  }

  // Etapa 2: publicar os primeiros da fila
  const queue = await getQueue(maxPosts);
  let posted = 0;

  for (const item of queue) {
    try {
      const summary = {
        relevante: true,
        importancia: item.importancia ?? 3,
        titulo: item.titulo_post ?? item.title,
        resumo: item.resumo ?? "",
        ativo: item.ativo ?? "",
      };

      const postId = await createPendingPost(item.id, summary.ativo);
      const text = buildPostText(item, summary, postId, { template, affiliateUrl });
      const messageId = await sendToChannel(text);
      await attachTelegramMessageId(postId, messageId);
      await markPublished(item.id);

      posted++;
      console.log(`Publicado (${summary.importancia}/5): ${summary.titulo}`);
    } catch (err) {
      console.error(`Erro ao publicar "${item.title}":`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Ciclo concluído: ${posted} post(s) publicados.`);
}
