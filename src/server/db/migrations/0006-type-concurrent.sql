-- 0006-type-concurrent.sql : type du socle pour les concurrents. Au premier essai réel, faute de ce
-- type, des concurrents ont été rangés tantôt en outil, tantôt en produit, tantôt sous un type proposé.

insert into card_types (tenant_id, slug, label, parent_slug, status, acl) values
  (null, 'concurrent', 'Concurrent', null, 'validated', null);

insert into predicates (tenant_id, type_slug, slug, label, single_valued) values
  (null, 'concurrent', 'offre', 'Offre', false),
  (null, 'concurrent', 'prix', 'Prix', true),
  (null, 'concurrent', 'cible', 'Cible', false),
  (null, 'concurrent', 'force', 'Point fort', false),
  (null, 'concurrent', 'faiblesse', 'Point faible', false),
  (null, 'concurrent', 'note', 'Note', false);
