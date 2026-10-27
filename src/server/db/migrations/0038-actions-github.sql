-- 0038-actions-github.sql : toutes les écritures GitHub que Leon propose (lots 7 à 10 de
-- docs/specs/2026-10-26-github-acces-complet.md) : fichiers, branches, PR, tickets, revues, Actions. Seule la liste
-- des types d'action change. Écrite avec any(array[…]) comme celle de 0037 (contrat de schéma).

alter table actions
  drop constraint actions_kind_check,
  add constraint actions_kind_check check (kind = any (array[
    'github.creer_branche',
    'github.supprimer_branche',
    'github.ecrire_fichier',
    'github.supprimer_fichier',
    'github.ouvrir_pr',
    'github.modifier_pr',
    'github.fusionner_pr',
    'github.commenter',
    'github.demander_revue',
    'github.soumettre_revue',
    'github.creer_ticket',
    'github.modifier_ticket',
    'github.relancer_execution',
    'github.annuler_execution']));
