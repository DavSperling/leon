-- 0098-teams-notifications.sql : Microsoft prévient Leon d'un message dans une conversation ou un canal Teams, et d'une
-- transcription prête (abonnements de 0096, microsoft-notifications.ts). La notification dit où : la relève suivante
-- relit ce lieu tout de suite, au lieu d'attendre sa lecture du jour (teams/daily.ts).

-- Les lieux signalés depuis la dernière relève d'une connexion Teams ou Teams Chat. `cle` : la conversation ou le
-- canal, « reunions » pour une transcription, « * » pour tout relire (des notifications perdues). Ni droit ni
-- politique : l'appli n'y touche que par prendre_lieux_signales.
create table lieux_signales (
  tenant_id uuid not null,
  connection_id uuid not null,
  cle text not null check (char_length(cle) between 1 and 200),
  primary key (connection_id, cle),
  foreign key (tenant_id, connection_id) references connections (tenant_id, id) on delete cascade
);
alter table lieux_signales enable row level security;

-- Un canal suivi par la connexion d'un collègue se cherche par sa ressource.
create index abonnements_microsoft_ressource_idx on abonnements_microsoft (tenant_id, ressource);

-- Comme en 0096, et chaque notification au bon secret d'une connexion Teams ou Teams Chat garde aussi son lieu (lu
-- dans la notification par l'appli, `lieu`).
create or replace function notifications_microsoft(lot jsonb) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  with recues as (
    select r.abonnement, r.etat, bool_or(coalesce(r.cycle, false)) as cycle,
           array_agg(distinct r.lieu) filter (where r.lieu is not null) as lieux
      from jsonb_to_recordset(lot) as r(abonnement text, etat text, cycle boolean, lieu text)
     group by r.abonnement, r.etat
  ), valides as (
    update abonnements_microsoft a
       set prochain_renouvellement = case when r.cycle then now() else a.prochain_renouvellement end
      from recues r
     where a.id = r.abonnement and a.empreinte = sha256(convert_to(r.etat, 'UTF8'))
    returning a.tenant_id, a.connection_id, r.lieux
  ), signales as (
    insert into lieux_signales (tenant_id, connection_id, cle)
    select distinct v.tenant_id, v.connection_id, l.cle
      from valides v
      cross join unnest(v.lieux) as l(cle)
      join connections c on c.tenant_id = v.tenant_id and c.id = v.connection_id
     where c.provider in ('teams', 'teamschats') and char_length(l.cle) between 1 and 200
    on conflict do nothing
  )
  update connections c set next_sync_at = now(), updated_at = now()
    from (select distinct tenant_id, connection_id from valides) v
   where c.tenant_id = v.tenant_id and c.id = v.connection_id and c.status = 'active'
  returning c.id
$$;

-- Au début d'une relève : les lieux signalés de la connexion, rendus et retirés d'un coup. Seulement pour qui l'a
-- branchée, dans son organisation.
create function prendre_lieux_signales(p_connexion uuid) returns setof text
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from lieux_signales s
   using connections c
   where s.connection_id = p_connexion and c.tenant_id = s.tenant_id and c.id = s.connection_id
     and c.tenant_id = app_tenant() and c.created_by = app_user()
  returning s.cle
$$;
revoke all on function prendre_lieux_signales(uuid) from public;
grant execute on function prendre_lieux_signales(uuid) to leon_app;

-- Les ressources qu'une autre connexion de l'organisation suit déjà, par un abonnement qu'elle renouvelle : Microsoft
-- n'accepte qu'un abonnement par appli et par canal. Hors RLS (la connexion d'un collègue ne se voit pas) ; ne rend
-- que celles des ressources demandées. Une ligne `refus:` n'est pas un abonnement.
create function ressources_suivies(p_connexion uuid, p_ressources text[]) returns setof text
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct a.ressource from abonnements_microsoft a
   where a.tenant_id = app_tenant() and a.ressource = any(p_ressources) and a.connection_id <> p_connexion
     and a.id not like 'refus:%' and a.prochain_renouvellement > now() - interval '1 hour'
$$;
revoke all on function ressources_suivies(uuid, text[]) from public;
grant execute on function ressources_suivies(uuid, text[]) to leon_app;
