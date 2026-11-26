-- 0090-plafond-appels.sql : un plafond de dépense par personne et par jour pour la réponse en tête de la recherche et
-- pour la discussion (audit du 26/11/2026, n° 4).
--
-- Ces deux appels au modèle n'avaient pour garde qu'un nombre de réponses en cours (3 et 2), tenu en mémoire : un
-- script, ou une personne qui enchaîne les questions, n'avait aucune borne sur la journée, alors que le point (0060)
-- et l'agenda (0072) en ont une. Un seul compteur pour les deux, par étape, sans aucun texte : l'app n'y touche que par
-- reserver_appel. Les numéros 0075 à 0089 sont pris par la pile des agents, pas encore sur main : le migrateur
-- applique tout fichier qu'il n'a pas encore appliqué, l'ordre entre eux n'importe pas.
create table appels_par_jour (
  user_id uuid not null references "user"(id) on delete cascade,
  etape text not null check (etape in ('reponse', 'discussion')),
  jour date not null,
  nombre integer not null,
  primary key (user_id, etape, jour)
);

-- Compte un appel de p_user à p_etape aujourd'hui (UTC) s'il en reste sous p_plafond, et rend vrai ; sinon rend faux.
-- Comme reserver_point : l'écriture verrouille la ligne du jour, et les jours passés de la personne s'effacent au
-- passage.
create function reserver_appel(p_user uuid, p_etape text, p_plafond integer)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with passes as (
    delete from appels_par_jour where user_id = p_user and jour < (now() at time zone 'UTC')::date
  ), compte as (
    insert into appels_par_jour as a (user_id, etape, jour, nombre)
    values (p_user, p_etape, (now() at time zone 'UTC')::date, 1)
    on conflict (user_id, etape, jour) do update set nombre = a.nombre + 1 where a.nombre < p_plafond
    returning 1
  )
  select exists (select 1 from compte)
$$;
revoke all on function reserver_appel(uuid, text, integer) from public;
grant execute on function reserver_appel(uuid, text, integer) to leon_app;
