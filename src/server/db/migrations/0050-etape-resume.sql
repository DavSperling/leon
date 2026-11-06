-- 0050-etape-resume.sql : appels_modele accepte l'étape `resume`, le résumé d'une session écrit par Leon (D8 du
-- plan de la mémoire des sessions). Sans elle, chaque appel du résumé échouerait à s'inscrire, en silence (logUsage
-- n'attend pas).
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check check (step in ('reponse', 'discussion', 'point', 'resume'));
