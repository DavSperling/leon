-- 0039-tableau-admin.sql : ce que le tableau de bord des admins de Leon (/admin) compte.
--
-- Better Auth efface la session à la déconnexion et à l'expiration, et le coût des appels au modèle n'allait que
-- dans les journaux : deux tables gardent ce qu'il faut pour compter, sans aucun contenu. Le tableau lit tout par
-- statistiques_admin(), qui traverse les organisations : elle ne rend que des comptes, plus les noms et e-mails des
-- dix derniers inscrits.

-- Une ligne par session : son début, sa dernière activité, et le temps passé (les écarts de moins de 30 minutes
-- entre deux requêtes). Pas de tenant_id : une session n'appartient qu'à une personne.
create table journal_connexions (
  session_id uuid primary key,
  user_id uuid not null references "user"(id) on delete cascade,
  debut timestamptz not null default now(),
  derniere_activite timestamptz not null default now(),
  temps_actif interval not null default interval '0'
);
create index journal_connexions_debut_idx on journal_connexions (debut);
create index journal_connexions_user_idx on journal_connexions (user_id, derniere_activite);

-- Un appel au modèle : ses compteurs de tokens et son coût estimé (models.ts). Null : modèle sans tarif connu.
create table llm_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  step text not null check (step in ('reponse', 'discussion', 'point')),
  model text not null check (char_length(model) <= 100),
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null,
  cache_write_tokens integer not null,
  cost_usd numeric(12, 5)
);
create index llm_usage_created_at_idx on llm_usage (created_at);
grant insert on llm_usage to leon_app;

-- Note une requête de la session. Une écriture par minute au plus ; un écart de 30 minutes ou plus est une pause,
-- pas du temps passé (le délai de session des outils de mesure d'audience).
create function noter_activite(p_session uuid, p_user uuid)
returns void
language sql volatile security definer set search_path = public as $$
  insert into journal_connexions as j (session_id, user_id) values (p_session, p_user)
  on conflict (session_id) do update set
    temps_actif = j.temps_actif + case when now() - j.derniere_activite < interval '30 minutes'
                                       then now() - j.derniere_activite else interval '0' end,
    derniere_activite = now()
  where j.derniere_activite < now() - interval '1 minute'
$$;
revoke all on function noter_activite(uuid, uuid) from public;
grant execute on function noter_activite(uuid, uuid) to leon_app;

-- Les chiffres du tableau, en un seul objet. Les jours sont ceux de Paris, sur les 30 derniers jours.
create function statistiques_admin()
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
        'semaine', count(*) filter (where debut > now() - interval '7 days'),
        'mois', count(*) filter (where debut > now() - interval '30 days'),
        'tempsMoyen', coalesce(extract(epoch from avg(temps_actif)
                        filter (where debut > now() - interval '30 days')), 0),
        'tempsMedian', coalesce(extract(epoch from percentile_cont(0.5) within group (order by temps_actif)
                        filter (where debut > now() - interval '30 days')), 0),
        'tempsTotal30', coalesce(extract(epoch from sum(temps_actif)
                        filter (where debut > now() - interval '30 days')), 0))
      from journal_connexions),
    'questions', (select jsonb_build_object(
        'total', count(*),
        'semaine', count(*) filter (where created_at > now() - interval '7 days'),
        'mois', count(*) filter (where created_at > now() - interval '30 days'),
        'discussions', (select count(*) from discussions),
        'recherches30', (select count(*) from llm_usage
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
                        from (select model, coalesce(sum(cost_usd), 0) as cout, count(*) as appels from llm_usage
                               where created_at > now() - interval '30 days' group by model) m),
        'parEtape', (select coalesce(jsonb_agg(jsonb_build_object('nom', step, 'cout', cout, 'appels', appels)
                                               order by cout desc), '[]')
                       from (select step, coalesce(sum(cost_usd), 0) as cout, count(*) as appels from llm_usage
                              where created_at > now() - interval '30 days' group by step) e))
      from llm_usage),
    'parJour', (select jsonb_agg(jsonb_build_object(
        'jour', j.jour,
        'inscriptions', (select count(*) from "user" u
                          where (u."createdAt" at time zone 'Europe/Paris')::date = j.jour),
        'connexions', (select count(*) from journal_connexions c
                        where (c.debut at time zone 'Europe/Paris')::date = j.jour),
        'questions', (select count(*) from questions q
                       where (q.created_at at time zone 'Europe/Paris')::date = j.jour),
        'cout', (select coalesce(sum(l.cost_usd), 0) from llm_usage l
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
