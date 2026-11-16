-- 0071-points-a-refaire.sql : chaque point du matin est refait une fois avec les nouvelles consignes (le sens, la
-- priorité, l'essentiel : PR #177 et #179). Un point n'est réécrit que s'il est périmé (briefingIsFresh) : sans cela,
-- un projet où rien n'a bougé gardait pour toujours son texte écrit avec l'ancienne consigne. La prochaine lecture
-- (Accueil, crochet, MCP) ou le tic du matin le refait, sous le plafond du jour (reserver_point).
update briefings set stale = true where not stale;
