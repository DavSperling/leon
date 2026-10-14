# R1 : stockage et modèle de données de la mémoire de Leon (12 octobre 2026)

Ce rapport part du cahier des besoins et challenge `stockage.md` : même conclusion (Postgres source de vérité), trois corrections, et ce que le premier rapport n'adressait pas (faits partagés / conversations privées, socle de types adaptable, hébergement européen réel).

## 1. Comparaison

**Postgres seul (pgvector + FTS + RLS + contraintes temporelles).** Un seul moteur porte faits, droits, temps et recherche. pgvector 0.8.7 (5 oct. 2026) est présent partout : Neon le livre en 0.8.6 sur PG18, Scaleway et OVH le proposent. Pour le plein texte, `tsvector` natif suffit au départ ; le vrai BM25 existe en licence Postgres avec `pg_textsearch` v1.0 (Tiger Data, avril 2026, PG17/18), mais ni Neon ni Supabase ne l'installent, et ParadeDB `pg_search` est AGPL. Deux corrections au premier rapport : l'extension `periods` (temps système) ne supporte que PG 9.5 à 15, donc inutilisable ; et `WITHOUT OVERLAPS` (PG18) n'existe que chez Neon (PG18 par défaut), pas chez Scaleway (14 à 17) ni, à la lecture du changelog, chez Supabase (17). Il ne faut donc **pas** dépendre de PG18 : une contrainte `EXCLUDE USING gist` avec `btree_gist` garantit « jamais deux valeurs actives pour la même clé » depuis PG 9.2, chez tous les hébergeurs.

**Postgres + moteur de recherche dédié.** Meilisearch (MIT en communautaire, entreprise commerciale, 59 k étoiles), Typesense (serveur GPL-3.0, clés « scoped » multi-tenant), Elasticsearch (AGPL/SSPL/ELv2 depuis août 2024). Tous font l'hybride. Prix : un second système à synchroniser et deux modèles de droits à tenir cohérents ; un fait mal filtré côté moteur est exactement l'erreur « qui coûte la confiance en 30 secondes ». À n'ajouter que si le plein texte Postgres se révèle insuffisant à la mesure.

**Graphe temporel (Graphiti/Zep, Neo4j, FalkorDB).** Graphiti (Apache-2.0, 31,7 k étoiles) a le bon modèle : faits bi-temporels invalidés jamais supprimés, provenance par épisode. Mais ses backends sont Neo4j 5.26+ (communautaire GPLv3, entreprise payante), FalkorDB (SSPLv1, non OSI), Neptune (AWS) ou Kuzu (abandonné). Pas d'ACL par arête, pas de fiche Markdown, ingestion multi-appels LLM à l'opposé du tri en un passage. Sentra, qui vend ce modèle, décrit quatre horodatages par fait (`validStart/End`, `transactionStart/End`) et des droits hérités des sources : un schéma relationnel qui s'ignore. On reprend le modèle, pas le moteur.

**Bases vectorielles managées (Turbopuffer, Qdrant, Pinecone).** Turbopuffer a Francfort (AWS, GCP), Dublin, Londres ; Qdrant Cloud, Francfort et Paris. Excellents index, pas des sources de vérité : pas de transaction avec les faits, pas de bi-temporalité, droits réduits à des filtres. Utile à 1 000 clients si pgvector sature ; inutile avant.

**SQLite par client (Turso/libSQL).** Isolation dure, résidence par base, bases illimitées en payant : séduisant pour « un espace isolé par entreprise ». Mais « Multi-DB Schemas » (migration poussée aux bases filles) est déprécié pour les nouveaux comptes, il n'y a pas de RLS par fait, la recherche hybride est faible et le serveur MCP doit router chaque appel. L'isolation par entreprise s'obtient plus simplement avec RLS.

**Produits comparables.** Mem0 (Apache-2.0) : vector store (Qdrant par défaut, pgvector supporté) + graphe optionnel + historique ; ADD-only depuis avril 2026. Cognee (Apache-2.0, 32,1 k) : relationnel + vecteur + graphe, avec depuis la 1.0 un mode « tout sur un seul Postgres » et des permissions multi-tenant. Supermemory (MIT, 31,2 k) : Postgres + Cloudflare, faits à expiration, isolation par `containerTags`. Qontext : fichiers et dossiers, droits voir/réviser/éditer, journal de lecture. Convergence nette : **Postgres central, vecteur et graphe comme index**, bi-temporalité comme différenciant.

