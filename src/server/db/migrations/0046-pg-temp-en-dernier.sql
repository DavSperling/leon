-- 0046-pg-temp-en-dernier.sql : les fonctions security definer nomment pg_temp en dernier dans leur search_path.
--
-- Quand pg_temp n'est pas nommé, Postgres le parcourt en premier pour les tables : un rôle qui a le droit TEMP sur la
-- base pourrait créer une table temporaire du même nom qu'une table de public (sources, member…) et faire lire ou
-- écrire sa table à la fonction, avec les droits de son propriétaire. Nommé en dernier, pg_temp ne passe plus devant
-- public. Les corps ne changent pas. Une nouvelle fonction security definer écrit directement
-- « set search_path = public, pg_temp » (le test de 0046 lit pg_proc et refuse les autres).
alter function apropos_a_proposer(text[], integer, interval) set search_path = public, pg_temp;
alter function briefings_a_rafraichir(integer) set search_path = public, pg_temp;
alter function briefings_du_projet(text) set search_path = public, pg_temp;
alter function connector_syncs_due() set search_path = public, pg_temp;
alter function consommer_limites(text[], interval) set search_path = public, pg_temp;
alter function noter_activite(uuid, uuid) set search_path = public, pg_temp;
alter function passages_entrent_en_file() set search_path = public, pg_temp;
alter function passages_sans_vecteur(text, integer) set search_path = public, pg_temp;
alter function passages_sortent_de_file() set search_path = public, pg_temp;
alter function retirer_sources_connexion(uuid, text[]) set search_path = public, pg_temp;
alter function retirer_vieux_vecteurs(text, integer) set search_path = public, pg_temp;
alter function runs_en_attente(integer) set search_path = public, pg_temp;
alter function sortir_de_la_file(text, uuid[]) set search_path = public, pg_temp;
alter function statistiques_admin() set search_path = public, pg_temp;
alter function supprimer_document(uuid) set search_path = public, pg_temp;
