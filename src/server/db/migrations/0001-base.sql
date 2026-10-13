-- 0001-base.sql : extensions, contexte de transaction, schéma de pg-boss.
create extension if not exists btree_gist;
create extension if not exists pg_trgm;

-- Posés par withTenant (set_config local). Vides hors transaction : aucune ligne de la mémoire n'est visible.
create function app_tenant() returns uuid language sql stable
  as $$ select nullif(current_setting('app.tenant', true), '')::uuid $$;
create function app_principals() returns uuid[] language sql stable
  as $$ select coalesce(nullif(current_setting('app.principals', true), '')::uuid[], '{}'::uuid[]) $$;

-- pg-boss crée ses tables ici avec le rôle de l'app (createSchema: false côté pg-boss).
create schema if not exists pgboss;
grant usage, create on schema pgboss to leon_app;
grant usage on schema public to leon_app;
