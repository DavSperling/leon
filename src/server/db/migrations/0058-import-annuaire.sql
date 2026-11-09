-- 0058-import-annuaire.sql : l'organigramme s'importe de l'annuaire de Google Workspace ou de Microsoft 365
-- (annuaire.ts). L'import ne touche jamais au rattachement d'un membre fait ou retiré à la main dans Leon : il le lit
-- ici, posé par setManager (organisation.ts).
alter table "member" add column "rattachementManuel" boolean not null default false;

-- Tout rattachement déjà là a été fait à la main (0054).
update "member" set "rattachementManuel" = true where id in (select member_id from reporting_lines);
