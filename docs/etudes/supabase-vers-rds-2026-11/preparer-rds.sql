-- Prépare une base vide sur RDS, en compte maître (rds_superuser). Équivalent RDS de docker/postgres/init.sql.
-- Lancé depuis CloudShell, où le mot de passe maître (Secrets Manager) ne s'affiche jamais :
--   psql "host=<adresse RDS> dbname=postgres user=leon_admin sslmode=require" \
--     -v db=leon -v owner_verifier='SCRAM-SHA-256$…' -v app_verifier='SCRAM-SHA-256$…' -f preparer-rds.sql
-- Les mots de passe des rôles arrivent déjà hachés (SCRAM) : leur version en clair reste sur le poste qui copie les
-- données et dans Railway. Relançable : rôles et base ne sont créés que s'ils manquent.
\set ON_ERROR_STOP on

select not exists (select 1 from pg_roles where rolname = 'leon_owner') as creer_roles \gset
\if :creer_roles
  create role leon_owner login password :'owner_verifier';
  create role leon_app login nobypassrls password :'app_verifier';
\endif
-- PG 16+ : le maître doit pouvoir « devenir » leon_owner pour lui donner une base.
grant leon_owner to current_user;

select not exists (select 1 from pg_database where datname = :'db') as creer_base \gset
\if :creer_base
  create database :"db" owner leon_owner;
\endif
revoke all on database :"db" from public;
grant connect on database :"db" to leon_app;

\connect :db
-- vector n'est pas « trusted » : seul le maître peut la créer. Les deux autres suivent pour rester au même endroit
-- (public) que chez Supabase, où le schéma copié les attend.
create extension if not exists vector schema public;
create extension if not exists pg_trgm schema public;
create extension if not exists btree_gist schema public;
-- Comme 0001-base.sql : le schéma appartient à leon_owner, pg-boss (leon_app) y crée et possède ses tables.
create schema if not exists pgboss authorization leon_owner;
grant all on schema pgboss to leon_app;
