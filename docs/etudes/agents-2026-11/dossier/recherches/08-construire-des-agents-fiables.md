# 08 - Construire des agents fiables, sûrs et peu coûteux sur l'API d'Anthropic (TypeScript)

État des lieux au 19 novembre 2026. Nature des faits : « officiel » (doc ou page de l'éditeur), « tiers » (presse, blog), « déduit ». « Skill » = le skill claude-api chargé le 19 nov. 2026 (table de modèles « cached 2026-11-03 », officiel Anthropic, fichiers dans `shared/` et `typescript/claude-api/`). Les pages Anthropic en ligne n'ont pas pu être ouvertes (pas d'outil de lecture de page) : tout ce qui vient d'un résumé de recherche est marqué tiers.

Versions npm vérifiées le 19 nov. 2026 via https://registry.npmjs.org/NOM/latest (officiel) : `@anthropic-ai/sdk` 1.11.0 (Apache-2.0, publié le 19 nov. 2026 ; la 1.0.0 date du 21 oct. 2026), `@anthropic-ai/claude-agent-sdk` 0.3.329 (licence « voir README », pas open source classique), `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7, `@opentelemetry/api` 1.10.0, `@opentelemetry/sdk-node` 0.301.2, `@opentelemetry/semantic-conventions` 1.45.0, `promptfoo` 0.126.0, `langfuse` 3.39.2, `@langfuse/tracing` et `@langfuse/otel` 6.1.1, `braintrust` 3.44.0.

## 1. L'API : outils, sorties structurées, cache, lots, comptage, contexte long, MCP, SDK d'agents

### 1.1 Appel d'outils (officiel, skill)
- Point d'API unique : `POST /v1/messages`. Les outils sont dans `tools` ; le modèle répond `stop_reason: "tool_use"` avec des blocs `tool_use` ; on renvoie les `tool_result` dans UN seul message `user` (tous ensemble, sinon le modèle apprend à ne plus appeler en parallèle). Outil en échec : `tool_result` avec `is_error: true`.
- `strict: true` sur la définition de l'outil (au même niveau que `name`, `description`, `input_schema`, pas sur `tool_choice`) garantit que `input` respecte le schéma ; le schéma doit avoir `additionalProperties: false` et `required`.
- Changement important (skill) : sur Claude Opus 5.5, Sonnet 5.5, Fable 5.2/5.1, `tool_choice: {type:"any"}` et `{type:"tool", name}` renvoient 400. Utiliser `auto` + `strict: true` + consigne, ou la sortie structurée quand l'outil forcé ne servait qu'à obtenir du JSON. Les anciens modèles (Opus 5, Sonnet 5) l'acceptent encore.
- Entrée d'outil : toujours `JSON.parse`/Zod, jamais de recherche de chaîne sur le JSON (l'échappement change selon les modèles).
- Si on diffuse en flux avec des outils clients : `eager_input_streaming: true` sur chaque outil ; l'API ne valide plus l'entrée, valider soi-même (skill).
- Boucle toute faite : `client.beta.messages.toolRunner({...})` avec `betaZodTool({name, description, inputSchema, run})` importé de `@anthropic-ai/sdk/helpers/beta/zod` (skill, partie bêta). Boucle manuelle possible, plus de contrôle (porte d'approbation avant chaque outil d'écriture).
- Appel programmatique d'outils : `code_execution_20260120` + `allowed_callers: ["code_execution_20260120"]` sur l'outil client ; incompatible avec `strict`, `disable_parallel_tool_use`, `tool_choice` forcé et MCP (skill). Recherche d'outils : `tool_search_tool_bm25_20251119` ou `..._regex_20251119` + `defer_loading: true` sur les autres outils (au moins un outil non différé) (skill). Billet d'ingénierie Anthropic sur les deux : https://anthropic.com/engineering/advanced-tool-use ; chiffres de gain (85 % de contexte économisé, 134 K jetons de définitions avant) viennent de résumés tiers et divergent (72K -> 8,7K ailleurs) ; GA ou bêta : contradiction entre tiers.

### 1.2 Sorties structurées (officiel, skill ; GA, sans en-tête bêta d'après un tiers)
- Paramètre : `output_config: { format: { type: "json_schema", schema } }`. L'ancien `output_format` est déprécié.
- TS : `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` avec `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"` ; résultat dans `response.parsed_output` (null si échec : gardez-vous).
- Limites : sous-ensemble de JSON Schema, `additionalProperties:false` obligatoire sur les objets, pas de contraintes numériques ni de longueur (tiers : doc Google Cloud pour Claude). Incompatible avec les citations (400). Pas disponible avec une clé de chiffrement client (CMEK) sur Fable 5.2 (skill). Les deux limites réelles à tester : complexité maximale de schéma et latence de première requête : non trouvé.
- Sur Haiku 5.5 : un tiers dit « indisponible sur Amazon Bedrock » ; nous sommes en direct sur l'API, non concerné.

### 1.3 Cache de consignes (officiel, skill `shared/prompt-caching.md`)
- Prix : lecture 0,1x du prix d'entrée de base ; écriture 1,25x (durée 5 min, par défaut) ou 2x (1 h). Exceptions de lecture : Sonnet 5.5 0,05x (0,10 $/M), Opus 5.5 0,05x (0,20 $/M), Fable 5.2 0,025x. Haiku 5.5 : lecture 0,01 $/M et écriture 0,125 $/M par application du coefficient général ; non vérifié sur une page de prix.
- Durées : `cache_control: {type:"ephemeral"}` = 5 min ; `{type:"ephemeral", ttl:"1h"}` = 1 h. Une lecture rafraîchit la minuterie sans frais. Seuil de rentabilité : 2 requêtes en 5 min ; 3 en 1 h.
- Taille minimale cachable : 512 jetons pour Opus 5.5, Sonnet 5.5, Haiku 5.5 ; 1024 Sonnet 5 / Opus 4.8 ; 4096 Haiku 4.5 / Opus 4.6. En dessous : le cache ne s'écrit pas, sans erreur.
- Ordre de rendu : `tools` -> `system` -> `messages`. Un octet changé dans le préfixe invalide tout ce qui suit. En tête : définitions d'outils (ordre fixe, triées), consignes de la fiche d'agent, exemples. Après le dernier point de coupe : horodatage, identifiants, contenu de l'élément traité.
- Deux façons : `cache_control` au niveau de la requête (placement automatique sur le dernier bloc) ou sur un bloc précis (max 4 points de coupe). Pour une boucle d'agent : un point explicite à la fin du préfixe statique + le automatique pour la queue de conversation. Si TTL 1 h : mettre `ttl:"1h"` sur les deux (les durées longues d'abord).
- Vérifier : `usage.cache_read_input_tokens` et `usage.cache_creation_input_tokens`. Si lecture = 0 sur des requêtes identiques : invalidateur silencieux (date dans le système, JSON non trié, jeu d'outils variable). Mettre un test d'intégration qui exige `cache_read_input_tokens > 0` à la deuxième requête.
- Le cache est isolé par espace de travail (workspace) : ne pas répartir un même agent sur plusieurs workspaces.
- Appels parallèles : une entrée de cache n'est lisible qu'après le début de la réponse de la première requête ; envoyer une requête, attendre le premier jeton, puis lancer les N-1 autres.
- Instruction en cours de conversation : `{role:"system"}` ajouté dans `messages` (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable) garde le préfixe en cache ; ne supprimez jamais un ancien message (modifier l'historique casse le cache et invalide les blocs de réflexion).
- Changer `thinking` ou `effort` au niveau supérieur en cours de route invalide le cache des messages. Un effort par message (bêta `mid-conversation-output-config-2026-07-01`) l'évite.

### 1.4 Traitement par lots (officiel, skill `typescript/claude-api/batches.md`)
- `client.messages.batches.create({ requests: [{ custom_id, params }] })` -> `client.messages.batches.retrieve(id).processing_status` jusqu'à `"ended"` -> `for await (const r of await client.messages.batches.results(id))`. Résultat par `custom_id` (ordre non garanti) ; types `succeeded | errored | canceled | expired`.
- 50 % de réduction sur tous les jetons. Jusqu'à 100 000 requêtes ou 256 Mo par lot ; la plupart finissent en moins d'une heure, 24 h au maximum ; résultats gardés 29 jours. Un lot ne peut pas fixer `stream`, `speed`, `fallbacks`, `max_tokens: 0`. Le cache fonctionne dans les lots (à l'effort maximal, pas garanti : déduit ; non confirmé).
- Pour Leon : rattrapage initial des 42 connecteurs (tri de l'historique), réindexation, évaluations nocturnes. Pas pour le temps réel du standard.

### 1.5 Comptage de jetons (officiel, skill)
- `await client.messages.countTokens({ model, system, messages, tools })` -> `.input_tokens`. Spécifique au modèle : repasser le même identifiant. Ne pas utiliser `tiktoken` (sous-compte de 15 à 20 % ou plus).
- Haiku 5.5 : un tiers dit ~30 % de jetons en plus que Haiku 4.5 pour le même texte (nouveau tokenizer) et que l'économie réelle est donc de ~75 % et non 90 % ; un autre mesure ~1,25x. Recompter sur Haiku 5.5 avant de chiffrer (https://www.neowin.net/news/anthropic-launches-claude-haiku-55-with-aggressive-pricing-but-it-consumes-far-more-tokens/ , tiers).

### 1.6 Contexte long et gestion du contexte
- Tous les modèles courants ont 1 M de jetons (Haiku 4.5 : 200 K) ; Haiku 5.5 : le prix passe à 0,50 $ entrée / 2,50 $ sortie (5 fois plus) au-delà de 100 K jetons de prompt (skill, officiel). Ne jamais dépasser 100 K sur le tri.
- Compaction côté serveur (bêta, en-tête `compact-2026-01-12`, `context_management: { edits: [{ type: "compact_20260112" }] }` sur `client.beta.messages.create`) : seuil par défaut 150 K ; il faut renvoyer `response.content` entier (le bloc `compaction` doit être gardé) (skill).
- Effacement des résultats d'outils (bêta `context-management-2025-06-27`, `{ type: "clear_tool_uses_20250919" }`, option `clear_tool_inputs`) ; effacement de réflexions `clear_thinking_20251015` (skill). Billet Anthropic « Effective context engineering » : compaction, effacement des résultats d'outils, notes structurées, sous-agents à contexte propre (https://www.anthropic.com/research/effective-context-engineering-for-ai-agents ; officiel pour le plan, détails via tiers).
- Pour nos agents étroits : on n'a pas besoin du contexte long. Rester sous 30-50 K jetons par appel en passant des résumés et des identifiants, pas des corps de mails entiers.
- Fils de messages (bêta `message-threads-2026-08-12`) : requêtes plus petites dans les longues boucles ; incompatible avec la compaction et les lots, non éligible ZDR (skill). Inutile pour nous au début.

### 1.7 Connecteur MCP (officiel pour la forme : https://platform.claude.com/docs/en/agents-and-tools/mcp-connector ; détails via skill et tiers)
- Les deux moitiés sont obligatoires : `mcp_servers: [{ type: "url", url, name, authorization_token? }]` ET `tools: [{ type: "mcp_toolset", mcp_server_name: <même nom> }]`, avec l'en-tête bêta `mcp-client-2025-11-20` (skill ; l'ancien `mcp-client-2025-04-04` existe encore dans des exemples). Liste d'autorisation, de refus ou config par outil dans le toolset (noms de champs : `default_config`, `configs` d'après un tiers : à vérifier).
- Limites (tiers, à vérifier) : serveurs distants publics en HTTP (Streamable HTTP ou SSE), pas de stdio local ; seulement les outils (ni ressources ni prompts). Incompatible avec l'appel programmatique d'outils (skill).
- Spécification MCP la plus récente : 2026-07-28 (stateless, authentification durcie : OAuth 2.1, PKCE obligatoire, validation de `iss` RFC 9207, liaison d'audience des jetons) https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization (officiel). SDK `@modelcontextprotocol/sdk` 1.32.2.
- Pour Leon (déduit) : nos 42 connecteurs sont à nous et utilisent les jetons OAuth de chaque utilisateur. Les exposer comme outils clients (fonctions TypeScript que nous exécutons, avec contrôle des droits et journal) plutôt que par le connecteur MCP d'Anthropic, qui enverrait les jetons à un serveur distant. Le connecteur MCP convient pour un outil externe public à lecture seule.

### 1.8 SDK d'agents contre boucle écrite à la main
| Option | Ce que c'est | Pour nous |
|---|---|---|
| Boucle manuelle (`messages.create` + `while stop_reason === "tool_use"`) | Vous possédez tout | Meilleur choix pour agents de fond étroits : porte d'approbation, plafond d'appels et de budget, journal, cache maîtrisé. ~60 lignes. |
| Tool runner (`client.beta.messages.toolRunner`, `betaZodTool`) | Boucle du SDK standard, vos outils, hooks par tour (approbation, interception, modification du résultat, reprises) | Bon gain de temps si on accepte la bêta ; vérifier que l'approbation humaine peut s'insérer (skill dit que oui via hooks). |
| Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.329) | Claude Code en bibliothèque : outils intégrés (Read, Write, Bash, Grep, WebSearch), sous-agents, hooks, permissions, sessions ; lance le binaire Claude Code (tiers) | Conçu pour agents de code et fichiers. Surdimensionné pour des agents qui appellent des outils SaaS ; dépendance à un cycle de sorties de Claude Code ; licence non open source. Écarter pour le moteur (déduit). Utile pour nos propres agents de développement. |
| Managed Agents (bêta, `client.beta.agents/sessions`) | Anthropic héberge la boucle et un bac à sable ; facturation du temps d'exécution en plus des jetons ; historique gardé ; non éligible ZDR/HIPAA (skill) | Les données clients sortent vers un conteneur d'Anthropic et le skill dit ZDR non éligible : à écarter pour des mails de clients européens tant que le contrat n'est pas clair (déduit). |
Le skill dit « par défaut Managed Agents » pour tout agent, sauf si on veut héberger soi-même la boucle, ce qui est notre cas (jetons OAuth des utilisateurs, hébergement UE, journal propre).
Agent SDK, détails de permissions (tiers, doc officielle non ouverte) : ordre d'évaluation hooks, règles de refus, règles « ask », mode, règles d'autorisation, puis `canUseTool` ; `allowedTools` approuve d'office mais ne restreint pas (utiliser `disallowedTools`) ; mode `dontAsk`. https://code.claude.com/docs/en/agent-sdk/overview

## 2. Choix du modèle par étape et coûts

Prix en dollars par million de jetons (officiel, table du skill « cached 2026-11-03 »). Lots : moins 50 %.

| Modèle | Identifiant | Entrée | Sortie | Lecture cache | Remarque |
|---|---|---|---|---|---|
| Haiku 5.5 | `claude-haiku-5-5` | 0,10 (0,50 si prompt > 100 K) | 0,50 (2,50 > 100 K) | ~0,01 (déduit) | Réflexion adaptative active par défaut, effort par défaut `medium` ; mettre `low` pour tri. Pas de repli serveur en cas de refus. |
| Sonnet 5.5 | `claude-sonnet-5-5` | 2,00 | 10,00 | 0,10 | Réflexion ne peut pas être coupée (`between_tools` à la place) ; effort par défaut `high` ; pas d'outil forcé |
| Opus 5.5 | `claude-opus-5-5` | 4,00 | 20,00 | 0,20 | Réflexion toujours active ; effort par défaut `medium` ; `fast` à 8/40 |
| Sonnet 5 | `claude-sonnet-5` | 2,00 | 10,00 | n.c. | |
| Fable 5.2 | `claude-fable-5-2` | 8,00 | 40,00 | 0,20 | Pas pour nous (cher) |
| Haiku 4.5 | `claude-haiku-4-5` | 1,00 | 5,00 | n.c. | 200 K, ancien |
Le skill dit « utiliser Opus 5.5 par défaut » : c'est un défaut de l'outil de génération de code, pas une consigne pour Leon ; le choix par étape ci-dessous est notre décision.

| Étape | Modèle | Réglage | Raison |
|---|---|---|---|
| Tri de chaque élément entrant (catégorie, urgence, agent à réveiller, confiance) | Haiku 5.5 | sortie structurée, `effort: "low"`, `max_tokens` ~300 | volume ; ~0,17 $ les mille éléments avec cache (§7) |
| Cas douteux du tri (confiance sous le seuil) | Sonnet 5.5 | effort `medium` | on paie le gros modèle sur 5 à 15 % des éléments (déduit) |
| Extraction « lecteur » de contenu non fiable | Haiku 5.5 | sortie structurée stricte, sans outils | modèle en quarantaine (§4) |
| Rédaction (mail, brief, compte rendu) | Sonnet 5.5 | effort `medium`, ton et exemples en tête, en cache | qualité d'écriture, coût modéré |
| Décision d'action (quelle écriture, avec quels paramètres) | Sonnet 5.5 ou Opus 5.5, effort `high` | `strict: true`, outil par action | peu d'appels, erreur coûteuse (déduit) |
| Évaluateur / juge | un cran au-dessus du jugé, ou Haiku 5.5 pour contrôles simples | notes binaires | |
| Évaluations hors ligne | lots (-50 %) | | |

Seuil de confiance (déduit) : demander dans le schéma `{category: enum, agent: enum, urgence: enum, confidence: number 0-1, raison: string<=200 car.}`. Le « nombre 0-1 » sort du modèle sans calibration : mesurer sur le jeu de référence la précision par tranche de confiance et fixer le seuil d'escalade pour viser une précision ≥ 95 % sur ce qui n'est pas escaladé. Les contraintes `minimum/maximum` ne sont pas supportées par les schémas : valider en Zod après coup.

## 3. Schémas d'agents qui tiennent

Source : Anthropic, « Building effective AI agents » (officiel) https://www.anthropic.com/engineering/building-effective-agents . Cinq schémas de « workflow » : enchaînement (prompt chaining), routage, parallélisation (découpage en sections ou vote), orchestrateur et sous-agents (orchestrator-workers), évaluateur puis correcteur (evaluator-optimizer). L'agent « libre » (le modèle choisit seul ses outils en boucle) est présenté comme le dernier recours. Un tiers (agentpatterns.ai, buildingeffectiveagents.com) résume pareil ; le chiffre « 80 % des cas se règlent par enchaînement » vu chez un tiers n'est PAS dans le texte d'Anthropic : ne pas le citer.

| Schéma | Quand l'utiliser chez nous | Quand l'éviter |
|---|---|---|
| Enchaînement fixe, code qui décide, modèle aux étapes de jugement | Standard : trier, puis enrichir, puis proposer. Étapes connues d'avance. | Tâche dont le nombre d'étapes dépend du contenu. |
| Routage (petit modèle classe, code dispatche) | Le « standard » qui réveille le bon agent. | Catégories floues sans seuil de confiance. |
| Parallélisation | Lire 5 sources indépendantes (mail, CRM, agenda) avant un brief ; vote de 2-3 juges sur une action risquée. | Appels qui dépendent l'un de l'autre. Note cache : les appels parallèles à préfixe identique n'attendent pas l'écriture du cache des autres (voir 1.3). |
| Évaluateur puis correcteur | Rédaction d'un mail : un second appel (petit modèle) vérifie ton, faits, destinataires, puis une seule passe de correction. | Boucle sans critère mesurable ; plafonner à 1-2 tours. |
| Orchestrateur et sous-agents | Brief multi-sources dont les sous-tâches ne sont pas connues d'avance. | Tâches étroites et répétitives : un enchaînement coûte moins cher et se teste mieux. |
| Boucle libre | Enquête ouverte, rare, avec plafond d'étapes et de budget. | Tout ce qui écrit dans un outil sans validation humaine. |

Déduit pour Leon : les agents de fond étroits (fiche de poste précise, outils peu nombreux) doivent être des enchaînements code + appels modèle, avec une boucle d'outils bornée (nombre d'appels max, budget de jetons max) seulement à l'étape de jugement.

## 4. Sécurité : injection, séparation lecture/décision, CaMeL, OWASP

### 4.1 Le risque, en une phrase
Un agent qui lit du contenu venu de l'extérieur (mail, ticket, page, invitation) peut en recevoir des ordres cachés. C'est l'injection de consignes indirecte. Elle ne se « corrige » pas au niveau du modèle seul.

### 4.2 Ce que disent les éditeurs et les cadres (2026)

| Source | Fait | Nature |
|---|---|---|
| Simon Willison, « lethal trifecta » (16 juin 2025) | Trois jambes : accès à des données privées + exposition à du contenu non fiable + moyen de communiquer vers l'extérieur. Il faut en retirer une. « 99 % est une note d'échec » en sécurité applicative. https://simonwillison.net/tags/lethal-trifecta/ (billets jusqu'à août 2026) | tiers (blog d'expert reconnu) ; le résumé vient d'un moteur de recherche, billets non ouverts |
| Meta, « Agents Rule of Two » (31 oct. 2025) | Une session d'agent ne doit réunir que deux des trois : (A) traiter du contenu non fiable, (B) accéder à des données sensibles, (C) changer un état ou communiquer vers l'extérieur. Les trois à la fois : pas d'autonomie, validation humaine. Meta précise que la règle ne suffit pas seule. https://ai.meta.com/blog/practical-ai-agent-security/ | officiel (Meta) |
| CaMeL, Debenedetti et coll., Google DeepMind et ETH Zurich (arXiv 2503.18813, mars 2025) | Un modèle « privilégié » ne voit que la demande de confiance et écrit un programme ; un modèle « en quarantaine » sans outils extrait des valeurs du contenu non fiable ; un interpréteur Python restreint exécute le plan, suit l'origine de chaque valeur (provenance) et applique des politiques sur les appels d'outils. Chiffres AgentDojo : un résumé dit 77 % des tâches avec sécurité prouvée contre 84 % sans défense ; un autre dit « presque toutes les attaques éliminées ». Les résumés divergent : à vérifier dans l'article. https://www.alphaxiv.org/abs/2503.18813 | tiers (résumés) ; article primaire non ouvert |
| OWASP Top 10 for Agentic Applications 2026 (publié le 9 déc. 2025) | ASI01 « Agent Goal Hijack » en tête : des instructions cachées dans mails, pages, documents, invitations deviennent l'objectif de l'agent. ASI06 empoisonnement de mémoire. Contre-mesures : tout texte naturel = non fiable, moindre privilège, approbation humaine des actions qui changent l'objectif. https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/ | officiel pour la date et le titre ; détails via guides de tiers |
| OpenAI, durcissement d'Atlas et guide de conception contre l'injection (début 2026) | « Peu probable d'être un jour entièrement résolu » ; moindre privilège (« ce qu'un humain aurait dans la même situation, et rien de plus »), hiérarchie système > utilisateur > outil, validation des champs structurés, listes d'actions permises, bac à sable, confirmation des actions lourdes. https://openai.com/index/hardening-atlas-against-prompt-injection/ . Date du guide : 11 mars 2026 chez un tiers, avril 2026 chez un autre : contradiction non levée. | officiel pour Atlas ; guide connu via tiers |
| Google | Défense en couches : « Agent Origin Sets » (domaines autorisés), classifieurs d'injection, « User Alignment Critic » (second modèle isolé qui vérifie que l'action voulue correspond à la demande), portes d'acquittement, application déterministe de règles hors du modèle. Source : tiers (synthèse 2026 arXiv 2603.11088 ; rapport Mandiant https://cloud.google.com/security/resources/ai-risk-and-resilience-2026). Document Google primaire non trouvé. | tiers |
| Anthropic, chiffres d'injection en navigation | Rapportés par la presse : Opus 4.5 avec protections 1,4 % de réussite d'attaque (adaptatif, 100 essais) contre 8,0 % sans (nov. 2025) ; Opus 4.8 : 31,5 % brut, 0,5 % avec toutes protections (mai-juin 2026) ; Opus 5 en mode Auto : 0 % sur 129 scénarios, 3,7 % sans les couches logicielles (juillet 2026) ; un autre média dit 2,0 % après 15 essais. Anthropic : « aucun agent de navigation n'est immun ». https://creati.ai/ai-news/2026-07-25/anthropic-says-claude-opus-5-with-auto-mode-drove-browser-prompt-injection-success-to-zero-in-in/ | tiers, chiffres contradictoires, fiches système non ouvertes |

