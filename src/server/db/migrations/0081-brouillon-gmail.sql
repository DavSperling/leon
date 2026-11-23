-- 0081-brouillon-gmail.sql : un brouillon complet est aussi déposé dans les brouillons Gmail de la personne, en réponse
-- dans le fil (portrait/brouillon-depot.ts). La colonne garde l'identifiant du brouillon Gmail créé, nul tant que rien
-- n'est déposé : elle sert à ne jamais déposer deux fois, et à dire à l'écran qu'il est déposé. Rien n'est envoyé, et
-- Leon ne supprime ni ne modifie rien dans sa boîte : cet identifiant ne sert à aucune autre requête.
alter table brouillons
  add column brouillon_gmail text check (char_length(brouillon_gmail) between 1 and 200);

-- L'app ne change toujours rien d'autre d'un brouillon écrit que la date où il est écarté (0080), et cet identifiant.
grant update (brouillon_gmail) on brouillons to leon_app;
