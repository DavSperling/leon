-- 0082-brouillon-questions.sql : quand une information ou une décision manque pour répondre, Leon ne laisse plus de
-- blanc dans le brouillon : il pose ses questions à la personne, puis écrit le mail en entier avec ses réponses
-- (portrait/brouillons.ts). Les questions et ses réponses se gardent sur la ligne du brouillon, privées comme elle
-- (0080) : la même politique, le même contrôle de l'accès, supprimées avec le compte et avec le fil.
-- Les états d'une ligne : un texte (le brouillon est prêt) ; ni texte ni questions (aucune réponse n'était attendue) ;
-- des questions sans réponses (Leon attend la personne) ; des questions et des réponses sans texte (le brouillon reste
-- à écrire).
alter table brouillons
  -- Les questions de Leon, une à trois, de 300 caractères chacune au plus (portrait/brouillon-prompt.ts). Nul : il
  -- n'en a pas posé.
  add column questions text[]
    check (cardinality(questions) between 1 and 3 and char_length(array_to_string(questions, '')) <= 900),
  -- Ses réponses, une par question, dans le même ordre, de 1 000 caractères chacune au plus ; une réponse peut être
  -- vide. Nul : elle n'a pas répondu.
  add column reponses text[] check (char_length(array_to_string(reponses, '')) <= 3000),
  add check (reponses is null or (questions is not null and cardinality(reponses) = cardinality(questions))),
  -- Le brouillon d'un mail pour lequel Leon a posé des questions ne s'écrit qu'avec ses réponses.
  add check (texte is null or questions is null or reponses is not null);

-- Ses réponses : avec la date où elle l'écarte (0080) et le brouillon déposé dans Gmail (0081), tout ce que l'app
-- change d'une ligne.
grant update (reponses) on brouillons to leon_app;

-- Le texte d'un brouillon écrit ne change jamais : l'app n'a toujours aucun droit de modifier `texte` (0080). Elle ne
-- le pose après coup que par cette fonction, une seule fois : sur une ligne de la personne courante, dans son
-- organisation, qui a ses questions et ses réponses, pas encore de texte, et qu'elle n'a pas écartée. Rend faux sinon.
create function ecrire_brouillon(p_id uuid, p_texte text) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with ecrit as (
    update brouillons set texte = p_texte
    where id = p_id and tenant_id = app_tenant() and user_id = app_user()
      and texte is null and reponses is not null and ecarte_le is null and p_texte is not null
    returning 1
  )
  select exists (select 1 from ecrit)
$$;
revoke all on function ecrire_brouillon(uuid, text) from public;
grant execute on function ecrire_brouillon(uuid, text) to leon_app;
