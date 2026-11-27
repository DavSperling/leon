-- 0103-actions-tickets.sql : Leon crée aussi un ticket Linear, une carte Trello ou une page Notion, par le même
-- circuit que les écritures GitHub (0037, 0038) : il propose dans une discussion, l'utilisateur confirme d'un clic.
-- Seule la liste des types d'action change. Écrite avec any(array[…]) comme celle de 0038 (contrat de schéma).

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
    'github.annuler_execution',
    'linear.creer_ticket',
    'trello.creer_carte',
    'notion.creer_page']));
