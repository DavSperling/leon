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
-- serveur (`read_log.at`) diffèrent. Dans le doute, l'état se cache plus souvent.
-- La fonction lit le journal sans sa sécurité par ligne : une source rendue privée avant que l'état s'écrive (0048) a
-- emporté l'accès de ses lectures, que l'auteur ne voit plus, et l'état ne doit pas la perdre. Elle ne rend que des ids
-- de sources, et seulement les lectures de la personne courante (app_user) dans l'organisation courante (app_tenant),
-- pendant ses propres sessions.
create function sources_lues_pendant(p_sessions uuid[]) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  with fenetres as (
    select s.external_id,
           min(t.ts) - interval '10 minutes' as debut,
           max(t.ts) + interval '10 minutes' as fin
      from sources s
      left join turns t on t.tenant_id = s.tenant_id and t.source_id = s.id
     where s.id = any(p_sessions) and s.tenant_id = app_tenant() and s.owner_user_id = app_user()
     group by s.id, s.external_id
  )
  select distinct l.source_id
    from read_log l
   where l.tenant_id = app_tenant() and l.user_id = app_user()
     and exists (
       select 1 from fenetres f
        where l.session = f.external_id or l.at between f.debut and f.fin)
$$;
revoke all on function sources_lues_pendant(uuid[]) from public;
grant execute on function sources_lues_pendant(uuid[]) to leon_app;
