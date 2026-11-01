-- 0043-passations.sql : les notes de passation entre agents (spec du 01/11/2026). La note elle-même est une source
-- de type `passation`, visible par toute l'organisation, indexée comme le reste. Ses lignes `[type]` et `[[liens]]`
-- sont rangées ici, lues sans modèle. Les deux tables portent l'ACL de la note : même sécurité par ligne que 0011.

-- Les numéros courts (D12, E7…) : une seule séquence pour tout le serveur, donc uniques par organisation sans verrou.
create sequence passation_numero_seq;

create table passation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  source_id uuid not null,
  numero text not null check (numero ~ '^[DEPCQ][1-9][0-9]{0,11}$'),
  type text not null check (type in ('decision', 'essai_rate', 'prochaine_etape', 'en_cours', 'question')),
  texte text not null check (char_length(texte) between 1 and 2000),
  project text not null check (char_length(project) between 1 and 200),
  branch text check (branch is null or char_length(branch) between 1 and 200),
  author_user_id uuid not null references "user"(id) on delete cascade,
  remplacee_par uuid,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, numero),
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade,
  -- Retirer la note qui remplaçait un élément le rend de nouveau valable (seule la colonne est remise à nul).
  foreign key (tenant_id, remplacee_par) references passation_items (tenant_id, id) on delete set null (remplacee_par)
);

create table passation_liens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  source_id uuid not null,
  item_id uuid,
  relation text not null check (char_length(relation) between 1 and 60),
  cible text not null check (char_length(cible) between 1 and 200),
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id) references passation_items (tenant_id, id) on delete cascade
);

create index passation_items_project_idx on passation_items (tenant_id, project, type, created_at desc);
create index passation_items_source_idx on passation_items (tenant_id, source_id);
create index passation_liens_source_idx on passation_liens (tenant_id, source_id);
create index sources_passation_idx on sources (tenant_id, (metadata ->> 'project'), created_at desc)
  where kind = 'passation';

alter table passation_items enable row level security;
create policy tenant_acl on passation_items to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table passation_liens enable row level security;
create policy tenant_acl on passation_liens to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Pas de delete direct : une note se retire par supprimer_passation, ses lignes partent en cascade.
grant select, insert on passation_items, passation_liens to leon_app;
grant update (remplacee_par) on passation_items to leon_app;
grant usage on sequence passation_numero_seq to leon_app;

-- Retirer une note : son auteur ; un propriétaire ou un administrateur actif seulement si l'auteur a supprimé son
-- compte (même règle que supprimer_document, 0042).
create function supprimer_passation(p_source uuid)
returns boolean
language sql volatile security definer set search_path = public as $$
  with gone as (
    delete from sources s
    where s.id = p_source and s.kind = 'passation'
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
revoke all on function supprimer_passation(uuid) from public;
grant execute on function supprimer_passation(uuid) to leon_app;
