-- 0059-sources-reprises.sql : un outil rebranché ne garde pas l'accès de l'ancienne connexion.
--
-- Une connexion supprimée laisse ses sources (connection_id passe à nul). Quand son créateur rebranche l'outil, la
-- nouvelle connexion relit les mêmes éléments : leurs sources prennent son accès (ingest-items.ts), et cette fonction
-- le recopie sur tout ce qui en descend (recopier_acl_sources, 0055). La relève a verrouillé ces sources en les
-- écrivant ; seules les siennes, dans l'organisation courante, sont recopiées.
create function recopier_acl_mes_sources(p_sources uuid[]) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform recopier_acl_sources(array(
    select s.id from sources s
     where s.id = any(p_sources) and s.tenant_id = app_tenant() and s.owner_user_id = app_user()));
end
$$;
revoke all on function recopier_acl_mes_sources(uuid[]) from public;
grant execute on function recopier_acl_mes_sources(uuid[]) to leon_app;

-- GitHub ne se partage plus (connections.ts) : la fin de chaque relève remettait déjà l'accès des dépôts d'équipe
-- (0048), le choix enregistré ne tenait pas.
update connections set partage = null where provider = 'github' and partage is not null;
