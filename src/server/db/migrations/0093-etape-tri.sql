-- 0093-etape-tri.sql : appels_modele accepte l'étape `tri`, le petit appel qui dit si un mail attend une réponse avant
-- que l'agent « Brouillons de réponse » n'écrive (portrait/tri-prompt.ts). Sans elle, chaque appel du tri échouerait à
-- s'inscrire au tableau des admins, en silence (logUsage n'attend pas).
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check
    check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda', 'fiche', 'brouillon', 'tri'));
