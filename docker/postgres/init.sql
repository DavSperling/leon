-- Exécuté une seule fois par le superutilisateur, à la création du volume.
create role leon_owner login password 'leon_owner';
create role leon_app login password 'leon_app' nobypassrls;
create database leon owner leon_owner;
create database leon_test owner leon_owner;
revoke all on database leon from public;
revoke all on database leon_test from public;
grant connect on database leon to leon_app;
grant connect on database leon_test to leon_app;
