-- 0013-corrections-audit.sql : les corrections de l'audit du 20/10 qui touchent la base (tics de fond, index
-- de recherche).

-- Audit n° 1 : les lectures des tics ne rendent plus les lignes d'un propriétaire qui a quitté l'organisation.
-- Personne ne peut plus travailler sous ses droits : rendues à chaque tic et sautées, elles occupaient la tête
-- de la liste et bloquaient tout ce qui venait derrière.

create or replace function passages_sans_vecteur(p_model text, p_limit integer)
returns table (passage_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.tenant_id, s.owner_user_id
  from passages p
  join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
  where not exists (
    select 1 from passage_vectors v where v.passage_id = p.id and v.model = p_model
  )
    and exists (
      select 1 from member m where m."userId" = s.owner_user_id and m."organizationId" = p.tenant_id
    )
  order by p.created_at desc, p.id
  limit p_limit
$$;

create or replace function runs_en_attente(p_minutes integer)
returns table (run_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.tenant_id, s.owner_user_id
  from ingest_runs r
  join sources s on s.tenant_id = r.tenant_id and s.id = r.source_id
  where r.status = 'queued' and r.updated_at < now() - make_interval(mins => p_minutes)
    and exists (
      select 1 from member m where m."userId" = s.owner_user_id and m."organizationId" = r.tenant_id
    )
  order by r.updated_at, r.id
$$;

create or replace function connector_syncs_due() returns table (connection_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.tenant_id, c.created_by from connections c
  where c.status in ('active', 'error') and c.next_sync_at <= now()
    and (c.sync_lock_at is null or c.sync_lock_at < now() - interval '30 minutes')
    and exists (
      select 1 from member m where m."userId" = c.created_by and m."organizationId" = c.tenant_id
    )
  order by c.next_sync_at
  limit 100
$$;
