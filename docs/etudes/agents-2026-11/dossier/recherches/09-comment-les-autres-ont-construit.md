# 09 - Comment les éditeurs d'agents ont construit leur système

État au 19 novembre 2026. Méthode : 24 recherches web (résumés de WebSearch), lecture directe de dust.tt par curl, vérification de versions npm. Les pages des éditeurs n'ont pas été ouvertes en entier, sauf dust.tt. Beaucoup de faits viennent donc de résumés de recherche : ils sont marqués **officiel**, **tiers** ou **déduit**. Tout ce qui vient de ma mémoire est marqué « à vérifier ».

Limite à garder en tête : les prix et plafonds des produits changent chaque mois. Les chiffres ci-dessous sont des ordres de grandeur, pas des tarifs à budgéter.

## 1. Dust (la référence, code ouvert)

### 1.1 Architecture du dépôt
| Fait | Nature | Source |
|---|---|---|
| Monorepo : `front/` (Next.js, routes API, workers Temporal), `core/` (service Rust : indexation, recherche, OAuth), `connectors/` (service de synchronisation) | tiers (DeepWiki, généré automatiquement, peut retarder sur le code) | https://deepwiki.com/dust-tt/dust |
| Une boucle d'agent = un workflow Temporal par message d'agent, lancé après le commit de la transaction qui a enregistré le message. Code sous `front/temporal/agent_loop/` | tiers | https://deepwiki.com/dust-tt/dust/5-conversation-system |
| Les appels de modèle et l'exécution des outils sont des activités Temporal | tiers | https://deepwiki.com/dust-tt/dust/4.3-tool-execution-and-authentication |
| Dust fait plus de 10 millions d'activités Temporal par jour sur Temporal Cloud ; usage de `continueAsNew` pour les workflows longs | officiel (blog de Temporal) | https://temporal.io/blog/how-dust-builds-agentic-ai-temporal |
| Chaque événement entrant des connecteurs (message, édition, PR) déclenche un workflow Temporal d'ingestion, d'enrichissement et d'indexation | officiel (blog de Temporal) | même URL |
| Surveillance : Datadog (navigateur et serveur, site `datadoghq.eu`), vu dans le HTML de dust.tt | officiel (lu par curl) | https://dust.tt/blog |

Déduit pour nous : Dust sépare trois choses que nous voulons séparer aussi. L'application (front), l'ingestion des données (connectors + core), l'orchestration durable (Temporal). Nous avons pg-boss au lieu de Temporal : voir recommandation.

