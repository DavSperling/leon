-- 0091-plafonds-rendus.sql : rendre le créneau d'un point ou d'un agenda dont l'appel au modèle n'a pas eu lieu
-- (audit du 26/11/2026, n° 10).
--
-- reserver_point (0060) et reserver_agenda (0072) comptent avant l'appel, pour que deux recalculs simultanés ne
-- passent pas le plafond. Mais quand le fournisseur est injoignable ou refuse la clé (le 19/11/2026 : 401 sur tous
-- les appels), rien n'est payé et le créneau restait compté : les quatre tentatives de la file épuisaient le plafond
-- du jour de la personne sans produire un seul texte. L'app rend alors le créneau ; un appel payé (réponse vide,
-- tronquée, refus) reste compté.
create function rendre_point(p_user uuid) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update points_par_jour set nombre = nombre - 1
   where user_id = p_user and jour = (now() at time zone 'UTC')::date and nombre > 0
$$;
revoke all on function rendre_point(uuid) from public;
grant execute on function rendre_point(uuid) to leon_app;

create function rendre_agenda(p_user uuid) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update agendas_par_jour set nombre = nombre - 1
   where user_id = p_user and jour = (now() at time zone 'UTC')::date and nombre > 0
$$;
revoke all on function rendre_agenda(uuid) from public;
grant execute on function rendre_agenda(uuid) to leon_app;
