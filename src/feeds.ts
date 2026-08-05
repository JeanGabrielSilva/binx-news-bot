import Parser from "rss-parser";

export interface FeedItem {
  guid: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string;
}

/** Fontes públicas via RSS — resumo próprio + link para a matéria original. */
const FEEDS: { name: string; url: string }[] = [
  { name: "Cointelegraph Brasil", url: "https://cointelegraph.com.br/rss" },
  { name: "Livecoins", url: "https://livecoins.com.br/feed/" },
  { name: "BeInCrypto Brasil", url: "https://br.beincrypto.com/feed/" },
  { name: "CriptoFácil", url: "https://criptofacil.com/feed/" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
];

const parser = new Parser({
  timeout: 15000,
  headers: {
    // Alguns veículos retornam 403 para user-agents de bot/datacenter
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  },
});

/** Busca todos os feeds e devolve os itens normalizados, mais recentes primeiro. */
export async function fetchAllFeeds(): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items ?? []).map((item): FeedItem => ({
        guid: item.guid ?? item.link ?? `${feed.name}:${item.title}`,
        source: feed.name,
        title: item.title ?? "",
        url: item.link ?? "",
        publishedAt: item.isoDate ?? null,
        snippet: (item.contentSnippet ?? "").slice(0, 1500),
      }));
    }),
  );

  const items: FeedItem[] = [];
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.warn(`Feed falhou (${FEEDS[i].name}):`, result.reason?.message ?? result.reason);
    }
  }

  return items
    .filter((item) => item.title && item.url)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
