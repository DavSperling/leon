-- 0051-supprimer-fil.sql : un fil de travail (kind `leon_fil`, D21 du plan de la mémoire à disposition) est une source
-- que seul le serveur crée, privée à son auteur. L'app n'a pas le droit de supprimer une source : comme
-- supprimer_document (0034), seule cette fonction retire un fil, de l'organisation courante, appelée par son auteur
-- (withTenant). Elle ne sert qu'à la suppression du compte : une fusion garde le fil absorbé, marqué `absorbe_par`, avec
-- ses versions (tranché le 05/11). Ce qui dépend du fil part en cascade. Rend vrai si le fil est parti.
create function supprimer_fil(p_source uuid)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with gone as (
    delete from sources s
    where s.id = p_source and s.kind = 'leon_fil'
      and s.tenant_id = app_tenant() and s.owner_user_id = any(app_principals())
    returning s.id
  )
  select exists (select 1 from gone)
$$;
revoke all on function supprimer_fil(uuid) from public;
grant execute on function supprimer_fil(uuid) to leon_app;
