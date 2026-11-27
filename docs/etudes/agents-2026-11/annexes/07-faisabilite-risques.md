# Annexe 7 : faisabilité, risques, coûts et règles pour des agents qui agissent dans les outils

Rapport de recherche, relevé le 19 novembre 2026 par un agent Claude. Légende : **[OFF]** texte, documentation ou page de l'organisme concerné ; **[TIERS]** presse, analyse, cabinet, blog ; **[DED]** déduction de l'agent.

Limites de ce relevé. Les pages n'ont pas pu être ouvertes directement (réseau restreint) : tout vient de résumés de recherche qui citent les pages. Une limite d'utilisation a coupé la recherche : environ 45 requêtes au total. Les faits marqués [OFF] sont attribués à la page officielle par le résumé, pas relus dans le texte. Ce volet touche au droit : il rapporte ce que disent les textes et les commentateurs, ce n'est pas un avis juridique.

## 1. Fiabilité

### À retenir
Les éditeurs de modèles recommandent tous la même chose : un flux étroit et écrit à l'avance, un modèle aux seules étapes de jugement, un humain avant toute action sensible. Sur des tâches de bureau à plusieurs étapes, les mesures publiques donnent 30 à 65 % de réussite : un agent laissé seul se trompe trop souvent pour agir sans validation.

