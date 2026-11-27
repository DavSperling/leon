-- 0101-webhooks-trello.sql : Trello prévient Leon dès qu'une carte change, sur une connexion branchée par le bouton
-- (trello/webhooks.ts). L'alerte rend la connexion due tout de suite, et la relève habituelle lit le nouveau.

-- Un webhook par connexion et par tableau. `id` : l'identifiant que Trello lui a donné. `empreinte` : le sha256 du
-- jeton opaque de son adresse de rappel (…/api/trello/webhooks/<jeton>), jamais gardé en clair. Pas de suppression par
-- l'appli : une connexion supprimée emporte ses lignes (cascade), et Leon répond 410 à la première alerte de leurs
-- webhooks, que Trello retire alors.
create table webhooks_trello (
  id text primary key check (char_length(id) between 1 and 100),
  tenant_id uuid not null,
  connection_id uuid not null,
  tableau text not null check (char_length(tableau) between 1 and 100),
  empreinte bytea not null unique,
  created_at timestamptz not null default now(),
  unique (connection_id, tableau),
  foreign key (tenant_id, connection_id) references connections (tenant_id, id) on delete cascade
);

-- Les webhooks d'une connexion que l'on voit (la sécurité par ligne des connexions s'applique à la sous-requête).
alter table webhooks_trello enable row level security;
create policy tenant_connection on webhooks_trello to leon_app
  using (tenant_id = app_tenant() and exists (
    select 1 from connections c where c.tenant_id = webhooks_trello.tenant_id
      and c.id = webhooks_trello.connection_id))
  with check (tenant_id = app_tenant() and exists (
    select 1 from connections c where c.tenant_id = webhooks_trello.tenant_id
      and c.id = webhooks_trello.connection_id));
grant select, insert on webhooks_trello to leon_app;

-- La seule lecture hors RLS : une alerte reçue sans session, dont la signature de Trello a déjà été vérifiée. Rend la
-- connexion du jeton, pour que Leon réponde 410 à un jeton inconnu, et la rend due tout de suite si elle est active :
-- en pause, elle attend sa reprise, et en erreur, son prochain essai. Rend des identifiants seulement, comme
-- notifications_microsoft.
create function webhook_trello(empreinte_recue bytea) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  with connue as (
    select w.tenant_id, w.connection_id from webhooks_trello w where w.empreinte = empreinte_recue
  ), due as (
    update connections c set next_sync_at = now(), updated_at = now()
      from connue k
     where c.tenant_id = k.tenant_id and c.id = k.connection_id and c.status = 'active'
  )
  select k.connection_id from connue k
$$;
revoke all on function webhook_trello(bytea) from public;
grant execute on function webhook_trello(bytea) to leon_app;
