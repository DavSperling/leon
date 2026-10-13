-- 0005-durcissement.sql : chaque membre a ses propres sources ; aucune référence ne sort de son organisation ;
-- le journal de lecture est en ajout seul.

-- Une conversation appartient à qui l'envoie : un collègue qui capte la même obtient sa propre source.
alter table sources
  drop constraint sources_tenant_id_kind_external_id_key,
  add constraint sources_tenant_owner_kind_external_id_key unique (tenant_id, owner_user_id, kind, external_id);

-- Cibles des clés composées.
alter table sources add constraint sources_tenant_id_id_key unique (tenant_id, id);
alter table turns add constraint turns_tenant_id_id_key unique (tenant_id, id);
alter table ingest_runs add constraint ingest_runs_tenant_id_id_key unique (tenant_id, id);
alter table fact_candidates add constraint fact_candidates_tenant_id_id_key unique (tenant_id, id);
alter table cards add constraint cards_tenant_id_id_key unique (tenant_id, id);
alter table facts add constraint facts_tenant_id_id_key unique (tenant_id, id);

-- Les clés étrangères sont vérifiées hors RLS : elles portent tenant_id pour qu'aucune ligne ne pointe
-- vers une autre organisation. cards.type_id reste simple (types du socle à tenant_id nul).
-- « not valid » : Postgres vérifie toute nouvelle écriture sans réexaminer les lignes existantes.
-- Raison : la base partagée leon_test garde des lignes inter-organisations écrites avant cette
-- migration (tests de T08b en phase rouge) ; la base leon n'en a aucune. Les valider demandera
-- d'abord de supprimer ces lignes de test.
alter table turns
  drop constraint turns_source_id_fkey,
  add constraint turns_source_id_fkey foreign key (tenant_id, source_id)
    references sources (tenant_id, id) on delete cascade not valid;

alter table ingest_runs
  drop constraint ingest_runs_source_id_fkey,
  add constraint ingest_runs_source_id_fkey foreign key (tenant_id, source_id)
    references sources (tenant_id, id) on delete cascade not valid;

alter table fact_candidates
  drop constraint fact_candidates_ingest_run_id_fkey,
  add constraint fact_candidates_ingest_run_id_fkey foreign key (tenant_id, ingest_run_id)
    references ingest_runs (tenant_id, id) on delete cascade not valid,
  drop constraint fact_candidates_turn_id_fkey,
  add constraint fact_candidates_turn_id_fkey foreign key (tenant_id, turn_id)
    references turns (tenant_id, id) on delete cascade not valid;

alter table cards
  drop constraint cards_merged_into_fkey,
  add constraint cards_merged_into_fkey foreign key (tenant_id, merged_into)
    references cards (tenant_id, id) not valid;

alter table card_aliases
  drop constraint card_aliases_card_id_fkey,
  add constraint card_aliases_card_id_fkey foreign key (tenant_id, card_id)
    references cards (tenant_id, id) on delete cascade not valid;

alter table facts
  drop constraint facts_card_id_fkey,
  add constraint facts_card_id_fkey foreign key (tenant_id, card_id)
    references cards (tenant_id, id) not valid,
  drop constraint facts_source_id_fkey,
  add constraint facts_source_id_fkey foreign key (tenant_id, source_id)
    references sources (tenant_id, id) not valid,
  drop constraint facts_turn_id_fkey,
  add constraint facts_turn_id_fkey foreign key (tenant_id, turn_id)
    references turns (tenant_id, id) not valid,
  drop constraint facts_superseded_by_fkey,
  add constraint facts_superseded_by_fkey foreign key (tenant_id, superseded_by)
    references facts (tenant_id, id) not valid,
  drop constraint facts_candidate_id_fkey,
  add constraint facts_candidate_id_fkey foreign key (tenant_id, candidate_id)
    references fact_candidates (tenant_id, id) not valid;

alter table read_log
  drop constraint read_log_card_id_fkey,
  add constraint read_log_card_id_fkey foreign key (tenant_id, card_id)
    references cards (tenant_id, id) not valid;

revoke update on read_log from leon_app;
