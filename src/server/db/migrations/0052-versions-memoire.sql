-- 0052-versions-memoire.sql : les versions de la mémoire (D33, D34 et C12 du plan de la mémoire à disposition).
-- L'état d'un fil et une note s'écrivent v1, v2, v3, en ajout seul : aucune version n'est réécrite, et hors la
-- suppression du compte, aucune n'est effacée. Une version n'a ni tour, ni passage, ni vecteur : ni la recherche ni
-- fetch ne la voient, seule la lecture commune (src/server/memory/versions.ts) la lit. La cible est une source (un
-- fil ou une note) ; T55 ajoute les leçons (`lecon_id`).
create table versions_memoire (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  owner_user_id uuid not null references "user"(id) on delete cascade,
  source_id uuid not null,
  n integer not null check (n >= 1),
  -- Passé par maskSecrets à l'écriture.
  texte text not null check (char_length(texte) <= 4000),
  -- Les sources qui l'ont produite, sessions comprises : la lecture exige que le lecteur les voie toutes. Les tours ne
  -- servent qu'à la provenance, jamais à cette règle.
  entrees uuid[] not null default '{}',
  tours uuid[] not null default '{}',
  ecrit_par text not null check (ecrit_par in ('serveur', 'modele', 'agent', 'humain')),
  -- L'étape et le modèle pour un modèle, l'outil et la session pour l'agent.
  etape text,
  modele text,
  outil text,
  session text,
  motif text not null check (motif in ('rangement', 'note', 'correction', 'acceptation', 'restauration')),
  -- La version d'origine du texte restauré, jamais une restauration.
  restaure_de uuid references versions_memoire(id),
  cree_le timestamptz not null default now(),
  -- Privée à son auteur, quoi qu'écrive le code : l'accès ne peut être que [owner_user_id].
  acl uuid[] not null check (acl = array[owner_user_id]),
  -- Un état du modèle sans entrée échapperait à la règle de lecture.
  check (ecrit_par <> 'modele' or cardinality(entrees) > 0),
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade,
  unique (source_id, n)
);

alter table versions_memoire enable row level security;
create policy tenant_acl on versions_memoire to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Aucune mise à jour ; la suppression ne sert qu'à deleteAccount, comme pour about_suggestions (0045).
grant select, insert, delete on versions_memoire to leon_app;
