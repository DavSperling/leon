-- 0048-privatiser-hors-equipe.sql : les sources GitHub hors des dépôts d'équipe deviennent privées (décision D, D14).
--
-- Avant le lot 2, toute PR ou tout ticket relevé l'était avec l'accès de l'organisation, dépôts perso compris.
-- aligner_sources_github() aligne l'accès des sources GitHub de l'organisation courante sur la liste de 0047 : hors
-- de la liste, une source devient privée à qui l'a branchée (la règle de privateRaw) ; dans la liste, elle retrouve
-- l'organisation. Ses tours, passages, vecteurs, runs et lectures notées (read-log.ts : seuls ceux qui voient la
-- source voient la lecture) prennent l'accès de leur source, dans la transaction de l'appelant. Sous RLS, un
-- administrateur ne peut pas donner à la source d'un autre un accès qu'il n'a pas : seule cette fonction le fait,
-- pour app_tenant(). Elle n'applique que la liste, que seuls les administrateurs écrivent ; setDepotEquipe l'appelle
-- à chaque changement, sync.ts à la fin de chaque relève GitHub.
-- shortcut: une relève ou une indexation en cours quand la liste change (ou l'ancienne version, au déploiement)
-- écrit encore des lignes avec l'accès de l'organisation, jusqu'à la fin de la relève GitHub suivante de
-- l'organisation (15 min au plus) ; faire porter l'accès de la liste par l'ingestion elle-même si ce délai gêne.
create function aligner_sources_github()
returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  -- Deux changements de la liste en même temps : le second attend la fin du premier, puis lit sa liste (chaque
  -- requête d'une fonction volatile lit ce qui est validé à son début).
  select pg_advisory_xact_lock(hashtext('aligner_sources_github:' || app_tenant()::text));

  with cible as (
    select s.id, case when d.project is null then array[s.owner_user_id] else array[s.tenant_id] end as acl
      from sources s
      left join depots_equipe d
        on d.tenant_id = s.tenant_id and d.project = 'github.com/' || lower(s.metadata->'origin'->>'repo')
     where s.tenant_id = app_tenant() and s.kind = 'github'
  )
  update sources s set acl = c.acl from cible c where s.id = c.id and s.acl <> c.acl;

  -- Les lignes qui n'ont pas l'accès de leur source, y compris celles qu'un appel précédent n'avait pas vues.
  update turns t set acl = s.acl
    from sources s
   where s.tenant_id = app_tenant() and s.kind = 'github'
     and t.tenant_id = s.tenant_id and t.source_id = s.id and t.acl <> s.acl;

  update ingest_runs r set acl = s.acl
    from sources s
   where s.tenant_id = app_tenant() and s.kind = 'github'
     and r.tenant_id = s.tenant_id and r.source_id = s.id and r.acl <> s.acl;

  update passages p set acl = s.acl
    from sources s
   where s.tenant_id = app_tenant() and s.kind = 'github'
     and p.tenant_id = s.tenant_id and p.source_id = s.id and p.acl <> s.acl;

  update passage_vectors v set acl = p.acl
    from passages p
    join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
   where s.tenant_id = app_tenant() and s.kind = 'github'
     and v.tenant_id = p.tenant_id and v.passage_id = p.id and v.acl <> p.acl;

  -- Le journal n'a pas le droit de mise à jour (0005) ; la fonction l'a, avec les droits du propriétaire.
  update read_log l set acl = s.acl
    from sources s
   where s.tenant_id = app_tenant() and s.kind = 'github'
     and l.tenant_id = s.tenant_id and l.source_id = s.id and l.acl <> s.acl;
$$;
revoke all on function aligner_sources_github() from public;
grant execute on function aligner_sources_github() to leon_app;

-- Au déploiement, une fois pour toutes les organisations, même sans choix : sans dépôt coché, toutes leurs sources
-- GitHub deviennent privées à qui les a branchées, jusqu'à ce que l'administrateur coche ses dépôts.
do $$
declare
  organisation uuid;
begin
  for organisation in select id from organization loop
    perform set_config('app.tenant', organisation::text, true);
    perform aligner_sources_github();
  end loop;
  perform set_config('app.tenant', '', true);
end
$$;
