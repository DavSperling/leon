-- 0102-fathom-alertes.sql : Fathom prévient Leon dès qu'une réunion est prête (un webhook de Fathom par connexion, créé
-- avec la clé de la personne à sa première relève réussie, fathom/webhook.ts). Rien de ce que l'alerte porte n'est lu :
-- elle rend la connexion due tout de suite, et la relève habituelle lit la réunion.

-- Une alerte par connexion, à son adresse : Fathom ne dit pas à quelle clé une alerte appartient. `id` : l'identifiant
-- que Fathom lui a donné, rendu une seule fois (il n'en donne pas la liste), gardé pour la retirer avec la connexion ;
-- « en-creation » tant que sa réponse n'a pas été lue. `empreinte` : le sha256 du jeton de son adresse, jamais gardé en
-- clair. La ligne est posée avant la demande à Fathom, et seul un refus net de Fathom la retire : une alerte créée chez
-- lui a toujours la sienne. Une connexion supprimée emporte son alerte (cascade).
create table alertes_fathom (
  connection_id uuid primary key,
  tenant_id uuid not null,
  id text not null check (char_length(id) between 1 and 200),
  empreinte bytea not null unique,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, connection_id) references connections (tenant_id, id) on delete cascade
);

-- L'alerte d'une connexion que l'on voit (la sécurité par ligne des connexions s'applique à la sous-requête).
alter table alertes_fathom enable row level security;
create policy tenant_connection on alertes_fathom to leon_app
  using (tenant_id = app_tenant() and exists (
    select 1 from connections c where c.tenant_id = alertes_fathom.tenant_id
      and c.id = alertes_fathom.connection_id))
  with check (tenant_id = app_tenant() and exists (
    select 1 from connections c where c.tenant_id = alertes_fathom.tenant_id
      and c.id = alertes_fathom.connection_id));
grant select, insert, delete on alertes_fathom to leon_app;
grant update (id) on alertes_fathom to leon_app;

-- La seule lecture hors RLS : une alerte reçue sans session ni jeton d'API. Seule l'empreinte du jeton de son adresse
-- compte ; elle rend la connexion due tout de suite si elle est active : en pause, elle attend sa reprise, et en
-- erreur, son prochain essai. Rend des identifiants seulement, comme notifications_microsoft.
create function alerte_fathom(recue bytea) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  update connections c set next_sync_at = now(), updated_at = now()
    from alertes_fathom a
   where a.empreinte = recue and c.tenant_id = a.tenant_id and c.id = a.connection_id
     and c.status = 'active'
  returning c.id
$$;
revoke all on function alerte_fathom(bytea) from public;
grant execute on function alerte_fathom(bytea) to leon_app;
