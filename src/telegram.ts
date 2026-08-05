import { config } from "./config";
import type { ArticleRow } from "./db";
import type { Summary } from "./summarize";

const API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Template padrão do post. Placeholders: {titulo} {resumo} {ativo} {fonte} {cta}.
 * O painel pode sobrescrever via settings.post_template.
 */
export const DEFAULT_TEMPLATE = ["<b>{titulo}</b>", "", "{resumo}", "", "📰 {fonte}", "{cta}"].join("\n");

/** Disclaimer obrigatório — sempre anexado, independente do template (compliance). */
const DISCLAIMER = "<i>Conteúdo informativo. Isto não é recomendação de investimento.</i>";

export interface PostLayout {
  template: string;
  affiliateUrl: string;
}

export function buildPostText(
  article: ArticleRow,
  summary: Summary,
  postId: string,
  layout: PostLayout,
): string {
  const fonte = `<a href="${article.url}">Fonte: ${escapeHtml(article.source)}</a>`;

  let cta = "";
  if (layout.affiliateUrl) {
    const goLink = `${config.publicBaseUrl.replace(/\/$/, "")}/go/${postId}`;
    const label = summary.ativo
      ? `Negocie ${escapeHtml(summary.ativo)} na BingX com condições especiais`
      : "Abra sua conta na BingX com condições especiais";
    cta = `📈 <a href="${goLink}">${label}</a>`;
  }

  const body = (layout.template || DEFAULT_TEMPLATE)
    .replaceAll("{titulo}", escapeHtml(summary.titulo))
    .replaceAll("{resumo}", escapeHtml(summary.resumo))
    .replaceAll("{ativo}", escapeHtml(summary.ativo))
    .replaceAll("{fonte}", fonte)
    .replaceAll("{cta}", cta)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return `${body}\n\n${DISCLAIMER}`;
}

/** Publica no canal e devolve o message_id do Telegram. */
export async function sendToChannel(text: string): Promise<number> {
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChannelId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });

  const body = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
  if (!body.ok || !body.result) {
    throw new Error(`Telegram sendMessage falhou: ${body.description ?? res.status}`);
  }
  return body.result.message_id;
}
