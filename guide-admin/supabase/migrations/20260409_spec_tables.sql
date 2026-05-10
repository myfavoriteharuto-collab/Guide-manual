-- ============================================================
-- Supabase SQL エディタで実行してください
-- ============================================================

-- ① wizard_scores（product_keyword_scores の置き換え）
create table if not exists wizard_scores (
  product_id     uuid        references products(id) on delete cascade,
  keyword        text        not null,
  score          smallint    not null check (score between 0 and 9),
  reason         text,
  auto_generated boolean     default false,
  primary key (product_id, keyword)
);

-- ② product_specs（スペック抽出結果）
create table if not exists product_specs (
  product_id   uuid        references products(id) on delete cascade,
  specs        jsonb       not null default '{}',
  sources      jsonb       not null default '{}',
  collected_at timestamptz default now(),
  primary key (product_id)
);

-- ③ url_candidates（URL候補キャッシュ）
create table if not exists url_candidates (
  product_id uuid    references products(id) on delete cascade,
  url        text    not null,
  title      text,
  snippet    text,
  selected   boolean default true,
  primary key (product_id, url)
);
