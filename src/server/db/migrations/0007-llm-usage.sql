-- 0007-llm-usage.sql : coût de chaque appel au LLM, par organisation et par run.
-- Sert au jeu d'essai (coût mesuré d'un passage) et à savoir ce que coûte chaque client.
-- Le rôle de l'app ne fait qu'insérer ; la lecture passe par le rôle propriétaire.
-- ingest_run_id n'a pas de clé étrangère : la ligne garde le coût d'un run même après sa suppression.

create table llm_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  ingest_run_id uuid,
  step text not null check (step in ('triage', 'extraction', 'placement')),
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null,
  cache_write_tokens integer not null,
  cost_usd numeric(12, 8),
  created_at timestamptz not null default now()
);
create index llm_usage_tenant_idx on llm_usage (tenant_id, created_at desc);

alter table llm_usage enable row level security;
create policy tenant_insert on llm_usage for insert to leon_app
  with check (tenant_id = app_tenant());

grant insert on llm_usage to leon_app;
