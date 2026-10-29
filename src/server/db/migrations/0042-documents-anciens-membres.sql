-- 0042-documents-anciens-membres.sql : un document laissé à l'équipe par un membre qui a supprimé son compte (0040)
-- n'avait plus personne pour le retirer, même une erreur ou un secret. Un propriétaire ou un administrateur actif de
-- l'organisation le peut désormais ; le document d'un membre encore là reste à son seul auteur. Le reste est celui de
-- 0034. Better Auth peut ranger plusieurs rôles séparés par des virgules (comme connections.ts).
create or replace function supprimer_document(p_source uuid)
returns boolean
language sql volatile security definer set search_path = public as $$
  with gone as (
    delete from sources s
    where s.id = p_source and s.kind = 'document'
      and s.tenant_id = app_tenant()
      and (
        s.owner_user_id = any(app_principals())
        or (
          exists (select 1 from "user" o where o.id = s.owner_user_id and o.deleted_at is not null)
          and exists (
            select 1 from member m join "user" u on u.id = m."userId"
            where m."organizationId" = app_tenant() and m."userId" = any(app_principals())
              and u.deleted_at is null and string_to_array(m.role, ',') && array['owner', 'admin']
          )
        )
      )
    returning s.id
  )
  select exists (select 1 from gone)
$$;
revoke all on function supprimer_document(uuid) from public;
grant execute on function supprimer_document(uuid) to leon_app;
