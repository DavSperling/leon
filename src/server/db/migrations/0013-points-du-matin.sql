-- 0013-points-du-matin.sql : le point du matin de chaque utilisateur sur chaque projet (T13, C9 du plan du deuxième
-- jet). C'est un cache, pas une fiche : il est refait quand de nouvelles données arrivent sur le projet (et chaque
-- matin pour les points lus dans la semaine), jamais traité comme une source, et revérifié à chaque lecture : une
-- source qu'il a reçue et que l'utilisateur ne voit plus le rend illisible. Privé à son utilisateur
-- (acl = [user_id]) : il est fait de ses sessions et de ce qui le mentionne.

create table briefings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  -- La clé du projet (D9) : la forme de sources.metadata.project, contrôlée à l'ingestion (C8).
  project text not null
    check (char_length(project) <= 200
      and project ~ '^(github\.com/[a-z0-9._-]+/[a-z0-9._-]+|dossier:[0-9a-f]{16})$'),
  markdown text not null check (char_length(markdown) between 1 and 20000),
  -- TOUTES les sources fournies au modèle, citées ou non : la lecture vérifie que l'utilisateur les voit encore.
  source_ids uuid[] not null default '{}',
  prepared_at timestamptz not null,
  last_read_at timestamptz,
  -- Vrai quand des données sont arrivées sur le projet depuis la préparation : un recalcul est en file.
  stale boolean not null default false,
  -- Privé à son utilisateur, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, user_id, project)
);

-- Qui a un point sur ce projet, dans une organisation (briefings_du_projet) ; les points lus récemment (le tic du
-- matin, briefings_a_rafraichir).
create index briefings_project_idx on briefings (tenant_id, project);
create index briefings_last_read_idx on briefings (last_read_at) where last_read_at is not null;

alter table briefings enable row level security;
create policy tenant_acl on briefings to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Aucune suppression : un point se refait en place (insert … on conflict do update) et ne change que par ces
-- colonnes ; il disparaît avec son utilisateur ou son organisation.
grant select, insert on briefings to leon_app;
grant update (markdown, source_ids, prepared_at, last_read_at, stale) on briefings to leon_app;

-- Lectures hors sécurité par ligne, pour signaler un projet et pour le tic du matin : des identifiants, jamais de
-- texte (comme connector_syncs_due, 0008, et runs_en_attente, 0011). Tout le reste se lit ensuite sous les droits
-- de chaque destinataire.

-- Les utilisateurs de l'organisation courante (app_tenant(), posée par withTenant) qui ont un point sur ce projet :
-- de nouvelles données sur le projet les concernent tous. Sans organisation courante : aucune ligne.
create function briefings_du_projet(p_project text)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select b.user_id
  from briefings b
  where b.tenant_id = app_tenant() and b.project = p_project
  order by b.user_id
$$;
revoke all on function briefings_du_projet(text) from public;
grant execute on function briefings_du_projet(text) to leon_app;

-- Les points lus depuis moins de p_days jours, toutes organisations : le tic du matin les refait. La clé du projet
-- est un identifiant (un dépôt ou le hachage d'un dossier), pas du texte capté.
create function briefings_a_rafraichir(p_days integer)
returns table (tenant_id uuid, user_id uuid, project text)
language sql stable security definer set search_path = public as $$
  select b.tenant_id, b.user_id, b.project
  from briefings b
  where b.last_read_at > now() - make_interval(days => p_days)
  order by b.tenant_id, b.user_id, b.project
$$;
revoke all on function briefings_a_rafraichir(integer) from public;
grant execute on function briefings_a_rafraichir(integer) to leon_app;
