-- 0067-supprimer-notes.sql : les notes de l'agent (kind `mcp_remember`, D38 du plan de la mémoire à disposition, T57)
-- sont privées à leur auteur et partent avec son compte (A12), leurs versions comprises. L'app n'a pas le droit de
-- supprimer une source : comme supprimer_fil (0051), seule cette fonction le fait, bornée aux notes de l'organisation
-- courante et de la personne qui agit (withTenant pose app.user, 0055). Seule la suppression du compte l'appelle
-- (delete-account.ts). Ses tours, passages, vecteurs, runs, versions et lectures partent en cascade. Rend le nombre de
-- notes supprimées.
create function supprimer_notes_du_compte()
returns integer
language sql volatile security definer set search_path = public, pg_temp as $$
  with gone as (
    delete from sources s
    where s.kind = 'mcp_remember' and s.tenant_id = app_tenant() and s.owner_user_id = app_user()
    returning s.id
  )
  select count(*)::integer from gone
$$;
revoke all on function supprimer_notes_du_compte() from public;
grant execute on function supprimer_notes_du_compte() to leon_app;
