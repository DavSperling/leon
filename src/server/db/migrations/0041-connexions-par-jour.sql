-- 0041-connexions-par-jour.sql : le journal des connexions compte par session et par jour.
--
-- 0039 gardait une ligne par session et comptait les connexions et le temps passé au jour de son début. Une
-- session Better Auth est prolongée tant qu'on s'en sert et vit des semaines : quelqu'un d'actif tous les jours
-- comptait 0 connexion et 0 minute sur les 30 derniers jours. Une ligne par session et par jour de Paris : une
-- connexion est désormais une session active un jour donné, et son temps est celui de ce jour-là.

-- Les lignes déjà là restent au jour de leur début : leur temps passé ne se découpe plus.
alter table journal_connexions add column jour date;
update journal_connexions set jour = (debut at time zone 'Europe/Paris')::date;
alter table journal_connexions alter column jour set not null;
alter table journal_connexions drop constraint journal_connexions_pkey;
alter table journal_connexions add primary key (session_id, jour);
drop index journal_connexions_debut_idx;
create index journal_connexions_jour_idx on journal_connexions (jour);

-- Comme en 0039 (une écriture par minute au plus, une pause dès 30 minutes), mais une ligne par jour : la première
-- requête du jour en ouvre une. L'écart qui enjambe minuit n'est compté nulle part, une fois par jour au plus.
create or replace function noter_activite(p_session uuid, p_user uuid)
returns void
language sql volatile security definer set search_path = public as $$
  insert into journal_connexions as j (session_id, user_id, jour)
  values (p_session, p_user, (now() at time zone 'Europe/Paris')::date)
  on conflict (session_id, jour) do update set
    temps_actif = j.temps_actif + case when now() - j.derniere_activite < interval '30 minutes'
                                       then now() - j.derniere_activite else interval '0' end,
    derniere_activite = now()
  where j.derniere_activite < now() - interval '1 minute'
$$;
revoke all on function noter_activite(uuid, uuid) from public;
grant execute on function noter_activite(uuid, uuid) to leon_app;

