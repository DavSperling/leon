-- L'outil MCP qui a rendu la lecture : `search` et `briefing` écrivent au journal des lectures comme `fetch`. Les
-- lignes déjà écrites viennent toutes de `fetch` ; ensuite chaque écriture nomme son outil (pas de défaut).
alter table read_log add column tool text not null default 'fetch'
  check (tool = any (array['fetch', 'search', 'briefing']));
alter table read_log alter column tool drop default;
