-- 0060-plafond-points.sql : un plafond de dépense pour le point du matin.
--
-- Chaque point écrit par le modèle est un appel payé (2,3 centimes en moyenne, 3,6 au plus, mesuré en production du
-- 3 au 10/11/2026). Les recalculs suivent l'activité des projets : rien ne bornait ce qu'un dépôt très actif, ou un
-- script qui ouvre des sessions en boucle, faisait payer pour une personne. Un compteur par personne et par jour
-- (UTC), sans aucun texte, comme journal_connexions (0039) : l'app n'y touche que par reserver_point.
create table points_par_jour (
  user_id uuid not null references "user"(id) on delete cascade,
  jour date not null,
  nombre integer not null,
  primary key (user_id, jour)
);

-- Compte un point payé de p_user aujourd'hui s'il en reste sous p_plafond, et rend vrai ; sinon rend faux. L'écriture
-- verrouille la ligne du jour : deux recalculs simultanés ne passent pas le plafond. Les jours passés de la personne
-- s'effacent au passage.
create function reserver_point(p_user uuid, p_plafond integer)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with passes as (
    delete from points_par_jour where user_id = p_user and jour < (now() at time zone 'UTC')::date
  ), compte as (
    insert into points_par_jour as p (user_id, jour, nombre)
    values (p_user, (now() at time zone 'UTC')::date, 1)
    on conflict (user_id, jour) do update set nombre = p.nombre + 1 where p.nombre < p_plafond
    returning 1
  )
  select exists (select 1 from compte)
$$;
revoke all on function reserver_point(uuid, integer) from public;
grant execute on function reserver_point(uuid, integer) to leon_app;
