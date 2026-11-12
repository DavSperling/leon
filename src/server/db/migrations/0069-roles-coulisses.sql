-- 0069-roles-coulisses.sql : turns accepte les trois rôles des coulisses d'une session de code, `raisonnement`,
-- `sous_agent` et `appel_outil` (T51, D29 et C10 du plan de la mémoire à disposition), en gardant les quatre d'avant
-- (0008). Seule leur route les écrit (POST /api/v1/coulisses) : l'ingestion n'accepte toujours que user et assistant.
--
-- Le migrateur applique ce fichier en une transaction : le verrou exclusif de l'alter tient jusqu'au commit. `not
-- valid` évite d'y relire toute la table, la plus grosse : la nouvelle liste contient l'ancienne, que 0008 a validée,
-- donc chaque ligne déjà là la respecte. La contrainte vaut pour toute écriture neuve. `lock_timeout` : sans le verrou
-- en 5 s (une longue transaction sur turns), la migration échoue et se relance, plutôt que de bloquer derrière elle
-- toutes les lectures de turns.
set local lock_timeout = '5s';

alter table turns
  drop constraint turns_role_check,
  add constraint turns_role_check check (role in ('user', 'assistant', 'document', 'participant', 'raisonnement',
    'sous_agent', 'appel_outil')) not valid;
