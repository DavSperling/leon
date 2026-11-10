-- 0061-tours-injectes.sql : la marque des tours `user` que la personne n'a pas tapés (T43 du plan de la mémoire à
-- disposition) : rapport de sous-agent, notification de tâche, message d'un agent, sortie de crochet. Seul un tour
-- marqué false prouve une `[décision]`. Nulle et sans défaut, contre le plan (not null default false) : un tour capté
-- avant la marque, ou par une CLI qui ne la pose pas, reste « inconnu », jamais « tapé par la personne ».
alter table turns add column injecte boolean;
