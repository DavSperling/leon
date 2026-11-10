-- 0064-lectures-fil.sql : le journal des lectures note celles des fils (`threads`, `thread`, T44) et des versions
-- (`versions`, T54) ; la route /chercher note `search`, comme l'outil MCP. `session` : la session de l'outil où la
-- lecture a eu lieu, quand le corps la donne (D27, D35). C'est l'identifiant de l'outil, pas un uuid : la source de
-- la session peut ne pas exister encore. Les lignes déjà écrites gardent null.
alter table read_log
  drop constraint read_log_tool_check,
  add constraint read_log_tool_check
    check (tool in ('fetch', 'search', 'briefing', 'threads', 'thread', 'versions')),
  add column session text constraint read_log_session_check check (char_length(session) between 1 and 200);