-- Les chiffres du tableau, comme en 0039, mais les connexions et le temps passé comptés par jour.
create or replace function statistiques_admin()
returns jsonb
language sql stable security definer set search_path = public as $$
  with jours as (
    select (now() at time zone 'Europe/Paris')::date - n as jour from generate_series(29, 0, -1) as n
  ),
  questions as (
    select tenant_id, created_at from discussion_messages where role = 'user'
  ),
  orgs as (
    select o.id, o.name, o."createdAt",
           (select count(*) from member m where m."organizationId" = o.id) as membres,
           (select count(*) from questions q where q.tenant_id = o.id) as questions,
           (select count(*) from questions q
             where q.tenant_id = o.id and q.created_at > now() - interval '30 days') as questions30,
           (select count(*) from connections c where c.tenant_id = o.id) as connecteurs,
           (select max(j.derniere_activite) from journal_connexions j
              join member m on m."userId" = j.user_id where m."organizationId" = o.id) as derniere_activite
      from organization o
  )
  select jsonb_build_object(
    'utilisateurs', (select jsonb_build_object(
        'total', count(*),
        'nouveaux7', count(*) filter (where "createdAt" > now() - interval '7 days'),
        'nouveaux30', count(*) filter (where "createdAt" > now() - interval '30 days'),
        'deuxFacteurs', count(*) filter (where "twoFactorEnabled"))
      from "user"),
    'actifs', (select jsonb_build_object(
        'jour', count(distinct user_id) filter (where derniere_activite > now() - interval '1 day'),
        'semaine', count(distinct user_id) filter (where derniere_activite > now() - interval '7 days'),
        'mois', count(distinct user_id) filter (where derniere_activite > now() - interval '30 days'))
      from journal_connexions),
    'organisations', (select jsonb_build_object(
        'total', count(*),
        'nouvelles30', count(*) filter (where "createdAt" > now() - interval '30 days'),
        'membresMoyen', coalesce(round(avg(membres), 1), 0),
        'actives30', count(*) filter (where derniere_activite > now() - interval '30 days'))
      from orgs),
    'connexions', (select jsonb_build_object(
        'total', count(*),
        'semaine', count(*) filter (where jour > aujourdhui - 7),
        'mois', count(*) filter (where jour > aujourdhui - 30),
        'tempsMoyen', coalesce(extract(epoch from avg(temps_actif) filter (where jour > aujourdhui - 30)), 0),
        'tempsMedian', coalesce(extract(epoch from percentile_cont(0.5) within group (order by temps_actif)
                        filter (where jour > aujourdhui - 30)), 0),
        'tempsTotal30', coalesce(extract(epoch from sum(temps_actif) filter (where jour > aujourdhui - 30)), 0))
      from journal_connexions, (select (now() at time zone 'Europe/Paris')::date as aujourdhui) a),
    'questions', (select jsonb_build_object(
        'total', count(*),
        'semaine', count(*) filter (where created_at > now() - interval '7 days'),
        'mois', count(*) filter (where created_at > now() - interval '30 days'),
        'discussions', (select count(*) from discussions),
        'recherches30', (select count(*) from appels_modele
                          where step = 'reponse' and created_at > now() - interval '30 days'))
      from questions),
    'couts', (select jsonb_build_object(
        'total', coalesce(sum(cost_usd), 0),
        'mois', coalesce(sum(cost_usd) filter (where created_at > now() - interval '30 days'), 0),
        'semaine', coalesce(sum(cost_usd) filter (where created_at > now() - interval '7 days'), 0),
        'appels30', count(*) filter (where created_at > now() - interval '30 days'),
        'nonChiffres30', count(*) filter (where cost_usd is null and created_at > now() - interval '30 days'),
        'tokensEntree30', coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens)
                            filter (where created_at > now() - interval '30 days'), 0),
        'tokensSortie30', coalesce(sum(output_tokens) filter (where created_at > now() - interval '30 days'), 0),
        'parModele', (select coalesce(jsonb_agg(jsonb_build_object('nom', model, 'cout', cout, 'appels', appels)
                                                order by cout desc), '[]')
                        from (select model, coalesce(sum(cost_usd), 0) as cout, count(*) as appels from appels_modele
                               where created_at > now() - interval '30 days' group by model) m),
        'parEtape', (select coalesce(jsonb_agg(jsonb_build_object('nom', step, 'cout', cout, 'appels', appels)
                                               order by cout desc), '[]')
                       from (select step, coalesce(sum(cost_usd), 0) as cout, count(*) as appels from appels_modele
                              where created_at > now() - interval '30 days' group by step) e))
      from appels_modele),
    'parJour', (select jsonb_agg(jsonb_build_object(
        'jour', j.jour,
        'inscriptions', (select count(*) from "user" u
                          where (u."createdAt" at time zone 'Europe/Paris')::date = j.jour),
        'connexions', (select count(*) from journal_connexions c where c.jour = j.jour),
        'questions', (select count(*) from questions q
                       where (q.created_at at time zone 'Europe/Paris')::date = j.jour),
        'cout', (select coalesce(sum(l.cost_usd), 0) from appels_modele l
                  where (l.created_at at time zone 'Europe/Paris')::date = j.jour)
      ) order by j.jour) from jours j),
    'connecteurs', (select coalesce(jsonb_agg(jsonb_build_object('nom', provider, 'total', total,
                                                                 'organisations', organisations)
                                              order by total desc), '[]')
      from (select provider, count(*) as total, count(distinct tenant_id) as organisations
              from connections group by provider) c),
    'listeOrganisations', (select coalesce(jsonb_agg(jsonb_build_object(
        'nom', name, 'creeLe', "createdAt", 'membres', membres, 'questions', questions,
        'questions30', questions30, 'connecteurs', connecteurs, 'derniereActivite', derniere_activite)
        order by derniere_activite desc nulls last, "createdAt" desc), '[]')
      from (select * from orgs order by derniere_activite desc nulls last, "createdAt" desc limit 50) o),
    'derniersInscrits', (select coalesce(jsonb_agg(jsonb_build_object(
        'nom', name, 'email', email, 'creeLe', "createdAt", 'organisation', organisation,
        'derniereActivite', derniere_activite) order by "createdAt" desc), '[]')
      from (select u.name, u.email, u."createdAt",
                   (select o.name from member m join organization o on o.id = m."organizationId"
                     where m."userId" = u.id order by m."createdAt" limit 1) as organisation,
                   (select max(j.derniere_activite) from journal_connexions j where j.user_id = u.id)
                     as derniere_activite
              from "user" u order by u."createdAt" desc limit 10) u)
  )
$$;
revoke all on function statistiques_admin() from public;
grant execute on function statistiques_admin() to leon_app;
