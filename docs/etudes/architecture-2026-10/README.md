# Architecture v1 : comment Leon est construit

13 octobre 2026 · David (avec Claude) · à relire par Amos

Annexes : [cahier des besoins](annexes/00-besoins.md) validé le 12/10, six rapports de recherche (un par composant) et le rapport connecteurs dans [`annexes/`](annexes/), et la [critique croisée](annexes/08-critique-croisee.md) qui a fait bouger les recommandations. Cette page est la synthèse : ce qu'on construit, avec quoi, et pourquoi.

## La question

Le cahier des besoins fixe le produit : une mémoire unifiée pour des équipes de 5 à 100 personnes, qui capte d'abord les conversations LLM (outils de code et chat web), puis les outils métier, trie et organise seule, respecte les droits des sources, se lit via MCP, un briefing injecté, l'interface et un petit chatbot de recherche, hébergée en Europe. La contrainte de David : **utiliser ce que les gens utilisent aujourd'hui**, pour être à jour, efficaces, et bien servis par les agents IA de code. Le coût IA n'est pas une contrainte de conception.

Six agents ont cherché en parallèle, un par composant, puis chacun a critiqué les cinq autres. Les désaccords et ce qu'ils ont changé sont dans l'annexe 8.

## La réponse courte

1. **Un monorepo TypeScript, une exception Rust.** Interface Next.js, API + ingestion + serveur MCP en Hono, extension navigateur en WXT, et un agent local en Rust réduit à une feuille sans logique métier. Un seul langage du schéma à l'extension pour deux fondateurs ; Rust seulement là où un démon de 10 Mo sans runtime compte.
2. **Une seule base : Postgres managé en Europe.** Faits sourcés, datés (bi-temporels), avec droits **par fait** appliqués par RLS. Pas de graphe, pas de base vectorielle à part : pgvector et le plein texte natif sont des index. La fiche Markdown est rendue à la lecture, jamais stockée.
3. **Un pipeline à six étapes, Postgres comme journal.** Filtre mécanique, triage Haiku, extraction Sonnet avec citation littérale obligatoire, résolution d'entités (clés dures, puis candidats, puis juge, puis question humaine), rangement par un agent Opus, résumés. Un job pg-boss par étape, état en tables.
4. **La règle n°1 : l'ACL d'un fait = l'intersection des droits de ses preuves.** Remontée indépendamment par quatre agents sur six. Par défaut un fait appartient à son auteur ; seuls les faits classés « partageables » s'élargissent à l'équipe ; tout dérivé (résumé, embedding, briefing) porte l'ACL la plus restrictive de ses entrées.
5. **La capture est un produit, pas un script.** Six formats sans contrat (trois fichiers locaux, trois interfaces web). Sa santé est visible dans l'interface, alertée chez nous sous 24 h, testée chaque jour sur des comptes canari.

## 1. Les quatre composants

| Dossier | Rôle | Techno | Pourquoi |
|---|---|---|---|
| `apps/web` | Interface : arborescence, fiches, faits sourcés, droits, « à vérifier », chatbot de recherche | Next.js 16, shadcn/ui (Radix), Tailwind 4 | Ce que les équipes comparables utilisent ; agents IA de code très à l'aise dessus |
| `apps/api` | API, webhooks des connecteurs, réception de l'agent et de l'extension (`/v1/ingest`), pipeline, **serveur MCP** | Hono, SDK MCP TypeScript v2 (adaptateur Hono), Drizzle | Un seul processus serveur, un seul serveur OAuth |
| `apps/extension` | Capture claude.ai, chatgpt.com, Gemini ; panneau de briefing | WXT (Manifest V3, un code pour Chrome, Edge, Firefox, Safari) | Plasmo n'a plus de mainteneur, CRXJS est Chromium seulement |
| `apps/agent` | Démon sur chaque poste : capture Claude Code, Codex, Cursor ; hooks de briefing ; CLI `leon` | **Rust**, binaire unique | 10 à 30 Mo de RAM, pas de runtime, signature propre ; Node packagé pèse 50 à 90 Mo. Repli nommé : `bun build --compile` si aucun fondateur ne veut porter du Rust |
| `packages/capture` | **Compréhension des formats**, une seule fois, avec fixtures par version d'éditeur | TypeScript | L'agent envoie des `Turn` bruts ; le serveur absorbe les ruptures de format |
| `packages/db` | Schéma, migrations SQL écrites à la main, politiques RLS | Drizzle + SQL | Drizzle ne déclare ni `EXCLUDE USING gist` ni la RLS proprement |

Outillage : pnpm + Turborepo, Node 24 LTS, Better Auth (organisations, SSO Google / Microsoft, et le plugin MCP qui fait de Leon le serveur OAuth 2.1 de Claude, ChatGPT et Cursor). Chiffres d'adoption et alternatives écartées : [annexe 6](annexes/06-stack.md).

