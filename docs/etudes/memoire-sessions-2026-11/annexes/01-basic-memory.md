# Annexe 1 : basic-memory, comment ça marche

1er novembre 2026 · Amos (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md)

> Lecture du code source de [`basicmachines-co/basic-memory`](https://github.com/basicmachines-co/basic-memory) (Python 3.12, AGPL-3.0), branche `main` du 01/11/2026. Rien n'a été exécuté : c'est une analyse statique.

## 1. TL;DR — ce que c'est

Un système de **mémoire local-first** pour LLM, exposé en **MCP**. L'idée centrale :

> **Les fichiers Markdown sont la source de vérité. La base de données n'est qu'un index
> dérivé, reconstruit par synchro.** Supprime la DB → `bm sync` la régénère à l'identique
> depuis les `.md`.

Tu possèdes tes notes (fichiers plats, compatibles git, lisibles sans l'outil). L'IA
lit/écrit ces fichiers via des outils MCP ; en arrière-plan un indexeur transforme le
Markdown en **graphe de connaissances** (entités → observations + relations) requêtable.

- Entrée : `basic-memory = basic_memory.cli.main:app` (CLI `bm`), plus le serveur FastMCP.
- Stack : **FastMCP** (surface MCP) · **FastAPI** (API interne v2) · **SQLAlchemy 2.0 async**
  (SQLite en local, PostgreSQL en cloud) · **markdown-it** (parsing) · **Alembic** (migrations).

---

## 2. Architecture en couches

```
        Agent LLM  ──MCP──►  FastMCP server  (src/basic_memory/mcp/)
                                  │  outils bm_* = la surface publique
                                  ▼
                             API v2 FastAPI   (src/basic_memory/api/)
                                  │  routers REST internes
                                  ▼
                             Services         (src/basic_memory/services/)
                                  │  logique métier (entity, file, search, project…)
                                  ▼
                             Repositories      (src/basic_memory/repository/)
                                  │  accès DB (SQLAlchemy) + moteurs de recherche
                                  ▼
                   ┌──────────────┴───────────────┐
              Fichiers .md                     Base SQLite/PG
              (source de vérité)               (index dérivé)
                   └──────────────┬───────────────┘
                                  ▲
                          Indexeur / Watch        (src/basic_memory/index/ + indexing/)
                          fichier ⇄ DB, bidirectionnel
```

Le découpage MCP → API → Services → Repository est strict : la même logique sert le
serveur MCP *et* la CLI. C'est ce qui rend l'outil utilisable en local (SQLite, pas de
serveur) comme en cloud (Postgres, multi-tenant).

---

## 3. Le cœur : le modèle de graphe de connaissances

`src/basic_memory/models/knowledge.py` — c'est ici que tout se comprend.

| Table | Rôle | Points clés |
|-------|------|-------------|
| **Entity** | un nœud = un fichier `.md` | `permalink` (URI stable), `file_path`, `checksum` + `mtime`/`size` pour la détection de changement, `external_id` (UUID stable pour l'API) |
| **Observation** | un fait atomique dans une note | `[category] content #tag (context)` ; permalink synthétique `note/observations/category/contenu` |
| **Relation** | arête dirigée entre entités | `from_id → to_id`, `relation_type`, `to_name` (texte du lien non encore résolu) |
| **NoteContent** | contenu markdown matérialisé + **machine à états** de sync | `file_write_status ∈ {pending, writing, synced, failed, external_change_detected}` |
| **NoteSection** | index des sections (titres) du corps | lignes + offsets d'octets, pour les lectures partielles (`bm_read` par section) |
| **MemoryTimeIndex** | assertions de **temps valide** | projette `@effective[2026-06-10,2026-07-27)` — « quand c'est vrai du monde », distinct de la date d'édition |

**Trois décisions de design remarquables** (toutes documentées dans le code) :

1. **Asymétrie de cascade sur les relations.** `from_id` est `ON DELETE CASCADE` (une entité
   possède les liens qu'elle *déclare*), mais `to_id` est `ON DELETE SET NULL`. Supprimer une
   cible ne doit pas effacer le fait qu'une autre note pointe encore vers elle — le wikilink
   est toujours dans le markdown. Un lien non résolu (`to_id = NULL`, `to_name` conservé) est
   exactement l'état d'un lien vers une note pas encore créée. → **liens avant (forward links)
   survivent**, le graphe ne « ment » pas sur sa santé.

2. **Tout ce qui est dérivé est reconstructible.** Observations, sections, time-index sont des
   *projections* du markdown, reconstruites à chaque (ré)indexation sous une « generation fence »
   (`note_content.db_version`). Le markdown reste l'unique source de vérité temporelle/sémantique.

3. **Permalinks d'observations stables.** `duplicate_index` + un préfixe `observations/` généré
   (jamais atteignable par le contenu de l'auteur) garantissent qu'une note qui dit deux fois la
   même chose produit deux adresses distinctes sans casser la normalisation des URL `memory://`.
   (Contrainte réelle : limite de 2704 octets des index btree PostgreSQL → troncature à 200 car.
   + digest SHA-256.)

---

## 4. Le « langage » Markdown (l'interface auteur)

Réf. `NOTE-FORMAT.md` + `src/basic_memory/markdown/` (parsing via **markdown-it** + plugins).

```markdown
---
title: Coffee Brewing Methods
type: note
tags: [coffee, brewing]
permalink: coffee-brewing-methods
---

# Coffee Brewing Methods

## Observations
- [method] Pour over provides more flavor clarity than French press
- [technique] Water temperature at 205°F extracts optimal compounds #brewing
- [preference] Ethiopian beans work with lighter roasts (personal experience)

## Relations
- relates_to [[Coffee Bean Origins]]
- requires [[Proper Grinding Technique]]
```

- **Observation** : `- [category] contenu #tags (context)`. Catégorie obligatoire entre
  crochets ; tags et contexte optionnels. Les cases à cocher `- [ ]`, les liens
  `[texte](url)` et les wikilinks nus `- [[X]]` sont **exclus** (ce dernier devient une relation).
- **Relation explicite** : `- relation_type [[Cible]]`. Un lien Markdown `[txt](path)` devient
  implicitement une relation `links_to`. Les titres `## Observations` / `## Relations` sont
  **conventionnels, pas requis** — le parseur détecte par la syntaxe, n'importe où.
- **Frontmatter** : `title` (défaut = nom de fichier), `type` (défaut `note`), `tags`,
  `permalink`, `schema`. Tout champ custom → stocké dans `entity_metadata`, indexé pour la recherche.
- **Garde-fou sécurité** : `bm_parse_semantics: false` dans le frontmatter désactive
  l'extraction d'observations/relations → du contenu non fiable (texte brut extrait d'un PDF)
  ne peut pas « fabriquer » des arêtes de graphe avant une passe d'enrichissement bornée.
- `parse_markdown_content` nettoie les octets nuls (`\x00`, refusés par Postgres) et le BOM.

### URL `memory://`
Schéma d'adressage interne pour la traversée de graphe. `bm_context` prend un point de départ
(path, permalink, URL `memory://`, ou pattern `specs/*`) et remonte le graphe depuis ce nœud —
c'est ce qui « charge le contexte » d'une conversation.

---

## 5. Le moteur de synchro (fichier ⇄ DB)

Deux packages se partagent le travail (il n'y a pas de dossier `sync/` — c'est réparti) :

- `src/basic_memory/index/` — orchestration & temps réel : `local_watch.py` + `watch_service.py`
  (watcher du système de fichiers), `schedulers.py` / `local_schedulers.py`,
  `note_content_materialization.py` (écrit la DB vers les fichiers).
- `src/basic_memory/indexing/` — le pipeline d'(ré)indexation : `change_detector.py`,
  `file_indexer.py` / `batch_indexer.py`, `link_resolution.py` + `relation_resolution.py`
  (résolution différée des `to_name` → `to_id`), `forward_reference_resolution.py`,
  `wiki_projector.py`, `orphan_cleanup.py`.

**Détection de changement** : `checksum` + `mtime` + `size` sur `Entity`. Deux checksums
coexistent (`checksum` vs `sync_checksum`) pour gérer le cas où l'indexeur a lui-même réécrit
le fichier (normalisation du frontmatter / permalink) — un client de sync qui recopie
l'original par-dessus n'est alors pas traité comme un nouveau changement.

**Bidirectionnel** : les écritures MCP passent par la DB (`NoteContent`) puis sont
*matérialisées* vers le fichier (`file_write_status`), pendant que les éditions externes des
fichiers (éditeur, git pull) sont détectées par le watcher et ré-indexées
(`external_change_detected`). `NoteFileVacate` gère proprement les `move` DB-first : il
distingue le fichier source fantôme d'un move d'une vraie copie byte-identique.

C'est la partie la plus sophistiquée du projet — l'essentiel de la complexité de `indexing/`
sert à garder cohérents deux stores (FS + DB) sous éditions concurrentes des deux côtés.

---

## 6. La surface MCP (l'API que voit l'agent)

`src/basic_memory/mcp/tools/*.py`, serveur = `mcp/server.py` (FastMCP). Outils `bm_*` :

| Outil | Fait quoi |
|-------|-----------|
| `bm_write` / `bm_edit` | créer / modifier une note (édition incrémentale) |
| `bm_read` | lire une note, éventuellement par section / plage de lignes |
| `bm_search` | recherche classée (`ranked_search.py`, ~660 lignes — le plus gros) |
| `bm_context` | **traversée de graphe** depuis un point `memory://` → charge le contexte |
| `bm_recent` | activité récente (timeline) |
| `bm_move` / `bm_delete` | déplacer / supprimer notes ou répertoires |
| `bm_list` / `bm_find` | lister / trouver des fichiers |
| `bm_project` / `bm_project_delete` | gérer les projets (espaces de notes isolés) |
| `bm_schema` | valider / inférer / diff un schéma de `type` de note |
| `bm_man` | manuel intégré (`man/man1,3,7`) |

Middlewares FastMCP notables : `MissingProjectMiddleware` (exige un projet actif),
`EmptyListResultMiddleware`, `MCPClientInfoMiddleware`, et une **visibilité conditionnelle**
de `bm_project_delete` (masqué par tag selon le contexte — garde-fou destruction).

---

## 7. La stack de recherche (plus riche qu'attendu)

`src/basic_memory/repository/` (~19 600 lignes, le plus gros package) implémente plusieurs
backends derrière une interface commune (`search_repository_base.py`) :

- **Full-text** : `sqlite_search_repository.py` (FTS5 SQLite en local) vs
  `postgres_search_repository.py` (FTS Postgres en cloud) — même requête logique, deux dialectes.
- **Vectoriel / sémantique** : `sqlite_vec_index.py`, `pgvector_index.py`, `milvus_index.py` ;
  providers d'embeddings pluggables (`fastembed_provider.py` local, `openai_provider.py`,
  `litellm_provider.py`) + **reranking** (`*_rerank_provider.py`). Chunking sémantique
  (`semantic_chunking.py`) et une passe de sync des vecteurs différée/shardée
  (`vector_sync_deferred_at` sur `Entity`).
- **Temporel** : filtres de temps valide (`temporal_filters.py`, `memory_time_index_repository.py`)
  → requêter « ce qui était vrai à telle date ».

Donc : recherche lexicale + sémantique + rerank + filtrage temporel, le tout portable
SQLite↔Postgres. L'abstraction repository est ce qui permet cette portabilité.

---

## 8. Ce qui vaut le coup d'être repris (leçons d'ingénierie)

1. **Source de vérité = fichiers plats ; DB = cache reconstructible.** Robuste, versionnable
   (git), et ça désamorce le lock-in. Le pattern « projection reconstructible sous generation
   fence » est propre et testable.
2. **Commentaires qui expliquent le *pourquoi*, pas le *quoi*.** Chaque décision non évidente
   (cascade asymétrique, préfixe de permalink, octets nuls Postgres) est justifiée avec le n° de
   ticket. C'est de la doc de design in-situ — rare et précieux.
3. **Abstraction par repository** pour supporter 2 bases + 3 moteurs vectoriels sans dupliquer la
   logique métier.
4. **Garde-fous de sécurité pensés tôt** : opt-out d'extraction sémantique sur contenu non fiable,
   masquage de l'outil de suppression, redaction (`redaction.py`), politique YAML (`yaml_policy.py`).

**Angles fragiles à surveiller si tu forkes** : la cohérence FS⇄DB sous concurrence
(`indexing/` est dense) et la synchro vectorielle différée/shardée (état réparti entre
`vector_sync_deferred_at` et les manifestes — un seul writer autorisé).

---

## 9. Pour reproduire / explorer toi-même

```bash
# tourne le source
cd basic-memory && uv sync && bm --help
bm sync           # (re)construit la DB depuis les .md
bm mcp            # lance le serveur MCP (à brancher dans ta config MCP)
```

Fichiers à lire en priorité, dans l'ordre :
1. `src/basic_memory/models/knowledge.py` — le modèle (tout découle de là)
2. `NOTE-FORMAT.md` + `src/basic_memory/markdown/entity_parser.py` — le langage
3. `src/basic_memory/mcp/tools/` — la surface publique
4. `src/basic_memory/indexing/` — le moteur de synchro (le plus dur)
