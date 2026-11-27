-- 0088-brouillon-envoye.sql : quand elle a envoyé un brouillon de Leon depuis l'accueil (« Envoyer »,
-- portrait/brouillon-depot.ts, sendBrouillon). Posé une fois, à l'envoi par Gmail ; l'accueil ne montre plus la ligne
-- (portrait/brouillons.ts), sans attendre que la relève de sa boîte rapporte sa réponse dans le fil. Nul : pas envoyé
-- d'ici (elle a pu l'envoyer depuis Gmail). Privé comme la ligne (0080) : la même politique, supprimé avec elle.
alter table brouillons add column envoye_le timestamptz;

grant update (envoye_le) on brouillons to leon_app;
