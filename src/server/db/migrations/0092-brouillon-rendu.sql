-- 0092-brouillon-rendu.sql : rendre l'appel d'un brouillon qui n'a pas eu lieu, comme ceux du point et de l'agenda
-- (0091).
--
-- reserver_brouillon (0080) compte avant l'appel, pour que deux passages simultanés ne passent pas le plafond. Mais
-- quand le fournisseur du modèle est injoignable ou refuse la clé, rien n'est payé et l'appel restait compté : une
-- panne épuisait les vingt appels du jour de la personne sans produire un seul brouillon. L'app rend alors l'appel
-- (portrait/brouillons.ts) ; un appel payé (réponse illisible, tronquée, refus) reste compté.
create function rendre_brouillon(p_user uuid) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update brouillons_par_jour set nombre = nombre - 1
   where user_id = p_user and jour = (now() at time zone 'UTC')::date and nombre > 0
$$;
revoke all on function rendre_brouillon(uuid) from public;
grant execute on function rendre_brouillon(uuid) to leon_app;
