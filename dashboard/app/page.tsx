import { serverSupabase } from "../lib/supabase";
import { toggleBot, saveSettings } from "./actions";

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

interface PerformanceRow {
  post_id: string;
  title: string;
  source: string;
  asset: string | null;
  posted_at: string;
  clicks: number;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { salvo?: string };
}) {
  const supabase = serverSupabase();

  const [{ data: settings }, { data: performance }, { count: totalArticles }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("post_performance").select("*").limit(50),
    supabase.from("articles").select("id", { count: "exact", head: true }),
  ]);

  const rows = (performance ?? []) as PerformanceRow[];
  const totalPosts = rows.length;
  const totalClicks = rows.reduce((sum, row) => sum + Number(row.clicks), 0);
  const enabled = settings?.bot_enabled ?? true;

  // Posts por dia (últimos 14 dias) a partir dos dados já carregados
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const day = new Date(row.posted_at).toLocaleDateString("pt-BR");
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return (
    <main className="dash">
      <header>
        <h1>CX Cryptos — Painel do Bot</h1>
        <form action={toggleBot}>
          <button type="submit" className={enabled ? "btn-on" : "btn-off"}>
            {enabled ? "● Publicações ATIVAS — clique para pausar" : "○ Publicações PAUSADAS — clique para ativar"}
          </button>
        </form>
        <p className="hint">Mudanças valem no próximo ciclo do bot (até 15 min).</p>
      </header>

      <section className="stats">
        <div className="stat"><span>{totalArticles ?? 0}</span>notícias avaliadas</div>
        <div className="stat"><span>{totalPosts}</span>posts recentes</div>
        <div className="stat"><span>{totalClicks}</span>cliques no afiliado</div>
      </section>

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
            Importância mínima (1–5)
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

      <section className="card">
        <h2>Posts por dia</h2>
        <table>
          <tbody>
            {[...byDay.entries()].map(([day, count]) => (
              <tr key={day}>
                <td>{day}</td>
                <td>{"█".repeat(Math.min(count, 40))} {count}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
                <td>{new Date(row.posted_at).toLocaleString("pt-BR")}</td>
                <td>{row.title}</td>
                <td>{row.source}</td>
                <td>{row.asset ?? "—"}</td>
                <td className="num">{row.clicks}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5}>Nenhum post ainda.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
