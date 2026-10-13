-- 0003-memoire.sql : la mémoire. Les tables de données portent tenant_id et une ACL (uuid[] de principals) ;
-- la RLS impose tenant_id = app_tenant() et acl && app_principals() (fonctions de 0001).
-- Le catalogue (card_types, predicates) a tenant_id nul pour le socle, visible de tous les tenants.

create table sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  kind text not null check (kind in ('claude_code', 'claude_ai', 'chatgpt', 'mcp_remember')),
  external_id text not null,
  owner_user_id uuid not null references "user"(id) on delete cascade,
  title text,
  acl uuid[] not null,
  metadata jsonb not null default '{}'::jsonb,
  last_turn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, external_id)
);

create table turns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  external_id text not null,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  ts timestamptz not null,
  capture_mode text not null check (capture_mode in ('file', 'network', 'dom', 'manual')),
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  turn_ids uuid[] not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  step text not null default 'triage' check (step in ('triage', 'extraction', 'placement', 'done')),
  triage jsonb,
  error text,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fact_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  ingest_run_id uuid not null references ingest_runs(id) on delete cascade,
  turn_id uuid not null references turns(id) on delete cascade,
  statement text not null,
  predicate text not null,
  type_hint text not null,
  value text,
  mentions jsonb not null,
  quote text not null,
  quote_start integer,
  quote_end integer,
  valid_from timestamptz,
  valid_to timestamptz,
  confidence real not null,
  sensitivity text not null check (sensitivity in ('shareable', 'sensitive')),
  sensitive_category text check (sensitive_category in ('rh', 'remuneration', 'juridique', 'sante', 'perso')),
  fact_acl uuid[] not null,
  status text not null default 'pending' check (status in ('pending', 'rejected', 'placed')),
  rejection_reason text,
  acl uuid[] not null,
  created_at timestamptz not null default now()
);

create table card_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references organization(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  label text not null,
  parent_slug text,
  status text not null default 'validated' check (status in ('proposed', 'validated')),
  acl uuid[],
  created_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, slug),
  check ((tenant_id is null) = (acl is null))
);

create table predicates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references organization(id) on delete cascade,
  type_slug text not null,
  slug text not null check (slug ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  single_valued boolean not null,
  unique nulls not distinct (tenant_id, type_slug, slug)
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  type_id uuid not null references card_types(id),
  title text not null check (char_length(title) between 1 and 120),
  status text not null check (status in ('confirmed', 'unconfirmed')),
  merged_into uuid references cards(id),
  acl uuid[] not null,
  created_by uuid references "user"(id) on delete set null,
  created_at timestamptz not null default now()
);

create table card_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  alias text not null,
  kind text not null check (kind in ('name', 'email', 'domain')),
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  unique (card_id, kind, alias)
);

create table facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  card_id uuid not null references cards(id),
  predicate text not null,
  statement text not null,
  value text,
  quote text not null,
  source_id uuid not null references sources(id),
  turn_id uuid not null references turns(id),
  quote_start integer not null,
  quote_end integer not null,
  source_kind text not null check (source_kind in ('claude_code', 'claude_ai', 'chatgpt', 'mcp_remember')),
  author_id uuid not null references "user"(id),
  valid_from timestamptz not null,
  valid_to timestamptz,
  validity tstzrange generated always as (tstzrange(valid_from, valid_to, '[)')) stored,
  recorded_at timestamptz not null default now(),
  superseded_by uuid references facts(id),
  status text not null check (status in ('active', 'superseded', 'conflict', 'pending_review')),
  sensitivity text not null check (sensitivity in ('shareable', 'sensitive')),
  single_valued boolean not null,
  confidence real not null check (confidence >= 0 and confidence <= 1),
  acl uuid[] not null,
  candidate_id uuid references fact_candidates(id),
  search_tsv tsvector generated always as (to_tsvector('french', statement) || to_tsvector('simple', statement)) stored,
  check (quote_start >= 0 and quote_end > quote_start),
  -- Décision D5 : l'invariant « une seule valeur active » vaut pour les faits partagés avec l'équipe.
  constraint facts_one_active_shared_value exclude using gist (
    tenant_id with =, card_id with =, predicate with =, validity with &&
  ) where (status = 'active' and single_valued and acl @> array[tenant_id])
);

create table review_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  kind text not null check (kind in ('sensitive_fact', 'entity_match', 'proposed_type', 'conflict')),
  payload jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution jsonb,
  resolved_by uuid references "user"(id) on delete set null,
  resolved_at timestamptz,
  acl uuid[] not null,
  created_at timestamptz not null default now()
);

create table read_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  client text not null check (client ~ '^[a-z0-9._-]{1,40}$'),
  card_id uuid not null references cards(id),
  acl uuid[] not null,
  at timestamptz not null default now()
);

create index sources_owner_idx on sources (tenant_id, owner_user_id);
create index turns_source_ts_idx on turns (tenant_id, source_id, ts);
create index ingest_runs_source_idx on ingest_runs (tenant_id, source_id, created_at desc);
create index fact_candidates_run_idx on fact_candidates (tenant_id, ingest_run_id);
create index cards_type_idx on cards (tenant_id, type_id);
create index cards_title_trgm_idx on cards using gin (title gin_trgm_ops);
create index card_aliases_card_idx on card_aliases (tenant_id, card_id);
create index card_aliases_key_idx on card_aliases (tenant_id, kind, lower(alias));
create index card_aliases_trgm_idx on card_aliases using gin (alias gin_trgm_ops);
create index facts_card_predicate_idx on facts (tenant_id, card_id, predicate);
create index facts_recorded_idx on facts (tenant_id, recorded_at desc);
create index facts_search_idx on facts using gin (search_tsv);
create index review_items_status_idx on review_items (tenant_id, status, created_at desc);
create index read_log_at_idx on read_log (tenant_id, at desc);

-- RLS : une ligne est visible et modifiable seulement dans le tenant courant et si son ACL croise les principals.
alter table sources enable row level security;
create policy tenant_acl on sources to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table turns enable row level security;
create policy tenant_acl on turns to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table ingest_runs enable row level security;
create policy tenant_acl on ingest_runs to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table fact_candidates enable row level security;
create policy tenant_acl on fact_candidates to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table cards enable row level security;
create policy tenant_acl on cards to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table card_aliases enable row level security;
create policy tenant_acl on card_aliases to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table facts enable row level security;
create policy tenant_acl on facts to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table review_items enable row level security;
create policy tenant_acl on review_items to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table read_log enable row level security;
create policy tenant_acl on read_log to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table card_types enable row level security;
create policy read_types on card_types for select to leon_app
  using (tenant_id is null or (tenant_id = app_tenant() and acl && app_principals()));
create policy insert_types on card_types for insert to leon_app
  with check (tenant_id = app_tenant() and acl && app_principals());
create policy update_types on card_types for update to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table predicates enable row level security;
create policy read_predicates on predicates for select to leon_app
  using (tenant_id is null or tenant_id = app_tenant());

grant select, insert, update on sources, turns, ingest_runs, fact_candidates, card_types,
  cards, card_aliases, facts, review_items, read_log to leon_app;
grant select on predicates to leon_app;
