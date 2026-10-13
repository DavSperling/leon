# Premier jet de Leon : spec

13 octobre 2026 · Amos (avec Claude) · à relire par David

Base : l'[architecture v1](https://github.com/DavSperling/leon/pull/5) de David (PR #5) et l'[étude concurrents](https://github.com/DavSperling/leon/pull/4) (PR #4). Cette spec dit ce que le premier jet construit, ce qu'il reporte, et où il s'écarte de l'architecture.

## Le but

Prouver la boucle complète sur nos propres postes : une conversation LLM entre dans Leon, en ressort en faits sourcés et datés avec des droits par fait, et se relit dans l'interface et depuis Claude Code via MCP. Démo visée : **une info dite à ChatGPT ou à claude.ai, retrouvée dans Claude Code** (étude concurrents, « ce que ça implique pour les pilotes »).

Critères de succès :
1. `docker compose up -d`, `pnpm db:migrate`, `pnpm dev` : l'app démarre ; l'inscription crée une organisation.
2. `pnpm leon import-claude-code` envoie des sessions Claude Code ; avec une vraie clé API, le pipeline produit des fiches avec des faits cités.
3. L'extension chargée dans Chrome capte un échange sur claude.ai et sur chatgpt.com ; il apparaît dans la page Sources et passe dans le pipeline.
4. Claude Code branché sur `http://localhost:3000/api/mcp` avec un jeton personnel retrouve un fait par `search` puis `fetch`.
5. Tests verts, dont la matrice de droits : **un fait visible par Paul seul n'apparaît jamais pour Marie**, ni dans `fetch`, ni dans `search`, ni dans le briefing, ni dans l'interface.

## Les principes de code

- **Monolithe.** Une seule app serveur (Next.js, Hono embarqué) et l'extension, seul second artefact parce qu'elle tourne dans le navigateur.
- **Simple.** Pas d'abstraction sans deuxième usage, pas de couche « au cas où ». Fonctions courtes, noms explicites, un fichier = une responsabilité. YAGNI.
- **Typé de bout en bout.** TypeScript strict, zod aux frontières (API, LLM, env).
- **Testé là où ça casse.** Tests unitaires sur les parseurs et les règles ; tests d'intégration sur un vrai Postgres pour les droits et le pipeline ; faux client LLM dans les tests.

## Ce qu'on garde de l'architecture

TypeScript, Node 24+ (Node 26 en local), pnpm. Next.js 16 (App Router), shadcn/ui sur Radix, Tailwind 4. Hono pour l'API et le MCP, monté dans Next.js. Postgres 17 (image `pgvector/pgvector:pg17`) avec RLS par fait, temps bi-temporel, `EXCLUDE USING gist`. Drizzle pour les requêtes, migrations SQL écrites à la main. pg-boss pour le pipeline. Better Auth pour les comptes et les organisations. SDK MCP TypeScript officiel, transport Streamable HTTP. SDK Anthropic, modèles Claude 5.5 (Haiku au triage, Sonnet à l'extraction, Opus au rangement). WXT pour l'extension.

## Ce qui s'écarte de l'architecture, et pourquoi

