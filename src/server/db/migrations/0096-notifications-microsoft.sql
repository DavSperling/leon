-- 0096-notifications-microsoft.sql : Microsoft prévient Leon dès qu'un mail arrive, qu'elle en envoie un ou que son
-- agenda change (abonnements de Microsoft Graph, microsoft-notifications.ts). Une notification ne porte rien du
-- contenu : elle rend la connexion due tout de suite, et la relève habituelle lit le nouveau.

-- Un abonnement par connexion et par ressource suivie. `id` : l'identifiant que Microsoft lui a donné. `empreinte` :
-- le sha256 du clientState, le secret que Microsoft renvoie avec chaque notification, jamais gardé en clair.
-- `prochain_renouvellement` : quand le prolonger, avant que le jeton d'accès que Microsoft garde avec lui n'expire.
-- Pas de suppression par l'appli : une connexion supprimée emporte ses abonnements (cascade).
create table abonnements_microsoft (
  id text primary key check (char_length(id) between 1 and 200),
  tenant_id uuid not null,
  connection_id uuid not null,
  ressource text not null check (char_length(ressource) between 1 and 400),
  empreinte bytea not null,
  prochain_renouvellement timestamptz not null,
  created_at timestamptz not null default now(),
  unique (connection_id, ressource),
  foreign key (tenant_id, connection_id) references connections (tenant_id, id) on delete cascade
);

-- Les abonnements d'une connexion que l'on voit (la sécurité par ligne des connexions s'applique à la sous-requête).
alter table abonnements_microsoft enable row level security;
create policy tenant_connection on abonnements_microsoft to leon_app
  using (tenant_id = app_tenant() and exists (
    select 1 from connections c where c.tenant_id = abonnements_microsoft.tenant_id
      and c.id = abonnements_microsoft.connection_id))
  with check (tenant_id = app_tenant() and exists (
    select 1 from connections c where c.tenant_id = abonnements_microsoft.tenant_id
      and c.id = abonnements_microsoft.connection_id));
grant select, insert, update on abonnements_microsoft to leon_app;

-- La seule lecture hors RLS : un lot de notifications reçu sans session ni jeton. Une notification ne vaut que si son
-- clientState est celui de l'abonnement ; elle rend alors la connexion due tout de suite si elle est active : en
-- pause, elle attend sa reprise, et en erreur, son prochain essai (chaque mail ne relance pas une relève qui échoue).
-- Une notification du cycle de vie (jeton bientôt expiré, abonnement retiré, notifications perdues) fait aussi
-- renouveler l'abonnement au passage qui suit. Rend des identifiants seulement, comme connector_syncs_due.
create function notifications_microsoft(lot jsonb) returns table (connection_id uuid)
language sql volatile security definer set search_path = public, pg_temp as $$
  with recues as (
    select r.abonnement, r.etat, bool_or(coalesce(r.cycle, false)) as cycle
      from jsonb_to_recordset(lot) as r(abonnement text, etat text, cycle boolean)
     group by r.abonnement, r.etat
  ), valides as (
    update abonnements_microsoft a
       set prochain_renouvellement = case when r.cycle then now() else a.prochain_renouvellement end
      from recues r
     where a.id = r.abonnement and a.empreinte = sha256(convert_to(r.etat, 'UTF8'))
    returning a.tenant_id, a.connection_id
  )
  update connections c set next_sync_at = now(), updated_at = now()
    from (select distinct tenant_id, connection_id from valides) v
   where c.tenant_id = v.tenant_id and c.id = v.connection_id and c.status = 'active'
  returning c.id
$$;
revoke all on function notifications_microsoft(jsonb) from public;
grant execute on function notifications_microsoft(jsonb) to leon_app;
