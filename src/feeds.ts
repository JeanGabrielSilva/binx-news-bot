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
  { name: "Portal do Bitcoin", url: "https://portaldobitcoin.uol.com.br/feed/" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
];

const parser = new Parser({ timeout: 15000 });

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
