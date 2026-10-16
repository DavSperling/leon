-- 0007-taches.sql : projets, statuts, tâches, étiquettes, commentaires, journal, vues enregistrées.
-- Projets, tâches, étiquettes et vues portent une ACL (celle d'une tâche = celle de son projet,
-- posée par tasks_guard) ; statuts, liens d'étiquettes, commentaires et journal suivent la
-- visibilité de leur parent.
-- Les clés étrangères ignorent la RLS : le code vérifie la visibilité des lignes visées.

create table task_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name text not null check (char_length(name) between 1 and 80),
  last_number integer not null default 0 check (last_number >= 0),
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);

create table task_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  project_id uuid not null,
  label text not null check (char_length(label) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  category text not null check (category in ('backlog', 'todo', 'started', 'done', 'canceled')),
  position double precision not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, project_id, id),
  foreign key (tenant_id, project_id) references task_projects (tenant_id, id) on delete cascade
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  project_id uuid not null,
  number integer not null check (number > 0),
  status_id uuid not null,
  parent_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description_md text not null default '' check (char_length(description_md) <= 100000),
  priority text not null default 'none' check (priority in ('none', 'urgent', 'high', 'medium', 'low')),
  assignee_id uuid references "user"(id) on delete set null,
  creator_id uuid references "user"(id) on delete set null,
  due_date date,
  position double precision not null,
  origin text not null check (origin in ('ui', 'mcp')),
  status_changed_at timestamptz not null default now(),
  completed_at timestamptz,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id),
  unique (project_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references task_projects (tenant_id, id) on delete cascade,
  -- le statut appartient au projet de la tâche ; pas de cascade : on déplace les tâches avant de supprimer un statut
  foreign key (tenant_id, project_id, status_id) references task_statuses (tenant_id, project_id, id),
  foreign key (tenant_id, parent_id) references tasks (tenant_id, id) on delete set null (parent_id)
);

create table task_labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table task_label_links (
  tenant_id uuid not null references organization(id) on delete cascade,
  task_id uuid not null,
  label_id uuid not null,
  primary key (task_id, label_id),
  foreign key (tenant_id, task_id) references tasks (tenant_id, id) on delete cascade,
  foreign key (tenant_id, label_id) references task_labels (tenant_id, id) on delete cascade
);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  task_id uuid not null,
  author_id uuid references "user"(id) on delete set null,
  body_md text not null check (char_length(body_md) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, task_id) references tasks (tenant_id, id) on delete cascade
);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  task_id uuid not null,
  actor_id uuid references "user"(id) on delete set null,
  actor_kind text not null check (actor_kind in ('user', 'agent')),
  client text check (client ~ '^[a-z0-9._-]{1,40}$'),
  kind text not null check (kind in ('created', 'title', 'description', 'status', 'priority', 'assignee',
                                     'labels', 'due_date', 'parent', 'project', 'comment')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, task_id) references tasks (tenant_id, id) on delete cascade
);

create table task_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  owner_id uuid not null references "user"(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  config jsonb not null,
  is_team_default boolean not null default false,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_team_default or acl @> array[tenant_id])
);

create unique index task_labels_name_idx on task_labels (tenant_id, lower(name));
create unique index task_views_team_default_idx on task_views (tenant_id) where is_team_default;
create index tasks_project_status_idx on tasks (tenant_id, project_id, status_id);
create index tasks_assignee_idx on tasks (tenant_id, assignee_id);
create index tasks_creator_idx on tasks (tenant_id, creator_id);
create index tasks_parent_idx on tasks (tenant_id, parent_id);
create index tasks_title_trgm_idx on tasks using gin (title gin_trgm_ops);
create index task_statuses_project_idx on task_statuses (tenant_id, project_id, position);
create index task_comments_task_idx on task_comments (tenant_id, task_id, created_at);
create index task_events_task_idx on task_events (tenant_id, task_id, created_at);
create index task_events_recent_idx on task_events (tenant_id, created_at desc);

-- RLS, tables à ACL : politique tenant_acl de 0003.
alter table task_projects enable row level security;
create policy tenant_acl on task_projects to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table tasks enable row level security;
create policy tenant_acl on tasks to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table task_labels enable row level security;
create policy tenant_acl on task_labels to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table task_views enable row level security;
create policy tenant_acl on task_views to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Vues : seul l'auteur crée et supprime (politiques restrictives, combinées en ET avec tenant_acl).
create policy owner_insert on task_views as restrictive for insert to leon_app
  with check (owner_id = any(app_principals()));
create policy owner_delete on task_views as restrictive for delete to leon_app
  using (owner_id = any(app_principals()));

