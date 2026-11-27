-- 0095-retirer-tours-connexion.sql : une connexion retire des tours précis, quand l'outil signale la suppression d'un
-- message dans un fil gardé (un message supprimé dans Teams : les conditions des API Microsoft demandent de refléter les
-- suppressions). Comme retirer_sources_connexion (0019, 0020) : seulement dans les sources de son outil et de son
-- créateur, y compris celles d'une connexion supprimée depuis. Une source qui n'a plus aucun tour part aussi. Passages
-- et vecteurs suivent leurs tours, runs et lectures leur source (clés en cascade). Rend le nombre de tours retirés et
-- les sources parties, que l'app retire ensuite des fils qui les reliaient (unlinkSources, comme removeConnectorItems).
-- `p_stems` : les racines des identifiants (turnStem). Un tour est rangé sous `racine#empreinte`, ou `racine:n#empreinte`
-- pour la n-ième part d'un texte découpé : les deux formes sont retrouvées.
create function retirer_tours_connexion(p_connection uuid, p_stems text[])
returns table (retires integer, vides uuid[])
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  touched uuid[];
begin
  with gone as (
    delete from turns t
    using sources s, connections c
    where c.id = p_connection and c.tenant_id = app_tenant() and c.created_by = any(app_principals())
      and s.tenant_id = c.tenant_id and s.owner_user_id = c.created_by and s.kind = c.provider
      and t.tenant_id = s.tenant_id and t.source_id = s.id
      and (regexp_replace(t.external_id, '#[0-9a-f]{12}$', '') = any(p_stems)
        or regexp_replace(t.external_id, ':[0-9]+#[0-9a-f]{12}$', '') = any(p_stems))
    returning t.source_id
  )
  select coalesce(array_agg(distinct gone.source_id), '{}'), count(*)::integer into touched, retires from gone;

  with emptied as (
    delete from sources s
    where s.id = any(touched) and not exists (select 1 from turns t where t.source_id = s.id)
    returning s.id
  )
  select coalesce(array_agg(emptied.id), '{}') into vides from emptied;
  return next;
end
$$;
revoke all on function retirer_tours_connexion(uuid, text[]) from public;
grant execute on function retirer_tours_connexion(uuid, text[]) to leon_app;
