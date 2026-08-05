import express from "express";
import cron from "node-cron";
import { config } from "./config";
import { recordClick } from "./db";
import { runCycle } from "./cycle";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Redirect rastreado: cada post aponta para /go/:postId, que loga o clique
 * no Supabase e redireciona para o link de afiliado da Binx. É a métrica
 * que diz qual tipo de notícia converte.
 */
app.get("/go/:postId", (req, res) => {
  if (!config.binxAffiliateUrl) {
    res.status(404).send("Link de afiliado ainda não configurado.");
    return;
  }
  const { postId } = req.params;
  // Não bloqueia o redirect esperando o insert
  void recordClick(postId, req.get("user-agent") ?? "", req.get("referer") ?? "");
  res.redirect(302, config.binxAffiliateUrl);
});

app.listen(config.port, () => {
  console.log(`Servidor de redirect ouvindo na porta ${config.port}`);
});

cron.schedule(config.cronSchedule, () => {
  runCycle().catch((err) => console.error("Ciclo falhou:", err));
});

// Roda um ciclo imediatamente ao subir, útil para validar o deploy
runCycle().catch((err) => console.error("Ciclo inicial falhou:", err));