## 2. Stockage et modèle de mémoire

Postgres 17 managé en Europe, schéma partagé entre clients, isolation par **RLS par client et par fait**. Extensions standard seulement (`vector`, `btree_gist`, `pg_trgm`, `ltree`) pour rester portable entre Neon Francfort, Supabase et Scaleway. Détail et schéma complet : [annexe 1](annexes/01-stockage.md).

Tables clés :
- `sources` : mail, page Notion, conversation, réunion… avec hash et ACL d'origine.
- `turns` : messages bruts reçus de l'agent et de l'extension, avec `capture_mode` (`network` ou `dom`), ids du fournisseur.
- `card_types` : le socle (clients, projets, personnes, décisions, règles, fournisseurs ; `tenant_id` NULL) et les types **dérivés par entreprise** (`parent_slug`, statut `proposed` ou `validated`). On dérive, on ne mute jamais : l'arborescence et le tri restent stables.
- `predicates` : catalogue par type, avec `single_valued` (un montant de contrat) ou multi-valué (une décision).
- `cards` : la fiche, avec un embedding de résumé pour `search`.
- `facts` : `card_id`, `predicate`, `value`, **`quote` obligatoire**, `source_span`, `valid_from` / `valid_to` (temps réel), `recorded_at` (temps système), `superseded_by`, statut (`active`, `superseded`, `conflict`), `confidence`, **`acl`**. Contrainte `EXCLUDE USING gist` sur (fiche, prédicat, validité) pour les prédicats mono-valués : jamais deux valeurs actives en même temps.
- `mentions` : les entités citées non encore résolues (« Marie », « le syndic ») avec indices, rattachées à une fiche quand elles sont résolues.
- `merges` : chaque fusion d'entités, journalisée, **réversible**.
- `read_log` : qui (humain ou assistant) a lu quelle fiche.