### 1.2 (a) Modèle de données d'un agent
- Un agent a des consignes, des outils (serveurs MCP internes et distants), des connaissances (sources de données rangées dans des **espaces**), des déclencheurs, un modèle, des éditeurs. (tiers, DeepWiki « Agent Builder Interface » https://deepwiki.com/dust-tt/dust/3.2-agent-builder-interface)
- **Espaces** : ouverts (tout le monde) ou restreints (groupes). Un agent hérite des exigences de **tous** les espaces dont il utilise des ressources. Un utilisateur ne peut invoquer un agent que s'il a accès à tous ces espaces. (officiel : https://blog.dust.tt/permissions-in-the-age-of-ai-driven-companies-2 et https://dust.tt/blog/ai-solutions-built-in-privacy-governance)
- **Skills** (lancés le 26 janvier 2026) : un paquet de trois choses, consignes + connaissances + outils. Un skill est partagé entre agents, mis à jour une fois, appliqué partout. Il respecte les espaces : un skill qui touche deux espaces n'est utilisable que par un agent qui a les deux accès. Réservé aux admins et « builders ». (officiel : https://dust.tt/blog/skills-your-entire-agent-fleet-smarter-together)
- Propriétaire / droits : le droit d'accès de l'agent est fixé par les données qu'il utilise, pas par la personne qui l'invoque. (officiel, article de 2023 : https://blog.dust.tt/permissions-in-the-age-of-ai-driven-companies-2)

### 1.3 (b) Boucle d'exécution et bornes
- Boucle : modèle -> choix d'outils -> exécution (activité) -> résultat -> modèle, dans un workflow Temporal par message d'agent. (tiers, DeepWiki)
- Bornes exactes (nombre d'itérations, durée) : **non trouvé**. À lire dans `front/temporal/agent_loop/` et dans les paramètres de configuration de l'agent.
- Remarque : une boucle longue est coupée par `continueAsNew` côté Temporal (officiel, blog Temporal).

### 1.4 (c) Déclencheurs (« Triggers », annoncés le 10 novembre 2025)
| Fait | Nature | Source |
|---|---|---|
| Deux types : **planifié** (décrit en langage naturel, converti en cron + fuseau) et **webhook** | officiel | https://dust.tt/blog/introducing-triggers-your-agents-working-while-you-sleep |
| Activer un déclencheur planifié crée ou met à jour une **planification Temporal** par une fonction unique | tiers | https://deepwiki.com/dust-tt/dust/3-agent-system |
| Webhook : filtre évalué à la réception, puis lancement du workflow si ça correspond. Pour les fournisseurs prédéfinis, le filtre est généré depuis une description en langage naturel | tiers | https://deepwiki.com/dust-tt/dust/3.6-trigger-system |
| Sources prédéfinies : GitHub, Jira, Linear, Zendesk, Fathom, plus webhook personnalisé. L'**admin** crée la source de webhook, puis les membres ajoutent des déclencheurs | officiel | https://docs.dust.tt/docs/user-documentation/agents/triggers |
| **Limite par défaut : 42 exécutions par 24 h** par déclencheur webhook | officiel | même URL |
| Chaque exécution déclenchée est journalisée (quoi, quand, pourquoi) | officiel | blog Triggers |
| L'écriture dans les outils passe par les mêmes outils MCP que le chat | officiel | blog Triggers |
| Pour les cas complexes, Zapier / Make / n8n appellent l'agent via la **Conversation API** | officiel (11 mars 2026) | https://dust.tt/blog/automate-dust-agents-workflow-tools |

Idée à reprendre : l'agent est le même en chat et en automatique, avec les mêmes consignes, droits et connaissances (officiel, blog du 11 mars 2026).

### 1.5 (d) Validation humaine par niveau d'enjeu
- Chaque outil MCP a un niveau d'**enjeu** (« stake ») réglé par l'admin : `never_ask`, `low`, `medium`, `high`. (officiel, journal des changements https://docs.dust.tt/docs/changelog ; page Outlook https://docs.dust.tt/docs/outlook-tool-setup)
- Sources en désaccord sur le détail, à donner toutes :
  - Journal officiel et page Outlook : `high` = on demande toujours ; `medium` = l'utilisateur peut mémoriser une confirmation pour une entrée précise ; `low` = on demande, avec option de ne plus demander ; `never_ask` = jamais.
  - DeepWiki « MCP Server Architecture » (tiers) : `low` = une fois par conversation ; `medium` et `high` = à chaque appel. Autre page DeepWiki : `medium` = approbation par agent pour des combinaisons d'arguments.
  - Guide tiers StackOne : `medium` = une fois par couple agent + destinataire. (https://www.stackone.com/blog/best-mcp-gateway-for-dust/)
  - Conclusion : les versions diffèrent. Le principe est stable, le détail est à vérifier dans le code.
- Mécanisme (tiers, DeepWiki « Tool Execution and Authentication ») : pour `medium`, un champ `argumentsRequiringApproval` limite la demande aux arguments qui correspondent. L'accord est mémorisé par triplet (agentId, nom d'outil, valeurs d'arguments).
- Récent : la PR dust-tt/dust #35119 laisse un outil interne fixer son niveau d'enjeu **appel par appel**. Le niveau est calculé une fois, à la création de l'action, et sert à la fois à décider et à l'afficher dans la demande. (officiel, dépôt : https://github.com/dust-tt/dust/pull/35119)
- Conseil officiel du guide tiers : lecture = faible enjeu, écriture = fort enjeu.
- Où se fait le clic : dans la conversation (et Slack). Expiration : **non trouvé**. Comportement des exécutions déclenchées (sans humain devant l'écran) face à l'approbation : **non trouvé**.

### 1.6 (e) Journal et annulation
- Journal : chaque exécution déclenchée est journalisée, avec le raisonnement de chaque action (officiel, blog Triggers). Page produit « AI observability » existe (https://dust.tt/blog/ai-observability), non lue en détail.
- Annulation : **non trouvé**. Aucun mécanisme d'annulation des écritures n'est décrit.

### 1.7 (f) Droits d'accès
- Les données : espaces (ci-dessus). Les outils : OAuth par utilisateur pour les outils personnels (Outlook, Google, etc.) ; serveurs MCP distants avec secret partagé ou OAuth. (officiel, pages docs.dust.tt ; détail non lu)
- Faille connue de conception : un agent qui lit des données d'un espace restreint ne peut pas être vu par ceux qui n'y ont pas accès. Le coût est la prolifération d'agents par espace. (déduit)

### 1.8 (g) Facturation
- Prix publics : **non lus** (la page https://dust.tt/home/pricing est atteignable par curl mais rendue côté client). Je n'ai pas de chiffre vérifié.

### 1.9 (h) Limites reconnues
- Dust dit lui-même que les cas complexes (branches, écriture vers des outils non supportés) passent par un outil de workflow externe. (officiel, 11 mars 2026)
- Les webhooks natifs sont encore peu nombreux (GitHub, Jira, Linear, Zendesk, Fathom).

## 2. Onyx (code ouvert)
- Pile : FastAPI, Next.js, PostgreSQL, Redis, Celery (Redis comme courtier), Vespa pour la recherche (migration vers OpenSearch signalée, **sources en désaccord**), MinIO. (tiers : https://deepwiki.com/onyx-dot-app/onyx , https://onyx-dot-app-onyx.mintlify.app/architecture)
- Les connecteurs récupèrent les documents, produisent des chunks et des embeddings, écrits dans l'index. Tâches de fond : `vespa_metadata_sync`, `connector_deletion`, `doc_permissions_upsert`. (tiers, DeepWiki « Background Processing »)
- Les **permissions des documents sont synchronisées par un travail de fond** et appliquées comme filtre à la recherche. (tiers)
- Actions via MCP : le modèle choisit l'outil, Onyx l'exécute, le résultat revient dans le contexte. Recherche profonde, exécution de code en bac à sable (« Craft »). (tiers)
- Nombre de connecteurs : 40, 50 ou 60+ selon la source.
- Pour les huit questions a-h sur Onyx (déclencheurs, validation, facturation) : **non trouvé**. Onyx est plus un moteur de recherche avec agents qu'un système d'agents autonomes.

## 3. Autres éditeurs, résumé par question

### 3.1 Glean
- Déclenchement : manuel, planifié, ou « content trigger » quand un contenu change. Le déclencheur s'exécute avec les droits de l'utilisateur qui l'a activé : si cet utilisateur ne voit pas le document, rien ne se déclenche. (officiel : https://docs.glean.com/agents/concepts/content-trigger)
- Journal : « View run history » dans la vue des agents actifs. (tiers/officiel mêlés, même résultat)
- Droits : héritage des droits des sources, synchronisés en temps réel. (officiel affirmé par Glean, cité par tiers)
- Validation humaine : un comparatif tiers la mentionne, mais la sécurité de Glean la marque en bêta. **Non confirmé**.
- Facturation : siège « Enterprise Flex » + réserve commune de « FlexCredits ». Une exécution médiane coûte environ 7 crédits, le 90e centile environ 114. Prix de siège estimé 50 à 98 000 euros par an selon la source. (tiers : https://agentmarketplace.ai/glean-pricing , https://coworker.ai/blog/glean-pricing)
- Construire et tester ne consomme pas de crédits (tiers).

### 3.2 Notion (Custom Agents)
- Déclencheurs : planification ; événements Notion (commentaire ajouté, page ajoutée ou retirée d'une base, propriété modifiée, fin d'une note de réunion IA) ; Slack, e-mail, calendrier ; plusieurs déclencheurs combinables. (tiers : https://almcorp.com/blog/notion-custom-agents/ , https://matthiasfrank.de/en/notion-custom-agents-full-tutorial-use-cases-pricing-changes/)
- Droits : trois niveaux de partage (Full Access, Can Edit, Can View and Interact). L'agent tourne avec **ses propres droits** : quiconque a l'agent atteint ce que l'agent atteint. Pas d'accès à l'espace de travail tant que le créateur ne l'accorde pas. Les actions d'écriture peuvent être réglées pour s'exécuter sans approbation. (tiers : https://greenlitbooks.com/field-notes/is-notion-ai-agents-safe)
- Facturation : forfait Business ou Enterprise + crédits, 10 dollars les 1 000 par mois (13 en annuel selon une source). Une exécution typique : 0,03 à 0,30 dollar (estimation de Notion citée par tiers). Quand les crédits sont épuisés, **tous les agents s'arrêtent** et les exécutions planifiées ratées ne sont pas rattrapées. (tiers)
- Journal : journal d'activité par exécution ; annulation « possible » selon un guide, sans mécanique décrite. **Non confirmé**.

### 3.3 n8n
- Nœud d'agent avec un réglage **Max Iterations** ; défaut cité à 10 par un blog, **à vérifier** dans la doc officielle. Une demande de fonction dans la communauté demande une borne séparée sur les appels d'outils (tiers : https://community.n8n.io/t/feat-ai-tools-add-max-tool-interactions-to-ai-agent-nodes-to-prevent-infinite-loops/295587).
- Validation humaine : connecteur « Human Review » sur un outil précis de l'agent (l'agent s'arrête avant cet appel) ; sinon nœud Wait ou « Send and Wait for Response » avec boutons Slack / e-mail ; astuce de la communauté : envelopper l'action dans un sous-workflow « Send and Wait » exposé comme outil. (tiers : https://blog.n8n.io/human-in-the-loop-automation/ , https://community.n8n.io/t/how-to-enable-human-approval-for-specific-ai-agent-tool-calls-while-maintaining-normal-chat-conversation/272895)
- Aucune source officielle ouverte : tout est à vérifier par version.

### 3.4 Zapier Agents
- Facturation en « activités » (réserve séparée des tâches Zapier). Gratuit : 400 par mois ; payant : 1 500 ; prix 33 ou 50 dollars selon la source. Plafond par exécution : 10 (gratuit) ou 40 (payant). À la limite, l'agent **demande la permission de continuer**. Les déclencheurs ne comptent pas. (tiers : https://www.therundown.ai/tools/zapier-agents , https://a8gent.com/platforms/zapier-agents)
- Règle de pause pour les étapes IA d'un Zap : approbation manuelle après 75 tâches dans une exécution (tiers : https://latenode.com/blog/zapier-pricing).
- Limite reconnue (tiers) : les déclencheurs à plusieurs éléments et les boucles agent-vers-Zap multiplient l'usage.

### 3.5 Lindy
- Facturation par crédits, réserve commune : Plus 29,99 (3 000 crédits), Pro 99,99 (15 000), Max 199,99 (35 000), recharge 10 dollars les 1 000 ; les crédits ne se reportent pas. Une tâche coûte 2 à 2 500 crédits. (tiers : https://latenode.com/blog/lindy-ai-pricing , https://www.getmacha.com/blog/lindy-ai-complete-guide)
- Confirmation avant action, journal : **non trouvé**.

### 3.6 Relevance AI
- Deux compteurs : **Actions** (une exécution d'outil, même en échec) et **Vendor Credits** (modèle, au prix de gros). Pro 29 dollars (2 500 actions, 20 dollars de crédits) ; Team 349 (7 000 actions, 70 dollars). Recharges : 80 dollars les 1 000 actions. Offre gratuite retirée selon la source la plus récente. (tiers : https://www.getmacha.com/blog/relevance-ai-pricing-explained , https://www.activepieces.com/blog/how-much-does-relevance-ai-cost-2026-pricing-and-credits)
- Approbation, déclencheurs : **non trouvé**.

### 3.7 Langdock (Workflows)
- Déclencheurs : manuel, planifié, webhook, formulaire, intégration. Étapes d'approbation et points de relecture manuelle. Dans le chat, un workflow rattaché peut demander confirmation ; les workflows à webhook ou déclencheur d'intégration ne se lancent pas depuis le chat. (officiel : https://docs.langdock.com/en/using-langdock/workflows/nodes/triggers/integration-trigger , https://docs.langdock.com/product/workflows/introduction)
- Droits : avoir accès à l'agent **ne donne pas** accès aux workflows attachés. Les droits d'intégration peuvent expirer ; admins peuvent restreindre des actions à des groupes ; OAuth propre possible. (officiel)
- Prix : le site donne Core à 23,20 euros par utilisateur (2 500 exécutions de workflows par mois) ; un test tiers donne 449 euros par espace pour 40 000 exécutions. **Sources en désaccord**. Le modèle est facturé au prix de l'API. (https://langdock.com/pricing)

### 3.8 Fyxer
- Connexion OAuth Gmail + Agenda ou Microsoft Graph. Classe les mails (« To Respond », « FYI »), prépare des **brouillons** que l'utilisateur relit et envoie ; apprend le ton depuis les mails passés et depuis les corrections des brouillons. (tiers, avis commerciaux : https://tldv.io/blog/fyxer-ai-review/ , https://www.unite.ai/fyxer-review/)
- Portées exactes : **non trouvé** (aucune source ne les liste).
- Un concurrent (drel.ai) dit que l'accès complet à la boîte est la catégorie la plus risquée ; source partisane.
- Idée à reprendre : le produit n'envoie rien, donc pas besoin de validation ; le « clic » est l'envoi du brouillon dans le client mail.

### 3.9 Linear (agents invités)
- L'agent est installé par OAuth avec `actor=app` (admin d'espace). Portées `app:mentionable` (mentions) et `app:assignable` (délégation). (tiers : issue GitHub citée ; à vérifier sur https://linear.app/developers/agent-interaction)
- Webhook « AgentSession » : charge utile sous `agentSession` (pas `data`) ; actions `created` et `prompted` (tiers). Répondre au webhook en **5 secondes** ; première activité en **10 secondes** sinon l'agent paraît « non réactif ». Commencer par une activité de type `thought`. (officiel : https://linear.app/developers/agent-best-practices)
- Signature : `Linear-Signature` = HMAC-SHA256 hex du corps brut ; vérifier `webhookTimestamp` à moins d'une minute (tiers, **à vérifier**).
- Statut : API et SDK en préversion développeur (octobre 2026, tiers). SDK `@linear/sdk` 103.0.0 (registre npm, 19 nov. 2026).
- Article d'ingénierie : https://linear.app/now/our-approach-to-building-the-agent-interaction-sdk (non lu).

### 3.10 Slack
- API de recherche en temps réel (RTS) et serveur MCP, annoncés comme disponibles ; les données restent chez Slack, accès selon les droits de l'utilisateur, y compris canaux privés et messages directs. (tiers : https://www.reworked.co/digital-workplace/slacks-rts-api-and-mcp-server-hit-general-availability/ ; officiel Salesforce : https://www.salesforce.com/news/stories/slack-context-aware-ai-apps-agents/)
- Déclencheurs du Workflow Builder pour agents, validation : **non trouvé**.

### 3.11 Microsoft Copilot Studio
- Agents autonomes avec déclencheurs ; flux d'agent avec action d'approbation humaine et contrôles de boucle. (tiers : https://dev.to/holgerimbery/power-automate-and-copilot-studio-autonomous-agents-choosing-the-right-tool-for-your-automation-2agk)
- Facturation en « Copilot Credits » : page officielle donne action d'agent 5 crédits et actions de flux d'agent 13 crédits pour 100 actions ; les flux appelés par un agent autonome consomment des crédits même avec licence M365 Copilot. (officiel : https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-messages-management)
- **Désaccord** : plusieurs guides tiers disent 25 crédits par déclencheur autonome ; ce chiffre n'est pas sur la page officielle. Prix tiers : 200 dollars les 25 000 crédits, soit 0,01 dollar le crédit.
- Limite reconnue par les tiers : « surprise de facture » ; la création et les tests consomment déjà des crédits (environ 447 avant la première exécution pour un cas cité).

### 3.12 Claude (Cowork : skills, tâches planifiées, connecteurs)
- Chaque exécution planifiée = **sa propre session Cowork**, avec les connecteurs et plugins configurés. Si un outil de connecteur est réglé sur « toujours demander », l'exécution **attend la réponse ou termine sans l'outil**. Les tâches vont au nuage selon le forfait ; celles qui ont besoin de fichiers locaux restent sur l'ordinateur, appli ouverte (deux sources officielles qui se nuancent). (officiel : https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork , https://academy.claude.com/tutorials/delegating-and-scheduling-tasks-in-claude-cowork)
- Skills : instructions ; plugins : lot de skills + connecteurs distribué à une équipe ; les skills ne contiennent jamais d'identifiants. (officiel, Claude Academy)
- Format SKILL.md et chargement progressif : **non trouvé** dans cette recherche (de mémoire : fichier avec en-tête `name` et `description`, corps chargé à la demande ; à vérifier).
- Limite signalée par un tiers : les connecteurs MCP locaux ne sont pas vus par les tâches exécutées dans le nuage (https://oktopeak.com/blog/claude-cowork-scheduled-tasks-local-mcp-connector/).

### 3.13 ChatGPT (agents d'espace de travail)
- Disponibles pour Business, Enterprise, Edu ; les admins contrôlent qui peut construire. Déclencheurs : planification, **API**, Slack, ChatGPT. L'appel API renvoie `202 Accepted` **sans corps ni identifiant d'exécution** : la sortie ne se récupère pas par l'API. (officiel : https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business , https://developers.openai.com/cookbook/examples/chatgpt/workspace_agents/workspace-agents-api-trigger)
- Approbation : les actions d'écriture peuvent exiger une approbation ; réglage « personnalisé » par action d'écriture pour les admins. (officiel/tiers)
- Facturation : en crédits liés aux jetons (tiers : 100 crédits par million de jetons en entrée, 500 en sortie ; 5 à 25 crédits par exécution typique) ; dates de fin de gratuité en désaccord (6 mai ou 2 juin 2026). Statut (disponible ou préversion) en désaccord.
- Journaux de conformité pour Enterprise et Edu.

## 4. Tableau de synthèse

| Éditeur | Déclencheurs | Clic de validation | Facturation | Droits |
|---|---|---|---|---|
| Dust | planifié, webhook (42 / 24 h) | dans la conversation, par niveau d'enjeu | non trouvé | espaces + droits des outils |
| Glean | manuel, planifié, contenu | non confirmé | crédits (7 médian) | héritage des sources, droits de l'utilisateur déclencheur |
| Notion | planifié, événements, Slack, mail | réglable par écriture | crédits (10 $ / 1 000) | droits propres de l'agent |
| n8n | tout nœud déclencheur | Human Review / Wait | par exécution (auto-hébergé : libre) | non étudié |
| Zapier Agents | Zaps, planifié | « demande pour continuer » à la limite | activités | non étudié |
| Langdock | planifié, webhook, formulaire, intégration | étape d'approbation | exécutions + API | accès agent != accès workflow |
| Copilot Studio | déclencheurs autonomes | approbation humaine dans les flux | crédits (5 / action) | non étudié |
| Claude Cowork | planifié | « toujours demander » par outil | forfait | connecteurs de l'utilisateur |
| ChatGPT | planifié, API, Slack | approbation par écriture | crédits liés aux jetons | rôles + outils admis |
| Linear | mention, délégation | non étudié | non étudié | OAuth `actor=app` |

## 5. Produits qui proposent des automatisations à partir de l'activité observée
Peu de produits grand public le font vraiment. Trouvé :
- **Worktrace AI** : observe l'écran, regroupe les workflows observés en processus (phases, décisions, goulots), génère des agents ou des exports n8n et Copilot Studio. (tiers : https://www.worktrace.ai/)
- **Fyxer** : apprend le ton et les préférences par les corrections de l'utilisateur sur les brouillons (tiers). C'est un apprentissage de style, pas une proposition d'agent.
- AutoFlow AI et d'autres : décrits dans des listes de basse qualité, **non retenus**.
- Glean, Notion, Dust : aucune source trouvée sur des suggestions d'agents faites par le produit à partir de l'activité. **Non trouvé**.
- Méthode déduite pour nous : repérer des motifs répétés dans les événements déjà reçus (même expéditeur + même type de réponse + même action), puis proposer une fiche d'agent en mode « propose » avec le journal des cas passés comme preuve. Aucune source ne décrit une méthode publiée.

## 6. Dix choix de conception à reprendre
1. **Un workflow durable par message d'agent, lancé après le commit de la base.** Évite de lancer un travail dont le message n'existe pas encore. Source : Dust (DeepWiki conversation system).
2. **Les outils d'écriture passent par une interface d'outils unique (MCP), avec un niveau d'enjeu par outil.** Source : Dust (journal des changements).
3. **Niveau d'enjeu calculé par appel, une fois, à la création de l'action ; le même niveau décide et s'affiche.** Source : Dust PR #35119.
4. **Mémoriser un accord par triplet (agent, outil, arguments).** Pas par outil seul. Source : Dust (DeepWiki).
5. **Droits des données portés par un espace, et l'agent hérite de tous les espaces qu'il touche.** Source : Dust.
6. **Un skill = consignes + connaissances + outils, partagé entre agents.** Source : Dust (26 janv. 2026) ; équivalent Claude (skills, plugins).
7. **Même agent en chat et en automatique.** Source : Dust (11 mars 2026).
8. **Plafond d'exécutions par déclencheur par défaut (42 / 24 h) et planification créée côté orchestrateur.** Sources : Dust docs ; DeepWiki.
9. **Répondre vite au webhook (5 s) et poster tout de suite une première activité visible (10 s), le travail suit en tâche de fond.** Source : Linear (best practices).
10. **Une exécution planifiée qui rencontre un outil « toujours demander » attend ou termine sans l'outil, et le dit.** Source : Claude Cowork (aide officielle). À rapprocher de la limite de crédits de Zapier : on demande la permission de continuer.

Choix complémentaires utiles : exécution avec les droits de l'utilisateur déclencheur (Glean) ; facturation à deux compteurs, action et modèle (Relevance AI) ; sortie lisible quand on appelle l'agent par API (contre-exemple ChatGPT, voir erreurs).

## 7. Cinq erreurs à éviter
1. **Arrêt global quand le budget est épuisé.** Notion arrête tous les agents et ne rattrape pas les exécutions planifiées ratées. Source : tiers (matthiasfrank.de, almcorp.com).
2. **Appel déclenché sans identifiant d'exécution.** L'API de ChatGPT renvoie 202 sans corps : impossible de suivre le résultat. Source : OpenAI (cookbook).
3. **Facturation opaque ou qui compte les tests et les échecs.** Copilot Studio (447 crédits avant la première exécution, 25 crédits par déclencheur selon les tiers) ; Relevance AI compte une action en échec. Sources : tiers.
4. **Agent qui tourne avec ses propres droits et les prête à tous ses utilisateurs.** Notion : quiconque a l'agent atteint ce que l'agent atteint. Source : tiers (greenlitbooks.com). Mieux : droits de l'utilisateur concerné (Glean), ou accès à l'agent séparé de l'accès aux outils (Langdock).
5. **Une borne d'itérations qui ne borne pas le coût.** n8n : borne sur les itérations seulement, demande de borne sur les appels d'outils ; Zapier : les boucles agent-vers-Zap multiplient l'usage. Sources : tiers.

Sixième à noter : plusieurs éditeurs affichent des niveaux de validation différents selon la page ou la version (Dust : trois descriptions). Figer notre définition dès le départ, dans le code et la doc.

## 8. Ce que je recommande
- **Orchestration** : pg-boss suffit pour deux fondateurs, à condition de copier les principes de Dust sans Temporal : une tâche par exécution d'agent, créée dans la même transaction que le message, tâches d'étape idempotentes, état de l'exécution en base. Temporal (`@temporalio/client` 1.26.0) seulement si les exécutions dépassent des heures ou si les pauses de validation deviennent nombreuses. Pg-boss 12.38.2 (registre npm). (Voir note 03 pour la comparaison.)
- **Niveaux d'enjeu** : quatre niveaux comme Dust (`never_ask`, `low`, `medium`, `high`), mais notre curseur d'autonomie par agent prime : « propose » force `high` sur toute écriture ; « agit et prévient » = `medium` ; « agit seul » = `low` sur les actions réversibles uniquement. Un niveau calculé par appel (choix 3).
- **Clic de validation** : dans le poste de contrôle et en lien dans Slack ou par mail ; chaque demande a une expiration explicite (non trouvée chez les autres, donc notre décision : 24 h, puis l'exécution passe en « expirée » et le journal le dit).
- **Droits** : exécuter avec les jetons OAuth de l'utilisateur propriétaire de la ressource ; un agent partagé n'a jamais plus de droits que son déclencheur (Glean). Compter les espaces comme Dust si les clients le demandent ; au début, un agent a un propriétaire et un périmètre de sources.
- **Journal** : une ligne par étape (entrée, raisonnement, appel d'outil, sortie, niveau d'enjeu, décision humaine). Aucun éditeur étudié ne décrit d'annulation : prévoir l'annulation seulement pour les actions que l'outil sait défaire (brouillon supprimé, étiquette retirée), et marquer les autres « non annulable » dans la fiche d'outil.
- **Déclencheurs** : planifiés par la file ; webhooks avec réponse immédiate, file d'attente, déduplication, plafond par déclencheur et par agent (départ à 42 / 24 h, ajustable). Pour Linear : portées `app:mentionable` et `app:assignable`, réponse sous 5 s.
- **Facturation interne** : deux compteurs, appels d'outils et jetons du modèle, avec plafond par exécution et par jour ; à la limite, **demander** plutôt que couper (Zapier) et ne jamais arrêter tout le monde (erreur 1).
- **Automatisations proposées** : commencer par le motif le plus simple (corrections répétées de brouillons, comme Fyxer) avant toute exploration d'activité.

## 9. Ce que je n'ai pas trouvé
- Les bornes exactes de la boucle de Dust (itérations, durée, taille de contexte), l'expiration d'une demande de validation chez tous les éditeurs, et le comportement de la validation pour une exécution déclenchée sans humain devant l'écran (Dust).
- Le prix actuel de Dust (page rendue côté client), la facturation chez Slack, Linear, Onyx, Fyxer.
- La mécanique d'annulation chez Notion, Glean, Dust : aucune description fiable.
- Les portées OAuth exactes de Fyxer ; les noms exacts des événements Linear (`created` / `prompted` sont de source tiers) ; le détail officiel de Max Iterations chez n8n.
- Les déclencheurs et la validation de Lindy et de Relevance AI ; les déclencheurs du Workflow Builder de Slack.
- Les articles d'ingénierie : seuls ceux de Temporal sur Dust et de Linear sur le SDK d'agents ont été repérés, pas lus en entier. Pas de lecture directe du code source de Dust ni d'Onyx (uniquement DeepWiki, parfois vieux de 80 à 250 jours).
- Les documentations officielles de Glean, Notion, n8n, Zapier, Lindy, Slack, Microsoft et OpenAI n'ont pas été ouvertes : les résumés de recherche les citent, mais je n'ai pas lu les pages.
- Une méthode publiée d'automatisations proposées à partir de l'activité observée, hors Worktrace.