-- RLS, tables sans ACL : visibles si leur parent l'est (la RLS du parent s'applique dans le exists).
alter table task_statuses enable row level security;
create policy tenant_parent on task_statuses to leon_app
  using (tenant_id = app_tenant()
         and exists (select 1 from task_projects p where p.id = task_statuses.project_id))
  with check (tenant_id = app_tenant()
              and exists (select 1 from task_projects p where p.id = task_statuses.project_id));

alter table task_label_links enable row level security;
create policy tenant_parent on task_label_links to leon_app
  using (tenant_id = app_tenant()
         and exists (select 1 from tasks t where t.id = task_label_links.task_id)
         and exists (select 1 from task_labels l where l.id = task_label_links.label_id))
  with check (tenant_id = app_tenant()
              and exists (select 1 from tasks t where t.id = task_label_links.task_id)
              and exists (select 1 from task_labels l where l.id = task_label_links.label_id));

alter table task_comments enable row level security;
create policy tenant_parent on task_comments to leon_app
  using (tenant_id = app_tenant()
         and exists (select 1 from tasks t where t.id = task_comments.task_id))
  with check (tenant_id = app_tenant()
              and exists (select 1 from tasks t where t.id = task_comments.task_id));

alter table task_events enable row level security;
create policy tenant_parent on task_events to leon_app
  using (tenant_id = app_tenant()
         and exists (select 1 from tasks t where t.id = task_events.task_id))
  with check (tenant_id = app_tenant()
              and exists (select 1 from tasks t where t.id = task_events.task_id));

-- À l'insertion, l'auteur est soi (politiques restrictives, combinées en ET avec celle de la table).
-- Jamais nul : seule la clé étrangère le met à nul (on delete set null).
create policy creator_insert on tasks as restrictive for insert to leon_app
  with check (creator_id = any(app_principals()));
create policy author_insert on task_comments as restrictive for insert to leon_app
  with check (author_id = any(app_principals()));
create policy actor_insert on task_events as restrictive for insert to leon_app
  with check (actor_id = any(app_principals()));

-- Le compteur part de zéro et n'avance que d'un pas (takeNumber) : posé à la création, remis à zéro
-- ou poussé au maximum, il bloquerait toute création.
create function task_projects_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.last_number <> 0 then
      raise exception 'compteur de numéros modifié' using errcode = '42501';
    end if;
  elsif new.last_number not in (old.last_number, old.last_number + 1) then
    raise exception 'compteur de numéros modifié' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger task_projects_guard before insert or update of last_number on task_projects
  for each row execute function task_projects_guard();

-- Numéro et ACL d'une tâche viennent de son projet, lu sous la RLS de l'appelant (security invoker).
-- À l'insertion et au changement de projet, le numéro doit égaler le compteur courant du projet :
-- createTask et le changement de projet le prennent toujours au compteur, juste avant. La base
-- n'exige pas qu'il ait été pris dans la même transaction (le numéro d'une dernière tâche supprimée
-- peut donc être réattribué) ; seul un bug de code pourrait en profiter. Sans changement de projet,
-- le numéro ne bouge plus.
create function tasks_guard() returns trigger language plpgsql as $$
declare
  project record;
begin
  if tg_op = 'UPDATE' and new.project_id = old.project_id then
    if new.number <> old.number then
      raise exception 'numéro de tâche modifié' using errcode = '42501';
    end if;
    return new;
  end if;
  select acl, last_number into project from task_projects where id = new.project_id;
  if not found then
    raise exception 'projet de la tâche invisible' using errcode = '42501';
  end if;
  if new.number <> project.last_number then
    raise exception 'numéro de tâche hors du compteur' using errcode = '42501';
  end if;
  new.acl := project.acl;
  return new;
end $$;
create trigger tasks_guard before insert or update of project_id, number on tasks
  for each row execute function tasks_guard();

-- Droits au plus juste : pas de suppression de projet, commentaires et journal en ajout seul,
-- mises à jour limitées aux colonnes modifiables (jamais tenant_id, acl, creator_id, origin) ;
-- last_number et number restent gardés par les déclencheurs ci-dessus.
grant select, insert on task_projects, task_statuses, tasks, task_labels, task_views,
  task_label_links, task_comments, task_events to leon_app;
grant update (key, name, last_number) on task_projects to leon_app;
grant update (label, color, category, position) on task_statuses to leon_app;
grant update (project_id, number, status_id, parent_id, title, description_md, priority, assignee_id,
  due_date, position, status_changed_at, completed_at, updated_at) on tasks to leon_app;
grant update (name, color) on task_labels to leon_app;
grant update (name, config, is_team_default, updated_at) on task_views to leon_app;
grant delete on task_statuses, tasks, task_labels, task_label_links, task_views to leon_app;
