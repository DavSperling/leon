-- 0047-depots-equipe.sql : les dépôts d'équipe (décision D, D14). L'administrateur coche dans les réglages les dépôts
-- GitHub que l'équipe partage ; seuls ceux-là restent relevés et visibles de l'équipe (lot 2). Toute l'équipe lit la
-- liste ; seuls les propriétaires et les administrateurs de l'organisation l'écrivent, contrôle fait en base.
create table depots_equipe (
  tenant_id uuid not null references organization(id) on delete cascade,
  -- La clé de projet d'une session (PROJECT_KEY_PATTERN, côté GitHub) : github.com/<propriétaire>/<dépôt>, en minuscules.
  project text not null check (project ~ '^github\.com/[a-z0-9._-]+/[a-z0-9._-]+$'),
  -- La liste est celle de l'équipe, quoi qu'écrive le code : une ligne privée échapperait aux autres administrateurs.
  acl uuid[] not null check (acl = array[tenant_id]),
  choisi_par uuid not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, project)
);

alter table depots_equipe enable row level security;
create policy tenant_acl on depots_equipe to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- Écrire demande en plus d'être propriétaire ou administrateur de l'organisation courante, avec le test de rôle de
-- connections.ts (Better Auth peut ranger plusieurs rôles séparés par des virgules). Les principals sont la personne
-- et l'organisation : seule la personne peut être un "userId". Pour update et delete, Postgres écarte sans erreur les
-- lignes refusées.
create policy admin_insert on depots_equipe as restrictive for insert to leon_app
  with check (exists (
    select 1 from member m
    where m."organizationId" = app_tenant() and m."userId" = any(app_principals())
      and string_to_array(m.role, ',') && array['owner', 'admin']));
create policy admin_update on depots_equipe as restrictive for update to leon_app
  using (exists (
    select 1 from member m
    where m."organizationId" = app_tenant() and m."userId" = any(app_principals())
      and string_to_array(m.role, ',') && array['owner', 'admin']));
create policy admin_delete on depots_equipe as restrictive for delete to leon_app
  using (exists (
    select 1 from member m
    where m."organizationId" = app_tenant() and m."userId" = any(app_principals())
      and string_to_array(m.role, ',') && array['owner', 'admin']));

-- Cocher, décocher ; une ligne réécrite ne change que de choisi_par.
grant select, insert, delete on depots_equipe to leon_app;
grant update (choisi_par) on depots_equipe to leon_app;

-- Les sources GitHub d'un dépôt (origin.repo, owner/repo tel que GitHub l'écrit). Sous RLS, seuls tenant_id et kind
-- servent de condition d'index : lower et -> ne sont pas leakproof, le dépôt devient un filtre ; la fonction
-- security definer de la rétro-privatisation (T12) s'en sert en entier.
-- shortcut: sous RLS le dépôt est filtré ligne à ligne parmi les sources GitHub de l'organisation, passer à une
-- colonne générée (lower du dépôt, comparée par texteq qui est leakproof) si la section d'équipe dépasse 100 ms.
create index sources_github_repo_idx on sources (tenant_id, lower(metadata->'origin'->>'repo'))
  where kind = 'github';
