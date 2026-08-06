import Link from "next/link";
import { serverSupabase } from "../lib/supabase";
import { toggleBot, saveSettings, queueArticle, unqueueArticle, discardArticle } from "./actions";
import { ActivityChart } from "./chart";

export const dynamic = "force-dynamic";

const DEFAULT_TEMPLATE = [
  "<b>{titulo}</b>",
  "",
  "{resumo}",
  "",
  "{ativo_linha}",
  "📰 {fonte}",
  "{cta}",
].join("\n");

const TZ = "America/Sao_Paulo";

interface PerformanceRow {
  post_id: string;
  title: string;
  source: string;
  asset: string | null;
  posted_at: string;
  clicks: number;
}

interface ArticleItem {
  id: string;
  title: string;
  source: string;
  url: string;
  status: string;
  importancia: number | null;
  titulo_post: string | null;
  resumo: string | null;
  ativo: string | null;
  avaliado_em: string | null;
}

/** Próximo disparo do cron (a cada 15 min, nos quartos de hora). */
function nextCycleAt(): Date {
  const quarter = 15 * 60 * 1000;
  return new Date(Math.ceil((Date.now() + 1000) / quarter) * quarter);
}

function fmtDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { salvo?: string; aba?: string };
}) {
  const aba = searchParams.aba ?? "geral";
  const supabase = serverSupabase();

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: settings },
    { data: performance },
    { count: totalArticles },
    { data: fila },
    { data: avaliadas },
    { data: recentPosts },
    { data: recentClicks },
  ] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("post_performance").select("*").limit(50),
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase
      .from("articles")
      .select("id, title, source, url, status, importancia, titulo_post, resumo, ativo, avaliado_em")
      .eq("status", "fila")
      .order("importancia", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(100),
    supabase
      .from("articles")
      .select("id, title, source, url, status, importancia, titulo_post, resumo, ativo, avaliado_em")
      .in("status", ["avaliado", "descartado"])
      .order("avaliado_em", { ascending: false })
      .limit(60),
    supabase.from("posts").select("posted_at").gte("posted_at", since),
    supabase.from("clicks").select("clicked_at").gte("clicked_at", since),
  ]);

  const rows = (performance ?? []) as PerformanceRow[];
  const filaRows = (fila ?? []) as ArticleItem[];
  const avaliadasRows = (avaliadas ?? []) as ArticleItem[];
  const totalPosts = rows.length;
  const totalClicks = rows.reduce((sum, row) => sum + Number(row.clicks), 0);
  const enabled = settings?.bot_enabled ?? true;

  // Série diária dos últimos 14 dias (preenchendo dias sem atividade)
  const days: { label: string; posts: number; clicks: number }[] = [];
  const dayKey = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  for (let i = 13; i >= 0; i--) {
    days.push({ label: dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)), posts: 0, clicks: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.label, i]));
  for (const p of recentPosts ?? []) {
    const idx = dayIndex.get(dayKey(new Date(p.posted_at)));
    if (idx !== undefined) days[idx].posts++;
  }
  for (const c of recentClicks ?? []) {
    const idx = dayIndex.get(dayKey(new Date(c.clicked_at)));
    if (idx !== undefined) days[idx].clicks++;
  }

  const tabs = [
    { key: "geral", label: "Visão geral" },
    { key: "fila", label: `Fila (${filaRows.length})` },
    { key: "avaliadas", label: `Avaliadas (${avaliadasRows.length})` },
    { key: "config", label: "Configurações" },
  ];

  return (
    <main className="dash">
      <header>
        <h1>CX Cryptos — Painel do Bot</h1>
        <form action={toggleBot}>
          <button type="submit" className={enabled ? "btn-on" : "btn-off"}>
            {enabled ? "● Publicações ATIVAS — clique para pausar" : "○ Publicações PAUSADAS — clique para ativar"}
          </button>
        </form>
        <p className="hint">
          Próximo ciclo: <b>{fmtDateTime(nextCycleAt())}</b> (horário de Brasília) — publica até{" "}
          {settings?.max_posts_per_cycle ?? 3} post(s) da fila.
        </p>
      </header>

      <nav className="tabs">
        {tabs.map((t) => (
          <Link key={t.key} href={`/?aba=${t.key}`} className={aba === t.key ? "tab active" : "tab"}>
            {t.label}
          </Link>
        ))}
      </nav>

      {aba === "geral" && (
        <>
          <section className="stats">
            <div className="stat"><span>{totalArticles ?? 0}</span>notícias captadas</div>
            <div className="stat"><span>{filaRows.length}</span>na fila</div>
            <div className="stat"><span>{totalPosts}</span>posts recentes</div>
            <div className="stat"><span>{totalClicks}</span>cliques no afiliado</div>
          </section>

          <section className="card">
            <h2>Atividade — últimos 14 dias</h2>
            <ActivityChart days={days} />
          </section>

          <section className="card">
            <h2>Últimos posts e cliques</h2>
            <table>
              <thead>
                <tr><th>Data</th><th>Título</th><th>Fonte</th><th>Ativo</th><th>Cliques</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.post_id}>
                    <td>{fmtDateTime(row.posted_at)}</td>
                    <td>{row.title}</td>
                    <td>{row.source}</td>
                    <td>{row.asset ?? "—"}</td>
                    <td className="num">{row.clicks}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5}>Nenhum post ainda.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}

      {aba === "fila" && (
        <section className="card">
          <h2>Fila de publicação</h2>
          <p className="hint">
            Ordenada por importância. O bot publica os primeiros {settings?.max_posts_per_cycle ?? 3} no
            próximo ciclo ({fmtDateTime(nextCycleAt())}).
          </p>
          <table>
            <thead>
              <tr><th>#</th><th>Post</th><th>Fonte</th><th>Nota</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
              {filaRows.map((item, i) => (
                <tr key={item.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <b>{item.titulo_post ?? item.title}</b>
                    {item.resumo && <div className="resumo">{item.resumo}</div>}
                  </td>
                  <td>{item.source}</td>
                  <td className="num">{item.importancia ?? "—"}/5</td>
                  <td>{item.ativo || "—"}</td>
                  <td>
                    <form action={unqueueArticle}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="btn-small btn-gray">Tirar da fila</button>
                    </form>
                  </td>
                </tr>
              ))}
              {filaRows.length === 0 && <tr><td colSpan={6}>Fila vazia — tudo publicado.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {aba === "avaliadas" && (
        <section className="card">
          <h2>Notícias avaliadas</h2>
          <p className="hint">
            Notícias que o Claude avaliou mas não entraram na fila (nota abaixo da mínima ou descartadas).
            Você pode promover qualquer uma para a fila.
          </p>
          <table>
            <thead>
              <tr><th>Avaliada em</th><th>Post</th><th>Fonte</th><th>Nota</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {avaliadasRows.map((item) => (
                <tr key={item.id}>
                  <td>{item.avaliado_em ? fmtDateTime(item.avaliado_em) : "—"}</td>
                  <td>
                    <b>{item.titulo_post ?? item.title}</b>
                    {item.resumo && <div className="resumo">{item.resumo}</div>}
                    <a href={item.url} target="_blank" rel="noreferrer" className="fonte-link">ver matéria original ↗</a>
                  </td>
                  <td>{item.source}</td>
                  <td className="num">{item.importancia ?? "—"}/5</td>
                  <td>{item.status === "descartado" ? "🗑 descartada" : "⏸ fora da fila"}</td>
                  <td className="acoes">
                    <form action={queueArticle}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="btn-small btn-blue">➕ Pôr na fila</button>
                    </form>
                    {item.status !== "descartado" && (
                      <form action={discardArticle}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="btn-small btn-gray">Descartar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {avaliadasRows.length === 0 && <tr><td colSpan={6}>Nada avaliado fora da fila ainda.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {aba === "config" && (
        <section className="card">
          <h2>Configurações</h2>
          {searchParams.salvo === "ok" && (
            <p className="saved-ok">✓ Configurações salvas com sucesso. Valem no próximo ciclo (até 15 min).</p>
          )}
          {searchParams.salvo === "erro" && (
            <p className="saved-err">✗ Erro ao salvar — tente novamente.</p>
          )}
          <form action={saveSettings} className="settings-form">
            <label>
              Importância mínima para entrar na fila automaticamente (1–5)
              <input type="number" name="min_importance" min={1} max={5} defaultValue={settings?.min_importance ?? 3} />
            </label>
            <label>
              Máx. de posts por ciclo
              <input type="number" name="max_posts_per_cycle" min={1} max={10} defaultValue={settings?.max_posts_per_cycle ?? 3} />
            </label>
            <label>
              Link de afiliado BingX (vazio = posts sem CTA)
              <input type="url" name="affiliate_url" placeholder="https://bingx.com/invite/..." defaultValue={settings?.affiliate_url ?? ""} />
            </label>
            <label>
              Layout do post — placeholders: {"{titulo} {resumo} {ativo} {ativo_linha} {fonte} {cta}"} (HTML do Telegram: b, i, a)
              <textarea name="post_template" rows={8} defaultValue={settings?.post_template || DEFAULT_TEMPLATE} />
            </label>
            <p className="hint">O disclaimer "não é recomendação de investimento" é sempre anexado automaticamente.</p>
            <button type="submit">Salvar configurações</button>
          </form>
        </section>
      )}
    </main>
  );
}
