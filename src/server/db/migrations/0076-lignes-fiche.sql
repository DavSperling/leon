-- 0076-lignes-fiche.sql : la fiche d'une personne (sa façon de travailler et d'écrire), une ligne par fait. Construite
-- une fois d'après ses mails envoyés (portrait/fiche.ts), puis ajustée ligne à ligne : la personne corrige une ligne
-- ou la retire, et une reconstruction ne touche ni l'une ni l'autre. Privée à la personne (acl = [user_id], contrôlé
-- par la base), sans politique equipe_lit : ni son manager, ni un administrateur, ni un agent d'équipe ne la lisent.
-- Chaque ligne dit d'où elle vient, et un calcul dit sur combien de mails il repose.

create table lignes_fiche (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  -- La forme de `valeur` dépend du genre : portrait/lines.ts la valide à l'écriture et à la lecture.
  genre text not null check (genre = any (array[
    'interlocuteur', 'mots', 'appels', 'politesses', 'registre',
    'rythme', 'langues', 'delai-reponse', 'horaires', 'signature'])),
  -- Quand le genre a plusieurs lignes : l'adresse de l'interlocuteur, ou le type de destinataire d'un fait de style
  -- (« tous », « interne », « externe »). Vide sinon.
  cle text not null default '' check (char_length(cle) <= 320),
  valeur jsonb not null check (jsonb_typeof(valeur) = 'object' and char_length(valeur::text) <= 10000),
  -- Calculée sur ses mails, ou écrite par la personne. « synthese » (d'un modèle) et « apprise » (de ses corrections)
  -- sont prévues, rien ne les écrit encore.
  provenance text not null check (provenance = any (array['calcul', 'personne', 'synthese', 'apprise'])),
  -- Le nombre de mails sur lequel la ligne repose : un calcul le dit toujours.
  mails integer check (mails >= 0),
  check (provenance <> 'calcul' or mails is not null),
  corrigee_le timestamptz,
  -- Retirée par la personne : la ligne reste, pour qu'une reconstruction ne la fasse pas revenir.
  retiree_le timestamptz,
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, user_id, genre, cle)
);

alter table lignes_fiche enable row level security;
create policy tenant_acl on lignes_fiche to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- La suppression ne sert qu'à deleteAccount ; seuls la valeur, sa provenance et l'état d'une ligne changent.
grant select, insert, delete on lignes_fiche to leon_app;
grant update (valeur, provenance, mails, corrigee_le, retiree_le) on lignes_fiche to leon_app;
