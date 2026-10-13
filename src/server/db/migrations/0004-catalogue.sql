-- 0004-catalogue.sql : catalogue du socle (tenant_id et acl nuls, visible de tous les tenants).
-- Un type dérivé hérite des prédicats de son parent ; note (multi-valué) est le repli de tout type.

insert into card_types (tenant_id, slug, label, parent_slug, status, acl) values
  (null, 'client', 'Client', null, 'validated', null),
  (null, 'projet', 'Projet', null, 'validated', null),
  (null, 'personne', 'Personne', null, 'validated', null),
  (null, 'decision', 'Décision', null, 'validated', null),
  (null, 'regle', 'Règle', null, 'validated', null),
  (null, 'fournisseur', 'Fournisseur', null, 'validated', null),
  (null, 'produit', 'Produit', null, 'validated', null),
  (null, 'outil', 'Outil', null, 'validated', null);

insert into predicates (tenant_id, type_slug, slug, label, single_valued) values
  (null, 'client', 'statut', 'Statut', true),
  (null, 'client', 'contact', 'Contact', false),
  (null, 'client', 'besoin', 'Besoin', false),
  (null, 'client', 'offre', 'Offre ou devis', false),
  (null, 'client', 'tarif', 'Tarif convenu', true),
  (null, 'client', 'paiement', 'Paiement', true),
  (null, 'client', 'engagement', 'Engagement', false),
  (null, 'client', 'note', 'Note', false),

  (null, 'projet', 'statut', 'Statut', true),
  (null, 'projet', 'objectif', 'Objectif', true),
  (null, 'projet', 'echeance', 'Échéance', true),
  (null, 'projet', 'responsable', 'Responsable', true),
  (null, 'projet', 'budget', 'Budget', true),
  (null, 'projet', 'decision', 'Décision', false),
  (null, 'projet', 'risque', 'Risque', false),
  (null, 'projet', 'note', 'Note', false),

  (null, 'personne', 'role', 'Rôle', true),
  (null, 'personne', 'entreprise', 'Entreprise', true),
  (null, 'personne', 'email', 'E-mail', true),
  (null, 'personne', 'telephone', 'Téléphone', true),
  (null, 'personne', 'preference', 'Préférence', false),
  (null, 'personne', 'note', 'Note', false),

  (null, 'decision', 'enonce', 'Énoncé', true),
  (null, 'decision', 'statut', 'Statut', true),
  (null, 'decision', 'motif', 'Motif', false),
  (null, 'decision', 'date', 'Date', true),
  (null, 'decision', 'note', 'Note', false),

  (null, 'regle', 'enonce', 'Énoncé', true),
  (null, 'regle', 'portee', 'Portée', false),
  (null, 'regle', 'exception', 'Exception', false),
  (null, 'regle', 'note', 'Note', false),

  (null, 'fournisseur', 'contact', 'Contact', false),
  (null, 'fournisseur', 'offre', 'Offre', false),
  (null, 'fournisseur', 'tarif', 'Tarif', true),
  (null, 'fournisseur', 'contrat', 'Contrat', true),
  (null, 'fournisseur', 'delai', 'Délai', true),
  (null, 'fournisseur', 'note', 'Note', false),

  (null, 'produit', 'description', 'Description', true),
  (null, 'produit', 'prix', 'Prix', true),
  (null, 'produit', 'fonctionnalite', 'Fonctionnalité', false),
  (null, 'produit', 'limite', 'Limite', false),
  (null, 'produit', 'note', 'Note', false),

  (null, 'outil', 'usage', 'Usage', false),
  (null, 'outil', 'configuration', 'Configuration', false),
  (null, 'outil', 'acces', 'Accès', false),
  (null, 'outil', 'note', 'Note', false);
