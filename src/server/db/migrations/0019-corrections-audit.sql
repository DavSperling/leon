-- 0019-corrections-audit.sql : les corrections de l'audit du 20/10 qui touchent la base (tics de fond, index
-- de recherche).

-- Audit n° 8 : passages_sans_vecteur relisait chaque minute tous les passages (anti-jointure sur toute la table)
-- pour n'en trouver, la plupart du temps, aucun. Le passage note le modèle de son dernier vecteur
-- (embedPassages l'écrit avec le vecteur) ; un index sur cette colonne rend vide, sans rien parcourir, la liste
-- des passages dont le modèle n'est pas le courant. Un index partiel ne suffirait pas : il ne peut pas dépendre
-- du modèle courant, et un changement de modèle doit remettre tous les passages dans la liste. La condition
-- s'écrit `is null or < or >` : `is distinct from` et `<>` ne se servent pas d'un index. En tête du fichier :
-- passages_sans_vecteur (ci-dessous) lit la colonne.
alter table passages add column embedded_model text;
update passages p set embedded_model = v.model
from (
  select distinct on (passage_id) passage_id, model from passage_vectors order by passage_id, created_at desc
) v
where v.passage_id = p.id;
create index passages_embedded_model_idx on passages (embedded_model);

-- Audit n° 1 : les lectures des tics ne rendent plus les lignes d'un propriétaire qui a quitté l'organisation.
-- Personne ne peut plus travailler sous ses droits : rendues à chaque tic et sautées, elles occupaient la tête
-- de la liste et bloquaient tout ce qui venait derrière.

create or replace function passages_sans_vecteur(p_model text, p_limit integer)
returns table (passage_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.tenant_id, s.owner_user_id
  from passages p
  join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
  -- Audit n° 8 : le modèle noté sur le passage (en tête du fichier) écarte, par un index, ceux qui ont déjà
  -- leur vecteur.
  where (p.embedded_model is null or p.embedded_model < p_model or p.embedded_model > p_model)
    and not exists (
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
  where (
      (r.status = 'queued' and r.updated_at < now() - make_interval(mins => p_minutes))
      or (r.status in ('running', 'failed') and r.updated_at < now() - interval '30 minutes')
    )
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

-- Audit n° 5 : runs_en_attente (ci-dessus) rend aussi les runs « en cours » ou « échoués » inchangés depuis plus
-- de 30 minutes : un processus mort au milieu d'un run, ou un run échoué après les 3 reprises de pg-boss, n'était
-- jamais repris. L'index des runs en attente couvre désormais ces trois états.
drop index ingest_runs_queued_idx;
create index ingest_runs_pending_idx on ingest_runs (updated_at) where status in ('queued', 'running', 'failed');

-- Audit n° 7 : la recherche par le sens lit les vecteurs d'une organisation et d'un modèle (search.ts). Les
-- vecteurs d'un ancien modèle sont retirés à mesure que ceux du nouveau s'écrivent (embedPassages).
create index passage_vectors_tenant_model_idx on passage_vectors (tenant_id, model);

-- Audit n° 13 : un événement d'agenda devenu privé retire sa source (removeConnectorItems) ; ses tours, passages,
-- vecteurs, runs et lectures suivent par les clés en cascade. L'app ne reçoit pas le droit de supprimer du brut :
-- seule cette fonction le fait, pour les sources d'une connexion de l'organisation courante, appelée par son
-- créateur (withTenant), de son outil et à son nom.
create function retirer_sources_connexion(p_connection uuid, p_external_ids text[])
returns integer
language sql volatile security definer set search_path = public as $$
  with gone as (
    delete from sources s
    using connections c
    where c.id = p_connection and c.tenant_id = app_tenant() and c.created_by = any(app_principals())
      and s.tenant_id = c.tenant_id and s.connection_id = c.id and s.owner_user_id = c.created_by
      and s.kind = c.provider and s.external_id = any(p_external_ids)
    returning s.id
  )
  select count(*)::integer from gone
$$;
revoke all on function retirer_sources_connexion(uuid, text[]) from public;
grant execute on function retirer_sources_connexion(uuid, text[]) to leon_app;
