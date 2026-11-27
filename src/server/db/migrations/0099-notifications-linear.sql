-- 0099-notifications-linear.sql : Linear prévient Leon dès qu'un ticket, un commentaire ou une mise à jour de projet
-- change (le webhook de l'appli OAuth « Leon », linear-routes.ts). L'alerte ne sert qu'à rendre dues les connexions de
-- l'organisation Linear : la relève habituelle lit le nouveau, au lieu d'attendre son quart d'heure.

-- La seule lecture hors RLS : une alerte reçue sans session ni jeton, dont l'appli a déjà vérifié la signature. Rend
-- dues les connexions Linear actives de l'organisation : en pause, elles attendent leur reprise, et en erreur, leur
-- prochain essai. Au plus une relève par minute, car une équipe active envoie des alertes en rafale : l'échéance ne
-- tombe jamais moins d'une minute après le début de la dernière relève, et une échéance plus proche, demandée depuis
-- ce début, reste. Pendant une relève, l'échéance tombe donc après son début, et finishSync la garde.
-- L'organisation est la seconde partie de l'accountKey (`<viewer.id>:<organization.id>`, linear/client.ts), comparée
-- exactement. Seule une connexion par bouton (OAuth ou Pipedream) garde cet accountKey (oauth-routes.ts, puis
-- rememberAccountKey dans sync.ts) ; une connexion par clé personnelle ne garde que son libellé
-- (connections/actions.ts), n'est donc pas réveillée et reste relevée au quart d'heure. Rend des identifiants
-- seulement, comme connector_syncs_due.
create function notifications_linear(organisation text) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  update connections c
     -- least ignore un null : sans échéance demandée depuis le début de la relève, seule la première borne compte.
     set next_sync_at = least(
           greatest(now(), coalesce(c.last_sync_started_at, '-infinity') + interval '1 minute'),
           case when c.next_sync_at > c.last_sync_started_at then c.next_sync_at end),
         updated_at = now()
   where c.provider = 'linear' and c.status = 'active' and organisation <> ''
     and split_part(c.config ->> 'accountKey', ':', 2) = organisation
  returning c.id
$$;
revoke all on function notifications_linear(text) from public;
grant execute on function notifications_linear(text) to leon_app;
