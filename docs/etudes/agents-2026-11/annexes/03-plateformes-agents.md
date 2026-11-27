# Annexe 3 : comment les plateformes d'IA d'entreprise vendent et font tourner leurs agents

Relevé du 19 novembre 2026 par un agent Claude. Plateformes : Dust, Glean, Notion, Langdock, Sana (Workday), Atlassian Rovo, Slack / Agentforce, puis plus brièvement Dropbox Dash, Guru, Onyx et GoSearch.

Légende : **[OFF]** page de l'éditeur ; **[TIERS]** presse, comparatif, annuaire, avis ; **[DED]** déduction de l'agent. « Chiffre du vendeur » signale un chiffre auto-déclaré.

Limites de ce relevé, à lire avant le reste :

- Seul dust.tt a pu être lu directement (pages téléchargées le 19/11/2026). Pour les dix autres plateformes, le réseau bloquait les sites : tout vient de résumés de recherche web, donc surtout de sources tierces, dont beaucoup sont des blogs de concurrents (eesel.ai, gosearch.ai, coworker.ai, dust.tt lui-même). Les prix tiers sont à revérifier sur les pages officielles avant tout usage commercial.
- La recherche a été coupée puis limitée à une douzaine de requêtes. Plusieurs questions restent « non trouvé » ; elles sont listées à la fin.
- Aucun avis G2, Reddit ou Hacker News n'a pu être lu en direct.

---

## 1. Dust (Paris) : lu à la source

### Ce qu'est un agent

