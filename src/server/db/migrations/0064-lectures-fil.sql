-- 0064-lectures-fil.sql : le journal des lectures note celles des fils (`threads`, `thread`, T44) et des versions
-- (`versions`, T54) ; la route /chercher note `search`, comme l'outil MCP. `session` : la session de l'outil où la
-- lecture a eu lieu, quand le corps la donne (D27, D35). C'est l'identifiant de l'outil, pas un uuid : la source de
-- la session peut ne pas exister encore. Les lignes déjà écrites gardent null.
alter table read_log
  drop constraint read_log_tool_check,
  add constraint read_log_tool_check
    check (tool in ('fetch', 'search', 'briefing', 'threads', 'thread', 'versions')),
  add column session text constraint read_log_session_check check (char_length(session) between 1 and 200);

-- Les sources que l'auteur a lues pendant ses sessions (D35, décision d'Amos du 10/11) : l'état du fil écrit par le
-- modèle les ajoute à ses entrées (thread-state-worker.ts), pour que l'état se cache quand l'une devient invisible. Une
-- lecture compte si elle rend du texte (tous les outils du journal) et si elle est notée avec l'id externe d'une de ces
-- sessions, ou datée entre son premier et son dernier tour, à 10 minutes près : les horloges du poste (`turns.ts`) et du
-- serveur (`read_log.at`) diffèrent ; un jour plus tôt pour Cursor et Antigravity. Dans le doute, l'état se cache plus
-- souvent.
-- La fonction lit le journal sans sa sécurité par ligne : une source rendue privée avant que l'état s'écrive (0048) a
-- emporté l'accès de ses lectures, que l'auteur ne voit plus, et l'état ne doit pas la perdre. Elle ne rend que des ids
-- de sources, et seulement les lectures de la personne courante (app_user) dans l'organisation courante (app_tenant),
-- pendant ses propres sessions.
create function sources_lues_pendant(p_sessions uuid[]) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  -- shortcut: Cursor, et Antigravity sans created_at, datent tous les tours d'une capture à l'heure du fichier
  -- (cursor.ts:129, antigravity.ts:168). Le premier tour porte donc la fin du premier tour d'agent, ou celle d'un
  -- rattrapage. Un jour de marge couvre ce tour d'agent ; l'état se cache plus souvent. Si cette marge masque trop,
  -- dater le premier tour à l'heure du témoin de la conversation (temoins.ts, posé au premier message).
  with fenetres as materialized (
    select s.external_id,
           min(t.ts) - case when s.kind in ('cursor', 'antigravity') then interval '1 day'
                            else interval '10 minutes' end as debut,
           max(t.ts) + interval '10 minutes' as fin
      from sources s
      left join turns t on t.tenant_id = s.tenant_id and t.source_id = s.id
     where s.id = any(p_sessions) and s.tenant_id = app_tenant() and s.owner_user_id = app_user()
     group by s.id, s.external_id, s.kind
  )
  -- Deux branches indexables plutôt qu'un OR, qui parcourrait tout le journal du tenant sous le verrou du fil. Une
  -- session sans tour a une fenêtre nulle : aucune lecture par la date.
  select l.source_id from fenetres f
    join read_log l on l.tenant_id = app_tenant() and l.user_id = app_user() and l.at between f.debut and f.fin
  union
  select l.source_id from fenetres f
    join read_log l on l.tenant_id = app_tenant() and l.user_id = app_user() and l.session = f.external_id
$$;
revoke all on function sources_lues_pendant(uuid[]) from public;
grant execute on function sources_lues_pendant(uuid[]) to leon_app;

-- Les lectures d'un auteur par date, et par session quand elle est notée (rare : ni la CLI ni le MCP ne l'envoient).
create index read_log_user_at_idx on read_log (tenant_id, user_id, at);
create index read_log_session_idx on read_log (tenant_id, user_id, session) where session is not null;
