-- 0083-brouillon-choix.sql : Leon pose ses questions une par une, chacune avec des choix de réponse (un choix
-- « Autre », ajouté par l'écran, ouvre un texte libre). Les choix se gardent sur la ligne du brouillon, avec les
-- questions (0082) et privés comme elles : la même politique, le même contrôle de l'accès, supprimés avec le compte et
-- avec le fil. Ses réponses ne changent pas de forme : le texte du choix retenu, ou son texte libre.
alter table brouillons
  -- Une liste par question, dans le même ordre : deux à quatre choix de 80 caractères chacun au plus
  -- (portrait/brouillon-prompt.ts, qui valide leur forme). Nul : pas de question, ou une demande posée avant les choix.
  add column choix jsonb,
  -- Pas de choix sans question, une liste par question, et une taille bornée : celle du texte JSON, où un caractère
  -- peut en prendre six (trois questions, quatre choix de 80 caractères).
  add check (choix is null or (questions is not null and jsonb_typeof(choix) = 'array'
    and jsonb_array_length(choix) = cardinality(questions) and char_length(choix::text) <= 6000));

-- Aucun droit de plus pour l'app : les choix s'écrivent avec la ligne (insert, 0080) et ne changent jamais ensuite.
