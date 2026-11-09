-- Lot 2b : qui voit ce que Leon lit dans une connexion. Nul : le choix de l'outil (à qui branche pour une boîte mail,
-- Drive, Slack ou Outlook ; toute l'équipe sinon). Sinon l'ACL posée sur ses sources, de la forme de partager_document
-- (0055) : [créateur], [organisation] ou [créateur, groupes…].
alter table connections add column partage uuid[];

-- Le créateur choisit ; tout ce que la connexion a déjà relevé suit, sous verrou. La relève lit `partage` sous verrou
-- partagé de la même ligne (ingest-items.ts) : une relève en cours finit avant, ou écrit déjà avec le nouveau partage.
-- Faux si ce n'est pas sa connexion, ou si l'ACL n'a pas cette forme.
create function partager_connexion(p_connexion uuid, p_acl uuid[]) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  touchees uuid[];
begin
  if app_user() is null or not (
    p_acl = array[app_user()]
    or p_acl = array[app_tenant()]
    or (cardinality(p_acl) > 1 and p_acl[1] = app_user()
        and (select count(*) from groupes g where g.tenant_id = app_tenant() and g.id = any(p_acl[2:]))
            = cardinality(p_acl) - 1)
  ) then
    return false;
  end if;
  perform 1 from connections c
   where c.id = p_connexion and c.tenant_id = app_tenant() and c.created_by = app_user()
     for update;
  if not found then
    return false;
  end if;
  -- Dans l'ordre des id, comme lockSources (embed-missing.ts).
  select coalesce(array_agg(id order by id), '{}') into touchees from (
    select s.id from sources s
     where s.tenant_id = app_tenant() and s.connection_id = p_connexion and s.owner_user_id = app_user()
     order by s.id for no key update) verrou;
  update sources set acl = p_acl where id = any(touchees);
  perform recopier_acl_sources(touchees);
  update connections set partage = p_acl where id = p_connexion;
  return true;
end
$$;
revoke all on function partager_connexion(uuid, uuid[]) from public;
grant execute on function partager_connexion(uuid, uuid[]) to leon_app;

-- 0055, plus les connexions partagées au groupe : elles reviennent à leur créateur ou à leurs autres groupes. Les
-- connexions d'abord, puis les sources : l'ordre de la relève, qui verrouille sa connexion avant d'écrire ses sources.
create or replace function supprimer_groupe(p_groupe uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  touchees uuid[];
begin
  if not app_est_admin() then
    return false;
  end if;
  perform 1 from groupes where id = p_groupe and tenant_id = app_tenant() and service is null for update;
  if not found then
    return false;
  end if;
  update connections set partage = array_remove(partage, p_groupe)
   where tenant_id = app_tenant() and p_groupe = any(partage);
  -- Dans l'ordre des id, comme lockSources (embed-missing.ts).
  select coalesce(array_agg(id order by id), '{}') into touchees from (
    select s.id from sources s where s.tenant_id = app_tenant() and p_groupe = any(s.acl) order by s.id
       for no key update) verrou;
  update sources set acl = array_remove(acl, p_groupe) where id = any(touchees);
  perform recopier_acl_sources(touchees);
  delete from groupes where id = p_groupe;
  return true;
end
$$;
