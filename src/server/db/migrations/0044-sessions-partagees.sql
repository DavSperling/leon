-- 0044-sessions-partagees.sql : les sessions Claude Code liées à un dépôt GitHub sont partagées à l'organisation
-- (spec du 01/11/2026). Le partage d'une session est son ACL, sur les cinq tables qui la portent : sources, turns,
-- ingest_runs, passages, passage_vectors (read_log porte l'accès du lecteur à son journal : on n'y touche pas).
-- L'auteur, et lui seul, rend privée une session ou toutes ses sessions d'un dépôt (depots_prives).

-- Les dépôts dont un membre garde ses sessions privées, passées et futures. Écrits seulement par
-- regler_partage_depot ; lus par la capture et l'espace Développeurs.
create table depots_prives (
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  project text not null check (project ~ '^github\.com/[a-z0-9._-]+/[a-z0-9._-]+$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, project)
);

alter table depots_prives enable row level security;
-- Un user_id n'est jamais l'identifiant d'une organisation : `any(app_principals())` ne laisse voir que ses lignes.
create policy propres_lignes on depots_prives to leon_app
  using (tenant_id = app_tenant() and user_id = any(app_principals()));
grant select on depots_prives to leon_app;

-- Régler le partage d'une session : son auteur seul, une session claude_code liée à un dépôt GitHub. Un
-- administrateur ne le peut pas à sa place (la session est la sienne). La source est verrouillée et mise à jour la
-- première : une indexation en cours (lockSources, verrou partagé) finit avant, ou lit l'accès déjà corrigé.
create function regler_partage_session(p_source uuid, p_partage boolean)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_acl uuid[];
begin
  select case when p_partage then array[s.tenant_id] else array[s.owner_user_id] end
    into v_acl
    from sources s
   where s.id = p_source and s.tenant_id = app_tenant()
     and s.owner_user_id = any(app_principals())
     and s.kind = 'claude_code'
     and s.metadata ->> 'project' like 'github.com/%'
     for update;
  if v_acl is null then
    return false;
  end if;
  update sources set acl = v_acl where id = p_source;
  update turns set acl = v_acl where source_id = p_source;
  update ingest_runs set acl = v_acl where source_id = p_source;
  update passages set acl = v_acl where source_id = p_source;
  update passage_vectors v set acl = v_acl
    from passages p
   where p.source_id = p_source and v.passage_id = p.id;
  return true;
end
$$;
revoke all on function regler_partage_session(uuid, boolean) from public;
grant execute on function regler_partage_session(uuid, boolean) to leon_app;

-- Rendre privé (ou partager de nouveau) tout un dépôt pour l'appelant : la ligne de depots_prives, puis chacune de
-- ses sessions claude_code sur ce dépôt. Rend le nombre de sessions réglées. L'appelant est le membre actif de
-- l'organisation parmi ses principaux.
create function regler_partage_depot(p_project text, p_partage boolean)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
  v_source uuid;
  v_count integer := 0;
begin
  select m."userId" into v_user
    from member m join "user" u on u.id = m."userId"
   where m."organizationId" = app_tenant() and m."userId" = any(app_principals())
     and u.deleted_at is null;
  if v_user is null or p_project !~ '^github\.com/[a-z0-9._-]+/[a-z0-9._-]+$' then
    return 0;
  end if;
  if p_partage then
    delete from depots_prives
     where tenant_id = app_tenant() and user_id = v_user and project = p_project;
  else
    insert into depots_prives (tenant_id, user_id, project)
    values (app_tenant(), v_user, p_project)
    on conflict do nothing;
  end if;
  -- Dans l'ordre des identifiants : deux réglages concurrents ne s'attendent jamais l'un l'autre.
  for v_source in
    select s.id from sources s
     where s.tenant_id = app_tenant() and s.owner_user_id = v_user and s.kind = 'claude_code'
       and s.metadata ->> 'project' = p_project
     order by s.id
  loop
    if regler_partage_session(v_source, p_partage) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;
revoke all on function regler_partage_depot(text, boolean) from public;
grant execute on function regler_partage_depot(text, boolean) to leon_app;

-- Les sessions déjà captées sont partagées dès le déploiement (choix de Claude dans la spec : l'équipe a la matière
-- tout de suite). Seules celles encore privées à leur auteur, membre actif de l'organisation, changent : les sessions
-- d'un ancien membre (gardées privées par la suppression du compte) restent privées. À ne jouer qu'une fois : rejoué
-- plus tard, il partagerait de nouveau les sessions rendues privées depuis. Le test de la migration joue ce bloc entre
-- les deux marqueurs.
-- début : partage des sessions passées
update sources set acl = array[tenant_id]
 where kind = 'claude_code' and metadata ->> 'project' like 'github.com/%'
   and acl = array[owner_user_id]
   and exists (select 1 from member m join "user" u on u.id = m."userId"
                where m."organizationId" = sources.tenant_id and m."userId" = sources.owner_user_id
                  and u.deleted_at is null);
update turns t set acl = array[s.tenant_id]
  from sources s
 where t.source_id = s.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
update ingest_runs r set acl = array[s.tenant_id]
  from sources s
 where r.source_id = s.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
update passages p set acl = array[s.tenant_id]
  from sources s
 where p.source_id = s.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
update passage_vectors v set acl = array[s.tenant_id]
  from passages p join sources s on s.id = p.source_id
 where v.passage_id = p.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
-- fin : partage des sessions passées
