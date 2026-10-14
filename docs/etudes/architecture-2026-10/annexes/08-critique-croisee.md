# Annexe 8 : critique croisée

12 octobre 2026. Après avoir rendu son rapport, chaque agent a lu les cinq autres et répondu en 350 mots : où ils le contredisent, ce qu'il change, le risque n°1 de l'ensemble. Voici ce qui a bougé, par agent, et les désaccords tranchés dans la synthèse.

## Stockage (annexe 1)

**Cédé.** Cinq corrections au schéma, imposées par le pipeline et le MCP : catalogue `predicates(slug, single_valued)` avec `EXCLUDE … WHERE single_valued` seulement (un prédicat « décision » est multi-valué, la contrainte initiale aurait cassé l'ingestion) ; tables `mentions` (entités non résolues, `card_id` NULL) et `merges` (défusion journalisée) ; `facts.quote NOT NULL` ; `card_types.status proposed | validated` ; embedding de résumé sur `cards` pour `search` ; UUIDv7 ; migrations en SQL (Drizzle n'a ni `tstzrange` ni `EXCLUDE`).

**Maintenu.** Une seule base, RLS par fait, bi-temporel en colonnes, pas de graphe ni de base vectorielle, Markdown rendu à la lecture.

**Risque n°1.** La fuite de droits par la fiche : une fiche partagée agrège des faits aux ACL différentes ; `render_card` en `SECURITY DEFINER` ou une fusion erronée sert à tous un fait réservé. Réduction : rendu sous le rôle du lecteur, entités non confirmées hors de l'arbre partagé, tests pgTAP allow / deny par table et par outil MCP, test de non-fuite du `app.tenant` sous pooler.

## Pipeline (annexe 2)

**Cédé.** Inngest abandonné (SSPL, pas de région UE) pour pg-boss avec un job par étape et l'état en tables Postgres. Le `Fact` à mentions est un format intermédiaire (`fact_candidates`), pas la table : citation vérifiée dans le chunk → offsets → résolution → rangement **et** jugement de contradiction dans le même job, puis INSERT (la contrainte EXCLUDE force à trancher avant). Création de type immédiate par l'agent, marquée « proposé » (la validation humaine préalable bloquait des faits). Le filtre mécanique est en grande partie côté poste ; le serveur le garde en défense en profondeur. Résumé déterministe par défaut, résumé LLM seulement sur les faits visibles par tous.

**Maintenu.** Multi-étapes, mentions sans identités, citation obligatoire, clés dures → candidats → juge → question humaine, jamais de fusion automatique entre emails différents, contradictions comparées dans la même fiche et le même prédicat, jeu d'or dès le jour 1.

**Risque n°1.** La fuite de droits **par artefact dérivé** : tout le monde a mis la sécurité dans la RLS sur `facts`, mais résumés, alias, embeddings, briefing et résumé d'entité donné au juge sont écrits par un LLM qui a vu des faits restreints. Réduction : un dérivé porte l'ACL la plus restrictive de ses entrées ou n'est construit que sur des faits « tous » ; cas rouge automatisé par surface.

## Agent local (annexe 3)

**Cédé.** Plus de native messaging en V1 : l'extension parle au serveur en direct (la moitié des utilisateurs n'auront pas l'agent). L'agent s'amincit : il surveille, découpe par session, retire le bruit par trois règles structurelles par source, expédie les lignes brutes ; la compréhension des formats vit une seule fois côté serveur, en TypeScript, avec les fixtures. Le hook de briefing lit un cache du démon, pas un appel REST bloquant.

**Maintenu.** Rust pour le démon permanent (empreinte, signature sans entitlements JIT) ; repli nommé `bun build --compile` si aucun fondateur ne veut porter du Rust. Hooks Cursor comme voie principale, SQLite en rattrapage. Trousseau système, distribution signée, auto-update signé.

**Risque n°1.** La capture meurt en silence : cinq sources sans contrat, une rupture passe inaperçue des semaines, le client conclut que Leon « n'apprend rien ». Réduction : battement par source et par poste visible dans l'interface, alerte sous 24 h, télémétrie des erreurs de parsing, fixtures par version en CI.

## Extension (annexe 4)

