-- 0008-connecteurs.sql : les connexions aux outils de l'équipe, et les sources qu'elles apportent.

create table connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  created_by uuid not null references "user"(id) on delete cascade,
  provider text not null check (provider in ('github', 'notion', 'linear', 'granola', 'fathom', 'fireflies', 'tldv', 'circleback', 'claap', 'leexi', 'gong', 'jira', 'confluence', 'gitlab', 'asana', 'clickup', 'trello', 'monday', 'shortcut', 'plane', 'airtable', 'sentry', 'hubspot', 'attio', 'folk', 'pipedrive', 'close', 'intercom', 'zendesk', 'freshdesk', 'helpscout', 'front', 'plain', 'crisp', 'missive')),
  label text not null check (char_length(label) between 1 and 120),
  config jsonb not null default '{}'::jsonb,
  secret text not null check (secret like 'v1:%'),
  secret_hint text not null check (char_length(secret_hint) <= 4),
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  cursor text,
  since timestamptz not null,
  next_sync_at timestamptz,
  sync_lock_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  items_synced integer not null default 0,
  acl uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index connections_due_idx on connections (next_sync_at) where status in ('active', 'error');

alter table connections enable row level security;
create policy tenant_acl on connections to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
grant select, insert, update, delete on connections to leon_app;

alter table sources drop constraint sources_kind_check;
alter table sources add constraint sources_kind_check check (kind in ('claude_code', 'claude_ai', 'chatgpt', 'mcp_remember', 'github', 'notion', 'linear', 'granola', 'fathom', 'fireflies', 'tldv', 'circleback', 'claap', 'leexi', 'gong', 'jira', 'confluence', 'gitlab', 'asana', 'clickup', 'trello', 'monday', 'shortcut', 'plane', 'airtable', 'sentry', 'hubspot', 'attio', 'folk', 'pipedrive', 'close', 'intercom', 'zendesk', 'freshdesk', 'helpscout', 'front', 'plain', 'crisp', 'missive'));
alter table sources add column connection_id uuid;
alter table sources add constraint sources_connection_fk foreign key (tenant_id, connection_id)
  references connections (tenant_id, id) on delete set null (connection_id);

alter table turns drop constraint turns_role_check;
alter table turns add constraint turns_role_check check (role in ('user', 'assistant', 'document', 'participant'));
alter table turns drop constraint turns_capture_mode_check;
alter table turns add constraint turns_capture_mode_check
  check (capture_mode in ('file', 'network', 'dom', 'manual', 'connector'));
alter table turns add column author_name text check (char_length(author_name) <= 200);
alter table turns add column author_email text check (char_length(author_email) <= 320);

alter table facts drop constraint facts_source_kind_check;
alter table facts add constraint facts_source_kind_check check (source_kind in ('claude_code', 'claude_ai', 'chatgpt', 'mcp_remember', 'github', 'notion', 'linear', 'granola', 'fathom', 'fireflies', 'tldv', 'circleback', 'claap', 'leexi', 'gong', 'jira', 'confluence', 'gitlab', 'asana', 'clickup', 'trello', 'monday', 'shortcut', 'plane', 'airtable', 'sentry', 'hubspot', 'attio', 'folk', 'pipedrive', 'close', 'intercom', 'zendesk', 'freshdesk', 'helpscout', 'front', 'plain', 'crisp', 'missive'));

-- Seule lecture hors RLS du jet : des identifiants, jamais de contenu ni de secret (décision D5).
create function connector_syncs_due() returns table (connection_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select id, tenant_id, created_by from connections
  where status in ('active', 'error') and next_sync_at <= now()
    and (sync_lock_at is null or sync_lock_at < now() - interval '30 minutes')
  order by next_sync_at
  limit 100
$$;
revoke all on function connector_syncs_due() from public;
grant execute on function connector_syncs_due() to leon_app;
