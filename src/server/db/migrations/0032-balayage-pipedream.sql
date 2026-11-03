-- 0032-balayage-pipedream.sql : le balayage quotidien des utilisateurs Pipedream (sweepPipedreamUsers, connectors/sync.ts)
-- doit savoir lesquels servent encore, dans toutes les organisations. Comme connector_syncs_due (0008), la fonction ne
-- rend que des identifiants, choisis par Leon (`leon-<uuid>`), jamais de texte capté. Toute connexion qui en porte un
-- compte, quel que soit son statut : un utilisateur en trop reste chez Pipedream, un en moins casserait la connexion.
create function pipedream_users_en_service()
returns table (external_user_id text)
language sql stable security definer set search_path = public as $$
  select distinct c.config->>'externalUserId' from connections c
  where c.config->>'externalUserId' is not null
$$;
revoke all on function pipedream_users_en_service() from public;
grant execute on function pipedream_users_en_service() to leon_app;
