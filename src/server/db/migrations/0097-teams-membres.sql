-- 0097-teams-membres.sql : dans Teams et Teams Chat, chaque conversation, canal ou réunion n'existe qu'une fois dans
-- l'organisation, et n'est visible que de ses membres qui y sont, comme dans Teams (choix de David du 27/11/2026).
--
-- Jusqu'ici une source par élément et par personne qui branche, à l'accès de sa connexion : deux collègues dans la
-- même conversation la relevaient chacun, en deux copies privées. Pour ces deux outils, le connecteur dit maintenant le
-- lieu de chaque élément (la conversation, le canal, la réunion : `metadata.audience`) et, à chaque lecture d'un lieu,
-- qui en est : leurs adresses, leurs identifiants Microsoft et, dans une conversation, le début de l'historique que
-- chacun y voit. Un canal standard d'une équipe publique reste visible de toute l'organisation.
--
-- aligner_lieu() retrouve ces personnes parmi les membres de l'organisation, par l'adresse de leur compte Leon ou par
-- l'identifiant du compte Microsoft d'une connexion qu'elles ont branchée (Outlook, Teams, Teams Chat) : elles voient le
-- lieu même sans avoir branché Teams. Elle les garde (`lieux`) et donne à tout ce qui a déjà été relevé du lieu l'accès
-- du jour : un membre parti perd l'accès, un nouveau le gagne. Une personne ne voit un élément que si son historique
-- commence avant le premier message de l'élément : une conversation se range par jour, et le jour où quelqu'un y entre
-- sans l'historique, ce jour-là lui reste fermé s'il a commencé avant lui.
-- relever_source_lieu() écrit la source d'un élément, une seule par élément dans l'organisation, quel que soit qui la
-- relève, à l'accès que donnent les membres gardés de son lieu. Ses tours s'écrivent ensuite sous la RLS de qui relève :
-- sans accès à l'élément, il le laisse à un autre membre. Comme partager_connexion (0056) et aligner_sources_github
-- (0048) : les sources sous verrou, dans l'ordre des id (lockSources, embed-missing.ts), puis recopier_acl_sources
-- (0055) sur ce qui en descend.
-- shortcut: une personne qui quitte la conversation garde ce qu'elle a déjà vu tant qu'aucun autre membre ne relit le
-- lieu (elle-même ne le lit plus) ; le revoir quand un lieu n'a plus aucun lecteur.

-- Une seule source par élément de ces deux outils dans l'organisation ; et les sources d'un lieu, pour l'aligner. Les
-- requêtes des fonctions redisent `kind in (…)` : sans lui, un plan générique de PL/pgSQL n'utilise pas ces index.
create unique index sources_lieu_unique on sources (tenant_id, kind, external_id)
  where kind in ('teams', 'teamschats');
create index sources_lieu_idx on sources (tenant_id, kind, (metadata->>'audience'))
  where kind in ('teams', 'teamschats');

-- Les membres du jour de chaque lieu, retrouvés dans l'organisation, avec le début de leur historique ; l'organisation
-- elle-même pour un lieu ouvert à tous. Écrits par aligner_lieu, lus par relever_source_lieu : aucun droit pour l'app.
create table lieux (
  tenant_id uuid not null references organization(id) on delete cascade,
  kind text not null,
  cle text not null,
  membres uuid[] not null,
  depuis timestamptz[] not null,
  primary key (tenant_id, kind, cle)
);
-- Sans politique ni droit : l'app n'y lit rien, même par erreur ; les fonctions ci-dessous passent par leur propriétaire.
alter table lieux enable row level security;

