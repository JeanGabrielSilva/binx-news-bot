# binx-news-bot

Bot que busca notícias de cripto em feeds RSS confiáveis, resume via Claude (pt-BR),
publica no canal do Telegram com CTA neutro + disclaimer, e rastreia cliques no link
de afiliado da Binx via redirect próprio (`/go/:postId`) logado no Supabase.

## Fluxo

```
cron (15 min) → RSS (Cointelegraph BR, Livecoins, Portal do Bitcoin, CoinDesk)
             → dedupe por GUID (tabela articles no Supabase)
             → Claude avalia relevância (1-5) e resume em pt-BR
             → posts com importância >= 3 vão para o canal (máx. 3 por ciclo)
             → link "Negocie X na Binx" passa por /go/:postId (loga clique) → afiliado
```

## Setup (uma vez)

1. **Telegram**
   - Fale com o [@BotFather](https://t.me/BotFather) → `/newbot` → guarde o token.
   - Crie o canal e adicione o bot como **administrador** (permissão de postar).
   - Use `@nomedocanal` como `TELEGRAM_CHANNEL_ID` (ou o ID `-100...` se o canal for privado).

2. **Supabase**
   - No projeto, abra o SQL Editor e rode o conteúdo de `schema.sql`.
   - Copie `SUPABASE_URL` e a `service_role` key em Settings → API.

3. **Claude API**
   - Crie uma chave em console.anthropic.com → API Keys.

4. **Local**
   ```bash
   npm install
   copy .env.example .env   # preencha os valores
   npm run cycle            # roda UM ciclo para testar
   ```

5. **Railway**
   - Crie um serviço a partir deste repositório.
   - Configure as variáveis do `.env.example` no painel do Railway.
   - Build: `npm run build` / Start: `npm start` (o Railway detecta pelo package.json).
   - Depois do primeiro deploy, copie o domínio público gerado e preencha `PUBLIC_BASE_URL`.

## Métricas

No Supabase, a view `post_performance` mostra cliques por post (título, fonte, ativo).
É ela que diz qual tipo de notícia gera clique no link de afiliado.

## Compliance (não remover)

- O CTA é neutro ("Negocie X na Binx") e **nunca** manda comprar/vender com base na notícia.
- Todo post carrega o disclaimer "Isto não é recomendação de investimento".
- O bot publica **resumo próprio + link para a fonte original** (nada de republicar texto integral).

Esses três pontos evitam problema com a CVM (recomendação de investimento sem credenciamento)
e com os termos do programa de afiliados. Não altere o prompt/template para linguagem de call.
