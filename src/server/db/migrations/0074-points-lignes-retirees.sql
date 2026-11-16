-- 0074-points-lignes-retirees.sql : les lignes que l'utilisateur a retirées de son point du matin (« c'est réglé »).
-- Le texte affiché de chaque ligne retirée, les 20 plus récentes au plus : la lecture les ôte du point (Accueil,
-- crochet, MCP), et le recalcul les donne au modèle pour qu'il ne les redise pas. Un recalcul ne les efface pas.
-- Privé comme le reste de la ligne : la sécurité par ligne de 0030 s'applique.
alter table briefings
  add column dismissed text[] not null default '{}'
    check (cardinality(dismissed) <= 20 and char_length(array_to_string(dismissed, '')) <= 20000);

grant update (dismissed) on briefings to leon_app;
