import express from "express";
import cron from "node-cron";
import { config } from "./config";
import { recordClick, getSettings } from "./db";
import { runCycle } from "./cycle";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Cache curto do link de afiliado para o redirect não depender de uma query por clique
let cachedAffiliateUrl = config.binxAffiliateUrl;
let cacheLoadedAt = 0;

async function affiliateUrl(): Promise<string> {
  if (Date.now() - cacheLoadedAt > 60_000) {
    const settings = await getSettings();
    cachedAffiliateUrl = settings?.affiliate_url || config.binxAffiliateUrl;
    cacheLoadedAt = Date.now();
  }
  return cachedAffiliateUrl;
}

/**
 * Redirect rastreado: cada post aponta para /go/:postId, que loga o clique
 * no Supabase e redireciona para o link de afiliado da BingX. É a métrica
 * que diz qual tipo de notícia converte.
 */
app.get("/go/:postId", async (req, res) => {
  const target = await affiliateUrl();
  if (!target) {
    res.status(404).send("Link de afiliado ainda não configurado.");
    return;
  }
  const { postId } = req.params;
  // Não bloqueia o redirect esperando o insert
  void recordClick(postId, req.get("user-agent") ?? "", req.get("referer") ?? "");
  res.redirect(302, target);
});

app.listen(config.port, () => {
  console.log(`Servidor de redirect ouvindo na porta ${config.port}`);
});

cron.schedule(config.cronSchedule, () => {
  runCycle().catch((err) => console.error("Ciclo falhou:", err));
});

// Roda um ciclo imediatamente ao subir, útil para validar o deploy
runCycle().catch((err) => console.error("Ciclo inicial falhou:", err));
