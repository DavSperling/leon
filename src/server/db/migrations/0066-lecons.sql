-- 0066-lecons.sql : les leçons (D37 et C13 du plan de la mémoire à disposition, T55). Une leçon est un texte court,
-- relu et accepté par un humain, privé à son auteur, avec un dépôt facultatif. Son texte et ses preuves sont ceux de
-- sa dernière version (versions_memoire, C12), qui gagne la leçon comme cible. Le journal des lectures note aussi une
-- leçon lue (`lessons`, décision d'Amos du 11/11 pour le lot 13). Seules les actions du site écrivent une leçon.
create table lecons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  owner_user_id uuid not null references "user"(id) on delete cascade,
  -- La clé de projet (ProjectSchema, vérifiée par lessons.ts) ; nulle : tous les dépôts de l'auteur.
  projet text check (char_length(projet) between 1 and 200),
  -- Écrite à la main sur le site, ou proposée par une règle du rêve (lot 15) puis acceptée.
  origine text not null check (origine in ('humain', 'regle')),
  -- Les sessions touchées, calculées par le serveur ; 0 pour une leçon écrite à la main.
  frequence integer not null default 0 check (frequence >= 0),
  acceptee_le timestamptz not null default now(),
  retiree_le timestamptz,
  -- Privée à son auteur, quoi qu'écrive le code : l'accès ne peut être que [owner_user_id].
  acl uuid[] not null check (acl = array[owner_user_id]),
  unique (tenant_id, id)
);
create index lecons_owner_idx on lecons (tenant_id, owner_user_id) where retiree_le is null;

alter table lecons enable row level security;
create policy tenant_acl on lecons to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- La suppression ne sert qu'à deleteAccount ; seuls l'acceptation, le retrait et la fréquence changent une leçon.
grant select, insert, delete on lecons to leon_app;
grant update (acceptee_le, retiree_le, frequence) on lecons to leon_app;

-- Une version vise un fil ou une note (source_id), ou une leçon (lecon_id) : exactement l'une des deux. Les clés de
-- 0052 sur source_id ne jouent pas quand il est nul ; leurs jumelles par lecon_id font le même travail.
alter table versions_memoire
  alter column source_id drop not null,
  add column lecon_id uuid,
  add constraint versions_memoire_cible_check check (num_nonnulls(source_id, lecon_id) = 1),
  add constraint versions_memoire_lecon_fkey foreign key (tenant_id, lecon_id)
    references lecons (tenant_id, id) on delete cascade,
  add constraint versions_memoire_lecon_id_n_key unique (lecon_id, n),
  -- Une restauration ne pointe que dans sa leçon et son organisation : la règle de lecture suit l'origine.
  add constraint versions_memoire_tenant_id_lecon_id_id_key unique (tenant_id, lecon_id, id),
  add constraint versions_memoire_lecon_restaure_de_fkey foreign key (tenant_id, lecon_id, restaure_de)
    references versions_memoire (tenant_id, lecon_id, id);

-- Une lecture vise une source (source_id) ou une leçon (lecon_id), exactement l'une des deux.
alter table read_log
  alter column source_id drop not null,
  add column lecon_id uuid,
  add constraint read_log_cible_check check (num_nonnulls(source_id, lecon_id) = 1),
  add constraint read_log_lecon_fkey foreign key (tenant_id, lecon_id)
    references lecons (tenant_id, id) on delete cascade,
  drop constraint read_log_tool_check,
  add constraint read_log_tool_check
    check (tool in ('fetch', 'search', 'briefing', 'threads', 'thread', 'versions', 'lessons'));
create index read_log_lecon_idx on read_log (tenant_id, lecon_id) where lecon_id is not null;

-- sources_lues_pendant (0064), à l'identique, sauf qu'elle ne rend que des sources : une lecture de leçon a un
-- source_id nul, qui entrerait dans les entrées de l'état d'un fil et le rendrait illisible (D33).
create or replace function sources_lues_pendant(p_sessions uuid[]) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  -- shortcut: Cursor, et Antigravity sans created_at, datent tous les tours d'une capture à l'heure du fichier
  -- (cursor.ts:129, antigravity.ts:168). Le premier tour porte donc la fin du premier tour d'agent, ou celle d'un
  -- rattrapage. Un jour de marge couvre ce tour d'agent ; l'état se cache plus souvent. Si cette marge masque trop,
  -- dater le premier tour à l'heure du témoin de la conversation (temoins.ts, posé au premier message).
  with fenetres as materialized (
    select s.external_id,
           min(t.ts) - case when s.kind in ('cursor', 'antigravity') then interval '1 day'
                            else interval '10 minutes' end as debut,
           max(t.ts) + interval '10 minutes' as fin
      from sources s
      left join turns t on t.tenant_id = s.tenant_id and t.source_id = s.id
     where s.id = any(p_sessions) and s.tenant_id = app_tenant() and s.owner_user_id = app_user()
     group by s.id, s.external_id, s.kind
  )
  -- Deux branches indexables plutôt qu'un OR, qui parcourrait tout le journal du tenant sous le verrou du fil. Une
  -- session sans tour a une fenêtre nulle : aucune lecture par la date.
  select l.source_id from fenetres f
    join read_log l on l.tenant_id = app_tenant() and l.user_id = app_user() and l.at between f.debut and f.fin
   where l.source_id is not null
  union
  select l.source_id from fenetres f
    join read_log l on l.tenant_id = app_tenant() and l.user_id = app_user() and l.session = f.external_id
   where l.source_id is not null
$$;
