-- 0100-notifications-notion.sql : Notion prévient Leon dès qu'une page partagée change (webhooks, notion-routes.ts).
-- Une alerte ne sert qu'à dire quel espace a bougé : elle rend dues tout de suite les connexions Notion de cet espace,
-- et la relève habituelle (la recherche des pages modifiées) lit le nouveau.

-- La seule lecture hors RLS : une alerte reçue sans session ni jeton, dont la signature a déjà été vérifiée. L'espace
-- est la partie de `accountKey` avant le premier « : » (`<espace>:<propriétaire ou 'espace'>`, notion/connector.ts) ;
-- une clé sans « : » (un jeton qui agit au nom d'une personne) n'a pas d'espace. Comparaison exacte. En pause, la
-- connexion attend sa reprise ; en erreur, son prochain essai, comme notifications_microsoft (0096). Rend des
-- identifiants seulement, comme connector_syncs_due.
create function notifications_notion(espace text) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  update connections c set next_sync_at = now(), updated_at = now()
   where c.provider = 'notion' and c.status = 'active'
     and strpos(c.config ->> 'accountKey', ':') > 0
     and split_part(c.config ->> 'accountKey', ':', 1) = espace
  returning c.id
$$;
revoke all on function notifications_notion(text) from public;
grant execute on function notifications_notion(text) to leon_app;
