-- 0031-suppression-discussions.sql : l'auteur peut supprimer ses discussions. La règle tenant_acl de 0012 vaut
-- pour toutes les commandes : on ne supprime que ce qu'on voit, donc ses propres discussions (acl = [user_id]).
-- Les messages partent avec, par la clé étrangère « on delete cascade » ; aucun droit de suppression direct sur eux.

grant delete on discussions to leon_app;