**Cédé.** Plus de bouton d'insertion dans la zone de saisie en V1 : panneau latéral en lecture + « copier ». Chaque message envoyé porte `capture_mode` (`network` ou `dom`), `provider_conversation_id`, `provider_message_id` ; le pipeline traite les citations `dom` comme approximatives.

**Maintenu.** HTTPS direct vers `/v1/ingest` avec le même device flow que l'agent. Interception réseau sur claude.ai et chatgpt.com, DOM sur Gemini.

**Signalé.** Le canal MCP seul n'atteint ni Gemini, ni ChatGPT Plus, ni les non-propriétaires sur Claude Team : sans l'extension, ces gens n'ont pas de briefing.

**Risque n°1.** Six formats sans contrat dont la casse est silencieuse. Réduction : santé de capture dans le produit, alertes par source et version de parseur, comptes canari quotidiens, `packages/capture` partagé, configuration JSON distante.

## MCP (annexe 5)

**Cédé.** `mcp-handler` de Vercel abandonné (adaptateur Next.js) pour l'adaptateur Hono du SDK v2, dans `apps/api`. Un seul serveur OAuth : le plugin MCP de Better Auth. `fetch(id, section?, as_of?)` accepte un id de fiche ou de fait et écrit `read_log` ; le filtre de droits est la RLS, plus forte que le pré-filtre initial. Codex ajouté aux hôtes à hooks. Le bouton de l'extension est compatible avec le refus de l'injection automatique.

**Maintenu.** Quatre outils, noms littéraux `search` / `fetch`, consignes dans la skill et les server instructions (jamais dans les descriptions, motif de rejet à l'annuaire Claude), chatbot sans agent, Opus en effort faible.

**Risque n°1.** L'élargissement à « tous » des faits tirés d'une conversation LLM : une session sur un licenciement ou un salaire devient lisible par l'équipe. Réduction : ACL par défaut = auteur, classification `partageable | sensible` au triage avec liste fermée, test de non-régression sur les trois chemins de lecture.

## Stack (annexe 6)

**Cédé.** pg-boss ne fait pas d'étapes rejouables avec résultats mémorisés ; l'agent a proposé Inngest auto-hébergé. Rust accepté pour l'agent à condition qu'il soit une feuille avec un contrat `Turn` en JSON Schema. Migrations SQL écrites à la main dès le jour 1. `mcp-handler` retiré.

**Maintenu.** TypeScript partout ailleurs, Next.js 16, Hono, Drizzle, Better Auth, shadcn / Radix, Vercel `fra1` + Fly Francfort + Neon Francfort, connecteurs maison.

**Risque n°1.** La fuite de droits par construction : une session Claude Code contient des fichiers lus dans un dépôt privé, un mail collé, un document Drive. Réduction : ACL d'un fait = intersection des ACL de ses preuves, calculée à l'extraction ; aucun fait sans preuve n'entre. Risque n°2 : quatre surfaces pour deux personnes.

## Les désaccords tranchés dans la synthèse

| Sujet | Positions | Décision |
|---|---|---|
| Orchestration | Pipeline → pg-boss ; Stack → Inngest (les deux ont échangé leurs positions) | **pg-boss + tables d'état.** Zéro infra en plus ; Temporal en porte de sortie |
| Langage de l'agent | Agent → Rust ; Stack → TypeScript | **Rust**, feuille sans logique métier, contrat JSON Schema, repli `bun compile` |
| Native messaging | Agent → oui ; Extension → non | **Non** en V1 |
| Injection du briefing par l'extension | Extension → bouton d'insertion ; MCP → non | **Panneau + copier**, pas d'écriture dans la page |
| Serveur MCP | MCP → `mcp-handler` ; Stack → Hono + Better Auth | **Hono + SDK v2 + Better Auth**, un seul serveur OAuth |
| Validation des nouveaux types de fiches | Pipeline → humain avant usage ; Stockage → immédiat, marqué proposé | **Immédiat, marqué proposé** |

## Ce que la critique a fait apparaître que personne n'avait vu seul

La fuite de droits. Chaque rapport pris isolément était « sûr » : RLS sur les faits, droits hérités des sources, faits partagés. C'est la confrontation qui a montré que l'élargissement à l'équipe (stockage), les résumés et embeddings écrits par un LLM (pipeline), les fichiers privés lus dans une session de code (stack) et le briefing (MCP) ouvraient quatre chemins de fuite différents. D'où la règle unique de la section 4 de la synthèse.
