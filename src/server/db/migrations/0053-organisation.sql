-- 0053-organisation.sql : qui est le manager de qui, et ce que chaque manager suit des gens sous lui (écran
-- « Mon équipe »). Aucun droit sur la mémoire ne change : un manager ne lit que ce que toute l'équipe voit déjà,
-- sous ses propres droits (0003). Les lignes partent avec le membre (clés vers member, en cascade).

create table reporting_lines (
  tenant_id uuid not null references organization(id) on delete cascade,
  member_id uuid primary key references member(id) on delete cascade,
  manager_id uuid not null references member(id) on delete cascade,
  check (member_id <> manager_id)
);
create index reporting_lines_manager_idx on reporting_lines (manager_id);

-- Les familles d'outils qu'un manager suit chez une personne sous lui ; sans ligne, il suit tout.
create table manager_follows (
  tenant_id uuid not null references organization(id) on delete cascade,
  manager_id uuid not null references member(id) on delete cascade,
  member_id uuid not null references member(id) on delete cascade,
  families text[] not null,
  primary key (manager_id, member_id)
);

-- L'organigramme se lit dans toute l'organisation, comme la liste des membres. Le code réserve son écriture aux
-- propriétaires et administrateurs, et les suivis au manager qui les choisit (organisation.ts).
alter table reporting_lines enable row level security;
alter table manager_follows enable row level security;
create policy tenant_only on reporting_lines to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_only on manager_follows to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert, update, delete on reporting_lines to leon_app;
grant select, insert, update on manager_follows to leon_app;

-- Un document ajouté à la main a pour auteur celui qui l'a ajouté (documents.ts l'écrit désormais) : « de: » et
-- l'écran « Mon équipe » le retrouvent. Les documents déjà là sont rattrapés ici, tours et passages.
update turns t set author_name = left(u.name, 200), author_email = left(u.email, 320)
  from sources s join "user" u on u.id = s.owner_user_id
  where s.tenant_id = t.tenant_id and s.id = t.source_id and s.kind = 'document' and t.author_email is null
    and u.deleted_at is null;
update passages p set author_name = left(u.name, 200), author_email = left(u.email, 320)
  from sources s join "user" u on u.id = s.owner_user_id
  where s.tenant_id = p.tenant_id and s.id = p.source_id and s.kind = 'document' and p.author_email is null
    and u.deleted_at is null;
