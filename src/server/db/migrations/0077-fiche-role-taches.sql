-- 0077-fiche-role-taches.sql : la fiche d'une personne (0076) reçoit deux genres de lignes, écrits une fois par un
-- modèle d'après ses éléments récents dans tous ses outils (portrait/synthese.ts) : son rôle (une ligne, sans clé) et
-- les tâches qu'elle refait (une ligne par tâche, la clé est son rang). Ces lignes ont la provenance « synthese », sans
-- nombre de mails, et suivent les règles de la table : privées à la personne, corrigées ou retirées par elle seule.
alter table lignes_fiche
  drop constraint lignes_fiche_genre_check,
  add constraint lignes_fiche_genre_check check (genre = any (array[
    'interlocuteur', 'mots', 'appels', 'politesses', 'registre',
    'rythme', 'langues', 'delai-reponse', 'horaires', 'signature', 'role', 'tache']));

-- L'étape du modèle qui écrit ces lignes, pour que ses appels s'inscrivent au tableau des admins.
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check
    check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda', 'fiche'));