- Un agent = des instructions, un modèle choisi parmi « 20+ », des connaissances (sources de données rangées dans des espaces) et des outils (connecteurs et serveurs MCP) [OFF] (https://dust.tt/home/pricing).
- Depuis le 26/01/2026, une couche au-dessus : les **Skills**. Une skill regroupe instructions, connaissances et outils, et se réutilise dans tous les agents. « Update once, improve everywhere » [OFF] (https://dust.tt/blog/skills-your-entire-agent-fleet-smarter-together). Raison donnée par Dust : la même règle métier se retrouvait copiée dans quatre agents, avec quatre versions qui divergeaient [OFF] (https://dust.tt/blog/build-a-flock-not-a-crowd).
- Depuis le 07/07/2026 : skills « auto-améliorantes », qui apprennent de l'usage [OFF] (https://dust.tt/blog/introducing-self-improving-skills-reusable-ai-capabilities). Détail du mécanisme : non relevé.

### Qui le crée, comment, en combien de temps

- N'importe quel salarié, sans code. Dust dit que la plupart des créateurs ne sont pas ingénieurs. Exemples du vendeur : un chef de produit a créé 242 agents, un autre en a modifié 560 en 2025 [OFF] (https://dust.tt/blog/dust-wrapped-2025).
- Interface : un formulaire (« Agent Builder »), sans canevas visuel. Dust défend ce choix dans un billet du 16/01/2026, « AI Agents don't need to be Boxes and Lines » [OFF] (https://dust.tt/blog/ai-agents-boxes-and-lines).
- Depuis le 09/04/2026 : **Sidekick**. On décrit le besoin en langage naturel, Sidekick pose deux questions puis rédige les instructions et propose outils et skills, sous forme de modifications à accepter ou refuser. Il sait aussi transformer une conversation réussie en agent (« Convert to agent ») et améliorer un agent existant à partir des retours et des mesures d'usage [OFF] (https://dust.tt/blog/product-update-23).
- Temps : un client (Patch, moins de 50 salariés) dit avoir recréé son cas d'usage « en 20 minutes environ » [OFF, témoignage client] (https://dust.tt/customers/how-patch-empowered-70-of-its-team-to-use-ai-agents-weekly). Dust parle d'« un après-midi » pour un agent branché sur la documentation produit [OFF] (dust-wrapped-2025).

### Déclencheurs

- Mention manuelle (@agent) dans Dust, dans Slack, dans l'extension Chrome et, depuis le 19/11/2026, dans Excel, PowerPoint et Word, sur tous les plans [OFF] (https://dust.tt/blog/dust-agents-company-knowledge-excel-powerpoint-word).
- Planification : agents planifiés depuis le 29/09/2025, décrits en langage naturel, sans syntaxe cron [OFF] (https://dust.tt/blog/dust-product-update-17).
- Événements : « Triggers » depuis le 10/11/2025. Webhooks (GitHub, Jira et webhooks génériques), avec filtrage. Chaque exécution est journalisée [OFF] (https://dust.tt/blog/introducing-triggers-your-agents-working-while-you-sleep). Exemples donnés : fin d'un appel commercial → e-mail de suivi et mise à jour du CRM prête à poster ; ouverture d'une PR → revue de code ; arrivée d'un ticket → tri et brouillon de réponse ; synthèse hebdomadaire de cinq systèmes vers Notion.
- E-mail : depuis mai 2026, on met un agent en copie ou on lui transfère un message ; il lit le fil, agit et répond. L'administrateur doit activer la fonction [OFF] (https://dust.tt/blog/your-agent-lives-in-your-inbox).
- Sous-agents : agents chaînables depuis juillet 2025 ; « Multi-agent orchestration » inclus dans le plan Business [OFF] (https://dust.tt/blog/dust-product-update-15, https://dust.tt/home/pricing). Exemple : un agent anti-fraude qui pilote 6 agents spécialisés [OFF] (dust-wrapped-2025).

### Actions dans les outils

- Mécanisme : presque tout passe par MCP. La page intégrations liste **105 intégrations** au 19/11/2026, chacune avec son nombre d'actions (Airtable 40, Amplitude 48…) [OFF] (https://dust.tt/integrations). La page d'accueil dit « 70+ connectors » et la page prix « 20+ data sources » [OFF]. [DED] : les « 20+ » sont les connecteurs qui indexent les données (recherche sémantique) ; le reste sont des outils MCP appelés à la demande. Le plafond de 3 du plan Business porte sur les premiers.
- Écriture : Google Drive (créer et modifier Docs, Sheets, Slides, commenter) depuis février 2026, avec le périmètre OAuth `drive.file` : l'agent ne touche que les fichiers qu'il a créés ou qu'on lui a partagés [OFF] (https://dust.tt/blog/product-update-22). E-mails et invitations de calendrier depuis juillet 2025. CRM Attio, Ashby, Front, Intercom, Granola, Fathom ajoutés en 2026 [OFF] (product-update-22 et 23).
- Navigateur : l'extension Chrome, refaite en avril 2026, lit les onglets, prend des captures et peut cliquer et saisir dans la page, après demande d'autorisation [OFF] (product-update-23).
- Validation humaine : diffs à accepter dans Sidekick, autorisation demandée pour lire une page, « human review » mis en avant, et un client de 45 personnes décrit « 4 workflows entièrement automatisés, chacun avec un humain dans la boucle » [OFF]. Règle exacte de confirmation avant une écriture : non trouvée (la documentation docs.dust.tt n'était pas accessible).
- Garde-fous : « inference hooks » avec Datadog AI Guard depuis le 05/11/2026, pour surveiller ou bloquer une interaction à des points de contrôle [OFF] (https://dust.tt/blog/datadog-ai-guard-inference-hooks).

### Agents livrés tout faits

- Une galerie de modèles existe dans l'Agent Builder. Depuis avril 2026, choisir un modèle ouvre Sidekick, qui l'adapte au contexte de l'entreprise au lieu de coller des instructions figées [OFF] (product-update-23). **Liste des modèles : non trouvée** (elle n'est pas sur le site public ; elle vit dans l'application et la documentation).
- À défaut, les cas d'usage que Dust met en avant par métier [OFF] (https://dust.tt/home, https://dust.tt/home/solutions/sales) :
  - Vente : fiche de compte avant rendez-vous, e-mails de prospection et de suivi à partir des transcriptions d'appels, réponses aux questions de prospects et aux appels d'offres, analyse des appels, hygiène du CRM, qualification des leads.
  - Support : tri et routage des tickets, brouillons de réponse, transformation des tickets résolus en documentation, détection des comptes à risque.
  - Marketing : briefs, localisation, analyse de performance, posts.
  - Données : questions en langage naturel, surveillance de tableaux de bord, rapports.
  - Ingénierie : revue de code, réponse aux incidents, documentation continue.
- Agents les plus utilisés : Dust ne publie pas de classement. Indices : 65 % des messages envoyés aux agents vont à des agents personnalisés utilisés par plus d'une personne (Dust Index, 07/10/2026) ; un salarié de Dust utilise plus de 15 agents différents par semaine [OFF, chiffres du vendeur] (https://dust.tt/blog/dust-index-ai-strategy-beyond-models, build-a-flock-not-a-crowd).

### Prix, lus à la source le 19/11/2026

Source : https://dust.tt/home/pricing [OFF]. Le relevé du 19 octobre est confirmé, rien n'a changé.

- Plan Business, self-service, « For teams up to 100 people ». Trois types de sièges, mélangeables : Free 0 € (500 crédits à vie) ; **Pro 24 €/siège/mois en annuel, 30 € en mensuel, 8 000 crédits/mois** ; Max 120 € en annuel, 150 € en mensuel, 40 000 crédits/mois. Hors TVA. Aucun minimum de sièges affiché.
- **Plafonds du plan Business : 3 connecteurs de données (« Up to 3 »)**, 5 serveurs MCP distants, 5 espaces, SSO « à partir de 5 sièges, sur demande », API de conversation seulement.
- Enterprise, sur devis : connecteurs et MCP illimités, crédits mis en commun, SCIM, journaux d'audit, rétention sur mesure, single-tenant, CSM, DPA et MSA négociés, API des sources de données.
- Crédits : facturés par message selon le modèle et les outils appelés. Pas de report d'un mois sur l'autre. Dépassement possible si l'administrateur l'active, plafonné. Usage programmatique (API, déclencheurs) : 0,01 $ par crédit. Combien de crédits coûte une exécution type : non publié sur la page.
- Le passage aux crédits date du 23/06/2026. Justification du PDG : skills, réveils planifiés, Frames, mémoire et chaînage consomment plus de calcul [OFF] (https://dust.tt/blog/economics-of-multiplayer-ai).
- Coût [DED] : 30 sièges Pro en annuel = 720 €/mois, soit 8 640 €/an HT. 100 sièges Pro = 2 400 €/mois, soit 28 800 €/an HT, mais 100 est le plafond du self-service et 3 connecteurs ne suffisent pas à une société qui veut brancher Gmail, Drive, Slack, HubSpot et Notion : elle bascule en Enterprise, sur devis.

### Adoption

- 3 000+ organisations, 300 000+ agents déployés (mai et novembre 2026) [OFF, chiffres du vendeur] (https://dust.tt/blog/series-b-multiplayer-ai). En 2025 : 80 000 agents, 12 millions de conversations ; une seule société a configuré 7 683 agents [OFF] (dust-wrapped-2025). [DED] : environ 100 agents par organisation en moyenne, moyenne tirée par quelques très gros comptes.
- Série B de 40 M$ le 18/05/2026 (Abstract, Sequoia, Snowflake Ventures, Datadog) [OFF]. ARR d'environ 20 M$ : presse, déjà dans l'étude d'octobre.
- **Taille des clients cités : 58 cas publiés au 19/11/2026, dont 3 de 1 à 50 salariés, 18 de 51 à 200, 28 de 201 à 1 000 et 9 de plus de 1 000. 48 en Europe, 12 aux États-Unis** [OFF, données de la page] (https://dust.tt/customers). Donc 21 cas sur 58 (36 %) ont moins de 200 salariés.
- Les trois petits : Nexio Projects (conseil ESG, Rotterdam, 45 personnes : 88 % d'usage quotidien en 4 mois, 100+ agents publiés, 70 skills, 4 workflows automatisés, 4 à 6 h gagnées par commercial et par semaine), Patch (climat, États-Unis : 70 % de l'équipe utilise des agents chaque semaine), Ardabelle (fonds de capital-investissement) [OFF, chiffres du client et du vendeur].
- PME et ETI françaises citées, souvent via un partenaire : Applium (SAP, 90 % d'adoption en 29 jours, via Idoption), Adomik (via Wesype), Apiday, DataValue Strategy, CMI Strategies (100 consultants, 95 %), Fluxym, PMP Strategy (150 personnes, 97 %) [OFF]. Profil dominant : cabinets de conseil et éditeurs SaaS, pas la PME traditionnelle [DED].
- Taux d'adoption affichés : 70 à 97 % chez les clients mis en avant. À comparer au chiffre que Dust cite lui-même pour le marché : 15 % d'adoption moyenne après six mois et 95 % de pilotes d'IA générative sans valeur tangible [OFF, source primaire non donnée] (https://dust.tt/blog/ai-rollout-working-people-need-it-least).

### Droits

- Modèle à deux couches, décrit le 27/01/2025 [OFF] (https://dust.tt/blog/permissions-in-the-age-of-ai-driven-companies-2) :
  - Agent ↔ données : l'agent hérite de l'accès aux données des espaces que son créateur a utilisés, « et pas plus ». Cet accès reste le même quel que soit l'utilisateur. Un agent RH répond donc avec des documents RH à des salariés qui ne peuvent pas ouvrir ces documents.
  - Humain ↔ agent : par défaut, seuls ceux qui ont accès à tous les espaces concernés peuvent utiliser l'agent. Un administrateur peut ouvrir l'agent à d'autres groupes.
- Conséquence [DED] : Dust **ne reprend pas les droits de la source** document par document. L'administrateur redéfinit les droits par espaces. Dust l'assume : « This might feel like extra overhead – it is. » Risque : un agent mal rangé expose à tous un contenu restreint. Limite pour une PME : 5 espaces au plan Business.
- Incident public sur ce point : non trouvé.

### Critiques

- Entretien : Dust écrit lui-même qu'un agent « qui marche aujourd'hui peut donner d'autres résultats la semaine prochaine » parce que les connaissances changent [OFF] (https://dust.tt/blog/evaluation-to-maintenance). Les skills, Sidekick et le tableau de bord d'observabilité (février 2026) sont des réponses à ce problème.
- Dépendance à la qualité des documents : l'agent répète les docs périmés et les contradictions de Slack. Gouvernance : si chacun crée son agent, les agents se chevauchent et sèment la confusion. Prix : le siège Pro et les plafonds poussent tôt vers l'Enterprise [TIERS, sites comparatifs dont certains concurrents] (https://www.1stpage.agency/reviews/dust-review/, https://tooliverse.ai/tools/dust, https://metaflow.life/blog/dust-tt-reviews).
- G2 : 4,9/5 sur 19 avis selon un comparatif ; trop peu d'avis négatifs publics pour conclure [TIERS] (metaflow.life). Reddit et Hacker News : non trouvé.

### Mouvements datés [OFF] (https://dust.tt/blog)

14/08/2025 mémoire d'agent · 29/09/2025 agents planifiés · 15/10/2025 Frames (tableaux de bord interactifs) · 29/10/2025 Deep Dive (recherche longue) · 10/11/2025 Triggers · 05/12/2025 voix · 06/01/2026 mentions entre humains · 26/01/2026 Skills · 24/02/2026 Dust Academy · 26/02/2026 écriture Google Drive et observabilité · 30/03/2026 extension Chrome qui agit dans la page · 09/04/2026 Sidekick · 18/05/2026 série B · 28/05/2026 agent par e-mail · 23/06/2026 prix par crédits · 07/07/2026 skills auto-améliorantes · 05/11/2026 inference hooks · 19/11/2026 compléments Office 365. Pods (espaces persistants partagés humains et agents) : sur le site en novembre 2026, date de sortie non relevée.

### France et canal

- Vente directe en self-service, plus un réseau de partenaires qui s'étoffe en 2026 : Niji (07/07), AI Partners, Paris (23/09), Mantu (15/10), Artefact (03/11), et des « Platinum Partners » qui signent des cas clients : Idoption, Wesype [OFF]. La page partenaires ne prend plus que des inscriptions en liste d'attente [OFF] (https://dust.tt/home/partner).
- Un intégrateur, socIAty, dit avoir déployé Dust dans plus de 20 PME de 10 à 200 personnes [TIERS, site de l'intégrateur] (https://sociaty.io/integrateur-dust/).
- Argument de vente actuel face à Claude : un ingénieur avant-vente écrit qu'il vend surtout à des gens « qui utilisent déjà beaucoup Claude » et qui se demandent pourquoi payer autre chose. Sa réponse : la distribution à ceux qui ne configureront jamais rien, une bibliothèque centrale, un propriétaire, des mises à jour [OFF] (https://dust.tt/blog/what-multiplayer-ai-unlocks-for-your-business, 02/11/2026).

---

## 2. Glean (États-Unis)

Base déjà connue : voir `concurrents-2026-10/annexes/01-glean.md`. Ici, les agents seulement.

- **Agent** : deux modes, « Auto » (on décrit, Glean construit) et « Workflow » (étapes, branches, boucles, choix du modèle par étape) [OFF, vu par résumé] (https://docs.glean.com/agents/auto-mode-agent, https://docs.glean.com/glean-core-suite-pricing). Un assistant de construction existe ; il consomme des crédits.
- **Déclencheurs** [OFF, vu par résumé] (https://docs.glean.com/agents/how-agents-work) : lancement manuel depuis la bibliothèque ou un lien ; planification, activée par chaque utilisateur pour lui-même, par exemple un condensé quotidien (https://docs.glean.com/agents/concepts/schedule-triggers) ; déclencheur de contenu, par exemple le changement de statut d'un ticket (https://docs.glean.com/agents/concepts/content-trigger). Les messages de Gleanbot sont exclus pour éviter les boucles dans Slack. Un article de mai 2026 dit ces déclencheurs encore en bêta [TIERS] (https://thelettertwo.com/2026/05/12/glean-enterprise-agent-development-lifecycle/).
- **Sous-agents** : depuis juillet 2026, un agent peut déléguer à un agent tiers compatible A2A [OFF] (https://docs.glean.com/release-notes/releases/2026-07-29-july-release).
- **Agents tout faits** : bibliothèque rangée par métier (ingénierie, RH, marketing, vente, support, IT) [OFF] (https://docs.glean.com/agents/concepts/agent-library). « 30+ » agents préconstruits annoncés le 20/05/2025 : prospection, résolution de tickets, revue de code, help desk [OFF, communiqué] (https://www.businesswire.com/news/home/20250520667569/en/). Liste nominative et agents les plus utilisés : non trouvé.
- **Prix** : non publié. Siège plus crédits « FlexCredits » consommés seulement quand un agent tourne ; créer et tester est inclus [TIERS] (https://agentmarketplace.ai/glean-pricing). 35 à 50 $/utilisateur/mois, contrat annuel minimum de 25 000 à 50 000 $ [TIERS] (https://www.thunai.ai/blog/glean-review, https://workativ.com/ai-agent/blog/glean-pricing). [DED] : une société de 30 personnes n'est pas servie ; à 100 personnes, compter 50 000 à 60 000 $ par an.
- **Adoption des agents** : nombre d'agents créés, non trouvé. ARR de 300 M$ en mai 2026 (étude d'octobre).
- **Droits** : droits de la source hérités et appliqués à chaque lecture et écriture de l'agent (étude d'octobre). C'est l'inverse du modèle Dust.
- **Critiques, France** : voir l'annexe d'octobre. Rien de neuf trouvé sur les agents.

---

## 3. Notion (États-Unis)

- **Agent** : deux objets. « Notion Agent », l'assistant personnel inclus dans le plan Business. « Custom Agents », des agents autonomes d'équipe, avec instructions, accès et déclencheurs [TIERS] (https://www.eesel.ai/blog/notion-ai-review).
- **Déclencheurs des Custom Agents** [TIERS, concordant sur plusieurs guides] (https://matthiasfrank.de/en/notion-custom-agents-full-tutorial-use-cases-pricing-changes/, https://almcorp.com/blog/notion-custom-agents/) : planification récurrente ; événements Notion (page créée, modifiée ou supprimée dans une base, mention) ; événements Slack (nouveau message, réaction emoji, début de fil, mention dans un canal public). Les déclencheurs Slack exigent qu'un administrateur Slack connecte l'espace.
- **Actions** : écrire dans Notion, Slack, Mail, Calendar, le web et des serveurs MCP [TIERS] (mêmes sources).
- **Prix** : plan Business à 20 $/membre/mois en annuel. Les Custom Agents ont été gratuits jusqu'au 03/05/2026, puis facturés en crédits depuis le 04/05/2026 : **10 $ les 1 000 crédits**, mis en commun, remis à zéro chaque mois, sans report. Réservés aux plans Business et Enterprise. Notion ne publie pas le coût en crédits d'une exécution. Quand les crédits sont épuisés, les exécutions planifiées sont sautées et ne sont pas rattrapées [TIERS] (https://techjacksolutions.com/ai-tools/notion-ai/notion-ai-pricing/, https://www.therundown.ai/tools/notion-custom-agents).
- **Coût [DED]** : 30 sièges = 600 $/mois ; 100 sièges = 2 000 $/mois ; plus les crédits des agents personnalisés, non prévisibles.
- **Adoption** : Ramp ferait tourner plus de 300 agents et Notion 2 800 en interne ; Ramp gagnerait 20 h par semaine sur le tri des questions Slack [TIERS, chiffres proches du vendeur, non vérifiés] (almcorp.com). Nombre total d'agents, part de PME : non trouvé.
- **Modèles tout faits, droits, critiques détaillées** : non trouvé dans ce relevé.
- **France** : aucun canal spécifique trouvé. Notion est déjà installé dans beaucoup de PME et de start-up ; c'est sa distribution [DED].

---

## 4. Langdock (Berlin)

- **Agent** : assistant configuré (instructions, connaissances, intégrations) dans un chat multi-modèles. À côté, un produit distinct, **Workflows**, pour les automatisations en étapes, avec déclencheurs webhook et planification [TIERS] (https://github.com/Agenta-AI/agenta/pull/8136). Liste complète des déclencheurs et modèles d'agents : non trouvé.
- **Actions** : « 40+ » intégrations selon la page prix [OFF, vu par résumé] (https://langdock.com/pricing). Un serveur MCP expose les agents de l'espace comme outils à un client MCP externe [TIERS] (https://agentery.com/agents/langdock_agent_mcp_server). Gouvernance d'une passerelle MCP : encore « coming soon » [TIERS] (https://ecom-tools.de/en/langdock-review/).
- **Prix : les sources se contredisent.** 25 € par utilisateur et par mois, siège Max à 99 € (relevé d'octobre sur la page officielle, et https://www.teamazing.com/blog/langdock-enterprise-review-2026/). 20 € en annuel selon tl;dv (https://tldv.io/blog/langdock/). Nouvelles licences « Core, Work, Max » avec Core à 29 € en mensuel ou 23,20 € en annuel jusqu'à 50 utilisateurs, dégressif jusqu'à 16 €, selon un revendeur allemand (https://www.unfuture.de/en/langdock/kosten) [TIERS]. La grille a peut-être changé à l'automne 2026 : à vérifier sur langdock.com.
- **Workflows, facturés à part, par espace** : Starter inclus, 2 500 exécutions par mois. Business à environ 449 à 539 € par espace et par mois pour 40 000 exécutions. L'usage des modèles dans les workflows est facturé en plus, au tarif API avec une majoration [TIERS] (https://tldv.io/blog/langdock/, https://techflow.ai/en/blog/langdock-pricing).
- **Coût [DED]**, sur la base de 25 € : 30 sièges = 750 €/mois ; 100 sièges = 2 500 €/mois ; plus 449 à 539 €/mois dès qu'on dépasse 2 500 exécutions automatiques.
- **Adoption** : 13 000+ entreprises, 200 000+ utilisateurs actifs mensuels [OFF, chiffres du vendeur]. [DED] : environ 15 utilisateurs actifs par entreprise, donc une base très PME. ARR d'environ 50 M (étude d'octobre).
- **France** : décrit par un comparatif français comme adapté aux ETI et grands comptes européens [TIERS] (https://lonestone.io/blog/meilleurs-assistants-ia-entreprise). Programme de partenaires français : non trouvé.

---

## 5. Sana (Workday)

- **Ce que c'est** : depuis le rachat, « Sana from Workday ». À Workday Rising 2026, Sana est devenu la page d'accueil de Workday et la couche qui coordonne ses agents. Le produit autonome Sana Agents subsiste [TIERS] (https://harmony.io/insights/workday-ai-agents, https://www.usecarly.com/blog/workday-sana/).
- **Création** : sans code, workflows en plusieurs étapes exécutés en arrière-plan [OFF, blog Sana vu par résumé] (https://sanalabs.com/agents-blog/ai-workflow-automation-agents-workday-sana-2026). Déclencheurs : non trouvé.
- **Prix : sources contradictoires.** Les plans Free (0 $) et Team (30 $/utilisateur/mois) auraient été retirés de la page prix le 05/10/2026, ne laissant qu'Enterprise sur devis (https://www.usagepricing.com/blueprint/sana-ai) ; un annuaire d'octobre 2026 liste encore un plan gratuit (https://agentsai.fyi/agents/sana-ai). Enterprise : à partir de 30 $/utilisateur/mois avec Flex Credits, plus un forfait « AI Transformation » de 45 000 à 65 000 $ (https://www.aigtmstack.com/blog/sana-agents-review) [TIERS]. Pour les clients Workday : accès par Flex Credits, avec une dotation incluse dans l'abonnement.
- **Cible** : grandes organisations. Un comparatif juge les sociétés de moins de 500 salariés « presque certainement hors cible » [TIERS] (aigtmstack.com).
- [DED] : Sana est sorti du marché PME en 2026. Sa trajectoire (self-service gratuit, puis rachat, puis Enterprise seul) laisse des utilisateurs PME sans offre.

---

## 6. Atlassian Rovo

- **Agent** : un agent Rovo a des instructions, des connaissances (Jira, Confluence, sources connectées) et des actions. Création dans **Rovo Studio**, sans frais séparés [TIERS] (https://www.eesel.ai/blog/rovo-studio).
- **Déclencheurs** : mention dans le chat ; appel depuis une règle d'automatisation Jira ou Confluence. Une condition placée avant l'agent évite toute dépense quand elle n'est pas remplie [TIERS, test d'un seul auteur] (https://dev.to/mihai_leanzero/rovo-agent-pricing-in-jira-automation-cost-per-agent-call-5dah). Liste complète des déclencheurs et liste des agents livrés d'origine : non trouvé.
- **Prix** [TIERS] (https://redresscompliance.com/atlassian-rovo-ai-licensing-cost-negotiation, https://agentmarketplace.ai/atlassian-rovo-pricing) : Rovo est inclus dans les plans payants Jira et Confluence Cloud. Dotation de 25, 70 ou 150 crédits par utilisateur et par mois (Standard, Premium, Enterprise), mise en commun. Un agent simple coûte 10 crédits par exécution ; un agent avancé de 10 à plus de 500. **Le dépassement sera facturé à partir du 3 décembre 2026, à 0,01 $ le crédit, activé par défaut** : l'administrateur doit poser un plafond. Offre autonome « à partir de 5 $ par utilisateur et par mois ».
- **Coût [DED]** : nul en plus pour une PME déjà cliente d'Atlassian, tant qu'elle reste dans sa dotation. En Standard, 25 crédits = 2,5 exécutions d'agent simple par personne et par mois : c'est très peu pour un agent planifié quotidien.
- **Adoption** : 3 millions puis plus de 5 millions d'utilisateurs actifs mensuels au deuxième trimestre fiscal 2026 (clos fin décembre 2025), 2,4 millions d'automatisations exécutées par des agents sur le trimestre, pour 350 000+ clients ; crédits consommés en hausse de plus de 20 % par mois au trimestre suivant ; plus de 9 000 agents créés par les clients (chiffre de 2025, ancien) [TIERS reprenant les chiffres du vendeur] (https://www.techtarget.com/news/Atlassian-Rovo-AI-platform-grows-to-3-million-monthly-users/857307/, https://deviniti.com/blog/enterprise-software/38-atlassian-ai-statistics-for-2026-rovo-atlassian-intelligence-adoption/, https://futurumgroup.com/insights/atlassian-q3-fy-2026-earnings-show-continued-cloud-and-ai-led-expansion/). Serveur MCP : plus de 5 millions d'appels d'outils par jour [OFF] (https://www.atlassian.com/blog/company-news/inside-rovo-mcp-usage).
- **Critiques** : résultats inégaux des agents ; coût d'une requête difficile à prévoir [TIERS] (https://theaiagentindex.com/agents/atlassian-rovo).
- **PME** : Atlassian compte des centaines de milliers de petites équipes clientes ; Rovo les atteint par simple inclusion dans l'abonnement [DED].

---

## 7. Slack (IA et agents dans Slack, Agentforce)

- **Agent** : trois niveaux. Slackbot, repositionné en agent personnel (recherche approfondie, MCP, réunions, agent de bureau) lors d'une vague de 30 fonctions d'IA annoncée le 31/03/2026. Les agents Agentforce de Salesforce, utilisables dans Slack. Les agents tiers installés comme applications [TIERS] (https://happycapyguide.com/blog/salesforce-slack-ai-30-features-agentforce-enterprise-2026, https://karloe.com/blog/best-slack-ai-agents).
- **Plateforme** : serveur MCP de Slack en disponibilité générale le 17/02/2026 ; API de recherche en temps réel en disponibilité générale [TIERS] (https://spiritt.ai/resources/guides/ai-agents-in-slack).
- **Prix [TIERS, chiffres divergents]** : Pro 7,25 $/utilisateur/mois en annuel, Business+ 15 $ en annuel (18 $ en mensuel). Slackbot : essai limité en Free et Pro, **15 messages par utilisateur et par semaine en Business+**, illimité en Enterprise+. Agentforce : 5 $/utilisateur/mois plus Flex Credits à 500 $ les 100 000 selon une source, 125 à 550 $/utilisateur/mois selon l'édition selon d'autres (https://runbear.io/posts/ai-agent-tools-for-slack-2026, https://viktor.com/blog/best-ai-agents-for-slack). Plusieurs de ces sources vendent des agents Slack concurrents.
- **Coût [DED]** : 30 sièges Business+ = 450 $/mois ; 100 sièges = 1 500 $/mois, avec un Slackbot rationné. Agentforce suppose en pratique d'être client Salesforce.
- **Modèles d'agents, adoption, droits, critiques** : non trouvé.

---

## 8. Plus brièvement

- **Dropbox Dash** : Dash for Teams à 15 $/utilisateur/mois en annuel, 19 $ en mensuel, jusqu'à 100 utilisateurs ; Dash for Business à 35 $ [TIERS, pas de page officielle lue] (https://projectmanagers.net/dropbox-pricing/). Agents : rien trouvé. Adoption jugée « encore précoce » par la direction (étude d'octobre).
- **Guru** : « Knowledge Agents », des agents de réponse par équipe. Guru ne publie plus ses prix depuis 2026 ; dernier tarif public, janvier 2026 : 25 $/siège/mois en annuel, minimum 10 sièges ; contrat médian Vendr d'environ 39 500 $ par an [TIERS, source concurrente] (https://www.gosearch.ai/faqs/guru-pricing/).
- **Onyx** : édition communautaire gratuite sous licence MIT ; Business à 20 $/utilisateur/mois en annuel, 25 $ en mensuel. Rachat par Zoom en septembre 2026 rapporté par un concurrent, toujours sans communiqué de Zoom [TIERS] (https://www.gosearch.ai/faqs/onyx-ai-pricing-the-real-open-source-tco-in-2026/).
- **GoSearch** : prix incohérents selon les sources, Pro à 12 ou 20 $/utilisateur/mois, ou 50 $+ avec environ 100 sièges minimum [TIERS] (https://www.eesel.ai/blog/gosearch-alternatives). Non exploitable en l'état.

---

## 9. Critiques communes aux plateformes d'agents

- **Prolifération** : un article du 17/08/2026 décrit une grande entreprise avec environ 850 agents créés et une douzaine réellement utilisés [TIERS, blog d'éditeur] (https://www.rezolve.ai/blog/agent-sprawl-850-agents-a-dozen-in-use). Une enquête auprès de 650 dirigeants : 78 % ont un pilote d'agent, 14 % en ont généralisé un. Un chiffre attribué à Gartner : 89 % des pilotes d'agents n'atteignent pas la production. 18 % seulement des organisations tiennent un inventaire à jour de leurs agents [TIERS, sources de faible autorité, chiffres primaires non vérifiés] (https://promactinfo.com/blogs/ai-agent-sprawl-why-94-of-enterprises-are-losing-control-of-their-own-ai-agents/). KPMG et SAP publient sur le sujet en 2026 (https://kpmg.com/us/en/articles/2026/from-agent-sprawl-to-enterprise-outcomes.html, https://news.sap.com/2026/08/agent-sprawl-why-ai-governance-is-now-board-level-issue/).
- **Sur-partage** : un analyste de Gartner met en garde contre la désinformation, le sur-partage et la perte de données [TIERS]. Incident nommé chez l'une des plateformes étudiées : non trouvé.
- **Coût imprévisible** : en 2026, tout le monde est passé aux crédits. Dust le 23/06, Notion le 04/05, Rovo avec un dépassement facturé le 03/12, Glean, Sana et Agentforce avec des Flex Credits. Aucun ne publie clairement le coût d'une exécution type.
- **Entretien** : reconnu par Dust lui-même (voir section 1).

---

## 10. Tableau comparatif (novembre 2026)

| Plateforme | Création d'un agent | Déclencheurs | Actions | Prix d'entrée | 30 personnes | 100 personnes | Droits | PME servies ? |
|---|---|---|---|---|---|---|---|---|
| Dust [OFF] | Tout salarié ; formulaire + description (Sidekick) | Mention, Slack, e-mail, planification, webhooks, sous-agents | 105 intégrations, surtout MCP ; navigateur | Pro 24 €/siège en annuel, crédits ; 3 connecteurs | 720 €/mois | 2 400 €/mois, plafond du self-service | Espaces définis par l'admin, pas ceux de la source | Oui, 36 % des cas clients < 200 salariés |
| Glean [TIERS] | Description (Auto) ou flux (Workflow) | Manuel, planification par utilisateur, contenu | Connecteurs natifs, MCP, A2A | 35-50 $/siège, minimum 25-50 k$/an | Non servi | 50-60 k$/an | Droits de la source | Non |
| Notion [TIERS] | Membre d'un plan Business | Planification, événements Notion, événements Slack | Notion, Slack, Mail, Calendar, MCP | 20 $/siège + 10 $ / 1 000 crédits | 600 $/mois + crédits | 2 000 $/mois + crédits | Non trouvé | Oui, par la base installée |
| Langdock [TIERS] | Assistant + Workflows séparés | Webhook, planification (Workflows) | 40+ intégrations, serveur MCP | 20 à 29 €/siège selon les sources | ≈ 750 €/mois | ≈ 2 500 €/mois ; Workflows 449-539 € en plus | Non trouvé | Oui, ≈ 15 actifs par client |
| Sana [TIERS] | Sans code | Non trouvé | Via Workday | Enterprise, 30 $/siège + forfait 45-65 k$ | Non servi | Non servi | Non trouvé | Non, depuis octobre 2026 |
| Rovo [TIERS] | Rovo Studio | Chat, règles d'automatisation | Jira, Confluence, MCP | Inclus ; 25-150 crédits/utilisateur ; 0,01 $ au-delà dès le 03/12/2026 | Inclus | Inclus | Non trouvé | Oui, si déjà chez Atlassian |
| Slack [TIERS] | Slackbot ; Agentforce | Mention ; non trouvé au-delà | MCP, apps | Business+ 15 $/siège, Slackbot rationné | 450 $/mois | 1 500 $/mois | Non trouvé | Oui pour Slack, non pour Agentforce |
| Dash [TIERS] | Non trouvé | Non trouvé | Non trouvé | 15 $/siège jusqu'à 100 | 450 $/mois | 1 500 $/mois | Non trouvé | Oui |
| Guru [TIERS] | Knowledge Agents | Non trouvé | Non trouvé | Sur devis ; 25 $/siège en janvier 2026 | ≈ 750 $/mois | ≈ 2 500 $/mois | Non trouvé | En retrait |
| Onyx [TIERS] | Non trouvé | Non trouvé | Non trouvé | Gratuit auto-hébergé ; 20 $/siège | 600 $/mois | 2 000 $/mois | Droits de la source | Avenir incertain (Zoom) |
| GoSearch [TIERS] | Non trouvé | Non trouvé | Non trouvé | 12 à 50 $ selon les sources | ? | ? | Non trouvé | ? |

Les coûts à 30 et 100 personnes sont des multiplications du prix public par siège, hors crédits et hors TVA [DED].

---

## 11. Ce qu'un petit acteur peut reprendre, éviter, et où les PME sont laissées de côté

**À reprendre** [DED]

- La création par description, avec des modifications à accepter (Sidekick), et « transformer cette conversation en agent ». Personne ne veut remplir un formulaire.
- Les déclencheurs là où les gens travaillent déjà : Slack, e-mail en copie, planification en langage naturel. Dust l'écrit : changer d'interface « tue l'adoption à grande échelle ».
- Le journal de chaque exécution et l'humain dans la boucle sur les workflows automatiques.
- Le périmètre d'écriture étroit (l'agent ne modifie que ce qu'il a créé ou qu'on lui a confié).
- Le canal des petits intégrateurs : les cas PME français de Dust sont presque tous signés par un partenaire.

**À éviter** [DED]

- Une galerie d'agents en libre création : elle mène aux doublons, puis à l'obligation d'inventer une couche de plus (les skills) et un outil d'entretien.
- Les crédits opaques. C'est le reproche le plus constant de 2026, et aucune plateforme ne dit ce que coûte une exécution.
- Un modèle de droits que l'administrateur doit redessiner à la main (espaces) : une PME n'a pas d'administrateur pour ça.

**Où les PME sont laissées de côté** [DED]

- Glean et Sana ne les servent pas. Agentforce suppose Salesforce.
- Dust les sert, mais avec 3 connecteurs et 5 espaces, et ses succès PME sont des cabinets de conseil et des éditeurs SaaS avec un « champion » interne et souvent un intégrateur.
- Notion, Rovo et Slack les atteignent, mais chacun reste centré sur ses propres données, avec des dotations de crédits faibles.
- Personne ne livre un petit nombre d'agents finis, branchés sur toutes les sources, qui marchent le premier jour sans que quelqu'un les construise.

---

## 12. Ce que ça implique pour nous

Interprétation de l'agent, à discuter.

- **Le marché PME des agents existe, mais il est étroit et outillé.** Un tiers des cas clients de Dust ont moins de 200 salariés. Ce sont des sociétés de services intellectuels, avec un champion et un intégrateur. La PME sans champion n'apparaît nulle part.
- **Ne pas vendre un atelier d'agents.** Dust, Glean, Notion et Rovo en ont un, à 20-25 € le siège ou inclus. Les concurrencer sur ce terrain, à deux, n'a pas de sens.
- **Vendre trois ou quatre agents finis plutôt qu'une plateforme.** Les cas que tous mettent en avant sont les mêmes : préparation de rendez-vous et fiche de compte, suivi après réunion avec mise à jour du CRM, tri des tickets et brouillon de réponse, synthèse hebdomadaire. Le « point du matin » est déjà un agent planifié : c'est le bon point de départ.
- **Notre avantage est là où Dust est plafonné.** 40 connecteurs contre 3 en self-service, et des droits repris de la source contre des espaces à dessiner à la main. Un agent tout fait a besoin de toutes les sources dès le premier jour ; c'est ce que le plan Business de Dust ne donne pas.
- **Un prix sans crédits visibles est un argument.** Tout le monde est passé aux crédits en 2026 et les acheteurs s'en plaignent. Un forfait par siège, agents inclus dans une limite raisonnable, se distingue. À valider avec l'étude de coûts.
- **Rester branchable.** Dust dit lui-même que ses prospects utilisent déjà Claude. Notre serveur MCP permet d'être la mémoire derrière Claude, ChatGPT ou Dust, plutôt qu'un agent de plus à adopter.
- **Le canal compte autant que le produit.** En France, Dust touche les PME par de petits intégrateurs (Idoption, Wesype, socIAty). Trouver deux ou trois partenaires de ce type vaut probablement plus qu'une fonction de plus.
- **Prudence sur la preuve.** Les taux d'adoption de 70 à 97 % sont des cas choisis par le vendeur. Le chiffre de marché qu'il cite lui-même est de 15 % après six mois. La vraie question à tester en entretien est : qui, dans une PME de 50 personnes, entretient les agents ?

---

## 13. Trous restants

- Liste des modèles d'agents de Dust, de Glean, de Notion et de Rovo ; agents les plus utilisés selon les éditeurs.
- Coût en crédits d'une exécution type, chez tous.
- Prix officiels de Langdock (grille peut-être modifiée), Sana, Slack, Agentforce, Dash, Guru, GoSearch : seulement des sources tierces, parfois contradictoires.
- Modèle de droits des agents chez Notion, Langdock, Rovo, Slack ; tout incident de sur-partage nommé.
- Avis d'utilisateurs lus en direct (G2, Capterra, Reddit, Hacker News).
- Mémoire d'agent, agents de fond de longue durée et navigateur hors Dust ; dates précises en 2026 chez Glean, Notion et Langdock.
- Présence réelle de Langdock, Notion et Rovo dans les PME françaises, et leurs canaux.
- Documentation de Dust (docs.dust.tt), inaccessible : règles de confirmation avant écriture, détail des déclencheurs, barème des crédits.
