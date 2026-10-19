-- 0012-discussions.sql : les discussions avec Leon (T11). Une discussion et ses messages sont privés à leur
-- auteur (acl = [user_id]) : ni l'équipe ni un administrateur ne les lisent. L'agent n'a pas d'autre mémoire
-- que cet historique : il repart toujours de la mémoire commune, sous les droits de l'auteur.

create table discussions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  -- Privée à son auteur, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table discussion_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  discussion_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 100000),
  -- Les renvois [n] de la réponse : { n, sourceId, passageId, title, url } (C9 du plan du deuxième jet). Sur la
  -- question qui ouvre une discussion depuis la barre, les résultats d'où elle part.
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array'),
  acl uuid[] not null,
  -- L'heure de l'écriture de la ligne, pas celle du début de la transaction : deux messages écrits ensemble
  -- gardent leur ordre.
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, discussion_id) references discussions (tenant_id, id) on delete cascade
);

-- La liste des discussions d'un utilisateur, la plus récente d'abord ; les messages d'une discussion dans l'ordre.
create index discussions_user_idx on discussions (tenant_id, user_id, updated_at desc);
create index discussion_messages_discussion_idx
  on discussion_messages (tenant_id, discussion_id, created_at);

alter table discussions enable row level security;
create policy tenant_acl on discussions to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

alter table discussion_messages enable row level security;
create policy tenant_acl on discussion_messages to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- La clé étrangère se vérifie hors sécurité par ligne : sans cette règle, qui connaîtrait l'identifiant de la
-- discussion d'un autre pourrait y écrire. Un message n'entre que dans une discussion que l'auteur voit, avec
-- l'accès de cette discussion (donc privé à son auteur).
create policy same_acl_as_discussion on discussion_messages as restrictive for insert to leon_app
  with check (exists (
    select 1 from discussions d
    where d.tenant_id = discussion_messages.tenant_id
      and d.id = discussion_messages.discussion_id
      and d.acl = discussion_messages.acl));

-- Aucune suppression ni réécriture : on ajoute des messages, et la discussion ne change que de date.
grant select, insert on discussions, discussion_messages to leon_app;
grant update (updated_at) on discussions to leon_app;
