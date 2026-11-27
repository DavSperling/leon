-- 0099-notifications-linear.sql : Linear prévient Leon dès qu'un ticket, un commentaire ou une mise à jour de projet
-- change (le webhook de l'appli OAuth « Leon », linear-routes.ts). L'alerte ne sert qu'à rendre dues les connexions de
-- l'organisation Linear : la relève habituelle lit le nouveau, au lieu d'attendre son quart d'heure.

-- La seule lecture hors RLS : une alerte reçue sans session ni jeton, dont l'appli a déjà vérifié la signature. Rend
-- dues tout de suite les connexions Linear actives de l'organisation : en pause, elles attendent leur reprise, et en
-- erreur, leur prochain essai. L'organisation est la seconde partie de l'accountKey que le bouton garde
-- (`<viewer.id>:<organization.id>`, linear/client.ts), comparée exactement ; une connexion par clé personnelle n'en a
-- pas et reste relevée au quart d'heure. Rend des identifiants seulement, comme connector_syncs_due.
create function notifications_linear(organisation text) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  update connections c set next_sync_at = now(), updated_at = now()
   where c.provider = 'linear' and c.status = 'active' and organisation <> ''
     and split_part(c.config ->> 'accountKey', ':', 2) = organisation
  returning c.id
$$;
revoke all on function notifications_linear(text) from public;
grant execute on function notifications_linear(text) to leon_app;
