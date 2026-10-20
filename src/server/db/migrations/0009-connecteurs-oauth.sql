-- 0009-connecteurs-oauth.sql : les quatre nouveaux outils (Basecamp, Miro, Productboard, Outlook) entrent dans
-- les listes de types des connexions, des sources et des faits. Aucune table : les jetons OAuth vivent dans le
-- bloc secret chiffré de la connexion, comme une clé.

alter table connections drop constraint connections_provider_check;
alter table connections add constraint connections_provider_check check (provider in ('github', 'notion', 'linear', 'granola', 'fathom', 'fireflies', 'tldv', 'circleback', 'claap', 'leexi', 'gong', 'jira', 'confluence', 'gitlab', 'asana', 'clickup', 'trello', 'monday', 'shortcut', 'plane', 'airtable', 'sentry', 'hubspot', 'attio', 'folk', 'pipedrive', 'close', 'intercom', 'zendesk', 'freshdesk', 'helpscout', 'front', 'plain', 'crisp', 'missive', 'basecamp', 'miro', 'productboard', 'outlook'));

alter table sources drop constraint sources_kind_check;
alter table sources add constraint sources_kind_check check (kind in ('claude_code', 'claude_ai', 'chatgpt', 'mcp_remember', 'github', 'notion', 'linear', 'granola', 'fathom', 'fireflies', 'tldv', 'circleback', 'claap', 'leexi', 'gong', 'jira', 'confluence', 'gitlab', 'asana', 'clickup', 'trello', 'monday', 'shortcut', 'plane', 'airtable', 'sentry', 'hubspot', 'attio', 'folk', 'pipedrive', 'close', 'intercom', 'zendesk', 'freshdesk', 'helpscout', 'front', 'plain', 'crisp', 'missive', 'basecamp', 'miro', 'productboard', 'outlook'));

alter table facts drop constraint facts_source_kind_check;
alter table facts add constraint facts_source_kind_check check (source_kind in ('claude_code', 'claude_ai', 'chatgpt', 'mcp_remember', 'github', 'notion', 'linear', 'granola', 'fathom', 'fireflies', 'tldv', 'circleback', 'claap', 'leexi', 'gong', 'jira', 'confluence', 'gitlab', 'asana', 'clickup', 'trello', 'monday', 'shortcut', 'plane', 'airtable', 'sentry', 'hubspot', 'attio', 'folk', 'pipedrive', 'close', 'intercom', 'zendesk', 'freshdesk', 'helpscout', 'front', 'plain', 'crisp', 'missive', 'basecamp', 'miro', 'productboard', 'outlook'));
