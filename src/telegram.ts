import { config } from "./config";
import type { ArticleRow } from "./db";
import type { Summary } from "./summarize";

const API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Monta o texto do post em HTML do Telegram, com CTA neutro e disclaimer fixo. */
export function buildPostText(article: ArticleRow, summary: Summary, postId: string): string {
  const lines = [
    `<b>${escapeHtml(summary.titulo)}</b>`,
    "",
    escapeHtml(summary.resumo),
    "",
    `📰 <a href="${article.url}">Fonte: ${escapeHtml(article.source)}</a>`,
  ];

  // CTA só entra quando o link de afiliado estiver configurado
  if (config.binxAffiliateUrl) {
    const goLink = `${config.publicBaseUrl.replace(/\/$/, "")}/go/${postId}`;
    const ctaLabel = summary.ativo
      ? `Negocie ${escapeHtml(summary.ativo)} na BingX com condições especiais`
      : "Abra sua conta na BingX com condições especiais";
    lines.push(`📈 <a href="${goLink}">${ctaLabel}</a>`);
  }

  lines.push("", `<i>Conteúdo informativo. Isto não é recomendação de investimento.</i>`);
  return lines.join("\n");
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
