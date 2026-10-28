-- 0039-suppression-compte.sql : un compte supprimé garde sa ligne `user`, vidée et verrouillée, pour que ses
-- sources, ses tours et ses discussions lui restent rattachés (la clé étrangère est en cascade : effacer la ligne
-- effacerait son travail). `deleted_at` dit quand. Rien d'autre à ajouter : leon_app fait le reste lui-même.
alter table "user" add column deleted_at timestamptz;
