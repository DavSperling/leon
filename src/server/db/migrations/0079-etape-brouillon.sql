-- 0079-etape-brouillon.sql : appels_modele accepte l'étape `brouillon`, le brouillon de réponse que l'agent
-- « Brouillons de réponse » écrit pour un mail qui attend (portrait/brouillons.ts). Sans elle, chaque appel échouerait
-- à s'inscrire au tableau des admins, en silence (logUsage n'attend pas).
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check
    check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda', 'fiche', 'brouillon'));
