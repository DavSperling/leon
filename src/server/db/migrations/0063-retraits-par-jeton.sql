-- 0063-retraits-par-jeton.sql : la date du dernier retrait de chaque outil, par jeton (T43 du plan de la mémoire à
-- disposition, amendé le 10/11) : `{ "claude_code": "<retire_le>" }`. La route du retrait la pose, recordFacts la relit :
-- des faits envoyés sous un accord qui ne la suit pas ne remettent aucun usage. Par jeton (l'ordinateur), pas par
-- personne : la date d'un retrait sur un ordinateur ne retire pas les usages des prochains faits d'un autre qui garde
-- son accord (le vidage de la route touche, lui, toutes les sessions de l'outil de la personne).
alter table api_tokens add column retraits jsonb not null default '{}';
