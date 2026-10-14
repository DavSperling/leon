# R2 : pipeline d'ingestion et agent d'organisation de Leon (12 octobre 2026)

## 1. Comparaison des architectures

**Pipeline à un passage, sorties structurées.** Une conversation entre, un JSON de faits sort. Mem0 a basculé vers ce modèle en avril 2026 : extraction « ADD-only » en un appel, plus d'UPDATE/DELETE, les faits s'accumulent et c'est la recherche (sémantique + BM25 + entités) qui fait remonter le plus récent. Résultat : 91,6 sur LoCoMo, 93,4 sur LongMemEval, latence divisée par deux ([Mem0, migration v3](https://docs.mem0.ai/migration/platform-v2-to-v3)). C'est efficace pour une mémoire par agent lue uniquement par un LLM. C'est l'inverse de Leon : nos fiches sont lues par des humains, les contradictions doivent être **signalées à l'écriture**, et un fait mal attribué coûte la confiance. Un seul passage mélange filtrage, extraction, résolution d'entités et rangement : quand ça se trompe, on ne sait pas quelle étape corriger.

**Pipeline multi-étapes (Graphiti/Zep, Sentra).** Le papier Zep décrit la chaîne de référence : extraction d'entités avec les 4 derniers messages comme contexte, passe de « réflexion » pour la couverture, embedding du nom + recherche plein texte pour trouver les candidats existants, puis un LLM tranche la fusion ; les faits (arêtes) sont dédupliqués **uniquement entre la même paire d'entités** ; un LLM compare chaque nouveau fait aux faits sémantiquement proches et ferme la validité de l'ancien (quatre horodatages : créé/expiré côté système, valide/invalide côté monde) ([Zep, arXiv 2501.13956](https://arxiv.org/abs/2501.13956) ; [Graphiti](https://github.com/getzep/graphiti), 31,7k étoiles, types d'entités Pydantic « prescrits » ou « appris », structured outputs obligatoires). Sentra vend exactement cela pour l'entreprise : résolution à l'écriture, « Sarah Chen dans HubSpot, S. Chen dans Gmail, @schen dans Slack » fusionnés en un acteur **avec score de confiance**, ontologie par organisation, contradiction **signalée** quand une décision en contredit une autre ([Sentra](https://www.sentra.app/articles/best-company-brain-platforms), [Sentra, AI memory](https://www.sentra.app/articles/ai-memory)). Aucun détail d'implémentation public.

**Agent avec outils.** Le Claude Agent SDK est Claude Code en bibliothèque (outils fichiers, bash, sous-agents) : conçu pour des agents de code, pas pour un pipeline de données ([Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)). Pour un agent qui doit *consulter* le socle avant de ranger, l'API Messages avec tool use (tool runner) suffit et reste maîtrisable. LangGraph et Mastra apportent des graphes d'étapes avec suspension/reprise ([Mastra](https://mastra.ai/docs/workflows/overview)) ; Inngest et Temporal apportent l'exécution durable (chaque étape rejouable, retries, résultats mémorisés) ([Inngest steps](https://www.inngest.com/docs/features/inngest-functions/steps-workflows), [step.ai](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-ai-orchestration), [Temporal](https://docs.temporal.io/evaluate/understanding-temporal)). Dans un pipeline d'ingestion, 90 % des étapes sont déterministes ; l'agent n'a sa place qu'à l'étape de rangement.

**Schéma adaptable.** Cognee impose une ontologie fournie (OWL/RDF ou modèles Pydantic) et canonise les entités extraites par correspondance floue à 0,8, sans ontologie par défaut ([Cognee, ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies)). La recherche 2026 sur l'induction de schéma (SCION : candidats tirés du texte, fusion conservatrice sous contrat JSON strict, auditable ([arXiv 2607.21610](https://arxiv.org/abs/2607.21610)) ; GOI : induction d'un schéma typé exporté en YAML/JSON ([arXiv 2607.16201](https://arxiv.org/abs/2607.16201))) confirme qu'un LLM découvre bien les types d'un corpus, à condition d'ancrer chaque proposition sur des preuves. Qontext range en fichiers et dossiers avec « change reviews » avant intégration, sans dire comment l'agent décide ([Qontext](https://qontext.ai)).

**Résolution d'entités.** Les bibliothèques classiques (Splink : Fellegi-Sunter, DuckDB, explicable, un million d'enregistrements en une minute ([Splink](https://moj-analytical-services.github.io/splink/index.html)) ; dedupe et Zingg : apprentissage actif ([Zingg](https://www.zingg.ai/post/top-10-open-source-entity-resolution-tools-2026))) visent des tables à colonnes homogènes. Nos entités arrivent sous forme de mentions en texte libre. L'état de l'art a convergé : **embeddings pour le blocage, LLM pour l'appariement par paire** ([DenseLinkage, CBSoft 2026](https://cbsoft.sbc.org.br/2026/data/papers/workshops/Engineering%20Entity%20Resolution%20for%20the%20LLM%20Era%20Requirements,%20Architecture,%20and%20Evaluation%20of%20an%20Open-Source%20Library.pdf)), avec un avertissement : les gros modèles ne sont pas forcément meilleurs, ils prennent des raccourcis ([arXiv 2607.24688](https://arxiv.org/abs/2607.24688)).

## 2. Recommandation ferme

**Architecture : pipeline durable à six étapes, déterministe partout sauf au rangement, où un agent Claude avec outils décide.** Orchestration Inngest (TypeScript, `step.ai.wrap` autour du SDK Anthropic, un `step.run` par étape, clé d'idempotence = identifiant de l'élément source). Temporal est l'alternative si on veut du Python ou des workflows très longs ; Inngest suffit et se déploie plus vite.

| Étape | Rôle | Modèle | Sortie |
|---|---|---|---|
| 0. Normalisation | Parser JSONL/SQLite/API, **jeter mécaniquement** les résultats d'outils, fichiers lus, commandes (les 91 % de bruit), dédupliquer par hash, découper par session ou fil, attacher les droits de la source | aucun | `SourceItem` |
| 1. Triage | « Y a-t-il quelque chose à retenir ? » et quels segments | Haiku 4.5 | `{keep, segments[]}` |
| 2. Extraction | Faits atomiques avec **mentions** (pas d'identités), citation source, indices temporels, propositions de types | Sonnet 5, `output_config.format` strict | `Fact[]` |
| 3. Résolution d'entités | Clés dures, puis candidats, puis juge | règles + Sonnet 5 | `Entity` ou `Question` |
| 4. Rangement | Choisir la fiche, créer une fiche, proposer un type | Opus 5, thinking adaptatif, tool runner | `Placement[]` |
| 5. Contradictions | Comparer au périmètre restreint, qualifier | Sonnet 5 (Opus 5 si fiche sensible) | `Relation` |
| 6. Résumé | Régénérer le résumé de la fiche à partir de ses faits seuls | Sonnet 5 | Markdown cité |

**Format d'un fait** (schéma Zod/Pydantic, `additionalProperties: false`) :

```json
{"statement": "Marie Dupont a validé le devis chantier Rennes",
 "predicate": "decision",
 "mentions": [{"text": "Marie Dupont", "role": "subject", "hints": {"email": "m.dupont@acme.fr"}},
              {"text": "chantier Rennes", "role": "object"}],
 "valid_from": "2026-10-08", "valid_to": null, "confidence": 0.9,
 "evidence": {"source_id": "claude-code:abc:msg-42", "quote": "Marie a validé le devis…"},
 "observed_at": "2026-10-09T14:03:00Z"}
```

La citation est obligatoire : un fait sans extrait littéral est rejeté avant stockage. C'est le garde-fou anti-hallucination le moins cher qui existe.

**Résolution d'entités, dans l'ordre.** (a) Clés déterministes : email, domaine, identifiants Notion/Linear/GitHub/HubSpot ; correspondance exacte = fusion automatique, journalisée. (b) Sinon : candidats par embedding du nom et BM25 sur noms, alias et résumé d'entité (pgvector + tsvector), limités au même type. (c) Juge LLM par paire, avec le contexte du fait et le résumé du candidat, sortie `same | different | unsure` + justification. (d) Seuils : fusion automatique uniquement si clé dure, ou si `same` sans clé dure contradictoire **et** aucun homonyme actif dans l'espace. Tout le reste crée une **question** dans l'interface (« Même personne ? ») et le fait est rattaché provisoirement à une entité « non confirmée ». (e) Toute fusion est réversible (table d'alias + journal de fusion ; « défusionner » est une action de l'interface). Ne jamais fusionner deux personnes aux emails différents sans validation humaine.

**Adaptation du schéma par entreprise.** Socle fermé (personne, client, fournisseur, projet, décision, règle, produit, document) stocké comme catalogue JSON par espace, injecté en préfixe mis en cache dans les prompts d'extraction et de rangement. L'agent de rangement a un outil `propose_type` qu'il n'appelle que si au moins N faits (N=5) ne trouvent pas de fiche correcte ; il doit fournir nom, définition, champs, exemples ancrés sur ces faits (principe SCION). Un type proposé est **validé une fois par un humain** dans l'interface, puis devient automatique. Le même mécanisme gère le vocabulaire (« chantier » devient une sous-classe de projet avec ses champs propres). Pas de formulaire de configuration : l'entreprise voit apparaître ses propres mots.

**Contradictions.** Comme Graphiti, on ne compare jamais tout contre tout : seulement les faits de la même fiche et du même prédicat, candidats par embedding. Le juge qualifie `supersedes | contradicts | refines | compatible`. `supersedes` ferme `valid_to` de l'ancien et le marque « remplacé par » ; `contradicts` garde les deux, pose un drapeau visible dans la fiche et dans le flux de révision ; rien n'est tranché en silence ni effacé.

**Modèles.** Haiku 4.5 au triage (rappel élevé, coût nul), Sonnet 5 partout où la sortie est contrainte par schéma, Opus 5 avec thinking adaptatif pour le rangement et les contradictions sur fiches sensibles. Modèles ouverts exclus au départ : Graphiti signale des échecs de schéma avec les petits modèles, et la qualité est le critère. On réévaluera Opus 5 à l'extraction si l'évaluation montre un écart.

## 3. Mesurer la qualité dès le premier jour

1. **Jeu d'or interne**, avant la première ligne de pipeline : 50 sessions Claude Code des fondateurs, 30 pages Notion, 30 mails, anonymisés, annotés à la main (faits attendus, grappes d'entités, contradictions, fiche cible). Il tient en deux jours et c'est le seul actif qui compte.
2. **Métriques par étape** : précision/rappel des faits (juge Opus 5 calibré sur un sous-échantillon humain) ; **taux de faits sans preuve = 0** ; résolution d'entités en P/R/F1 par paire et B-cubed par grappe, avec le **taux de fausses fusions** comme chiffre de tête ; rappel des contradictions ; exactitude du rangement ; fidélité du résumé (chaque phrase cite un fait).
3. **Boucle** : chaque modification de prompt ou de modèle relance le jeu en CI ; chaque correction faite dans l'interface (défusion, fait rejeté, fiche déplacée) devient un cas de test. LoCoMo et LongMemEval mesurent le rappel pour un agent, pas ce que Leon promet ; on les ignore ([LongMemEval](https://github.com/xiaowu0162/LongMemEval), [Mem0, état 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) : les scores divergent selon le juge et le top-k).

## 4. Ce que je n'ai pas pu vérifier

- Les internes de Sentra (modèles, seuils, revue humaine) et de Qontext (comment l'agent choisit un dossier) ne sont pas publiés.
- La doc Supermemory « how memory works » renvoie une 404 ; ses règles de contradiction viennent de sources secondaires.
- Le code actuel de Graphiti a pu diverger du papier de janvier 2025 (notamment le remplacement du reranker et les types d'entités « appris »).
- Le budget de recherche web de la session était épuisé : LangGraph (redirection), Temporal Cloud en Europe, OpenAI Agents SDK et les modèles GPT 2026 n'ont pas été vérifiés de première main. Les structured outputs Anthropic sont GA sur Sonnet 5, Opus 5, Haiku 4.5 ([doc](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)) ; côté OpenAI, la doc recommande un modèle nommé `gpt-6-astra` que je n'ai pas pu recouper ([doc](https://developers.openai.com/api/docs/guides/structured-outputs)).
- DenseLinkage est une bibliothèque de workshop, pas un produit ; je recommande d'en reprendre le motif, pas le code.
