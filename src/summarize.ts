import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { recordApiUsage } from "./db";
import type { ArticleRow } from "./db";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/** Preço por milhão de tokens (USD) — tabela oficial da Anthropic. */
const PRICE_PER_MTOK_USD: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
};

export interface Summary {
  relevante: boolean;
  importancia: number;
  titulo: string;
  resumo: string;
  ativo: string;
}

const SYSTEM_PROMPT = `Você é o editor de um canal brasileiro no Telegram sobre o mercado de criptomoedas.
Sua função é avaliar notícias e transformar as relevantes em posts curtos em português do Brasil.

Regras:
- "relevante" é true apenas para notícias com impacto real no mercado cripto (preço, regulação, adoção institucional, hacks, ETFs, halving, decisões de bancos centrais que afetem cripto). Fofoca, conteúdo patrocinado e listicles genéricos são false.
- "importancia" vai de 1 (irrelevante) a 5 (urgente, move mercado).
- "titulo": chamativo mas fiel ao fato, máximo 80 caracteres, sem clickbait mentiroso.
- "resumo": 2 a 3 frases objetivas em pt-BR explicando o fato e por que importa. Não invente números que não estejam no texto.
- "ativo": o símbolo do principal ativo citado (BTC, ETH, SOL...), ou string vazia se não houver um claro.
- NUNCA escreva recomendação de compra ou venda, previsão de preço, ou frases como "hora de comprar". O post é informativo, não é call de investimento.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    relevante: { type: "boolean" },
    importancia: { type: "integer", enum: [1, 2, 3, 4, 5] },
    titulo: { type: "string" },
    resumo: { type: "string" },
    ativo: { type: "string" },
  },
  required: ["relevante", "importancia", "titulo", "resumo", "ativo"],
  additionalProperties: false,
} as const;

/** Avalia e resume uma notícia via Claude, com saída JSON garantida por schema. */
export async function summarizeArticle(article: ArticleRow, snippet: string): Promise<Summary> {
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Fonte: ${article.source}\nTítulo original: ${article.title}\nLink: ${article.url}\n\nTrecho:\n${snippet}`,
      },
    ],
  });

  // Registra tokens e custo desta chamada (não bloqueia o fluxo se falhar)
  const price = PRICE_PER_MTOK_USD[config.anthropicModel];
  if (price) {
    const costUsd =
      (response.usage.input_tokens * price.input + response.usage.output_tokens * price.output) / 1_000_000;
    void recordApiUsage({
      articleId: article.id,
      model: config.anthropicModel,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd,
    }).catch(() => {});
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`Resposta sem bloco de texto (stop_reason: ${response.stop_reason})`);
  }
  return JSON.parse(text.text) as Summary;
}
