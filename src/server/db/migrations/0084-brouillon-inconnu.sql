-- 0084-brouillon-inconnu.sql : le mail d'un inconnu (quelqu'un à qui elle n'a pas écrit depuis 90 jours) ne part pas
-- au modèle comme les autres : l'accueil lui demande d'abord si elle veut une réponse, et le modèle ne lit ce mail
-- qu'après son « oui » (portrait/brouillons.ts). Sa réponse se garde sur la ligne du brouillon, privée comme elle
-- (0080) : la même politique, le même contrôle de l'accès, supprimée avec le compte et avec le fil.
-- « Non » : une ligne sans texte, sans question ni indications, l'état d'un mail sans réponse à donner (0080) : close.
-- « Oui » : une ligne avec ses indications, sans texte ni question : le passage suivant fera le premier appel.
alter table brouillons
  -- Ses indications : ce qu'elle veut répondre, vide quand elle n'en donne pas, de 1 000 caractères au plus comme une
  -- réponse (0082). Nul : pas de « oui » au mail d'un inconnu.
  add column indications text check (char_length(indications) <= 1000);

-- Aucun droit de mise à jour de plus : son oui et ses indications s'écrivent avec la ligne (insert, 0080), et l'app ne
-- change toujours ni `texte`, ni `questions`, ni `choix`. Le premier appel pose son résultat sur la ligne de son oui par
-- cette fonction seulement, une seule fois : sur une ligne de la personne courante, dans son organisation, qui a ses
-- indications, ni texte ni question, et qu'elle n'a pas écartée. Rend faux sinon. Le modèle juge qu'aucune réponse n'est
-- attendue : la ligne prend l'état d'un mail sans réponse à donner, et ses indications s'en vont. Le texte d'un
-- brouillon ne se pose donc toujours qu'une fois : ici, ou par ecrire_brouillon (0082) après ses réponses aux questions.
create function ecrire_inconnu(p_id uuid, p_texte text, p_questions text[], p_choix jsonb)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with ecrit as (
    update brouillons
    set texte = p_texte, questions = p_questions, choix = p_choix,
        indications = case when p_texte is null and p_questions is null then null else indications end
    where id = p_id and tenant_id = app_tenant() and user_id = app_user()
      and indications is not null and texte is null and questions is null and ecarte_le is null
    returning 1
  )
  select exists (select 1 from ecrit)
$$;
revoke all on function ecrire_inconnu(uuid, text, text[], jsonb) from public;
grant execute on function ecrire_inconnu(uuid, text, text[], jsonb) to leon_app;
