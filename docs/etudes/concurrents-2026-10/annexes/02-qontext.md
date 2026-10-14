# Annexe 2 : Qontext

Rapport de recherche, relevé le 12 octobre 2026 par un agent Claude. Légende : **[OFF]** vérifié sur une page officielle Qontext ; **[TIERS]** source tierce ; **[DED]** déduction de l'agent.

Homonymes à ne pas confondre : « Qontext, Inc. » (Mountain View, fondée 2009, logiciel de collaboration, qontext.com) est une société sans rapport [TIERS, https://www.linkedin.com/company/qontext-inc.]. L'extension Chrome « Context Vault » et les projets open source « context-mode », « Team Foundry » sont également sans lien. Le bon concurrent est Qontext GmbH / qontext.ai.

## 1. Produit

En une phrase : un « context layer » d'entreprise qui stocke la connaissance métier sous forme de fichiers Markdown, dossiers, skills et références dans un dépôt versionné, interrogeable par n'importe quel agent IA via MCP, API ou CLI [OFF, https://qontext.ai/, https://qontext.ai/blog/introducing-qontext-1.0]. Qontext 1.0 publié le 6 octobre 2026 [OFF]. Les connecteurs synchronisent les sources, des « continuous update agents » retraitent les données après chaque sync, des « context agents » (chat dans l'UI) créent/éditent les fichiers, et « change reviews » met les fichiers protégés sous validation humaine [OFF, https://docs.qontext.ai/features/context-agents.md, https://docs.qontext.ai/features/change-reviews.md]. Positionnement : infrastructure pour agents (« agent-first »), pas outil de recherche grand public ; le manifeste rejette le RAG seul et les « silos agentiques » [OFF, https://qontext.ai/blog/manifesto].

## 2. Capture de la donnée

- Connecteurs natifs (10) : Confluence, Gong, Google Drive, HubSpot, Linear, Notion, Salesforce, SharePoint, Slack, Website (crawl) [OFF, https://docs.qontext.ai/sources]. Pas de Gmail/Outlook, pas de Teams, pas de GitHub (seul un skill « import-repo » pour migrer un dépôt) [OFF, DED].
- Mécanisme : pull côté serveur via OAuth / compte d'intégration dédié (ex. qontext@yourcompany.com), sync quotidienne/hebdo/mensuelle au choix, « daily » sur Build, « hourly » sur Scale, temps réel seulement en Enterprise [OFF, https://docs.qontext.ai/sources/google-drive, https://qontext.ai/pricing]. Pas d'agent local ni d'extension navigateur trouvés [DED].
- Conversations LLM des employés : NON capturées. Aucune source ChatGPT/Claude/Cursor dans la liste ; les context agents ne travaillent que sur « your synced data » et le dépôt [OFF, DED]. Slack est ingéré seulement pour les canaux où l'app est invitée, pas les DM [OFF, https://docs.qontext.ai/sources/slack].
- Écriture par le LLM : le serveur MCP expose des outils d'écriture (qontext_create_file, qontext_write, qontext_mkdir, qontext_mv, qontext_rm) à côté des outils de lecture (qontext_ls, qontext_find, qontext_cat, qontext_grep, retrieval-tool) [OFF, https://docs.qontext.ai/interfaces/MCP.md]. Donc hors connecteurs, la mémoire issue des conversations dépend bien d'un appel d'outil par le LLM, exactement la « paresse d'écriture » que Leon contourne [DED].

## 3. Restitution

MCP hébergé (https://api.qontext.ai/mcp, OAuth par utilisateur ou clé API), API REST (api.qontext.ai/v1 : fichiers/dossiers, recherche sémantique + regex), CLI (ls/cat/grep/find + hybrid search), « Qontext Tag » pour interroger @Qontext dans Slack (lecture seule, early access) [OFF, https://docs.qontext.ai/interfaces/api.md, https://qontext.ai/blog/qontext-tag]. Clients documentés : ChatGPT, Claude (web + desktop), Codex, Cursor, Gemini (ADK), Langdock, n8n, Make, Zapier [OFF, https://docs.qontext.ai/clients]. Claude Code et Windsurf non mentionnés [OFF]. Dans Claude, l'utilisateur doit ajouter « Use Qontext » au prompt : pas d'injection automatique de contexte [OFF, https://docs.qontext.ai/clients/claude.md].

## 4. Droits d'accès

Rôles Owner/Admin/Member + accès par fichier/dossier à 4 niveaux (No access, Can read, Can edit, Full access) ; l'accès s'élargit en descendant l'arbre, ne se restreint pas ; clés API scopées par fichier/dossier ; groupes « en cours de déploiement » ; logs de récupération [OFF, https://docs.qontext.ai/features/access-management.md]. Permissions NON héritées des sources : Drive est ingéré avec les droits du compte connecté, Slack par canal ; tout est réglé manuellement dans Qontext [OFF, DED]. C'est une limite nette pour une PME où un seul compte de service verrait tout [DED].

## 5. Cible

« AI-native companies », de la startup en croissance au grand compte, fonctions marketing/ventes/support/engineering/RH [OFF, TIERS]. Témoignages : Cognigy, make.com, Flink [OFF, https://qontext.ai/solutions/customer-service]. Vente par démo (cal.com/qontext/sales), support Slack privé, on-premise en Enterprise : orientation mid-market/enterprise et équipes IA/dev plutôt que PME de 10 à 50 personnes sans ingénieur [DED]. Géographie : Allemagne/DACH d'abord (podcasts en allemand, investisseurs allemands) [TIERS, DED]. Rien de spécifique à la France trouvé.

## 6. Prix

[OFF, https://qontext.ai/pricing, https://docs.qontext.ai/get-started/pricing.md] Explore : gratuit, 100k crédits/mois, 3 sources, MCP/API/CLI. Build : 500 €/mois, 1M crédits, 5 sources, sync quotidienne, permissions, change reviews. Scale : 2 000 €/mois, 5M crédits, 10 sources, sync horaire. Enterprise : sur devis, sources illimitées, temps réel, on-premise. Crédits : 1 500 / 1 000 recherches, 400 / 1 000 écritures, 300 / 1 000 enregistrements ingérés, ~990 par « continuous update » ; dépassement 0,45 €/1 000 crédits dégressif à 0,30 €. Membres et groupes illimités, aucun prix par siège. À 25 €/siège, Leon serait moins cher que Build jusqu'à 20 sièges, mais le gratuit Qontext (3 sources) peut servir de point d'entrée [DED].

## 7. Hébergement et conformité

AWS Francfort, traitement en UE, RGPD, pas d'entraînement de modèles sur les données ; options BYOC (AWS/Azure/GCP) et on-premise ; ISO 27001 certifié (9 juin 2026) ; SOC 2 Type II « pending » [OFF, https://qontext.ai/security, https://qontext.ai/blog/iso-27001]. Trust center : https://trust.qontext.ai/ (contenu non lisible par fetch). Sur ce point, Leon n'a pas d'avantage « UE » face à eux [DED].

## 8. Traction

Fondée 2025 à Berlin par Lorenz Hieber (CEO) et Nikita Kowalski (CTO/CPTO) ; pré-seed 2,7 M$ annoncé le 5 février 2026, mené par HV Capital avec Zero Prime Ventures et des angels (fondateurs de n8n, neo4j, Celonis, Cognigy, make.com, Zapier, Camunda, Langdock…) [OFF, https://qontext.ai/blog/pre-seed ; TIERS, https://tech.eu/2026/02/05/qontext-closes-27m-pre-seed-round-to-develop-a-context-layer-for-ai/]. Effectifs : 12 personnes listées sur la page About [OFF, https://qontext.ai/about] ; 9 selon Tracxn (juillet 2026) [TIERS]. Nombre de clients : non trouvé. Revenu : non trouvé. GitHub : CLI, nœud n8n, exemples, très peu d'étoiles [OFF, https://github.com/qontext-ai].

## 9. Faiblesses

Aucun avis utilisateur trouvé (ni Reddit, ni HN, ni Product Hunt, ni G2) : produit trop jeune. Limites observables [OFF/DED] : pas de Gmail ni de messagerie ; pas de capture des conversations LLM ; écriture dépendante d'un tool-call MCP ou d'un prompt manuel aux context agents ; sync au mieux quotidienne sous 2 000 €/mois ; permissions non héritées des sources ; « Use Qontext » à taper dans Claude ; Claude Code non documenté ; groupes encore en déploiement ; SOC 2 absent ; prix d'entrée élevé pour une PME ; produit 1.0 vieux de six jours, étiquette « early access » sur Slack Tag.

## 10. Implications pour Leon

Concurrence frontale : le concept « mémoire d'entreprise interrogée par le LLM via MCP », hébergement UE, pitch « context as a layer », clients ChatGPT/Claude/Cursor. Si Qontext descend en gamme (son gratuit + Build) ou ajoute Gmail, le recouvrement augmente.

Différenciation réelle de Leon : (a) capture proactive sans attendre le LLM, y compris les conversations Claude/ChatGPT/Cursor/Claude Code, ce que Qontext ne fait pas du tout ; (b) Gmail et flux « humains » d'une PME, absents chez Qontext ; (c) droits hérités des sources plutôt que réglés à la main par un admin ; (d) prix par siège lisible pour un dirigeant de PME vs crédits + 500 €/mois ; (e) marché français et support francophone (Qontext est germanophone/anglophone). Point de vigilance : Qontext a déjà ISO 27001, 2,7 M$ et des angels de l'écosystème automation (n8n, make) ; Leon devra tenir la conformité et ne pas se vendre comme « infra pour agents » mais comme « mémoire clé en main pour PME ».
