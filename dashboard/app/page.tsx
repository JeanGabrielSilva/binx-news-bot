import Link from "next/link";
import { serverSupabase } from "../lib/supabase";
import { railwayCosts } from "../lib/railway";
import { bingxConversions } from "../lib/bingx";
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

/** Cotação USD→BRL (AwesomeAPI, cache de 1h; fallback conservador se falhar). */
async function usdToBrl(): Promise<{ rate: number; live: boolean }> {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
      next: { revalidate: 3600 },
    });
    const data = (await res.json()) as { USDBRL?: { bid?: string } };
    const rate = Number(data.USDBRL?.bid);
    if (rate > 0) return { rate, live: true };
  } catch {
    // segue para o fallback
  }
  return { rate: 5.5, live: false };
}

function brl(value: number, decimals = 2): string {
  return `R$ ${value.toFixed(decimals).replace(".", ",")}`;
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

  const [{ data: usage }, cambio, railway] = await Promise.all([
    supabase.from("api_usage").select("cost_usd, created_at").order("created_at", { ascending: false }).limit(5000),
    usdToBrl(),
    railwayCosts(),
  ]);

  // Agregados de custo (USD) por período, no fuso de Brasília
  const dayKeyOf = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TZ });
  const monthKeyOf = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TZ, month: "2-digit", year: "numeric" });
  const now = new Date();
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let costToday = 0;
  let costWeek = 0;
  let costMonth = 0;
  let costAll = 0;
  for (const u of usage ?? []) {
    const d = new Date(u.created_at);
    const c = Number(u.cost_usd);
    costAll += c;
    if (dayKeyOf(d) === dayKeyOf(now)) costToday += c;
    if (d.getTime() >= weekCutoff) costWeek += c;
    if (monthKeyOf(d) === monthKeyOf(now)) costMonth += c;
  }

  // Média por publicação: custo total rastreado / posts publicados no mesmo período
  const trackingStart = usage && usage.length > 0 ? usage[usage.length - 1].created_at : null;
  let postsSinceTracking = 0;
  if (trackingStart) {
    const { count } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .gte("posted_at", trackingStart);
    postsSinceTracking = count ?? 0;
  }
  const rate = cambio.rate;
  const avgPerPostBrl = postsSinceTracking > 0 ? (costAll * rate) / postsSinceTracking : 0;

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
    { key: "conversoes", label: "Conversões" },
    { key: "config", label: "Configurações" },
  ];

  const conversoes = aba === "conversoes" ? await bingxConversions() : null;
  const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;

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
            <h2>Gastos com IA (Claude)</h2>
            <div className="stats">
              <div className="stat"><span>{brl(costToday * rate, 4)}</span>hoje</div>
              <div className="stat"><span>{brl(costWeek * rate, 4)}</span>últimos 7 dias</div>
              <div className="stat"><span>{brl(costMonth * rate, 4)}</span>mês atual</div>
              <div className="stat"><span className="small-num">{brl(avgPerPostBrl, 8)}</span>média por publicação</div>
            </div>
            <p className="hint">
              Câmbio: US$ 1 = {brl(rate, 4)}
              {cambio.live ? " (cotação ao vivo, atualizada a cada hora)" : " (cotação padrão — API de câmbio indisponível)"}.
              {" "}Total gasto desde o início do rastreio: {brl(costAll * rate, 4)}
              {trackingStart ? ` (desde ${fmtDateTime(trackingStart)})` : " (nenhuma chamada registrada ainda)"}.
            </p>
          </section>

          <section className="card">
            <h2>Infraestrutura (Railway)</h2>
            {railway.ok ? (
              <>
                <div className="stats">
                  <div className="stat"><span>{brl(railway.currentUsd * rate, 4)}</span>gasto no mês até agora</div>
                  <div className="stat"><span>{brl(railway.estimatedUsd * rate, 2)}</span>projeção do mês</div>
                </div>
                <p className="hint">
                  Valores calculados sobre o uso de RAM, CPU e tráfego reportados pela API do Railway.
                  Se vocês estão no plano Hobby, os primeiros US$ 5/mês já estão inclusos na assinatura.
                </p>
              </>
            ) : railway.reason === "nao_configurado" ? (
              <p className="hint">
                Para exibir os custos do Railway: crie um token em railway.app → Account Settings → Tokens,
                copie o Project ID em Settings do projeto, e adicione as variáveis{" "}
                <code>RAILWAY_API_TOKEN</code> e <code>RAILWAY_PROJECT_ID</code> no Vercel (depois faça Redeploy).
              </p>
            ) : (
              <p className="saved-err">Não foi possível consultar a API do Railway: {railway.reason}</p>
            )}
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

      {aba === "conversoes" && conversoes && (
        <>
          {!conversoes.ok && conversoes.reason === "nao_configurado" && (
            <section className="card">
              <h2>Conversões (BingX)</h2>
              <p className="hint">
                Para ativar: adicione as variáveis <code>BINGX_API_KEY</code> e <code>BINGX_SECRET_KEY</code> no
                Vercel (Settings → Environment Variables) e faça Redeploy. Use uma chave somente-leitura criada em
                BingX → User Center → API Management.
              </p>
            </section>
          )}
          {!conversoes.ok && conversoes.reason !== "nao_configurado" && (
            <section className="card">
              <h2>Conversões (BingX)</h2>
              <p className="saved-err">Erro ao consultar a API da BingX: {conversoes.reason}</p>
            </section>
          )}
          {conversoes.ok && (
            <>
              <section className="card">
                <h2>Meta: US$ 1.000.000 em volume negociado</h2>
                <div className="progress-outer">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(100, (conversoes.volumeTotal / conversoes.goalUsd) * 100)}%` }}
                  />
                </div>
                <p className="hint">
                  {usd(conversoes.volumeTotal)} de {usd(conversoes.goalUsd)} (
                  {((conversoes.volumeTotal / conversoes.goalUsd) * 100).toFixed(4)}%) — volume acumulado dos
                  convidados desde ago/2026, direto da API de agente da BingX. Atualiza a cada 15 min.
                </p>
              </section>

              <section className="stats">
                <div className="stat"><span>{conversoes.invitedTotal}</span>cadastros pelo link</div>
                <div className="stat"><span>{conversoes.deposited}</span>depositaram</div>
                <div className="stat"><span>{conversoes.traded}</span>negociaram</div>
                <div className="stat"><span>{usd(conversoes.commissionTotal)}</span>comissão acumulada</div>
              </section>

              <section className="stats">
                <div className="stat"><span>{usd(conversoes.volume30d)}</span>volume — últimos 30 dias</div>
                <div className="stat"><span>{usd(conversoes.commission30d)}</span>comissão — últimos 30 dias</div>
              </section>

              <section className="card">
                <h2>Últimos cadastros</h2>
                <table>
                  <thead>
                    <tr><th>UID</th><th>Cadastro</th><th>KYC</th><th>Depositou</th><th>Negociou</th></tr>
                  </thead>
                  <tbody>
                    {conversoes.recent.map((u) => (
                      <tr key={u.uid}>
                        <td>{u.uid}</td>
                        <td>{fmtDateTime(new Date(u.registerTime))}</td>
                        <td>{u.kycResult === "true" ? "✓" : "—"}</td>
                        <td>{u.deposit ? "✓" : "—"}</td>
                        <td>{u.trade ? "✓" : "—"}</td>
                      </tr>
                    ))}
                    {conversoes.recent.length === 0 && (
                      <tr><td colSpan={5}>Nenhum cadastro pelo link ainda — divulguem o canal! 🚀</td></tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
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
              Layout do post — placeholders: {"{titulo} {resumo} {ativo} {ativo_linha} {fonte} {cta} {disclaimer}"} (HTML do Telegram: b, i, a)
              <textarea name="post_template" rows={8} defaultValue={settings?.post_template || DEFAULT_TEMPLATE} />
            </label>
            <p className="hint">
              O disclaimer é opcional: adicione {"{disclaimer}"} ao template para incluir a linha
              "não é recomendação de investimento" (recomendado por proteção jurídica).
            </p>
            <button type="submit">Salvar configurações</button>
          </form>
        </section>
      )}
    </main>
  );
}
