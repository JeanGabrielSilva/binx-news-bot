import "dotenv/config";

/** Carrega e valida as variáveis de ambiente na inicialização. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  /** Haiku 4.5 por padrão (custo baixo, conforme o plano); troque para claude-opus-5 se quiser mais qualidade. */
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",

  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  /** "@seucanal" ou o ID numérico (-100...). */
  telegramChannelId: required("TELEGRAM_CHANNEL_ID"),

  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  /** Link de afiliado da BingX. Vazio = posts saem sem CTA até o link existir. */
  binxAffiliateUrl: process.env.BINX_AFFILIATE_URL ?? "",
  /** URL pública do serviço no Railway, usada nos links /go de rastreio. */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",

  port: Number(process.env.PORT ?? 3000),
  /** Cron do ciclo de busca (padrão: a cada 15 minutos). */
  cronSchedule: process.env.CRON_SCHEDULE ?? "*/15 * * * *",
  /** Máximo de posts publicados por ciclo, para não inundar o canal. */
  maxPostsPerCycle: Number(process.env.MAX_POSTS_PER_CYCLE ?? 3),
  /** Importância mínima (1-5) para uma notícia virar post. */
  minImportance: Number(process.env.MIN_IMPORTANCE ?? 3),
};
