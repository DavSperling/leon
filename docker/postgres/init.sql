-- Exécuté une seule fois par le superutilisateur, à la création du volume.

-- Extensions que seul un superutilisateur peut créer (elles ne sont pas « trusted ») : créées dans
-- template1, que copie chaque base créée ensuite (leon, leon_test, et la base de test d'une branche).
-- Le « create extension if not exists » des migrations, lancé par leon_owner, est alors sans effet.
-- vector : pgvector, pour les vecteurs de la recherche (0011-passages.sql).
\connect template1
create extension if not exists vector;
-- On quitte template1 : créer une base depuis template1 échoue tant qu'une session y est connectée.
\connect postgres

create role leon_owner login password 'leon_owner';
create role leon_app login password 'leon_app' nobypassrls;
create database leon owner leon_owner;
create database leon_test owner leon_owner;
revoke all on database leon from public;
revoke all on database leon_test from public;
grant connect on database leon to leon_app;
grant connect on database leon_test to leon_app;