| Architecture v1 | Premier jet | Pourquoi |
|---|---|---|
| Monorepo `apps/web`, `apps/api`, `apps/worker`, `packages/*` | Une app à la racine + `extension/` | Monolithe demandé ; un seul process à lancer et à déployer |
| Hono comme serveur à part | Hono monté dans une route catch-all de Next.js | Garde Hono pour l'API et le MCP, sans second serveur |
| Worker pg-boss séparé | Worker démarré dans le process Next.js (`instrumentation.ts`) | Un seul process ; se sépare plus tard sans changer le code des étapes |
| Agent local en Rust | Commande TypeScript `leon import-claude-code`, même contrat `Turn` | Prouver le pipeline d'abord ; le démon Rust remplacera la commande sans changer le serveur |
| Six étapes, un job par étape | Trois jobs : triage, extraction, rangement (la résolution d'entités déterministe est la première moitié du rangement) | La résolution et le rangement ont besoin du même contexte ; une table d'état en moins |
| Rangement par un agent Opus avec outils | Un appel Opus à sortie structurée, avec les fiches candidates dans le prompt | Pas de boucle d'outils tant qu'un appel suffit |
| OAuth 2.1 MCP (Better Auth) | Jeton personnel en `Bearer` pour le MCP, l'import et l'extension | Suffit pour Claude Code ; l'OAuth vient avec claude.ai et ChatGPT |
| Recherche hybride avec embeddings | Plein texte (`tsvector` français + `simple`) et `pg_trgm` | Pas encore de fournisseur d'embeddings ; pgvector s'ajoute sans migration douloureuse |
| Résumés de fiche | Rendu Markdown déterministe seulement | Zéro coût, zéro risque de fuite par résumé |

## Reporté

Agent Rust, capture Codex, Cursor et Gemini, connecteurs (Notion d'abord), OAuth MCP et annuaires, embeddings, résumés LLM, chatbot de recherche, groupes autres que « l'équipe », configuration distante des sélecteurs de l'extension, capture DOM de secours, Firefox et Safari, déploiement, recherche à chaque prompt (hook `UserPromptSubmit`) et déduplication du contexte déjà injecté (comme claude-supermemory et codemem).

## Composants

```
src/app/                    pages Next.js (interface)
src/app/api/[[...route]]/   montage de Hono
src/server/api/             routes Hono : auth, /v1/ingest, /v1/briefing, /mcp
src/server/auth/            Better Auth, jetons personnels
src/server/db/              schéma Drizzle, client, withTenant, migrations SQL
src/server/pipeline/        triage, extraction, rangement, file pg-boss
src/server/llm/             client Anthropic, modèles, faux client pour les tests
src/server/memory/          rendu de fiche, recherche, briefing, actions « à vérifier »
src/server/mcp/             serveur MCP et ses quatre outils
src/capture/                contrat Turn, parseur Claude Code, masquage des secrets (partagé avec l'extension)
src/cli/                    commande leon
extension/                  extension WXT
```

L'interface appelle `src/server/memory` directement (composants serveur et server actions) ; Hono expose le même code aux clients externes (import, extension, MCP).

## Les droits : la règle n°1

Reprise telle quelle de l'architecture, section 4.

- **Tenant** = organisation Better Auth. **Principals** d'un utilisateur = son id + l'id de son organisation (le principal « équipe »). Pas d'autres groupes dans ce jet.
- **Une conversation brute reste privée à son auteur** : `sources` et `turns` ont l'ACL `{auteur}`.
- **ACL d'un fait** = intersection des ACL de ses preuves, calculée à l'extraction. Un fait n'a qu'une preuve dans ce jet. Pour une conversation LLM : `partageable` → `{équipe}` ; `sensible` → `{auteur}` et statut « à valider » ; l'auteur peut le partager depuis « À vérifier ».
- **Une fiche** n'est visible que si le lecteur voit au moins un de ses faits (ACL de la fiche = union des ACL de ses faits, tenue à jour à l'insertion). Une entité ambiguë reste `non confirmée` : son ACL est `{auteur}` jusqu'à confirmation, donc ses faits ne remontent que pour lui.
- **Tout dérivé** (élément « à vérifier », briefing, rendu, journal) porte l'ACL la plus restrictive de ses entrées, ou se calcule à la lecture sous la RLS du lecteur.
- **RLS partout** sur les tables de données : `tenant_id = app.tenant AND acl && app.principals`. L'app se connecte avec un rôle sans `BYPASSRLS` ; `SET LOCAL app.tenant` et `app.principals` vivent dans une transaction, posés par un seul helper `withTenant`. Le worker passe par le même helper, avec les principals de l'auteur de la source : il ne voit que ce que l'auteur voit.
- **Tests allow / deny** sur chaque table et chaque surface de lecture, avec le cas rouge Paul / Marie.

## Le modèle de données

Toutes les tables de données portent `tenant_id` ; identifiants UUID.

- `api_tokens` : jeton personnel (`leon_…`), stocké haché (SHA-256), montré une fois, révocable. Pas de RLS (table d'authentification, lue par hash).
- `sources` : `kind` (`claude_code`, `claude_ai`, `chatgpt`, `mcp_remember`), `external_id`, `owner_user_id`, `title`, `acl`, `metadata`, `last_turn_at`. Unique par (`tenant_id`, `kind`, `external_id`).
- `turns` : `source_id`, `external_id`, `role` (`user` | `assistant`), `text`, `ts`, `capture_mode` (`file` | `network` | `dom` | `manual`), `acl`. Unique par (`source_id`, `external_id`) : l'envoi est idempotent.
- `ingest_runs` : un passage du pipeline sur un lot de tours (état, étape, erreur).
- `fact_candidates` : sortie de l'extraction (énoncé, prédicat, mentions, citation, offsets), `pending` | `rejected` | `placed`, avec la raison du rejet.
- `card_types` : socle (`tenant_id` NULL : client, projet, personne, décision, règle, fournisseur, produit, outil) et types dérivés proposés par l'agent (`parent_slug`, `status` = `proposed` | `validated`).
- `predicates` : catalogue par type, avec `single_valued`.
- `cards` : `type_id`, `title`, `status` (`confirmed` | `unconfirmed`), `merged_into`, `acl`.
- `card_aliases` : noms et clés dures (email, domaine) d'une fiche.
- `facts` : `card_id`, `predicate`, `statement`, `value`, **`quote` NOT NULL**, `source_id`, `turn_id`, offsets de la citation, `valid_from`, `valid_to`, `recorded_at`, `superseded_by`, `status` (`active` | `superseded` | `conflict` | `pending_review`), `sensitivity`, `single_valued` (copié du prédicat), `confidence`, `acl`. Contrainte `EXCLUDE USING gist (tenant_id WITH =, card_id WITH =, predicate WITH =, validity WITH &&) WHERE (status = 'active' AND single_valued)`.
- `review_items` : « À vérifier » : `kind` (`sensitive_fact`, `entity_match`, `proposed_type`, `conflict`), `payload`, `status`, `acl`.
- `read_log` : qui (personne et client : interface, claude-code…) a lu quelle fiche, quand.

## Le pipeline

Le filtre se fait à l'entrée ; ensuite trois jobs pg-boss (triage, extraction, rangement), état en tables, clé d'idempotence (source, tours). Chaque job tourne dans `withTenant` avec les principals de l'auteur.

1. **Filtre mécanique** (sans IA) : côté poste dans l'import et l'extension (on ne garde que le texte des tours `user` / `assistant`, jamais `tool_result`, `thinking`, pièces jointes, entrées d'outils), refait côté serveur en défense. Masquage des secrets (clés d'API, jetons) avant envoi et à la réception.
2. **Triage** (Haiku 5.5, sortie structurée) : y a-t-il quelque chose à retenir ? `partageable` ou `sensible` (liste fermée : RH, rémunération, juridique, santé, perso).
3. **Extraction** (Sonnet 5.5, sortie structurée stricte) : faits atomiques avec mentions (pas d'identités), prédicat du catalogue, dates, et **citation littérale vérifiée dans le tour source** ; sinon rejet. Calcul de l'ACL du fait.
4. **Rangement** : d'abord la résolution déterministe (clés dures : email, domaine ; candidats par similarité de nom parmi les fiches visibles de l'auteur ; fusion automatique seulement sur clé dure). Puis un appel Opus 5.5 à sortie structurée choisit la fiche (existante, nouvelle, ou ambiguë → `entity_match`), propose un type dérivé si rien ne colle, et qualifie chaque fait face aux faits actifs de la même fiche et du même prédicat : nouveau, doublon, `supersedes` (on ferme l'ancien) ou `contradicts` (les deux en `conflict` + élément « à vérifier »). Rien n'est tranché en silence, rien n'est effacé. Écriture dans une transaction.

Le rendu Markdown de la fiche se fait à la lecture, sous la RLS du lecteur : `renderCard(card, asOf)`, une ligne par fait, terminée par `[source, date]`.

## Les entrées

- `POST /api/v1/ingest` (jeton `Bearer`) : `{ source: { kind, external_id, title? }, turns: Turn[] }`, validé par zod, taille bornée, idempotent ; crée un `ingest_run` pour les nouveaux tours et lance le triage.
- `Turn` = `{ external_id, role, text, ts, capture_mode }`, défini une fois en zod dans `src/capture`, importé par l'extension. C'est le contrat que le futur agent Rust respectera.
- `pnpm leon import-claude-code [--project <chemin>] [--since <date>] [--dry-run]` : lit `~/.claude/projects/*/*.jsonl`, une source par session, un tour par ligne `user` / `assistant` (id = `uuid` de la ligne), ignore les sous-agents, masque les secrets, envoie par lots. `--dry-run` montre exactement ce qui partirait.
- `remember(text, about?)` (MCP) : dépose une source `mcp_remember` d'un tour, qui passe dans le pipeline comme le reste.

## L'extension (WXT)

- Manifest V3, Chrome et Edge. `host_permissions` limitées à `claude.ai`, `chatgpt.com` et l'URL du serveur Leon. Ni `tabs`, ni `cookies`, ni `webRequest`.
- **Capture par interception réseau** en monde MAIN à `document_start` : patch de `fetch`, `clone()` du flux SSE de réponse, un parseur par site (claude.ai, chatgpt.com). Le message de l'utilisateur vient du corps de la requête, la réponse du flux. Événement « tour terminé » vers le monde isolé, puis vers le service worker. Jamais d'appel aux API privées des sites avec les jetons de l'utilisateur.
- Le service worker met en tampon (`chrome.storage.local`) et envoie par lots à `/api/v1/ingest` (`capture_mode = network`, ids de conversation et de message du fournisseur).
- Consentement au premier lancement (divulgation visible, exigée par le Chrome Web Store), interrupteur par site, pause globale, fenêtres privées ignorées, masquage des secrets avant envoi.
- Popup : état (connecté, dernière capture par site, en attente d'envoi). Options : URL du serveur et jeton. Panneau latéral : briefing en lecture (`GET /api/v1/briefing`) avec un bouton « copier ». Aucune écriture dans la page.
- Parseurs testés sur des flux d'exemple ; la vraie vérification se fait à la main sur les deux sites.

## La lecture

- **Serveur MCP** sur `/api/mcp` (Streamable HTTP, jeton `Bearer`). Quatre outils aux noms littéraux : `search(query, type?, since?, limit?)`, `fetch(id, section?, as_of?)` (écrit `read_log`), `briefing()`, `remember(text, about?)`. Réponses en Markdown + `structuredContent`, fiche ≤ 600 tokens. Le contenu des sources est présenté comme des données, jamais comme des consignes.
- **Briefing** déterministe : fiches touchées sur 7 jours visibles par l'utilisateur, une ligne chacune, + nombre d'éléments à vérifier, ≤ 3 000 caractères. Il est servi par l'outil MCP `briefing`, par `GET /api/v1/briefing`, et injecté au démarrage de chaque session Claude Code par un hook `SessionStart` qui appelle `pnpm leon briefing`, sans attendre un appel MCP que le modèle peut oublier.
- **Interface** :
  - arborescence des fiches par type, façon éditeur de code ;
  - fiche : faits datés avec citation et source, contradictions signalées, onglet « Brut » (exactement ce que `fetch` renvoie au LLM) ;
  - À vérifier : faits sensibles à partager ou non, « même entité ? », types proposés, contradictions ;
  - Sources : santé de capture (dernier tour capté par source, état du pipeline) ;
  - Journal : qui, avec quel assistant, a lu quelle fiche ;
  - Réglages : jetons personnels, commande pour brancher Claude Code, réglage de l'extension.
- **Design** : minimaliste et dense, lisible par un dev comme par un dirigeant, inspiré de Qontext (arborescence, Markdown, sobriété) sans le copier. Direction définie avec la skill `ui-ux-pro-max` dans `docs/specs/2026-10-13-design.md`. Interface en français.

## La sécurité

- Les droits ci-dessus, vérifiés par tests.
- Jetons hachés, montrés une fois, révocables ; jamais dans les journaux.
- Validation zod de toutes les entrées, tailles bornées, erreurs sans fuite d'information.
- Sessions Better Auth (cookies `httpOnly`, `SameSite`) ; server actions protégées par la session.
- Pas de CORS ouvert : l'extension appelle le serveur depuis son service worker grâce à `host_permissions`.
- Pas de texte de conversation ni de secret dans les journaux.
- Masquage des secrets à l'entrée, en temps linéaire : il reconnaît des formes (clés connues, blocs PEM et PGP, mots de passe d'URL, en-têtes `Bearer`/`Basic`, affectations nommées comme `password=`). Un secret sans forme ni nom reste en clair dans le texte brut (de même, dans une URL web, un mot de passe non encodé qui commence par des chiffres suivis de `/`, `?` ou `#` est pris pour un port), qui reste privé à son auteur ; l'extraction rejette tout fait qui contiendrait un secret reconnu, pour que rien de tel ne devienne visible de l'équipe.
- Contenus des sources délimités dans les prompts (injection de prompt).
- Variables d'environnement validées au démarrage (zod) ; `.env.example` à jour ; aucun secret dans le dépôt.

## Les tests

- Vitest. Unitaires : parseur Claude Code, parseurs SSE, filtre, masquage, vérification de citation, calcul d'ACL, rendu.
- Intégration sur un vrai Postgres (base de test dédiée) : matrice de droits Paul / Marie par table et par surface, idempotence de l'ingestion, pipeline de bout en bout avec un faux LLM, outils MCP.
- Contrats d'exécution (`auditing-runtime-contracts`) : variables d'environnement lues ↔ `.env.example`, routes appelées ↔ routes déclarées, colonnes utilisées ↔ migrations, URL du serveur ↔ `host_permissions` de l'extension.

## Environnement local

Postgres dans Docker (Colima) sur `127.0.0.1:54329` (les ports 54321 à 54324 sont pris par un autre projet). Deux bases : `leon` et `leon_test`. Deux rôles : un propriétaire pour les migrations, `leon_app` sans `BYPASSRLS` pour l'app. Variables : `DATABASE_URL`, `DATABASE_URL_ADMIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY` (dans `.env.local`, jamais commitée), et pour la commande `leon` : `LEON_URL`, `LEON_TOKEN`.
