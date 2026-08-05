import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import type { ArticleRow } from "./db";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

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

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`Resposta sem bloco de texto (stop_reason: ${response.stop_reason})`);
  }
  return JSON.parse(text.text) as Summary;
}
