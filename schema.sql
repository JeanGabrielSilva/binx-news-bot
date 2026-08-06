-- Rode este script no SQL Editor do Supabase (uma vez).

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  guid text unique not null,
  source text not null,
  title text not null,
  url text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  telegram_message_id bigint,
  asset text,
  posted_at timestamptz not null default now()
);

create table if not exists clicks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  user_agent text,
  referer text
);

create index if not exists idx_posts_article on posts(article_id);
create index if not exists idx_clicks_post on clicks(post_id);

-- Fluxo de avaliação/fila: novo -> (descartado | avaliado | fila) -> publicado
alter table articles add column if not exists status text not null default 'novo';
alter table articles add column if not exists relevante boolean;
alter table articles add column if not exists importancia int;
alter table articles add column if not exists titulo_post text;
alter table articles add column if not exists resumo text;
alter table articles add column if not exists ativo text;
alter table articles add column if not exists avaliado_em timestamptz;
create index if not exists idx_articles_status on articles(status);

-- Configurações editáveis pelo painel (linha única, id sempre 1)
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  bot_enabled boolean not null default true,
  min_importance int not null default 3 check (min_importance between 1 and 5),
  max_posts_per_cycle int not null default 3 check (max_posts_per_cycle between 1 and 10),
  affiliate_url text not null default '',
  post_template text not null default '',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- Bloqueia acesso via chave anon/publishable; bot e painel usam service_role (que ignora RLS)
alter table articles enable row level security;
alter table posts enable row level security;
alter table clicks enable row level security;
alter table settings enable row level security;

-- Métrica pronta: cliques por post, com título e ativo
create or replace view post_performance as
select
  p.id as post_id,
  a.title,
  a.source,
  p.asset,
  p.posted_at,
  count(c.id) as clicks
from posts p
join articles a on a.id = p.article_id
left join clicks c on c.post_id = p.id
group by p.id, a.title, a.source, p.asset, p.posted_at
order by p.posted_at desc;
