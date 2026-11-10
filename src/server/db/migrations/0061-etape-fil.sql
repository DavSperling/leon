-- 0061-etape-fil.sql : appels_modele accepte l'étape `fil`, l'état d'un fil de travail écrit par Leon (T43, D23 du
-- plan de la mémoire à disposition). Sans elle, chaque appel de l'état échouerait à s'inscrire, en silence (logUsage
-- n'attend pas).
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check check (step in ('reponse', 'discussion', 'point', 'resume', 'fil'));
