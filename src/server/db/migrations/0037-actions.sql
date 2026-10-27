-- 0037-actions.sql : les actions que Leon propose dans une discussion et que l'utilisateur confirme d'un clic
-- (lot 7 de docs/specs/2026-10-26-github-acces-complet.md). Une ligne par action : ce que Leon propose, la
-- décision, puis la réponse de l'outil. C'est aussi le journal des écritures : privé à son auteur, jamais supprimé,
-- et seuls l'état, le résultat et l'heure de la décision changent. Il survit à la discussion et à la connexion.

create table actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  discussion_id uuid references discussions(id) on delete set null,
  -- La connexion de l'auteur qui exécutera l'action : jamais celle d'un autre membre.
  connection_id uuid references connections(id) on delete set null,
  -- Écrit avec any(array[…]) : une liste d'une seule valeur garde sa forme dans le catalogue (contrat de schéma).
  kind text not null check (kind = any (array['github.creer_branche'])),
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  status text not null default 'proposee'
    check (status in ('proposee', 'en-cours', 'faite', 'echouee', 'annulee')),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  -- Privée à son auteur, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  -- Heure d'écriture de la ligne, comme les messages : une action se place entre la question et la réponse.
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz
);
create index actions_discussion_idx on actions (tenant_id, discussion_id, created_at);

alter table actions enable row level security;
create policy tenant_acl on actions to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- Les clés étrangères se vérifient hors sécurité par ligne : sans cette règle, qui connaîtrait l'identifiant de la
-- discussion ou de la connexion d'un autre pourrait y rattacher une action. Une action n'entre que dans une
-- discussion de son auteur, avec une connexion qu'il a branchée lui-même.
create policy own_discussion_and_connection on actions as restrictive for insert to leon_app
  with check (
    (discussion_id is null or exists (
      select 1 from discussions d
      where d.id = actions.discussion_id and d.tenant_id = actions.tenant_id and d.user_id = actions.user_id))
    and (connection_id is null or exists (
      select 1 from connections c
      where c.id = actions.connection_id and c.tenant_id = actions.tenant_id
        and c.created_by = actions.user_id)));

grant select, insert on actions to leon_app;
grant update (status, result, decided_at) on actions to leon_app;
