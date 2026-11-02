-- 0045-apropos-propose.sql : la proposition « About you » (onboarding, lot 5). Une par personne et par espace, écrite
-- par le travail de fond à partir de ses seules sources, montrée une fois en haut du Chat. closed_at : enregistrée ou
-- écartée. La fonction rend qui est prêt, sans rien lire des sources (security definer, identifiants seulement).
create table about_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  -- Les sources fournies au modèle, citées ou non.
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, user_id)
);

alter table about_suggestions enable row level security;
create policy tenant_acl on about_suggestions to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- La suppression ne sert qu'à deleteAccount ; seule la fermeture change une proposition écrite.
grant select, insert, delete on about_suggestions to leon_app;
grant update (closed_at) on about_suggestions to leon_app;

-- Qui est prêt pour une proposition, toutes organisations : des identifiants, jamais de texte (comme
-- briefings_a_rafraichir, 0030). Le texte se lit ensuite sous les droits de la personne. Elle doit :
-- - avoir validé l'étape 1 de l'onboarding, sans compte supprimé (0040) ni texte « À propos » ;
-- - n'avoir jamais eu de proposition dans cet espace ;
-- - avoir au moins p_min_sources sources à elle dans les outils p_kinds (le compte s'arrête à p_min_sources) ;
-- - avoir créé une connexion il y a plus de p_min_age, déjà relevée au moins une fois.
create function apropos_a_proposer(p_kinds text[], p_min_sources integer, p_min_age interval)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select m."organizationId", m."userId"
  from member m
  join "user" u on u.id = m."userId"
  where m."onboardedAt" is not null
    and u.deleted_at is null
    and coalesce(u.about, '') !~ '\S'
    and not exists (
      select 1 from about_suggestions a
      where a.tenant_id = m."organizationId" and a.user_id = m."userId")
    and (select count(*) from (
           select 1 from sources s
           where s.tenant_id = m."organizationId" and s.owner_user_id = m."userId" and s.kind = any(p_kinds)
           limit p_min_sources) x) = p_min_sources
    and exists (
      select 1 from connections c
      where c.tenant_id = m."organizationId" and c.created_by = m."userId"
        and c.created_at < now() - p_min_age and c.last_sync_at is not null)
  order by m."organizationId", m."userId"
$$;
revoke all on function apropos_a_proposer(text[], integer, interval) from public;
grant execute on function apropos_a_proposer(text[], integer, interval) to leon_app;
