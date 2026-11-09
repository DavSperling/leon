-- 0055-groupes.sql : les groupes (plan organisation, lot 2). Entre « moi seul » et « toute l'équipe », un document se
-- partage à un groupe. Chaque service des membres (member.department, 0043) est un groupe tenu à jour tout seul ; un
-- propriétaire ou un administrateur crée en plus des groupes libres et choisit qui en fait partie.
-- L'identifiant d'un groupe est un principal : principalsFor (tenant-context.ts) l'ajoute à ceux de ses membres, et une
-- ACL qui le contient s'ouvre à eux. Aucune règle RLS de la mémoire ne change. Une ACL partagée à des groupes commence
-- toujours par son auteur : il garde la main sur ce qu'il a partagé, et l'écriture passe la RLS (acl && principals).

-- La personne courante, posée par withTenant à côté de app.principals : les principals contiennent aussi l'organisation
-- et des groupes, seule app.user dit qui agit.
create function app_user() returns uuid language sql stable
  as $$ select nullif(current_setting('app.user', true), '')::uuid $$;

-- Propriétaire ou administrateur actif de l'organisation courante (test de rôle de connections.ts : Better Auth peut
-- ranger plusieurs rôles séparés par des virgules).
create function app_est_admin() returns boolean language sql stable set search_path = public, pg_temp
  as $$
    select exists (
      select 1 from member m join "user" u on u.id = m."userId"
      where m."organizationId" = app_tenant() and m."userId" = app_user() and u.deleted_at is null
        and string_to_array(m.role, ',') && array['owner', 'admin'])
  $$;

create table groupes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  -- Un groupe de service porte l'identifiant du service (DEPARTMENTS, onboarding.ts) et pas de nom : l'écran le traduit.
  service text,
  nom text check (char_length(nom) between 1 and 80),
  check ((service is null) <> (nom is null)),
  created_at timestamptz not null default now(),
  unique (tenant_id, service),
  unique (id, tenant_id)
);
create unique index groupes_nom_idx on groupes (tenant_id, lower(nom)) where nom is not null;

-- Les membres d'un groupe libre. Ceux d'un groupe de service ne s'écrivent pas : ce sont les membres de ce service.
create table membres_groupe (
  tenant_id uuid not null,
  groupe_id uuid not null,
  member_id uuid not null references member(id) on delete cascade,
  primary key (groupe_id, member_id),
  foreign key (groupe_id, tenant_id) references groupes(id, tenant_id) on delete cascade
);
create index membres_groupe_member_idx on membres_groupe (member_id);

-- Tout membre lit les groupes de son organisation (pour partager) ; seuls un propriétaire ou un administrateur les
-- écrivent, et un membre ajouté doit être de la même organisation. Pour update et delete, Postgres écarte sans erreur
-- les lignes refusées.
alter table groupes enable row level security;
alter table membres_groupe enable row level security;
create policy tenant_only on groupes to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_only on membres_groupe to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy admin_insert on groupes as restrictive for insert to leon_app
  with check (app_est_admin() and service is null);
create policy admin_update on groupes as restrictive for update to leon_app
  using (app_est_admin() and service is null) with check (service is null);
create policy admin_delete on groupes as restrictive for delete to leon_app
  using (false); -- supprimer_groupe, qui retire d'abord le groupe des ACL
create policy admin_insert on membres_groupe as restrictive for insert to leon_app
  with check (
    app_est_admin()
    and exists (select 1 from groupes g where g.id = groupe_id and g.service is null)
    and exists (select 1 from member m where m.id = member_id and m."organizationId" = tenant_id));
create policy admin_delete on membres_groupe as restrictive for delete to leon_app
  using (app_est_admin());
grant select, insert, update on groupes to leon_app;
grant select, insert, delete on membres_groupe to leon_app;

-- Un service qui apparaît (invitation, poste changé) devient un groupe. Un service vidé garde le sien : ce qui lui a été
-- partagé reviendra à qui y entre.
create function creer_groupe_service() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.department is not null then
    insert into groupes (tenant_id, service) values (new."organizationId", new.department)
      on conflict (tenant_id, service) do nothing;
  end if;
  return new;
end
$$;
create trigger groupe_service after insert or update of department on member
  for each row execute function creer_groupe_service();
insert into groupes (tenant_id, service)
  select distinct "organizationId", department from member where department is not null
  on conflict (tenant_id, service) do nothing;

-- Recopie l'ACL des sources `p_sources` (déjà écrite) sur tout ce qui en descend, comme aligner_sources_github (0048) :
-- tours, runs, passages, vecteurs, journal. L'appelant a verrouillé les sources (for no key update) : une indexation en
-- cours a fini avant, celle qui suit attend et recopie des tours déjà corrigés.
create function recopier_acl_sources(p_sources uuid[]) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update turns t set acl = s.acl from sources s
   where s.id = any(p_sources) and t.tenant_id = s.tenant_id and t.source_id = s.id and t.acl <> s.acl;
  update ingest_runs r set acl = s.acl from sources s
   where s.id = any(p_sources) and r.tenant_id = s.tenant_id and r.source_id = s.id and r.acl <> s.acl;
  update passages p set acl = s.acl from sources s
   where s.id = any(p_sources) and p.tenant_id = s.tenant_id and p.source_id = s.id and p.acl <> s.acl;
  update passage_vectors v set acl = p.acl from passages p
   where p.source_id = any(p_sources) and v.tenant_id = p.tenant_id and v.passage_id = p.id and v.acl <> p.acl;
  -- Le journal n'a pas le droit de mise à jour (0005) ; la fonction l'a, avec les droits du propriétaire.
  update read_log l set acl = s.acl from sources s
   where s.id = any(p_sources) and l.tenant_id = s.tenant_id and l.source_id = s.id and l.acl <> s.acl;
$$;
revoke all on function recopier_acl_sources(uuid[]) from public;

-- L'auteur d'un document choisit qui le voit : lui seul [auteur], toute l'équipe [organisation], ou un ou plusieurs
-- groupes de l'organisation [auteur, groupes…]. Faux si ce n'est pas son document, ou si l'ACL n'a pas cette forme.
create function partager_document(p_source uuid, p_acl uuid[]) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
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
  perform 1 from sources s
   where s.id = p_source and s.tenant_id = app_tenant() and s.kind = 'document' and s.owner_user_id = app_user()
     for no key update;
  if not found then
    return false;
  end if;
  update sources set acl = p_acl where id = p_source;
  perform recopier_acl_sources(array[p_source]);
  return true;
end
$$;
revoke all on function partager_document(uuid, uuid[]) from public;
grant execute on function partager_document(uuid, uuid[]) to leon_app;

-- Un administrateur supprime un groupe libre : ce qui lui était partagé ne l'est plus qu'aux autres groupes de son ACL,
-- ou à son seul auteur. Rien ne s'ouvre à plus de monde. Faux si ce n'est pas un groupe libre de l'organisation.
create function supprimer_groupe(p_groupe uuid) returns boolean
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
revoke all on function supprimer_groupe(uuid) from public;
grant execute on function supprimer_groupe(uuid) to leon_app;
