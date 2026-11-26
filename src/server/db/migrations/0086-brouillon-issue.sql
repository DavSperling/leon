-- 0086-brouillon-issue.sql : ce qu'elle a fait d'un brouillon de Leon, vu sur la réponse qu'elle a vraiment envoyée
-- dans le même fil (portrait/preferences.ts) : envoyé tel quel, retouché ou réécrit. La comparaison se fait dans le
-- code, sans modèle (portrait/retouche.ts) ; seule son issue se garde, sur la ligne du brouillon, privée comme elle
-- (0080) : la même politique, le même contrôle de l'accès, supprimée avec le compte et avec le fil. Rien de sa réponse
-- ne se garde ici : son texte reste dans son fil.
alter table brouillons
  -- Nul : pas encore de réponse d'elle, ou une retouche dont Leon n'a pas encore tiré la leçon (une préférence
  -- proposée, ou rien à retenir).
  add column issue text check (issue in ('tel-quel', 'retouche', 'reecrit')),
  -- Seul un brouillon écrit a une issue.
  add check (issue is null or texte is not null);

-- L'app n'a aucun droit de modifier `issue` : elle ne la pose que par cette fonction, une seule fois, sur une ligne de
-- la personne courante, dans son organisation, qui a son texte, qu'elle n'a pas écartée et qui n'a pas encore
-- d'issue. Rend faux sinon. L'issue ne change plus ensuite.
create function poser_issue(p_id uuid, p_issue text) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with posee as (
    update brouillons set issue = p_issue
    where id = p_id and tenant_id = app_tenant() and user_id = app_user()
      and texte is not null and ecarte_le is null and issue is null and p_issue is not null
    returning 1
  )
  select exists (select 1 from posee)
$$;
revoke all on function poser_issue(uuid, text) from public;
grant execute on function poser_issue(uuid, text) to leon_app;