Trois choses à savoir, découvertes en recherche :
- l'extension `periods` s'arrête à PG15 et les contraintes temporelles natives de PG18 n'existent que chez Neon : d'où `EXCLUDE USING gist`, disponible partout ;
- `pg_search` (ParadeDB) est AGPL : on reste sur `tsvector` + `pg_trgm` ;
- `SET LOCAL app.tenant` doit vivre dans une transaction, sinon le pooler fuit le client entre requêtes. Scale-to-zero désactivé (l'OAuth MCP impose 10 s).

La fiche Markdown est produite par `render_card(card, as_of)`, **exécutée avec le rôle du lecteur**, jamais en `SECURITY DEFINER`. Le Markdown n'est pas la source de vérité, c'est une vue. L'onglet « brut » de l'interface montre exactement ce que `fetch` renvoie au LLM.

## 3. Le pipeline d'ingestion et l'agent d'organisation

C'est le cœur et le risque n°1. Détail, modèles, formats et jeu de test : [annexe 2](annexes/02-pipeline.md).

Un job **pg-boss** par étape, état et sorties en tables (`ingest_runs`, `fact_candidates`), clé d'idempotence (source, id externe, version). La durabilité est une discipline de schéma, pas un framework. Temporal Cloud Francfort si ça déborde.

| Étape | Qui | Ce qui sort |
|---|---|---|
| 0. Filtre mécanique | Agent local (règles structurelles) puis serveur en défense | Les 91 % de bruit d'outils retirés sans IA |
| 1. Triage | Haiku | Catégorie, langue, et **`partageable` ou `sensible`** (liste fermée : RH, rémunération, juridique, santé, perso) |
| 2. Extraction | Sonnet, sorties structurées strictes | `fact_candidates` : prédicat, valeur, **mentions** (pas d'identités), **citation littérale vérifiée dans la source**, sinon rejet |
| 3. Résolution d'entités | Déterministe puis LLM | Clés dures d'abord (email, domaine, ids Notion / Linear / GitHub / HubSpot) ; candidats par embeddings + plein texte ; juge LLM par paire. **Fusion automatique seulement sur clé dure** ; sinon question « même personne ? » dans l'interface. Jamais de fusion automatique entre deux emails différents |
| 4. Rangement + contradictions | Agent Opus avec outils (tool runner de l'API Messages) | Choix de la fiche et du type ; si ≥ 5 faits ne rentrent nulle part, création d'un type dérivé marqué `proposed`. Contradiction jugée **dans le même job** (même fiche, même prédicat), qualifiée `supersedes` ou `contradicts`, puis INSERT avec `superseded_by` ou statut `conflict`. Jamais tranchée en silence |
| 5. Résumés | Rendu déterministe par défaut ; LLM seulement sur les faits visibles par tous | Le résumé d'une fiche ne contient jamais un fait restreint |

Ce qui se mesure dès le premier jour : un jeu d'or (sessions, pages, issues annotées à la main), précision et rappel de l'extraction, taux de fausses fusions et de fusions manquées, faits corrigés par l'humain, temps de traitement par étape.

## 4. Les droits : la règle n°1

Quatre agents sur six ont remonté le même risque, chacun par un angle différent : élargir à l'équipe les faits tirés d'une conversation LLM fait fuir un licenciement discuté dans Claude Code, un fichier lu dans un dépôt privé, un mail collé. C'est la perte de confiance en 30 secondes, et aucun pipeline ne la rattrape.

Les règles, toutes vérifiées en CI :
1. **L'ACL d'un fait = l'intersection des ACL de ses preuves**, calculée à l'extraction et stockée avec la citation. Jamais celle de la conversation.
2. **Par défaut, un fait appartient à son auteur.** Seuls les faits classés `partageable` s'élargissent à l'équipe. Les `sensible` attendent une validation dans l'interface.
3. **Tout dérivé porte l'ACL la plus restrictive de ses entrées**, ou n'est construit que sur des faits visibles par tous : résumés, alias, embeddings de fiche, briefing, résumé d'entité donné au juge de fusion.
4. **Les entités non confirmées restent hors de l'arborescence partagée.**
5. **Tests allow / deny** (pgTAP) par table, par outil MCP, par surface de lecture (fetch, search, briefing, chatbot, interface), avec un cas rouge automatisé : « un fait visible par Paul seul n'apparaît jamais pour Marie ».

## 5. La capture

### Agent local (Rust)
Un binaire `leon` : démon, CLI (`status`, `pause`, `preview`, `exclude`, `hooks install`, `update`), hook de briefing. Il surveille les fichiers, découpe par session, retire mécaniquement les corps de `tool_result`, `thinking`, `attachment`, `checkpointId`, et expédie les lignes `user` / `assistant` brutes vers `/v1/ingest`. Il ne comprend pas les formats : `packages/capture` le fait, une seule fois.

Sources, vérifiées sur une vraie machine ([annexe 3](annexes/03-agent-local.md)) :
- Claude Code : `~/.claude/projects/<cwd>/<uuid>.jsonl`, effacés après 30 jours ; texte utile 4 à 9 % du volume.
- Codex : `~/.codex/sessions/…/rollout-*.jsonl`, désormais aussi `.jsonl.zst` + index SQLite.
- Cursor : `state.vscdb` (clés `composerData:`, `bubbleId:` ; les `checkpointId:` font 75 % du poids). **Les hooks Cursor (`afterAgentResponse`, `beforeSubmitPrompt`) livrent le texte proprement et sont la voie principale ; la SQLite n'est qu'un rattrapage d'historique.**

Distribution : pkg notarisé + LaunchAgent (macOS), MSI signé (Windows), deb / rpm + `systemd --user` (Linux), Homebrew ; auto-update par manifeste signé ; jeton dans le trousseau du système (Keychain, Credential Manager, Secret Service). Pas de native messaging en V1.

### Extension navigateur (WXT)
- **Capture par interception réseau** sur claude.ai et chatgpt.com : clone du flux de réponse, messages structurés avec rôles et ids, citations exactes. **DOM sur Gemini** (format opaque), observateur DOM léger en secours partout. Sélecteurs et motifs d'URL **servis par Leon en JSON** : on corrige sans republier.
- Jamais d'appel aux API privées des sites avec les jetons de l'utilisateur (technique des extensions malveillantes de 2025, traquée par les stores).
- **HTTPS direct vers `/v1/ingest`**, même device flow que l'agent. Chaque message porte `capture_mode`, `provider_conversation_id`, `provider_message_id`. Les citations `dom` sont traitées comme approximatives, confiance réduite.
- Briefing : panneau latéral en lecture + « copier ». Zéro écriture dans la page en V1.
- Chrome + Edge d'abord, Firefox ensuite (consentement intégré et dépôt du source), Safari en dernier. Clients Enterprise : API de conformité Claude / OpenAI à la place. Détail et politiques des stores : [annexe 4](annexes/04-extension.md).

### Santé de capture = fonction produit
« Dernier message capté » par source et par poste dans l'interface et sur le badge de l'extension ; alerte chez nous quand le volume d'une source chute par version de parseur ; comptes canari testés chaque jour sur les trois sites ; fixtures par version d'éditeur en CI.

## 6. La lecture

Détail des hôtes, outils, auth et distribution : [annexe 5](annexes/05-mcp.md).

- **Serveur MCP** dans `apps/api`, SDK TypeScript v2, transport Streamable HTTP, OAuth 2.1 par utilisateur via Better Auth (DCR, CIMD à contribuer), droits appliqués par la RLS de la session (`SET LOCAL app.principals`). Quatre outils : `search(query, type?, since?…)`, `fetch(id, section?, as_of?)` (fiche ou fait, écrit `read_log`), `briefing()`, `remember(text, about?)` qui dépose dans la file d'ingestion avec le texte comme citation. Noms littéraux `search` / `fetch` imposés par ChatGPT. Réponses en Markdown + `structuredContent`, fiche ≤ 600 tokens. Pas d'outil `tree` : `search(type=…)` suffit.
- **Briefing injecté** : garanti seulement par hooks `SessionStart` sur les postes dev (Claude Code, Codex, Cursor, Gemini CLI), posés par `leon hooks install`, lus dans le cache du démon (≤ 3 000 caractères, jamais d'appel bloquant au démarrage). Sur claude.ai et ChatGPT, pas de hook : l'outil `briefing` + les server instructions, et le panneau de l'extension.
- **Chatbot de recherche** dans l'interface : pas d'agent, recherche hybride sur les faits + réponse avec citations natives de l'API Claude, « je ne trouve pas » forcé par seuil de pertinence.
- **Distribution** : annuaire Claude (connecteur + plugin) et **ChatGPT Directory**, parce que les serveurs MCP personnalisés y sont réservés aux plans Business / Enterprise / Edu : l'annuaire est le seul accès pour les employés en Plus ou Pro. `leon setup` configure Claude Code, Codex, Cursor et Gemini CLI en une commande.

## 7. Les connecteurs

Codés maison, dans l'ordre du [rapport connecteurs](annexes/07-connecteurs.md) : ceux sans procédure externe d'abord.

1. Notion (OAuth public, sans revue).
2. Linear (OAuth + webhooks ; Jira en deuxième vague).
3. GitHub (GitHub App, sans revue). Avec 1 + 2 + 3, une équipe dev est couverte.
4. Google Workspace : Gmail + Drive + Agenda. **Audit CASA Tier 2 à lancer dès le jour 1** (4 à 8 semaines, un seul audit pour les trois périmètres).
5. HubSpot (OAuth public, sans revue).

Slack et Teams exclus au début (conditions d'API). Nango à partir du sixième connecteur, pas avant.

## 8. Hébergement

Pour démarrer : Vercel région Francfort (`fra1`, à forcer : la région par défaut est aux États-Unis) pour l'interface, Fly.io Francfort pour l'API et les workers, Neon Francfort pour Postgres. Claude via Bedrock UE. Quand un client exige du souverain : Hetzner + Coolify ou Scaleway Paris, sans changer le code (extensions Postgres standard, Docker partout).

Pièges vérifiés : Railway n'a qu'Amsterdam en UE ; Inngest est SSPL sans région UE documentée ; Sentry UE garde les comptes et les journaux d'audit aux États-Unis.

## 9. Les arbitrages faits dans cette synthèse

- **pg-boss plutôt qu'Inngest.** Les deux agents ont échangé leurs positions en critique croisée (le pipeline a cédé à pg-boss, la stack à Inngest). Tranché pour pg-boss + tables d'état : zéro pièce d'infra en plus, Temporal en porte de sortie.
- **Rust pour l'agent, accepté à une condition** : feuille sans logique métier, contrat `Turn` en JSON Schema unique, généré côté Rust et validé côté Hono. Surface visée < 5 000 lignes, figée en quelques semaines.
- **Pas de native messaging, pas d'injection dans la page** en V1 : l'extension parle au serveur en direct, le briefing se copie.
- **Un seul serveur OAuth** (Better Auth). `mcp-handler` de Vercel écarté : adaptateur Next.js, hors sujet dès que le MCP vit dans Hono.

## 10. Les risques

1. **La fuite de droits** (section 4). Le seul qui tue le produit. Couvert par construction et par tests.
2. **La capture qui meurt en silence** (section 5). Couvert par la santé de capture comme fonction produit.
3. **La fausse fusion d'entités.** Couvert par « fusion automatique seulement sur clé dure », la question humaine et la défusion journalisée.
4. **Le périmètre** : quatre surfaces (agent, extension, SaaS, MCP) pour deux personnes. Pas couvert par l'architecture ; c'est une question de planning.

## Ce qui n'est pas dans cette étude

Le design visuel de l'interface, le nom, le prix, le pilote, la deadline, et le plan de construction (dans quel ordre on code les composants). Ce dernier est l'étape suivante.

## Limites de la recherche

Les agents ont travaillé avec un budget de recherche web limité (épuisé en cours de route pour quatre d'entre eux) : ils ont lu les pages officielles en direct, mais n'ont pas pu vérifier la stack de Linear, Attio, Granola ni de la promo YC S26. Les points non vérifiés sont listés à la fin de chaque annexe. Aucun composant n'a été prototypé : la prochaine étape est de faire tourner le pipeline sur de vraies sessions Claude Code.
