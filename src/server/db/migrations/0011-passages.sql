-- 0011-passages.sql : l'index de recherche. Chaque tour est découpé en passages (plein texte français et
-- simple) ; chaque passage peut avoir un vecteur par modèle (pgvector). Un passage et ses vecteurs portent
-- l'ACL de leur tour : la sécurité par ligne est la même que pour le brut (0003).

-- Déjà créée par le superutilisateur là où leon_owner n'en a pas le droit : sans effet dans ce cas.
create extension if not exists vector;

create table passages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  source_id uuid not null,
  turn_id uuid not null,
  ord integer not null check (ord >= 0),
  text text not null,
  -- Positions dans le texte du tour (le texte du passage en retire les marqueurs de surlignage).
  char_start integer not null,
  char_end integer not null,
  ts timestamptz not null,
  author_name text,
  author_email text,
  tsv tsvector generated always as (to_tsvector('french', text) || to_tsvector('simple', text)) stored,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (turn_id, ord),
  check (char_start >= 0 and char_end > char_start),
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade,
  foreign key (tenant_id, turn_id) references turns (tenant_id, id) on delete cascade
);

-- Un vecteur par passage et par modèle : changer de modèle complète les vecteurs en tâche de fond, la
-- recherche filtre sur le modèle courant. Dimension fixe 1 024 (décision D2 du plan).
create table passage_vectors (
  passage_id uuid not null,
  tenant_id uuid not null,
  model text not null check (char_length(model) between 1 and 80),
  embedding halfvec(1024) not null,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  primary key (passage_id, model),
  foreign key (tenant_id, passage_id) references passages (tenant_id, id) on delete cascade
);

create index passages_tsv_idx on passages using gin (tsv);
create index passages_source_idx on passages (tenant_id, source_id);
create index passages_ts_idx on passages (tenant_id, ts desc);
create index passage_vectors_embedding_idx on passage_vectors using hnsw (embedding halfvec_cosine_ops);

alter table passages enable row level security;
create policy tenant_acl on passages to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table passage_vectors enable row level security;
create policy tenant_acl on passage_vectors to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Supprimer : réindexer une source remplace ses passages ; changer de modèle peut retirer d'anciens vecteurs.
grant select, insert, update, delete on passages, passage_vectors to leon_app;

-- Lectures hors sécurité par ligne, pour les tics de l'indexation : des identifiants, jamais de texte
-- (comme connector_syncs_due, 0008). user_id = propriétaire de la source, qui voit toujours ses passages et
-- ses runs : le tic reprend le travail sous ses droits.

-- Passages sans vecteur du modèle p_model, les plus récents d'abord (le plus frais devient cherchable par
-- le sens en premier).
create function passages_sans_vecteur(p_model text, p_limit integer)
returns table (passage_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.tenant_id, s.owner_user_id
  from passages p
  join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
  where not exists (
    select 1 from passage_vectors v where v.passage_id = p.id and v.model = p_model
  )
  order by p.created_at desc, p.id
  limit p_limit
$$;
revoke all on function passages_sans_vecteur(text, integer) from public;
grant execute on function passages_sans_vecteur(text, integer) to leon_app;

-- Runs en attente depuis plus de p_minutes (leur dernier changement d'état), toutes organisations : le
-- tic les remet en file, ce qui rattrape un run resté « queued » sans job.
create function runs_en_attente(p_minutes integer)
returns table (run_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.tenant_id, s.owner_user_id
  from ingest_runs r
  join sources s on s.tenant_id = r.tenant_id and s.id = r.source_id
  where r.status = 'queued' and r.updated_at < now() - make_interval(mins => p_minutes)
  order by r.updated_at, r.id
$$;
-- Le tic passe chaque minute : il ne relit que les runs en attente, pas tout l'historique.
create index ingest_runs_queued_idx on ingest_runs (updated_at) where status = 'queued';
revoke all on function runs_en_attente(integer) from public;
grant execute on function runs_en_attente(integer) to leon_app;
