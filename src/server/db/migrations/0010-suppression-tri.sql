-- 0010-suppression-tri.sql : le tri disparaît. Leon garde le brut (sources, tours) et l'indexe (0011) :
-- plus de faits, de fiches ni de file « à vérifier ». Les tables, leurs index et leurs politiques de
-- sécurité par ligne partent ensemble ; aucune fonction ne dépendait d'elles.

-- Le journal de lecture pointait vers des fiches : ses lignes n'ont plus de sens, on les retire. Il garde
-- sa forme « qui a lu quoi, avec quel assistant », mais sur une source et, au besoin, un passage. Le passage
-- n'a pas de clé étrangère : la table des passages n'existe qu'en 0011.
delete from read_log;
alter table read_log drop column card_id; -- emporte sa clé étrangère vers cards
alter table read_log add column source_id uuid not null;
alter table read_log add column passage_id uuid;
alter table read_log add constraint read_log_source_id_fkey
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade;
create index read_log_source_idx on read_log (tenant_id, source_id);

-- Dans l'ordre des dépendances : chaque table part avant celles qu'elle référence.
drop table review_items;
drop table facts;
drop table fact_candidates;
drop table card_aliases;
drop table cards;
drop table predicates;
drop table card_types;

-- La liste des outils se valide dans le code (SOURCE_KINDS, PROVIDER_IDS) : ajouter un connecteur
-- ne demande plus de migration.
alter table sources drop constraint sources_kind_check;
alter table connections drop constraint connections_provider_check;

-- Un run n'a plus qu'une étape, l'indexation. Tous les runs existants repassent en attente : l'indexation
-- reprend ainsi tout l'historique déjà capté, y compris les runs que le tri n'avait pas finis.
alter table ingest_runs drop column triage;
alter table ingest_runs drop constraint ingest_runs_step_check;
alter table ingest_runs alter column step set default 'index';
update ingest_runs set step = 'index', status = 'queued', error = null;
alter table ingest_runs add constraint ingest_runs_step_check check (step in ('index', 'done'));