-- L'outil d'une connexion de la personne courante, Teams ou Teams Chat ; une erreur sinon.
create function outil_lieu(p_connexion uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_outil text;
begin
  select c.provider into v_outil from connections c
   where c.id = p_connexion and c.tenant_id = app_tenant() and c.created_by = app_user()
     and c.provider in ('teams', 'teamschats');
  if v_outil is null then
    raise exception 'connexion refusée' using errcode = 'insufficient_privilege';
  end if;
  return v_outil;
end
$$;
revoke all on function outil_lieu(uuid) from public;

-- Les membres de l'organisation qui sont dans un lieu, chacun avec le début de l'historique qu'il y voit (-infinity :
-- tout), retrouvés par l'adresse de leur compte ou par l'identifiant Microsoft d'une de leurs connexions. Qui relève en
-- est toujours : il vient de lire le lieu avec son compte.
-- shortcut: retrouvé ni par son adresse ni par son identifiant (une connexion sans accountKey), qui relève voit tout
-- l'historique ; la connexion garde pourtant l'identifiant Microsoft de son compte dès son branchement.
create function membres_du_lieu(p_adresses text[], p_ids text[], p_depuis timestamptz[])
returns table (membre uuid, depuis timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with gens as (
    select lower(trim(g.adresse)) as adresse, nullif(trim(g.ident), '') as ident,
           coalesce(g.depuis, '-infinity') as depuis
      from unnest(p_adresses, p_ids, p_depuis) as g(adresse, ident, depuis)
  ), membres as (
    select u.id, lower(u.email) as adresse
      from member m join "user" u on u.id = m."userId"
     where m."organizationId" = app_tenant() and u.deleted_at is null
  ), trouves as (
    select m.id as membre, g.depuis from gens g join membres m on m.adresse = g.adresse
    union all
    select m.id, g.depuis
      from gens g
      join connections c on c.tenant_id = app_tenant() and c.provider in ('outlook', 'teams', 'teamschats')
                        and c.config->>'accountKey' = g.ident
      join membres m on m.id = c.created_by
  )
  select t.membre, min(t.depuis) from trouves t group by t.membre
  union all
  select app_user(), '-infinity'::timestamptz where not exists (select 1 from trouves t where t.membre = app_user())
$$;
revoke all on function membres_du_lieu(text[], text[], timestamptz[]) from public;

-- Qui voit un élément d'un lieu dont le premier message date de `p_debut` (nul : sans message) : les membres dont
-- l'historique commence avant, dans l'ordre (l'accès se compare d'une lecture à l'autre).
create function acces_lieu(p_membres uuid[], p_depuis timestamptz[], p_debut timestamptz) returns uuid[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(x.m order by x.m), '{}')
    from unnest(p_membres, p_depuis) as x(m, d)
   where x.d <= coalesce(p_debut, 'infinity')
$$;
revoke all on function acces_lieu(uuid[], timestamptz[], timestamptz) from public;

-- Les membres du jour d'un lieu lu par la connexion `p_connexion` (Teams ou Teams Chat, de la personne courante) :
-- toute l'organisation pour un canal standard d'une équipe publique (`p_equipe`, Teams seulement), sinon ses membres
-- retrouvés. Ils sont gardés pour les éléments à venir, et tout ce qui a déjà été relevé du lieu prend leur accès.
create function aligner_lieu(
  p_connexion uuid, p_lieu text, p_equipe boolean, p_adresses text[], p_ids text[], p_depuis timestamptz[])
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_outil text := outil_lieu(p_connexion);
  v_membres uuid[];
  v_depuis timestamptz[];
  touchees uuid[];
begin
  if p_equipe and v_outil <> 'teams' then
    raise exception 'lieu ouvert refusé' using errcode = 'insufficient_privilege';
  end if;
  if p_equipe then
    v_membres := array[app_tenant()];
    v_depuis := array['-infinity'::timestamptz];
  else
    select coalesce(array_agg(l.membre order by l.membre), '{}'),
           coalesce(array_agg(l.depuis order by l.membre), '{}')
      into v_membres, v_depuis
      from membres_du_lieu(p_adresses, p_ids, p_depuis) l;
  end if;
  insert into lieux (tenant_id, kind, cle, membres, depuis)
  values (app_tenant(), v_outil, p_lieu, v_membres, v_depuis)
  on conflict (tenant_id, kind, cle) do update set membres = excluded.membres, depuis = excluded.depuis;

  select coalesce(array_agg(verrou.id order by verrou.id), '{}') into touchees from (
    select s.id from sources s
     where s.tenant_id = app_tenant() and s.kind in ('teams', 'teamschats') and s.kind = v_outil
       and s.metadata->>'audience' = p_lieu
     order by s.id for no key update) verrou;
  with cible as (
    select s.id, acces_lieu(v_membres, v_depuis, (select min(t.ts) from turns t where t.source_id = s.id)) as acl
      from sources s where s.id = any(touchees)
  ), changees as (
    update sources s set acl = c.acl from cible c where s.id = c.id and s.acl <> c.acl returning s.id
  )
  select coalesce(array_agg(changees.id), '{}') into touchees from changees;
  perform recopier_acl_sources(touchees);
end
$$;
revoke all on function aligner_lieu(uuid, text, boolean, text[], text[], timestamptz[]) from public;
grant execute on function aligner_lieu(uuid, text, boolean, text[], text[], timestamptz[]) to leon_app;

-- La source d'un élément du lieu `p_lieu`, une seule dans l'organisation : créée au nom de qui relève, ou reprise
-- quel que soit qui l'a créée. Son accès : les membres gardés du lieu (aligner_lieu), qui sont encore de
-- l'organisation, dont l'historique commence avant son premier message, déjà gardé ou apporté (`p_debut`). Un lieu
-- pas encore aligné (une lecture coupée avant) reste à qui relève, jusqu'à son prochain alignement. Ne rend rien
-- quand qui relève n'a pas accès à l'élément.
create function relever_source_lieu(
  p_connexion uuid, p_lieu text, p_external_id text, p_titre text, p_metadata jsonb, p_debut timestamptz)
returns table (source_id uuid, source_acl uuid[])
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_outil text := outil_lieu(p_connexion);
  v_metadata jsonb := p_metadata || jsonb_build_object('audience', p_lieu);
  v_membres uuid[] := array[app_user()];
  v_depuis timestamptz[] := array['-infinity'::timestamptz];
  v_id uuid;
  v_ancien uuid[];
  v_debut timestamptz;
  v_acl uuid[];
begin
  if exists (select 1 from lieux l where l.tenant_id = app_tenant() and l.kind = v_outil and l.cle = p_lieu) then
    select coalesce(array_agg(x.m order by x.m), '{}'), coalesce(array_agg(x.d order by x.m), '{}')
      into v_membres, v_depuis
      from lieux l, unnest(l.membres, l.depuis) as x(m, d)
     where l.tenant_id = app_tenant() and l.kind = v_outil and l.cle = p_lieu
       and ((x.m = app_tenant() and v_outil = 'teams')
         or x.m in (select m."userId" from member m where m."organizationId" = app_tenant()));
  end if;
  -- Deux tours au plus : un autre membre peut créer la même source entre la lecture et l'insertion.
  for tentative in 1..2 loop
    select s.id, s.acl, (select min(t.ts) from turns t where t.source_id = s.id)
      into v_id, v_ancien, v_debut
      from sources s
     where s.tenant_id = app_tenant() and s.kind in ('teams', 'teamschats') and s.kind = v_outil
       and s.external_id = p_external_id
       for no key update;
    v_acl := acces_lieu(v_membres, v_depuis, least(v_debut, p_debut));
    if not (v_acl && app_principals()) then
      return;
    end if;
    if v_id is null then
      insert into sources (tenant_id, kind, external_id, owner_user_id, title, acl, connection_id, metadata)
      values (app_tenant(), v_outil, p_external_id, app_user(), p_titre, v_acl, p_connexion, v_metadata)
      on conflict do nothing
      returning sources.id into v_id;
      if v_id is not null then
        return query select v_id, v_acl;
        return;
      end if;
    else
      update sources s set title = p_titre, metadata = v_metadata, connection_id = p_connexion, acl = v_acl
       where s.id = v_id;
      if v_ancien <> v_acl then
        perform recopier_acl_sources(array[v_id]);
      end if;
      return query select v_id, v_acl;
      return;
    end if;
  end loop;
  raise exception 'source introuvable';
end
$$;
revoke all on function relever_source_lieu(uuid, text, text, text, jsonb, timestamptz) from public;
grant execute on function relever_source_lieu(uuid, text, text, text, jsonb, timestamptz) to leon_app;

-- 0095, plus les sources de Teams et de Teams Chat relevées par un autre membre du lieu : un message supprimé chez
-- Microsoft part de la seule copie de l'organisation, pourvu que qui le signale ait accès à sa source.
create or replace function retirer_tours_connexion(p_connection uuid, p_stems text[])
returns table (retires integer, vides uuid[])
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  touched uuid[];
begin
  with gone as (
    delete from turns t
    using sources s, connections c
    where c.id = p_connection and c.tenant_id = app_tenant() and c.created_by = any(app_principals())
      and s.tenant_id = c.tenant_id and s.kind = c.provider
      and (s.owner_user_id = c.created_by or (s.kind in ('teams', 'teamschats') and s.acl && app_principals()))
      and t.tenant_id = s.tenant_id and t.source_id = s.id
      and (regexp_replace(t.external_id, '#[0-9a-f]{12}$', '') = any(p_stems)
        or regexp_replace(t.external_id, ':[0-9]+#[0-9a-f]{12}$', '') = any(p_stems))
    returning t.source_id
  )
  select coalesce(array_agg(distinct gone.source_id), '{}'), count(*)::integer into touched, retires from gone;

  with emptied as (
    delete from sources s
    where s.id = any(touched) and not exists (select 1 from turns t where t.source_id = s.id)
    returning s.id
  )
  select coalesce(array_agg(emptied.id), '{}') into vides from emptied;
  return next;
end
$$;

-- Ces deux outils ne se partagent plus (connections.ts) : leurs membres décident, comme dans Teams.
update connections set partage = null where provider in ('teams', 'teamschats') and partage is not null;
