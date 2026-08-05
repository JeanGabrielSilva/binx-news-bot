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
