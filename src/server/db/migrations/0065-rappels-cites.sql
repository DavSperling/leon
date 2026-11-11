-- 0065-rappels-cites.sql : les fils déjà cités par le rappel (D26 et C8 du plan de la mémoire à disposition, T48).
-- Une ligne dit qu'un fil a été rappelé dans une session de l'outil : la route ne le cite plus dans cette session. Le
-- message n'y est jamais. La clé primaire fait que deux messages en même temps ne citent pas deux fois le même fil :
-- seuls les fils réellement insérés sont cités. Une ligne part après 24 h, par purger_rappels_cites(), que le tic
-- `requeue` du worker de la recherche lance une fois par heure ; ou avec son fil (supprimer_fil, suppression du compte).
create table rappels_cites (
  tenant_id uuid not null references organization(id) on delete cascade,
  owner_user_id uuid not null references "user"(id) on delete cascade,
  -- L'id de session de l'outil, tel que la CLI le déclare (C8), pas un uuid.
  session text not null check (char_length(session) between 1 and 200),
  fil_id uuid not null,
  cree_le timestamptz not null default now(),
  -- Privée à son auteur, quoi qu'écrive le code.
  acl uuid[] not null check (acl = array[owner_user_id]),
  primary key (tenant_id, owner_user_id, session, fil_id),
  foreign key (tenant_id, fil_id) references sources (tenant_id, id) on delete cascade
);
create index rappels_cites_cree_le_idx on rappels_cites (cree_le);

alter table rappels_cites enable row level security;
create policy tenant_acl on rappels_cites to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Ni mise à jour ni suppression : seule la purge, ou la cascade, retire une ligne.
grant select, insert on rappels_cites to leon_app;

-- La purge, sur toutes les organisations : des lignes de plus de 24 h. Rend le nombre de lignes parties.
create function purger_rappels_cites()
returns integer
language sql volatile security definer set search_path = public, pg_temp as $$
  with gone as (
    delete from rappels_cites where cree_le < now() - interval '24 hours' returning 1
  )
  select count(*)::int from gone
$$;
revoke all on function purger_rappels_cites() from public;
grant execute on function purger_rappels_cites() to leon_app;