### Faits sourcés
- Anthropic, « Building effective agents » (déc. 2024) : trois principes, garder la conception simple, rendre explicites les étapes de planification, soigner l'interface entre l'agent et ses outils (documentation, tests). Un « workflow » suit un chemin codé ; un « agent » choisit lui-même ses outils. La page renvoie désormais vers Claude Managed Agents pour l'approche actuelle [OFF] (https://www.anthropic.com/research/building-effective-agents).
- Documentation Anthropic (nov. 2026) : ne construire un agent que si la tâche est complexe, a de la valeur, est à la portée du modèle, et si l'erreur est rattrapable (tests, relecture, retour arrière). Sinon, rester à un appel unique ou à un workflow [OFF] (documentation embarquée dans Claude Code, https://platform.claude.com/docs/en/about-claude/models/overview.md).
- OpenAI, « A practical guide to building agents » (2025) : deux cas où un humain reprend la main, le dépassement d'un seuil d'échecs et les actions à haut risque (annuler une commande, gros remboursement, paiement). Garde-fous en couches. Noter chaque outil selon son risque (lecture seule ou non, réversible ou non) [OFF] (https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf). Aucun seuil chiffré dans le guide.
- CRMArena-Pro (Salesforce AI Research, mai 2025) : environ 58 % de réussite en un tour, environ 35 % en plusieurs tours, sur 19 tâches de vente et de service. Conscience de la confidentialité « proche de zéro » sans consigne explicite [OFF, papier] (https://arxiv.org/abs/2505.18878) ; [TIERS] (https://www.cio.com/article/4008228/salesforce-study-warns-against-rushing-llms-into-crm-workflows-without-guardrails.html).
- TheAgentCompany (Carnegie Mellon, 175 tâches de bureau) : 30,3 % de tâches finies seules par le meilleur agent de l'article (Gemini 2.5 Pro) [OFF, papier] (https://arxiv.org/html/2412.14161v2). Un classement tiers donne 42,9 % au mieux (résultat daté de sept. 2025, relevé en nov. 2026) [TIERS] (https://www.benchleader.com/benchmarks/the_agent_company).
- BizAgentBench (arXiv, oct. 2026) : 64,0 % et 61,3 % de réussite stricte pour les deux meilleurs modèles ; sur des tâches de type tau-bench, 40 % seulement réussies trois fois sur trois [OFF, papier, non relu] (https://arxiv.org/pdf/2610.20424).
- OSWorld (usage d'un ordinateur) : 66,3 % contre environ 72 % pour un humain, selon des reprises du Stanford AI Index 2026 [TIERS] (https://www.sketricgen.ai/blog/ai-agents-task-success-stanford).
- METR (2026) : durée de tâche réussie une fois sur deux, environ 12 heures ; réussie quatre fois sur cinq, environ 1,5 heure. L'écart entre les deux seuils est d'un facteur cinq à dix [TIERS] (https://metavert.io/metr-benchmarking, https://ai.blocksize.hr/blog/en/ai-agent-task-time-horizons-metr-benchmark-2026).
- Erreur cumulée : dix étapes à 85 % chacune donnent environ 20 % de réussite globale [TIERS] (https://towardsdatascience.com/the-math-thats-killing-your-ai-agent/).

### Déductions
- [DED] Brouillon plutôt qu'envoi, journal des actions et retour arrière découlent des critères « erreur rattrapable » d'Anthropic et « action à haut risque » d'OpenAI.
- [DED] Avec 35 à 65 % de réussite en plusieurs étapes, seuls les flux courts (une à trois étapes de modèle) et relus par un humain sont défendables dès le premier jour.

### Trous
- Guides Google sur les agents : non recherché.
- Pratiques d'évaluation automatique (jeux de tests, juges) : non recherché, hors ce que dit la documentation Anthropic.
- Aucun taux d'erreur publié sur des agents de PME en production avec une méthode vérifiable.

## 2. Sécurité

### À retenir
Un agent qui lit des contenus non fiables, accède à des données privées et peut émettre vers l'extérieur est attaquable par simple envoi d'un mail. Les incidents de 2025 et 2026 touchent tous les grands éditeurs. Aucun filtre ne suffit ; la parade reconnue est d'architecture : retirer une des trois branches.

### Faits sourcés
- « Triplet fatal » (Simon Willison, juin 2025) : accès à des données privées, exposition à du contenu non fiable, moyen de communiquer vers l'extérieur. Retirer une des trois branches réduit fortement le risque ; la plus simple à couper est le canal sortant. Willison juge qu'un filtre qui arrête 95 % des attaques est un échec [OFF, auteur] (https://simonwillison.net/tags/lethal-trifecta/).
- EchoLeak (Microsoft 365 Copilot, CVE-2025-32711, CVSS 9,3, juin 2025, Aim Security) : un seul mail, aucun clic. Copilot reprend le mail dans son contexte puis fait sortir des données par l'URL d'une image chargée automatiquement. Le classifieur XPIA, la suppression des liens et la politique CSP ont été contournés. Corrigé côté serveur ; pas d'exploitation connue [TIERS] (https://www.hackthebox.com/blog/cve-2025-32711-echoleak-copilot-vulnerability, https://arxiv.org/pdf/2509.10540v1).
- AgentFlayer (Zenity, Black Hat, 6 août 2025) : chaînes sans clic contre ChatGPT (connecteurs), Copilot Studio, Salesforce Einstein, Gemini, Microsoft 365 Copilot, Cursor avec Jira MCP. Exemple : un fichier Drive piégé fait chercher des clés d'API et les envoie par une URL d'image [TIERS] (https://www.prnewswire.com/news-releases/zenity-labs-exposes-widespread-agentflayer-vulnerabilities-allowing-silent-hijacking-of-major-enterprise-ai-agents-circumventing-human-oversight-302523580.html).
- ShadowLeak (Radware, sept. 2025) : un mail avec consignes cachées en HTML fait exfiltrer la boîte Gmail par l'agent Deep Research de ChatGPT, depuis les serveurs d'OpenAI. Corrigé ; la date du correctif varie selon les sources [TIERS] (https://www.securityweek.com/chatgpt-deep-research-targeted-in-server-side-data-theft-attack/).
- Agents de boîte mail : étude « Your Mailbox Is Mine » sur des agents réels [OFF, papier, non relu] (https://arxiv.org/pdf/2507.02699).
- Navigateurs : Brave montre en août 2025 que Comet (Perplexity) obéit à une consigne cachée dans un message Reddit et peut prendre la main sur le mail de l'utilisateur ; Atlas (OpenAI) touché aussi [TIERS] (https://www.nbcnews.com/tech/tech-news/ai-browsers-comet-openai-hacked-atlas-chatgpt-rcna235980). OpenAI, déc. 2025 : l'injection de consignes est « unlikely to ever be fully solved » [TIERS] (https://www.technology.org/2025/12/23/ai-browsers-permanent-security-weakness-prompt-injection/).
- MCP : empoisonnement de description d'outil (Invariant Labs, avril 2025) ; serveur MCP GitHub détourné par une issue piégée (mai 2025) ; `postmark-mcp`, premier serveur MCP malveillant connu, copie les mails sortants (sept. 2025) ; `mcp-remote`, CVE-2025-6514, CVSS 9,6, exécution de code, plus de 437 000 téléchargements [TIERS] (https://checkmarx.com/learn/mcp-security-risks-real-world-incidents-and-security-controls/, https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-tool-poisoning-ai-agent-exfiltration-2/).
- 2026 : du 7 au 15 janvier, failles d'exfiltration publiées sur IBM Bob, Superhuman AI, Notion AI et Claude Cowork [TIERS] (https://breached.company/the-lethal-trifecta-strikes-four-major-ai-agent-vulnerabilities-in-five-days/). Avril 2026 : Capsule Security, Copilot via un formulaire SharePoint (CVE-2026-21520) et Salesforce Agentforce [TIERS] (https://www.darkreading.com/cloud-security/microsoft-salesforce-patch-ai-agent-data-leak-flaws). « Reprompt », CVE-2026-24307, Copilot Personal, un clic [TIERS] (https://www.vectra.ai/topics/prompt-injection).
- CaMeL (Google DeepMind et ETH Zurich, mars 2025, SaTML 2026) : un modèle privilégié écrit le plan à partir de la demande de l'utilisateur ; un modèle en quarantaine lit les données non fiables sans outil ; un interpréteur suit la provenance des données et vérifie une politique avant chaque appel. 77 % des tâches AgentDojo réussies contre 84 % sans défense ; 0 attaque réussie sur 949 dans une comparaison ; environ 2,8 fois plus de jetons [OFF, papier] (https://arxiv.org/abs/2503.18813) ; [TIERS] (https://insights.bostonidentity.com/research/arxiv-2025-03-24-camel-defeating-prompt-injections-design).
- « Design Patterns for Securing LLM Agents against Prompt Injections » (juin 2025) : une fois du contenu non fiable lu, l'agent doit être contraint pour que ce contenu ne puisse déclencher aucune action à conséquence. Six schémas, dont sélecteur d'action, plan puis exécution, double modèle, map-reduce, réduction du contexte [OFF, papier] (https://arxiv.org/abs/2506.08837, https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/).
- CNIL et CIANum, note exploratoire du 20 juillet 2026 : accès limité aux données nécessaires, suivi des actions, cloisonnement des mémoires, arrêt d'urgence, humain dans la boucle pour les opérations sensibles. Note non contraignante [OFF] (https://www.cnil.fr/sites/default/files/2026-07/ia-cianum-cnil.pdf).
- ANSSI, bulletin CERTFR-2026-ACT-016 : proscrire les assistants autonomes sur les postes de travail en production, selon un cabinet [TIERS, non vérifié sur le site de l'ANSSI] (https://silexo.fr/article/212/ia-agentique-et-donnees-personnelles-ce-que-la-cnil-et-l-anssi-demandent-deja).

### Déductions
- [DED] Les parades qui reviennent dans toutes les sources : séparer l'agent qui lit de celui qui agit, validation humaine avant toute sortie, destinataires limités (réponse à l'expéditeur ou domaine interne), pas de lien ni d'image vers un domaine non prévu dans ce que l'agent produit, moindre privilège par outil.
- [DED] Un brouillon relu par un humain coupe le canal sortant automatique. Le risque restant : un lien ou une image piégés dans le brouillon, que l'humain envoie sans voir.
- [DED] Un produit qui indexe mails et documents a déjà deux branches du triplet. Chaque outil d'écriture ajoute la troisième.

### Trous
- « Agents Rule of Two » (Meta), « The Attacker Moves Second », OWASP Top 10 des applications agentiques, NIST, ENISA : recherches coupées par la limite d'utilisation. Non trouvé.
- Texte du bulletin de l'ANSSI : non relu.

## 3. Autorisations pour écrire dans les outils

### À retenir
Chez Google, envoyer un mail demande moins que créer un brouillon : `gmail.send` est « sensible », `gmail.compose` est « restreint » et entraîne un audit annuel. Un pilote est possible sans vérification si l'application est interne au domaine du client. Slack interdit depuis 2025 les copies durables et l'entraînement sur ses données, et bride les applications hors Marketplace.

### Tableau

| Action | Outil | Autorisation requise | Vérification exigée | Délai et coût |
|---|---|---|---|---|
| Créer un brouillon | Gmail | `gmail.compose` (ou `gmail.modify`), restreint. Pas de scope « brouillon seul » [TIERS] | Vérification des scopes restreints ; évaluation de sécurité (CASA) si les données passent ou restent sur un serveur, à refaire tous les 12 mois [OFF] | « Plusieurs semaines » [OFF]. Google ne facture rien ; évaluateur : 540 à 5 400 $ par an selon les sources (nov. 2026) [TIERS] |
| Envoyer un mail | Gmail | `gmail.send`, sensible [TIERS] | Vérification des scopes sensibles, sans audit tiers [OFF] | 3 à 5 jours ouvrés selon Google ; « des semaines » selon Nylas. Gratuit |
| Créer un événement | Google Agenda | `calendar.events`, sensible. Aucun scope Agenda n'est restreint [TIERS] | Vérification des scopes sensibles [OFF] | Idem |
| Créer ou modifier un fichier | Google Drive | `drive.file` (fichiers créés ou ouverts par l'appli), non sensible ; `drive` complet, restreint [TIERS] | Aucune revue de scope pour `drive.file` ; vérification de marque possible | Jours. Gratuit |
| Pilote sans vérification | Google Workspace | Mêmes scopes | Aucune si l'appli est « Internal » au Workspace du client, ou marquée « Trusted » par son admin [OFF]. Mode test : 100 utilisateurs, jetons de 7 jours [OFF / TIERS] | Immédiat. Gratuit |
| Créer un brouillon | Outlook (Graph) | `Mail.ReadWrite` délégué ; ne permet pas d'envoyer [TIERS] | Consentement : sources contradictoires (voir plus bas). Vérification d'éditeur pour le badge [TIERS] | Coût et délai de la vérification d'éditeur : non trouvé |
| Envoyer un mail | Outlook (Graph) | `Mail.Send` délégué [TIERS] | Idem | Idem |
| Créer un événement | Outlook (Graph) | `Calendars.ReadWrite` délégué [TIERS] | Idem | Idem |
| Poster un message | Teams | Non trouvé | Non trouvé | Non trouvé |
| Lire l'historique, poster | Slack | Appli distribuée par la Marketplace ou accord partenaire [TIERS] | Revue Marketplace : critères 2026 non trouvés | Hors Marketplace : 1 requête/min et 15 messages sur `conversations.history` et `conversations.replies` [OFF] |
| Écrire une fiche, une note | HubSpot | OAuth, scopes déclarés | Certification Marketplace : questionnaire de sécurité ; OAuth v3 exigé pour les nouvelles fiches (mai 2026) [OFF / TIERS] | Jusqu'à 60 jours ; sans frais [TIERS] |
| Écrire dans le CRM | Salesforce | Non trouvé en source officielle | Revue de sécurité AppExchange [TIERS, non vérifié] | Environ 999 $ par tentative [TIERS, non vérifié] |
| Écrire | Pipedrive, Notion, Linear, Zendesk, Intercom | Non trouvé | Non trouvé | Non trouvé |

### Faits sourcés
- Google, scopes restreints : huit scopes Gmail, dont `gmail.readonly`, `gmail.compose`, `gmail.modify`, `gmail.metadata`, `gmail.insert`, `mail.google.com` [TIERS] (https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/, https://www.unipile.com/gmail-api-scopes-guide/). La page officielle des scopes ne donne pas les niveaux dans les résumés obtenus (https://developers.google.com/identity/protocols/oauth2/scopes).
- Google : « If you store or transmit restricted scope data on servers, then you need to complete a security assessment », à renouveler au moins tous les 12 mois [OFF] (https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
- Coût CASA : Google ne facture pas l'évaluation. TAC Security affiche 675 à 5 400 $ (nov. 2026) ; d'autres sources donnent 540 à 1 800 $ par an ou 500 à 4 500 $. Des blogs citent 15 000 à 75 000 $, sans appui [TIERS] (https://deepstrike.io/blog/google-casa-security-assessment-2025, https://bright-softwares.com/blog/en/google-workspace/the-50000-gmail-add-on-myth-what-google-s-casa-certification-really-costs, https://www.reversebits.tech/blog/gmail-api-compliance/).
- Google, scopes sensibles : vérification en 3 à 5 jours ouvrés « typiquement » [OFF] (https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification). Une autre page Google dit « several weeks » [OFF] (https://developers.google.com/data-manager/api/devguides/concepts/oauth-verification).
- Google, exemptions : appli « Internal » sans vérification, si le projet appartient à l'organisation [OFF] (https://support.google.com/cloud/answer/13463817?hl=en). Appli non vérifiée : écran d'avertissement et plafond de 100 nouveaux utilisateurs [OFF] (https://support.google.com/cloud/answer/7454865?hl=en). Appli marquée « Trusted » par l'admin : traitée comme interne pour cette organisation [OFF] (https://developers.google.com/identity/protocols/oauth2/production-readiness/overview). Jetons de rafraîchissement limités à 7 jours tant que l'appli n'est pas en production vérifiée [TIERS] (https://developer.nylas.com/docs/cookbook/use-cases/build/oauth-scopes-email-calendar/).
- Microsoft Graph : `Mail.ReadWrite` couvre les brouillons mais pas l'envoi [OFF selon le résumé] (https://learn.microsoft.com/en-us/graph/permissions-reference). Consentement : un guide dit que `Mail.Send`, `Mail.ReadWrite`, `Calendars.ReadWrite` ne demandent pas l'accord d'un admin [TIERS] (https://www.agenticfabriq.com/blog/microsoft-graph-agent-permissions) ; une réponse sur Microsoft Q&A dit que `Mail.ReadWrite` est bloqué dans la politique de consentement recommandée par Microsoft [TIERS] (https://learn.microsoft.com/en-us/answers/questions/5861727/how-to-add-mail-readwrite-permission-in-user-conse). Les deux sont à garder.
- Slack, limites : depuis le 29 mai 2025 pour les nouvelles applis commerciales hors Marketplace, et depuis le 3 mars 2026 pour les installations existantes. Les applis internes d'un client gardent les limites hautes [OFF] (https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/, https://api.slack.com/methods/conversations.history).
- Slack, conditions d'API : pas d'entraînement de modèle de langage sur les données d'API ; pas d'export en masse ; usage et conservation des données d'autres organisations limités au « minimum necessary » ; pas de copie, archive ou index durable via les API Data Access et Real-time Search ; distribution par la Marketplace ou par accord partenaire. Date d'effet : 29 mai 2025 selon une source, version du 10 octobre 2025 selon une autre [TIERS, cabinets] (https://www.hunton.com/insights/legal/salesforce-locks-down-slack-data-time-to-review-your-slack-api-terms, https://natlawreview.com/article/salesforce-locks-down-slack-data-time-review-your-slack-api-terms, https://www.computerworld.com/article/4005509/salesforce-changes-slack-api-terms-to-block-bulk-data-access-for-llms.html).
- HubSpot : certification avec OAuth et questionnaire de sécurité [OFF] (https://developers.hubspot.com/docs/apps/developer-platform/list-apps/apply-for-certification/certification-requirements) ; 60 jours et absence de frais [TIERS] (https://greatpartners.net/blog/app-marketplace-strategy/).
- Audit OhAuth, juin 2026 : 918 applis de marketplaces sur 2 890 ont des scopes plus larges que leur fonction, un domaine mort ou une alerte [TIERS] (https://www.helpnetsecurity.com/2026/06/04/oauth-marketplace-apps-audit/).

### Déductions
- [DED] Un agent Google qui lit déjà les mails (`gmail.readonly`, restreint) doit passer l'audit CASA de toute façon. Ajouter le brouillon ne change alors ni le niveau ni le coût.
- [DED] Voie de pilote la plus courte : le client crée lui-même l'appli OAuth dans son Workspace (interne), ou son admin marque l'appli « Trusted ». Idem chez Slack avec une appli interne au client, qui garde les limites hautes.
- [DED] Les conditions de Slack sur les copies et index durables visent directement un produit qui conserve les messages. C'est le point à faire lire par un juriste avant tout agent Slack.

### Trous
- Délégation à l'échelle du domaine chez Google : non trouvé.
- Coût, délai et conditions de la vérification d'éditeur Microsoft ; permissions Teams : non trouvé.
- Règles Slack propres aux agents, serveur MCP de Slack, critères Marketplace 2026 : non trouvé.
- Pipedrive, Notion, Linear, Zendesk, Intercom, et Salesforce en source officielle : non trouvé.

## 4. Coûts d'exécution

### À retenir
Aux prix Anthropic de novembre 2026, une exécution type coûte de 0,1 centime à 23 centimes de dollar selon le modèle. Un usage soutenu revient à environ 2 $ par siège et par mois sur le petit modèle, 12 à 17 $ sur le modèle moyen avec cache. Le cache est le premier levier.

### Faits sourcés
- Anthropic, prix par million de jetons, entrée / sortie (table datée du 3 nov. 2026) : Haiku 5.5, 0,10 / 0,50 $ jusqu'à 100 000 jetons de consigne, 0,50 / 2,50 $ au-delà ; Sonnet 5.5, 2 / 10 $, lecture de cache 0,10 $ ; Opus 5.5, 4 / 20 $, lecture de cache 0,20 $ ; Fable 5.2, 8 / 40 $, lecture de cache 0,20 $. Écriture de cache : 1,25 fois l'entrée (5 minutes), 2 fois (1 heure). Traitement par lots : moins 50 % sur tous les jetons, résultats sous 24 heures, cumulable avec le cache [OFF] (documentation embarquée dans Claude Code ; page de référence https://platform.claude.com/docs/en/about-claude/pricing.md). Des sites tiers donnent les mêmes chiffres [TIERS] (https://www.requesty.ai/blog/claude-api-pricing).
- Anthropic : la réflexion du modèle est facturée en jetons de sortie et ne peut pas être coupée sur Opus 5.5 ; le niveau d'effort la règle [OFF] (même documentation).
- OpenAI : sources tierces contradictoires. Grille « entreprise » : GPT-5.6 Sol 4 / 20 $, Terra 2 / 12 $, Luna 0,20 / 1,20 $, GPT-6 Astra 10 / 50 $ [OFF, page d'aide] (https://help.openai.com/en/articles/20001415-chatgpt-rate-card-enterprise-token-based-pricing). Un comparateur daté de nov. 2026 : GPT-6.2 Astra 8 / 40 $, GPT-6.2 Sol 2 / 10 $, GPT-6 Luna 0,10 / 0,50 $ [TIERS] (https://benchlm.ai/openai/api-pricing). Lots et « Flex » : moins 50 % ; entrée en cache : environ 10 % [TIERS] (https://www.requesty.ai/blog/openai-api-pricing).
- Google : Gemini 3.1 Flash-Lite 0,25 / 1,50 $, cache 0,025 $ plus stockage 1 $ par million de jetons et par heure [OFF selon le résumé] (https://ai.google.dev/gemini-api/docs/pricing). Gemini 3.1 Pro 2 / 12 $ jusqu'à 200 000 jetons ; Gemini 3 Flash 0,50 / 3 $ ou 0,25 / 1,50 $ selon les sources [TIERS] (https://www.cloudzero.com/blog/gemini-pricing/, https://benchlm.ai/google/api-pricing). Lots : moins 50 %.
- Mistral : Small 4, 0,15 / 0,60 $ ; Medium 3.5, 1,50 / 7,50 $ ; Large 4, 0,70 / 2,10 $ depuis le 29 oct. 2026 selon trois guides, 1,36 / 4,18 $ selon d'autres. Points d'accès UE et US à 1,1 fois, selon un guide [TIERS] (https://www.maximem.ai/blog/mistral-api-pricing-2026, https://benchlm.ai/mistral/api-pricing).
- Modèles ouverts via OpenRouter (nov. 2026) : DeepSeek V4 Flash 0,06 / 0,18 $ ; Qwen3 30B 0,12 / 0,50 $ ; Llama 4 Maverick 0,19 / 0,65 $ ; GLM 5.3 0,08 / 1,40 $. Le prix dépend de l'hébergeur [TIERS] (https://benchlm.ai/hosts/openrouter, https://www.teamday.ai/blog/top-ai-models-openrouter-2026). Frais OpenRouter de 5,5 % cités par un blog [TIERS] (https://www.betterclaw.io/blog/openrouter-vs-direct-api-agents).

### Déductions : coût par exécution [DED]
Calculs de l'agent, prix Anthropic ci-dessus, sans réflexion étendue. Hypothèses de volume à ajuster.

| Exécution | Hypothèse (entrée / sortie) | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|---|
| Brief de rendez-vous | 20 000 / 1 500 jetons | 0,003 $ | 0,055 $ | 0,11 $ |
| Brief de rendez-vous | 50 000 / 1 500 jetons | 0,006 $ | 0,115 $ | 0,23 $ |
| Brouillon de réponse | 8 000 / 500 jetons | 0,001 $ | 0,021 $ | 0,042 $ |
| Résumé quotidien | 40 000 / 2 000 jetons | 0,005 $ | 0,10 $ (0,05 $ par lots) | 0,20 $ |
| Agent, dix appels d'outils, sans cache | 11 appels, 275 000 jetons d'entrée cumulés, 5 000 de sortie | 0,03 $ | 0,60 $ | 1,20 $ |
| Même agent, avec cache | 30 000 écrits, 245 000 relus | non calculé | environ 0,15 $ | environ 0,30 $ |

Coût mensuel par siège [DED]. Hypothèse : 20 jours, par jour un résumé, trois briefs de 35 000 jetons, dix brouillons, deux agents à dix appels.
- Tout sur Haiku 5.5 : environ 1,80 $ par mois.
- Tout sur Sonnet 5.5 avec cache : environ 17 $ par mois ; sans cache sur les agents : environ 35 $.
- Mélange (brouillons sur Haiku, résumé par lots, briefs et agents sur Sonnet avec cache) : environ 12 $ par mois.
- À comparer aux 25 € par siège envisagés : le modèle moyen sans cache mange tout le prix ; le mélange en prend environ la moitié.

### Trous
- Prix officiels d'OpenAI (hors grille entreprise), de Google pour les modèles Pro, de Mistral : pages non lues, chiffres tiers contradictoires.
- Analyses Artificial Analysis : non recherché.
- Consommation réelle de jetons de réflexion par exécution : à mesurer.

## 5. Modèles de prix des agents

### À retenir
Le support client se facture au résultat, entre 0,20 et 2 $ la résolution. Pour des agents de bureau interne, aucune référence solide n'a été trouvée.

### Faits sourcés
- Intercom Fin : 0,99 $ par « outcome », un au plus par conversation ; l'unité, ex-« resolution », inclut désormais les transferts configurés [TIERS] (https://www.getmacha.com/blog/ai-agent-pricing-models-explained ; page Intercom : https://www.intercom.com/learning-center/ai-customer-service-agent-pricing-comparison).
- Zendesk : environ 1,50 $ la résolution sur engagement, 2 $ à l'usage ; facturation resserrée aux résolutions « vérifiées » en mai 2026 [TIERS] (https://www.getmacha.com/blog/ai-customer-support-pricing-index-2026).
- HubSpot Breeze : de 1 $ par conversation à 0,50 $ par conversation résolue, avril 2026 [TIERS] (https://quickchat.ai/post/ai-agent-pricing-models).
- Salesforce Agentforce : 2 $ par conversation, dû même si l'agent échoue ; ou crédits « Flex » ; sources divergentes [TIERS] (https://www.querynow.com/blog/outcome-based-pricing-for-ai-agents-what-vendors-charge-per-result-in-2026-921092).
- Indice 2026 du support : 0,20 à 2 $ par résolution, médiane 0,895 $. Chaque éditeur définit lui-même « résolution » [TIERS] (https://www.getmacha.com/blog/ai-customer-support-pricing-index-2026).
- Concurrent proche : 16 $ par utilisateur et par mois avec 2 000 « Action Credits » non définis [OFF] (voir annexe 3 de l'étude concurrents, https://www.sentra.app/pricing).

### Déductions
- [DED] Le prix au résultat suppose un résultat comptable (ticket clos). Un brief ou un brouillon n'en a pas : siège avec quota, ou crédits.

### Trous
- Marges brutes citées pour les éditeurs d'agents : non trouvé.
- Ce qui passe ou casse auprès des PME : non trouvé.
- Prix des agents de Microsoft, Notion, Dust, Lindy, Glean : non recherché.

## 6. Réglementation

### À retenir
Le report des obligations « haut risque » à décembre 2027 est adopté. L'article 50 (transparence) s'applique depuis le 2 août 2026. En France, plusieurs juges ont suspendu des outils d'IA déployés sans consultation du CSE, pilote compris.

### Faits sourcés
- Omnibus numérique sur l'IA : vote du Parlement le 16 juin 2026 (423 pour, 57 contre, 174 abstentions), adoption par le Conseil le 29 juin 2026, règlement (UE) 2026/1744 publié le 24 juillet 2026, en vigueur le 27 juillet 2026. Haut risque de l'annexe III : du 2 août 2026 au 2 décembre 2027. Annexe I : 2 août 2028 [TIERS, cabinets] (https://www.quantic-avocats.com/2026/07/22/ai-act-digital-omnibus-report-obligations-haut-risque/, https://www.aiacto.eu/en/blog/digital-omnibus-ai-act-report-2027, https://www.mirabile-avocat.com/blog/ai-act-digital-omnibus). Numéro et dates non vérifiés sur EUR-Lex.
- Article 50 : applicable depuis le 2 août 2026, non reporté. Tolérance jusqu'au 2 décembre 2026 pour le marquage lisible par machine (article 50, paragraphe 2) des systèmes mis sur le marché avant le 2 août 2026 [TIERS] (https://www.praxikon.com/en/posts/digital-omnibus-high-risk-postponement-december-2027). Un site annonce un report de l'article 50 au 2 novembre 2026 [TIERS, isolé] (https://tech-insider.org/fr/digital-omnibus-ia-ai-act-report-2-decembre-2027-2026/).
- Lignes directrices de la Commission sur l'article 50 : publiées le 20 juillet 2026, non contraignantes [OFF] (https://digital-strategy.ec.europa.eu/en/news/commission-publishes-guidelines-transparency-obligations-providers-and-deployers-certain-ai-systems). Adoption formelle le 5 novembre 2026, C(2026) 7702 final, selon un cabinet [TIERS] (https://www.twobirds.com/en/insights/2026/european-commission-adopts-final-guidelines-on-ai-act-article-50-transparency-obligations-first-impr). Sanction : jusqu'à 15 M€ ou 3 % du chiffre d'affaires mondial [TIERS] (https://www.stibbe.com/publications-and-insights/the-ai-acts-transparency-obligations-rules-scope-and-timeline).
- CNIL et CIANum, note exploratoire sur l'IA agentique, 20 juillet 2026 : voir section 2. Non opposable [OFF] (https://www.cnil.fr/sites/default/files/2026-07/ia-cianum-cnil.pdf).
- CNIL, 2026 : travaux sur l'IA au travail à finaliser ; contrôles sur la décision automatisée, l'information des candidats et les durées de conservation ; fiches pratiques attendues d'ici fin 2026 [TIERS] (https://proactiveacademy.fr/blog/ia/cnil-ia/, https://www.leto.legal/news/cnil-cianum-ia-agentique-2026).
- CSE, article L. 2312-8 du code du travail (nouvelles technologies, aménagement important des conditions de travail). Décisions rapportées :
  - TJ Nanterre, référé, 14 février 2025, RG 24/01457 : déploiement suspendu jusqu'à la fin de la consultation ; une phase pilote avec usage partiel par des salariés exige la consultation préalable ; trouble manifestement illicite. Montants divergents selon les commentaires [TIERS] (https://cms.law/fr/fra/legal-updates/quand-le-cse-stoppe-le-deploiement-de-l-ia, https://www.voltaire-avocats.com/fr/suspension-du-deploiement-doutils-informatiques-en-phase-pilote-jusqua-lachevement-de-la-consultation-du-cse/).
  - TJ Créteil, référé, 15 juillet 2025, n° 25/00851 : l'IA générative est une technologie nouvelle ; outils suspendus [TIERS] (https://www.editions-tissot.fr/guide/ia-entreprise-consultation-cse).
  - TJ Paris, référé, 2 septembre 2025 (3 selon une source), n° 25/53278 : consultation exigée pour une plateforme d'IA générative ; pas pour la simple mise à jour d'un chatbot déjà soumis au CSE [TIERS] (https://www.capstan.fr/articles/2789-ia-pour-une-approche-nuancee-de-lobligation-de-consultation-du-cse/).
  - TJ Nanterre, 29 janvier 2026, n° 25/02856 : consultation exigée pour le remplacement d'un outil RH par un outil à base d'IA [TIERS, une source] (https://rh-news.fr/2026/10/19/deploiement-de-lia-quand-consulter-le-cse-ce-que-disent-les-premiers-juges/).
  - TJ Paris, référé, 10 février 2026, n° 25/57412 : Copilot 365 jugé ne pas être un projet important imposant la consultation [TIERS, une source] (https://cms.law/fr/fra/legal-updates/deploiement-de-l-ia-quand-les-effets-comptent-plus-que-la-technologie).
  - CA Paris, 21 mai 2026, n° 25/13234 : confirmation de l'ordonnance de Créteil [TIERS, une source] (https://www.editions-tissot.fr/guide/ia-entreprise-consultation-cse).
- Responsabilité : Moffatt c. Air Canada (tribunal de Colombie-Britannique, février 2024). L'entreprise répond de l'information fausse donnée par son chatbot ; l'argument d'une entité distincte est rejeté ; fondement, la négligence. Décision canadienne, sans portée en France [TIERS] (https://www.americanbar.org/groups/business_law/resources/business-law-today/2024-february/bc-tribunal-confirms-companies-remain-liable-information-provided-ai-chatbot/).
- Directive (UE) 2024/2853 sur les produits défectueux : le logiciel et l'IA sont des produits ; transposition au plus tard le 9 décembre 2026 ; dommages corporels, matériels et de données, pas la simple réponse fausse ; le fournisseur s'ajoute à l'exploitant. Directive sur la responsabilité en matière d'IA retirée [TIERS] (https://aiact-navigator.com/blog/ai-liability-product-liability-directive-december-2026).

### Déductions
- [DED] Seuil du CSE : 50 salariés pour les attributions consultatives. Une bonne part de la cible de 20 à 200 salariés est concernée. C'est le client qui consulte, mais c'est le pilote de l'éditeur qui est suspendu.
- [DED] Les décisions Copilot 365 (février 2026) et Créteil (juillet 2025) vont en sens différents : le critère semble être l'effet sur les conditions de travail, pas la technologie.
- [DED] Un agent qui note, classe ou surveille des salariés ou des candidats entrerait dans l'emploi au sens de l'annexe III. Les sources obtenues ne le détaillent pas : à vérifier dans le règlement (UE) 2024/1689.

### Trous
- Texte de l'annexe III (point emploi), article 26 (déployeurs), article 4 (maîtrise de l'IA) : non relus.
- Autorités françaises désignées pour le règlement sur l'IA : non recherché.
- Position de la CNIL propre aux assistants au travail ; règles de surveillance des salariés : non trouvé.
- Transposition française de la directive 2024/2853 : état non trouvé.
- Droit français sur l'information fausse envoyée à un client par un agent : aucune décision trouvée.

## 7. Architecture

### À retenir
Une file dans Postgres suffit à une petite équipe, à condition de traiter chaque tâche comme livrée « au moins une fois ».

### Faits sourcés
- Prise de tâche par `SELECT … FOR UPDATE SKIP LOCKED` : deux workers ne prennent pas la même ligne [TIERS] (https://github.com/erikarg/jobqueue, https://faizahmed.in/postgres-queue-skip-locked/).
- Transaction de prise courte ; l'appel réseau se fait en dehors. Bail avec battement : si le worker meurt, un autre reprend ; un worker dont le battement ne trouve plus sa ligne s'arrête [TIERS] (https://blog.master.dev/building-a-reliable-postgresql-queue-concurrency-crashes-retries-and-scale/).
- Idempotence : clé unique et `ON CONFLICT DO NOTHING` à l'entrée ; clé d'idempotence côté destinataire pour les appels externes [TIERS] (https://poojan.technokari.com/blog/postgres-outbox-instead-of-kafka).
- Webhooks : ils arrivent en double, en retard et dans le désordre. Accuser réception vite, ranger dans une table d'arrivée, traiter en arrière-plan, dédoublonner par identifiant et version [TIERS] (https://dev.to/jctechlabs/webhooks-arrive-twice-late-and-out-of-order-designing-idempotent-handlers-gen).
- Relances : attente exponentielle avec aléa, nombre d'essais plafonné, état « lettre morte » [TIERS] (https://github.com/erikarg/jobqueue).

### Déductions
- [DED] Piège propre aux agents : une relance après un envoi réussi mais non enregistré produit un doublon chez le client. Enregistrer l'intention avant l'action, et vérifier chez l'outil avant de rejouer.
- [DED] Le traitement par lots d'Anthropic (résultats sous 24 heures) convient au résumé quotidien, pas à un brief demandé à la minute.

### Trous
- Durée de vie des abonnements Gmail (`watch`) et Microsoft Graph, moteurs de flux durables (Temporal, Inngest, DBOS…), tâches longues : non trouvé ou non recherché.

## 8. Protocoles

### À retenir
MCP a changé en profondeur à l'été 2026 : la version du 28 juillet 2026 est sans session. Le reste (A2A, appels depuis ChatGPT ou Copilot) n'a pas pu être relevé.

### Faits sourcés
- MCP, version 2026-07-28, courante : cœur sans état, suppression de la poignée de main `initialize` et des sessions, découverte par `server/discover`, requêtes à plusieurs allers-retours, routage par en-têtes, listes cachables, autorisation durcie, cadre d'extensions. La version 2025-11-25 est figée. Candidate publiée le 21 mai 2026 [OFF, blog du projet] (https://blog.modelcontextprotocol.io/posts/2026-07-28/) ; [OFF, fondation] (https://aaif.io/blog/mcp-2026-07-28-whats-changing-and-how-to-migrate).
- MCP est porté par l'Agentic AI Foundation [OFF] (https://aaif.io/blog/mcp-2026-changes-the-rules). SDK C# officiel en v2.0 [OFF] (https://devblogs.microsoft.com/dotnet/announcing-v20-of-the-official-mcp-csharp-sdk/).
- MCP n'a pas de mécanisme intégré pour valider les descriptions d'outils [TIERS] (https://www.uvcyber.com/resources/reports/threat-advisory-mcp-threats).

### Déductions
- [DED] Un serveur MCP écrit pour la version 2025 doit être migré vers le mode sans session pour rester compatible avec les clients récents.
- [DED] Exposer un outil d'écriture par MCP donne la main à un modèle que l'éditeur ne contrôle pas : la validation humaine doit vivre côté serveur.

### Trous
- A2A et autres protocoles entre agents, conditions pour être appelé depuis ChatGPT, Claude ou Copilot (annuaires, revue, actions d'écriture) : non trouvé.

## Ce que ça implique pour nous

Interprétation de l'agent, à discuter.

- **Faisable tout de suite** : les agents qui lisent et rendent un texte à leur seul demandeur (brief de rendez-vous, résumé quotidien, réponse proposée affichée dans le produit). Aucune autorisation d'écriture, pas de canal sortant, coût de 0,3 à 12 centimes par exécution.
- **Faisable avec précautions** : brouillon Gmail ou Outlook, événement d'agenda, note dans le CRM. Conditions : brouillon ou proposition validés par un humain, jamais d'envoi automatique ; destinataires limités ; liens et images filtrés ; journal et annulation ; appli interne au domaine du client pour le pilote.
- **À éviter pour l'instant** : envoi automatique de mails, agent autonome à nombreuses étapes, agent qui lit du contenu externe et écrit dans la foulée, tout ce qui évalue ou surveille des salariés ou des candidats, outils d'écriture exposés par MCP sans validation côté serveur.
- L'audit CASA est probablement déjà dû pour la lecture de Gmail. Il faut le budgéter (quelques centaines à quelques milliers de dollars par an, plusieurs semaines) avant tout client hors pilote, agents ou pas.
- Les conditions d'API de Slack sur les copies durables et les modèles de langage sont un risque pour le produit actuel, pas seulement pour les agents. À faire relire par un juriste en priorité.
- À 25 € le siège, le coût des modèles tient si l'on mélange petit modèle, cache et lots (environ 12 $ par siège pour un usage soutenu). Il ne tient pas avec le modèle moyen sans cache. Un quota d'exécutions par siège protège la marge.
- Chez un client de 50 salariés ou plus, prévoir dès l'offre un dossier pour le CSE : un pilote lancé sans consultation peut être suspendu par le juge.
- Trois vérifications restent à faire avant décision : texte du règlement sur l'IA (annexe III, article 26), conditions Microsoft (vérification d'éditeur, consentement admin), conditions pour être appelé depuis ChatGPT, Claude ou Copilot.
