-- 0034-suppression-documents.sql : l'auteur d'un document ajouté à la main (écran Documents) peut le supprimer.
-- L'app ne reçoit pas le droit de supprimer du brut : comme retirer_sources_connexion (0019), seule cette fonction
-- le fait, pour un document de l'organisation courante, appelée par son auteur (withTenant). Ses tours, passages,
-- vecteurs, runs et lectures partent avec lui (clés en cascade). Rend vrai si le document est parti.
create function supprimer_document(p_source uuid)
returns boolean
language sql volatile security definer set search_path = public as $$
  with gone as (
    delete from sources s
    where s.id = p_source and s.kind = 'document'
      and s.tenant_id = app_tenant() and s.owner_user_id = any(app_principals())
    returning s.id
  )
  select exists (select 1 from gone)
$$;
revoke all on function supprimer_document(uuid) from public;
grant execute on function supprimer_document(uuid) to leon_app;