## 2. Recommandation ferme

**Postgres managé en Europe, schéma partagé avec RLS par tenant et par fait, pgvector + `tsvector`/`pg_trgm`, contraintes d'exclusion GiST pour le temps, Markdown rendu à la lecture.** Extensions standard seulement (`vector`, `btree_gist`, `pg_trgm`, `ltree`), donc portable entre Neon Francfort (PG18, le plus dev-friendly : branches, CLI, MCP ; propriété de Databricks), Supabase Francfort/Paris/Zurich (RLS outillée, PG17) et Scaleway Paris (souveraineté, PG17) si un client l'exige. Démarrer sur Neon ou Supabase ; migrer vers Scaleway est un `pg_dump`.

Tables (toutes portent `tenant_id`, index composites menant par `tenant_id`) :

- `tenants`, `users`, `groups`, `group_members` : principals ; `users.principals uuid[]` matérialisé (lui-même + ses groupes + le groupe « tous »).
- `sources` : `kind` (llm_conversation, notion, linear, github, gmail, drive, hubspot), `external_id`, `owner_user_id`, `acl uuid[]` (principals autorisés, hérités de la source), `content_hash`, `captured_at`, `raw_ref` (clé de stockage objet pour le brut), `metadata jsonb`. Pour une conversation LLM, `acl = {owner}` : **la conversation brute reste privée**.
- `source_chunks` : `source_id`, `ord`, `text`, `embedding halfvec(1024)`, `tsv`. Même ACL que la source. Sert à montrer la preuve et à chercher dans ses propres conversations.
- `card_types` : `tenant_id` (NULL = socle), `slug`, `label`, `parent_slug`, `sections jsonb` (ordre et prédicats attendus), `created_by` (core | agent). Voir §3.
- `cards` : `type_id`, `slug`, `path ltree` (`clients.acme`), `title`, `merged_into` (résolution d'entités : la fiche absorbée pointe vers la survivante, rien n'est effacé).
- `card_aliases` : `card_id`, `alias`, `source_id`, `confidence` : les noms sous lesquels une entité apparaît (« la Marie Dupont du mail est-elle celle du CRM ? »).
- `facts` : `card_id`, `predicate`, `value_text`, `value_json`, **`validity tstzrange`** (temps réel), **`recorded_at`, `retracted_at`** (temps système), `superseded_by`, `source_id NOT NULL`, `source_span` (offsets dans le chunk), `confidence`, `acl uuid[]` (hérité de la source, élargi à « tous » pour un fait extrait d'une conversation LLM : **les faits sont partagés**), `status` (active | superseded | conflict), `embedding halfvec`, `tsv`.
  Contrainte : `EXCLUDE USING gist (tenant_id WITH =, card_id WITH =, predicate WITH =, validity WITH &&) WHERE (status = 'active')`. Le moteur refuse deux valeurs actives qui se chevauchent ; l'agent, en un passage, choisit entre fermer l'ancienne (`superseded_by`) ou poser les deux en `conflict`.
- `conflicts` : `fact_a`, `fact_b`, `detected_at`, `resolved_by`, `resolution` : les contradictions sont signalées, visibles dans l'interface, jamais tranchées en silence.
- `read_log` : `user_id`, `client` (claude-code, cursor, chatgpt…), `card_id`/`fact_ids`, `at` : « voir ce que les assistants ont lu », comme le journal de Qontext.

**Droits.** Le serveur MCP ouvre sa transaction avec `SET LOCAL app.tenant`, `app.principals`. Politique RLS sur `facts`, `sources`, `source_chunks` : `tenant_id = app.tenant AND acl && app.principals`. Le code ne peut pas oublier un filtre ; surcoût mesuré sous 2 % avec l'index composite. Tests pgTAP allow/deny par table.

**Recherche hybride** : `tsv` (`french` + `simple`) et `pg_trgm` pour l'exact et les fautes, HNSW sur `halfvec` pour le sémantique, fusion RRF en SQL, toujours après RLS (les scans itératifs de pgvector 0.8 évitent les résultats vides sous filtre). `pg_textsearch` dès qu'un hébergeur le livre.

**Fiche Markdown** : `render_card(card_id, as_of)` lit les faits dont `validity @> as_of` et `recorded_at <= as_of` (bi-temporel : « ce qu'on savait en mars »), les groupe selon `card_types.sections`, termine chaque ligne par `[source, date]` ; cache `card_renders` invalidé à chaque INSERT. Export Git par client pour les devs. Outils MCP : `tree(path)`, `read_card(path, as_of?)`, `search(q)`, `explain(fact_id)` qui renvoie le chunk source.

**Exploitation.** Deux fondateurs : une instance managée, migrations versionnées, sauvegardes de l'hébergeur. 10 et 100 clients : même instance. 1 000 : partition de `facts` et `source_chunks` par hash de `tenant_id`, instance dédiée (même schéma) pour les gros comptes ou ceux qui exigent Scaleway.

## 3. Socle de fiches adaptable sans casser le tri

Le socle est un jeu de lignes `card_types` avec `tenant_id NULL` : client, projet, personne, décision, règle, fournisseur, produit, outil, chacun avec ses `sections`. L'agent d'organisation adapte **par dérivation, jamais par mutation** : pour un cabinet d'avocats il crée `dossier` avec `parent_slug = projet` ; pour une agence, `campagne`. Trois règles : (1) un type dérivé hérite des sections du parent et ne peut qu'en ajouter ; (2) le tri cible toujours un `slug` existant, un type nouveau est créé **avant** la première fiche et apparaît dans l'interface marqué « proposé par l'agent », révisable ; (3) toute requête par type remonte la hiérarchie, donc `tree('projets')` montre aussi les `dossiers`, et une fiche mal typée se re-type par UPDATE d'une colonne sans toucher aux faits. Le socle évolue par migration chez nous ; les dérivations restent dans les données du client.

## 4. Non vérifié

- PG18 chez Supabase et OVH (changelog Supabase lu : PG17 ; page OVH tronquée).
- `pg_textsearch` chez un hébergeur managé autre que Tiger Cloud (absent chez Neon ; liste Supabase non détaillée).
- Régions européennes de Meilisearch Cloud, Typesense Cloud et Pinecone.
- Historique interne de Mem0 ; détail des permissions Cognee ; format et hébergement précis de Qontext ; code de Sentra (aucun dépôt public).
- Tenue de l'`EXCLUDE` partiel sous forte concurrence d'écriture (à tester en charge).

## Sources

- https://www.postgresql.org/about/featurematrix/detail/temporal-constraints · https://aiven.io/blog/exploring-how-postgresql-18-conquered-time-with-temporal-constraints
- https://www.postgresql.org/about/news/pgvector-087-released-3392/ · https://www.postgresql.org/about/news/pgvector-080-released-2952
- https://www.postgresql.org/about/news/pg_textsearch-v10-3264 · https://github.com/timescale/pg_textsearch · https://www.pgxn.org/dist/pg_search/
- https://github.com/xocolatl/periods
- https://supabase.com/docs/guides/platform/regions · https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/changelog
- https://neon.com/docs/changelog · https://neon.com/docs/extensions/pg-extensions
- https://www.scaleway.com/en/database/ · https://www.ovhcloud.com/en/public-cloud/postgresql/
- https://turso.tech/solutions/multi-tenant-saas · https://turso.tech/blog/multi-tenancy-at-scale
- https://turbopuffer.com/docs/regions · https://qdrant.tech/documentation/cloud/create-cluster/
- https://github.com/getzep/graphiti · https://github.com/FalkorDB/FalkorDB · https://neo4j.com/open-core-and-neo4j/
- https://github.com/typesense/typesense · https://github.com/meilisearch/meilisearch · https://www.elastic.co/blog/elasticsearch-is-open-source-again
- https://docs.mem0.ai/components/vectordbs/overview · https://mem0.ai/blog/state-of-ai-agent-memory-2026
- https://github.com/topoteretes/cognee · https://github.com/supermemoryai/supermemory
- https://www.sentra.app/articles/what-is-a-bitemporal-knowledge-graph · https://qontext.ai/
- https://daily.dev/posts/row-level-security-performance-in-postgresql-measured-ymgclktel
