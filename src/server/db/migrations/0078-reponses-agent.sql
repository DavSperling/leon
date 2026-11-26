-- 0078-reponses-agent.sql : la réponse d'une personne, oui ou non, à chaque agent de départ que Leon lui propose
-- (portrait/agents.ts, portrait/propositions.ts). La proposition ne s'enregistre pas : elle se calcule à chaque lecture.
-- Seule sa réponse se garde, une ligne par agent, et elle peut en changer. Aucun agent ne tourne encore.
-- Comme sa fiche (0076) : privée à la personne (acl = [user_id], contrôlé par la base), sans politique equipe_lit : ni
-- son manager, ni un administrateur, ni un agent d'équipe ne la lisent.

create table reponses_agent (
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  -- L'identifiant de l'agent dans le catalogue (portrait/agents.ts). La liste est courte et fermée : la base la
  -- contrôle aussi, comme le genre d'une ligne de fiche. Un agent de plus demande une migration, comme 0077.
  agent text not null check (agent = any (array[
    'suite-reunion', 'brouillon-reponse', 'brief-rendez-vous', 'relance', 'point-du-jour'])),
  oui boolean not null,
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  primary key (tenant_id, user_id, agent)
);

alter table reponses_agent enable row level security;
create policy tenant_acl on reponses_agent to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Refaite en place quand elle change d'avis (insert … on conflict do update) ; la suppression ne sert qu'à
-- deleteAccount.
grant select, insert, delete on reponses_agent to leon_app;
grant update (oui) on reponses_agent to leon_app;
