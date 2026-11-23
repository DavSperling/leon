-- 0087-fiche-preference.sql : la fiche d'une personne (0076) reçoit un genre de plus, la préférence d'écriture, qu'un
-- modèle tire d'une retouche qu'elle a faite à un brouillon de Leon (portrait/preferences.ts). Une ligne par
-- préférence, la clé est le brouillon d'où elle vient ; sa valeur garde son texte et son état : proposée, acceptée ou
-- refusée (portrait/lines.ts). Provenance « apprise », prévue par 0076, sans nombre de mails. Elle suit les règles de
-- la table : privée à la personne, retirée par elle seule, supprimée avec le compte. Refusée ou retirée, elle reste,
-- pour ne jamais être reproposée.
alter table lignes_fiche
  drop constraint lignes_fiche_genre_check,
  add constraint lignes_fiche_genre_check check (genre = any (array[
    'interlocuteur', 'mots', 'appels', 'politesses', 'registre',
    'rythme', 'langues', 'delai-reponse', 'horaires', 'signature', 'role', 'tache', 'preference']));