Étude académique citée par un tiers : douze défenses publiées contournées à plus de 90 % par des attaques adaptatives (arXiv, 2026, non vérifié). Conclusion prudente : ne jamais compter sur le modèle seul.

### 4.3 Architecture recommandée (déduite, appuyée sur les sources ci-dessus)
1. Séparer qui lit et qui décide. Le « lecteur » (petit modèle, sans outils d'écriture, sortie structurée stricte) extrait des faits d'un mail ou ticket. Le « décideur » reçoit uniquement ces champs typés (enum, ids, courtes chaînes plafonnées), jamais le texte brut libre. C'est le double modèle de Willison, version allégée de CaMeL.
2. Plan arrêté avant lecture quand c'est possible : la fiche d'agent fixe la liste d'actions permises ; le contenu lu ne peut pas en ajouter.
3. Listes d'actions permises par agent et par niveau d'autonomie, vérifiées dans le code (pas dans la consigne). Destinataires limités : un envoi de mail ne peut viser que des adresses déjà dans le fil, de la même société, ou une liste validée.
4. Provenance : marquer chaque champ « venu d'un contenu externe » ; toute action dont un paramètre porte cette marque monte d'un cran (propose au lieu d'agir seul).
5. Règle de deux appliquée au curseur d'autonomie : « agit seul » interdit si l'agent réunit contenu externe + données sensibles + écriture externe.
6. Validation humaine pour l'irréversible (envoi externe, suppression, partage de droits).
7. Les droits OAuth des utilisateurs sont larges : le moteur doit réduire chaque agent à un sous-ensemble d'outils (moindre privilège), pas lui donner tout ce que le jeton permet.



## 5. Qualité : jeux de référence, juges, outils d'évaluation

### 5.1 Méthode (déduit, pratique courante)
- Jeu de référence : 100 à 300 éléments réels anonymisés par agent (mails, tickets), étiquetés à la main par un fondateur. Garder à part 20 % jamais utilisés pour régler les consignes.
- Trois mesures : (a) justesse du tri (précision/rappel par catégorie, à seuil de confiance fixé) ; (b) qualité de rédaction notée par un juge modèle avec grille courte (ton, faits justes, destinataire correct, pas d'engagement non autorisé) ; (c) conformité aux règles dures vérifiées par code (destinataires permis, champs présents, aucune action hors liste).
- Juge par modèle : un modèle d'un cran supérieur au modèle jugé, notes binaires par critère plutôt qu'une note sur 10, vérifier le juge contre 30 à 50 jugements humains.
- En production : taux d'acceptation des propositions (acceptée telle quelle / modifiée / rejetée), distance d'édition entre proposition et version envoyée, taux d'annulation après « agit et prévient ». C'est la mesure qui décide si on monte le curseur d'autonomie d'un agent.
- Non-régression des consignes : toute modification d'une fiche d'agent ou d'un prompt passe en CI sur le jeu de référence ; refus de fusion si le score baisse de plus de N points ou si une règle dure casse.

### 5.2 Outils (versions vérifiées sur le registre npm le 19 nov. 2026, officiel)

| Outil | Version npm | Licence | Auto-hébergement | Remarque |
|---|---|---|---|---|
| promptfoo | 0.126.0 | MIT (registre npm) | Oui : CLI locale, YAML, tourne en CI sans serveur | OpenAI a annoncé le rachat le 9 mars 2026 ; promoteur dit « reste open source sous la licence actuelle » (tiers : https://www.promptfoo.dev/blog/promptfoo-joining-openai/ ; presse). Un tiers dit Apache 2.0, le registre dit MIT : le registre prime. Risque : indépendance vis-à-vis d'un concurrent (déduit). A un fournisseur Anthropic. |
| Langfuse | 3.39.2 (paquet `langfuse`) ; `@langfuse/tracing` et `@langfuse/otel` 6.1.1 | MIT | Oui, mais exige ClickHouse en plus de Postgres (+ Redis, stockage S3) ; ce n'est pas « juste Postgres » | Racheté par ClickHouse le 16 janv. 2026 ; Langfuse dit « MIT inchangé, auto-hébergement de première classe » (tiers : https://langfuse.com/handbook/chapters/story). Un commentateur note que le support entreprise auto-hébergé est lié à un contrat ClickHouse. Traces, jeux de données, évaluations, gestion de prompts. |
| Braintrust | 3.44.0 (SDK, MIT) | Plateforme fermée | Entreprise seulement ; un comparatif de nov. 2026 dit que les nouveaux clients ne peuvent plus l'auto-héberger (aperçu privé « BYOC » sur AWS), des comparatifs plus anciens disent le contraire : contradiction, à vérifier. Pro à 249 $/mois (tiers). | Bon pour évaluations, mais données chez eux : écarter pour des mails clients sauf besoin fort (déduit). |
| Inspect (UK AISI) | PyPI (Python), version 0.3.268-0.3.279 selon les sources | MIT | Oui, bibliothèque | Python seulement ; fait pour évaluer modèles et agents avec bacs à sable. Trop lourd pour nous (déduit). https://inspect.aisi.org.uk/ |

Recommandation de fond (déduit) : promptfoo en CI pour la non-régression (pas de serveur, YAML dans le repo, juge par modèle, assertions code), plus Langfuse ou simples tables Postgres pour les traces de production. Voir « Ce que je recommande ».

## 6. Observabilité : OpenTelemetry GenAI

- Les conventions sémantiques GenAI d'OpenTelemetry vivent dans un dépôt dédié `open-telemetry/semantic-conventions-genai` (tiers, résultat de recherche : https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md). Statut : « Development » (pas stable) pour `gen_ai.operation.name` et ses valeurs : `chat`, `create_agent`, `embeddings`, `generate_content`, `invoke_agent`, `invoke_workflow`, `retrieval`, `text_completion`, `execute_tool` (le détail des valeurs vient d'un résumé de recherche : à vérifier sur le dépôt).
- Forme d'une trace d'agent (tiers) : un span `invoke_agent <nom>` contient des étapes ; chaque étape a un span `chat <modèle>` et, si un outil tourne, un span `execute_tool <nom>` (kind INTERNAL, `gen_ai.tool.name` requis). Le nom du span est le nom d'opération suivi du nom.
- Attributs utiles : `gen_ai.operation.name`, `gen_ai.provider.name` (valeur « anthropic »), `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.agent.name`, `gen_ai.tool.name`, `gen_ai.conversation.id` (noms de mémoire : à vérifier, ils ont bougé entre versions). Cache : l'API d'Anthropic donne `cache_read_input_tokens` et `cache_creation_input_tokens` ; leur mapping standard est en évolution (non trouvé de façon sûre).
- Le SDK `@anthropic-ai/sdk` 1.11.0 (publié le 19 nov. 2026, registre npm) émet lui-même des spans OpenTelemetry (bêta). Source officielle du skill claude-api : option `openTelemetry: { tracerProvider, traces: { contentMode: "content" | "metadata_only" } }` à la construction du client ; `openTelemetry: false` pour couper ; `{ openTelemetry: { conversationId } }` par appel. Les attributs suivent les conventions `gen_ai.*`. Mode par défaut `metadata_only` (pas de prompts exportés) : garder ce défaut pour des mails de clients. Limite de contenu par span 0,75 Mo par défaut. Il existe aussi un « API tracing » côté serveur d'Anthropic, activé par un admin d'organisation, qui envoie des spans à un point OTLP (voir `shared/opentelemetry.md` du skill). Les spans bêta peuvent changer : épingler la version du SDK.
- Si on ajoute une instrumentation tierce (`@traceloop/instrumentation-anthropic` 0.27.0 ou `@opentelemetry/instrumentation-anthropic` 0.2.0, registre npm), couper celle du SDK pour éviter les doublons (règle du skill).
- Paquets : `@opentelemetry/api` 1.10.0, `@opentelemetry/sdk-node` 0.301.2, `@opentelemetry/semantic-conventions` 1.45.0 (les attributs GenAI y sont encore « incubating » : à vérifier). Langfuse reçoit de l'OTLP via `@langfuse/otel` 6.1.1.
- Déduit : une table Postgres `agent_runs` (run_id, agent, étape, modèle, jetons par type, coût, latence, issue, décision humaine) reste nécessaire en plus des traces, pour le poste de contrôle et les taux d'acceptation.

## 7. Coûts chiffrés (calcul fait le 19 nov. 2026, hypothèses ci-dessous, déduit)

Prix : § 2. Écriture de cache 1,25x (5 min). Jetons de réflexion non comptés sauf mention : ils sont facturés comme sortie, donc ajouter 0 à 100 % selon l'effort. Tokenizer Haiku 5.5 : +25 à 30 % de jetons chez des tiers, donc multiplier la partie Haiku par ~1,3 en cas de doute.

| Cas | Hypothèses | Sans cache | Avec cache | Avec cache + lot |
|---|---|---|---|---|
| Tri, 1 000 éléments, Haiku 5.5 | consignes + catégories + exemples 3 000 jetons (en cache), élément 600 jetons, sortie 150 jetons | 0,44 $ | 0,17 $ | 0,08 $ |
| Même tri, 10 000 éléments par jour | idem | 4,35 $ / jour | 1,65 $ / jour (~50 $ / mois) | 0,83 $ / jour |
| Même tri avec Sonnet 5.5 (pour comparer) | idem | 8,70 $ pour 1 000 | 3,01 $ | non calculé |
| Brief (1 appel), Sonnet 5.5 | système 4 000 jetons en cache + 40 000 jetons de sources + 3 500 jetons de sortie (réflexion comprise) | 0,123 $ | 0,115 $ | 0,06 $ (50 %) |
| Agent à 10 appels d'outils, Sonnet 5.5 | système + outils 6 000, demande 1 500, chaque résultat d'outil 2 000, 300 jetons de sortie par tour, 11 appels | 0,45 $ | 0,13 $ | non applicable (boucle) |
| Même agent, Opus 5.5 | idem | 0,90 $ | 0,25 $ | |
| Même agent, Haiku 5.5 | idem | 0,023 $ | 0,007 $ | |

Lectures (déduit) :
1. Le cache vaut beaucoup pour le tri (préfixe long réutilisé des milliers de fois : -62 %) et pour la boucle d'outils (le préfixe grossit à chaque tour : -72 %). Il apporte presque rien pour un brief à appel unique dont l'entrée est surtout du contenu neuf (-6 %).
2. Le tri coûte ~0,17 $ les mille éléments en Haiku 5.5. Pour 20 salariés recevant ~100 éléments par jour (mail, tickets, événements), soit 2 000 par jour : ~0,33 $ par jour. Le tri n'est pas le poste de coût ; ce sont les agents qui agissent.
3. Un agent de dix outils avec Sonnet 5.5 coûte ~0,13 $ avec cache : 1 000 exécutions par jour = ~130 $ par jour. Dans ce cas le plafond d'appels et de budget et le choix du modèle (Haiku 5.5 pour les étapes de lecture) comptent plus que n'importe quelle autre optimisation.
4. Un tiers (écosystème Anthropic, recherche multi-agents) rapporte qu'un système multi-agents consomme ~15x les jetons d'un chat et un agent ~4x (article d'Anthropic de juin 2025 « How we built our multi-agent research system », non ouvert ; chiffre vu dans https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent , tiers). Ne pas passer à des sous-agents sans besoin.
5. Mesurer, ne pas croire : journaliser `usage` (input, output, cache_read, cache_creation) de chaque appel dans `agent_runs` ; les calculs ci-dessus sont des ordres de grandeur.

## 8. Extraits TypeScript (SDK `@anthropic-ai/sdk` 1.11.0 ; noms d'API repris du skill ; non exécutés ici, à tester)

### 8.1 Tri en sortie structurée (Haiku 5.5, `messages.parse` + Zod)
```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic();

const Triage = z.object({
  category: z.enum(["demande_client", "facture", "reunion", "support", "info", "bruit"]),
  agent: z.enum(["suivi_client", "compta", "agenda", "support", "aucun"]),
  urgency: z.enum(["basse", "normale", "haute"]),
  confidence: z.number(),           // 0-1 : min/max non supportés par le schéma, vérifier après
  reason: z.string(),               // <= 200 car. à vérifier après
});

const SYSTEM = "...catégories, règles, 20 exemples..."; // > 512 jetons, figé octet pour octet

export async function triage(itemText: string) {
  const res = await client.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 400,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: zodOutputFormat(Triage) },
    // contenu non fiable : balisé comme donnée, jamais mélangé à la consigne
    messages: [{ role: "user", content: `<element_non_fiable>\n${itemText}\n</element_non_fiable>` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null; // file d'attente humaine
  const t = res.parsed_output;
  if (t.confidence < 0.8 || t.reason.length > 200) return { ...t, escalate: true };
  console.log(res.usage.cache_read_input_tokens, res.usage.input_tokens); // le cache doit lire
  return { ...t, escalate: false };
}
```
(`output_config.effort` avec `format` dans le même objet : forme déduite du skill, qui montre les deux séparément ; à vérifier.)

### 8.2 Étape avec outils et cache (boucle manuelle bornée, porte d'approbation)
```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const tools: Anthropic.Tool[] = [
  { name: "lire_fil_mail", description: "Lit un fil (lecture seule)", strict: true,
    input_schema: { type: "object", properties: { thread_id: { type: "string" } },
      required: ["thread_id"], additionalProperties: false } },
  { name: "creer_brouillon", description: "Crée un brouillon, n'envoie rien", strict: true,
    input_schema: { type: "object", properties: { thread_id: { type: "string" }, body: { type: "string" } },
      required: ["thread_id", "body"], additionalProperties: false } },
]; // ordre fixe : fait partie du préfixe caché

const ALLOWED = new Set(["lire_fil_mail", "creer_brouillon"]); // liste permise par la fiche d'agent

export async function runStep(system: string, userMsg: string, maxCalls = 10) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMsg }];
  for (let i = 0; i <= maxCalls; i++) {
    const res = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      cache_control: { type: "ephemeral" },            // auto-cache de la queue de conversation
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], // préfixe statique
      output_config: { effort: "medium" },
      tools,
      messages,
    });
    if (res.stop_reason !== "tool_use") return res;     // end_turn, max_tokens, refusal : à traiter
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      if (!ALLOWED.has(b.name)) { results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: "outil non permis" }); continue; }
      try { results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await exec(b.name, b.input)) }); }
      catch (e) { results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: String(e) }); }
    }
    messages.push({ role: "user", content: results });  // tous les résultats dans UN message
  }
  throw new Error("plafond d'appels atteint");
}
declare function exec(name: string, input: unknown): Promise<unknown>; // ton code : droits, journal, validation Zod
```
Rappels : pas de `tool_choice` forcé sur Sonnet 5.5 ; ne pas mettre d'horodatage dans `system` ; les appels parallèles d'un même tour reviennent ensemble.

### 8.3 Envoi par lots (rattrapage ou évaluation)
```ts
const batch = await client.messages.batches.create({
  requests: items.map((it) => ({
    custom_id: it.id, // clé de rapprochement, l'ordre des résultats n'est pas garanti
    params: {
      model: "claude-haiku-5-5", max_tokens: 400,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: zodOutputFormat(Triage) }, // format dans params : à tester
      messages: [{ role: "user", content: `<element_non_fiable>\n${it.text}\n</element_non_fiable>` }],
    },
  })),
});
// sonder toutes les 60 s jusqu'à processing_status === "ended"
for await (const r of await client.messages.batches.results(batch.id)) {
  if (r.result.type === "succeeded") save(r.custom_id, r.result.message);
  else retryOrLog(r.custom_id, r.result);
}
```
`zodOutputFormat` dans un lot et `output_config` dans `params` : non montré par le skill, à vérifier ; sinon décrire le JSON dans le prompt et valider avec Zod.

### 8.4 Spans OpenTelemetry autour d'un appel (officiel, skill)
```ts
const client = new Anthropic({ openTelemetry: { tracerProvider: provider, traces: { contentMode: "metadata_only" } } });
await client.messages.create({ /* ... */ }, { openTelemetry: { conversationId: runId } });
```

## Ce que je recommande

1. Boucle écrite à la main (ou tool runner) avec `@anthropic-ai/sdk` 1.11.0, pas le Claude Agent SDK ni Managed Agents, pour les agents de fond. Raison : le contrôle des droits, du plafond de budget, de la porte d'approbation et du journal est notre produit ; le Agent SDK est fait pour du code et des fichiers, Managed Agents envoie les données dans un conteneur Anthropic (ZDR non éligible, d'après le skill).
2. Enchaînements fixes (standard, extraction, rédaction, décision, écriture) avec le modèle seulement aux étapes de jugement ; boucle d'outils bornée à ≤ 10 appels et budget de jetons. Pas d'orchestrateur multi-agents au départ (~15x de jetons, tiers).
3. Modèles : Haiku 5.5 pour tri et lecteur ; Sonnet 5.5 pour rédaction et décision ; Opus 5.5 seulement pour les décisions à fort enjeu après mesure ; Fable non. Tout est paramétré par fiche d'agent (modèle, effort).
4. Sortie structurée (`output_config.format` + Zod) pour le tri et le lecteur ; `strict: true` sur chaque outil d'écriture ; pas de `tool_choice` forcé (400 sur Sonnet 5.5 / Opus 5.5).
5. Cache : un point explicite en fin de préfixe statique (outils triés + consignes + exemples) + `cache_control` automatique pour la boucle ; test d'intégration `cache_read_input_tokens > 0` ; un seul workspace Anthropic par environnement. TTL 5 min par défaut, 1 h seulement pour les agents réveillés toutes les 5 à 60 min.
6. Lots (-50 %) pour tout ce qui n'est pas urgent : rattrapage des connecteurs, évaluations nocturnes, réindexation.
7. Sécurité d'abord : double modèle (lecteur en quarantaine sans outils, décideur qui ne reçoit que des champs typés), liste d'actions permises appliquée dans le code, destinataires limités, provenance par champ, règle de deux de Meta appliquée au curseur : un agent qui lit du contenu externe, voit des données sensibles et écrit à l'extérieur n'est jamais « agit seul ». Ne pas bâtir CaMeL complet maintenant (interpréteur + politiques : trop lourd pour deux personnes) ; reprendre ses idées (séparation, provenance, politiques sur les appels d'outils).
8. Qualité : jeu de référence par agent dans le repo ; promptfoo (MIT, local, sans serveur) en CI ; juge par modèle à notes binaires calibré sur des jugements humains ; taux d'acceptation des propositions comme mesure de passage de niveau d'autonomie.
9. Observabilité : SDK en OpenTelemetry avec `metadata_only` + table Postgres `agent_runs` pour le poste de contrôle. Langfuse auto-hébergé (MIT, mais ClickHouse en plus) seulement si on veut une interface de traces avant d'avoir construit la nôtre ; sinon rester sur Postgres au début. Braintrust écarté (fermé, données chez eux).
10. Mesurer les jetons en continu (`usage`) et recompter sur Haiku 5.5 avec `countTokens` avant de promettre un coût.

## Ce que je n'ai pas trouvé

- Aucune page Anthropic n'a pu être ouverte (pas d'outil de lecture de page) : prix, minima de cache et noms de paramètres viennent du skill (officiel, daté du 3 nov. 2026) ; tout le reste des « faits Anthropic » vient de résumés de recherche (tiers).
- Prix de lecture et d'écriture du cache de Haiku 5.5 : appliqué le coefficient général (0,1x / 1,25x), non confirmé sur une page de prix.
- Texte primaire de CaMeL : les chiffres AgentDojo divergent entre résumés (77 % de tâches avec sécurité prouvée contre 84 % sans défense, ou « presque toutes les attaques éliminées »). À lire dans arXiv 2503.18813.
- Guide d'OpenAI contre l'injection : date contradictoire (11 mars 2026 ou avril 2026) ; page primaire non ouverte. Guide d'agents d'OpenAI et guide de Google (« An Introduction to Secure AI Agents » et autres) : seulement des résumés de tiers.
- Chiffres d'injection d'Anthropic (fiches système d'Opus 4.8 et Opus 5) : seulement par la presse, contradictoires (0 % sur 129 scénarios contre 2,0 % après 15 essais).
- Posts récents de Simon Willison (2026) et le rapport de Meta : seulement via résumés ; billets non ouverts.
- Noms exacts et stabilité des attributs OpenTelemetry GenAI pour le cache (`cache_read`, `cache_creation`) et pour `gen_ai.conversation.id` : non confirmés. La liste des valeurs de `gen_ai.operation.name` vient d'un résumé de recherche.
- Limites du schéma de sortie structurée (profondeur, nombre de champs, récursion) et latence de première requête : non trouvées. Compatibilité `output_config.format` + `effort` dans un lot : non montrée.
- Champs exacts de la liste d'autorisation du `mcp_toolset` (`default_config`, `configs` ?) : non confirmés.
- Politique actuelle d'auto-hébergement de Braintrust : sources contradictoires. Version exacte d'Inspect : 0.3.268 ou 0.3.279 selon la source.
- Aucune mesure réelle de nos coûts : les chiffres du § 7 sont des calculs sur hypothèses.
- Éligibilité de Managed Agents et de l'API aux garanties de résidence des données (UE) : non vérifiée ; `inference_geo` existe comme paramètre d'API (skill, Opus 4.6 / Sonnet 4.6 et suivants) mais la couverture de Haiku 5.5 et la région UE ne sont pas confirmées.

