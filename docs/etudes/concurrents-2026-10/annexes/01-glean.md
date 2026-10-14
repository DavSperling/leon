# Annexe 1 : Glean

Rapport de recherche, relevé le 12 octobre 2026 par un agent Claude. Légende : **[OFF]** vérifié sur une page officielle Glean ; **[TIERS]** source tierce ; **[DÉD]** déduction de l'agent.

## 1. Produit

En une phrase : Glean est une plateforme « Work AI » d'entreprise qui indexe toutes les applications SaaS d'une organisation dans un graphe de connaissances avec permissions, puis expose cette connaissance via une recherche, un assistant conversationnel, des agents et un serveur MCP.

En détail [OFF] : recherche d'entreprise sur 275+ connecteurs, assistant (Glean Assistant), plateforme d'agents (GA mai 2025), MCP server managé, MCP Gateway (« 2 000+ outils gouvernés »), AI Gateway (juillet 2026 : routage de 30+ modèles, quotas, observabilité), Glean Protect/Protect+ (sécurité IA). Sources : https://www.glean.com/connectors ; https://www.glean.com/blog/glean-ai-gateway ; https://docs.glean.com/administration/platform/mcp/about

## 2. Capture de la donnée

- Connecteurs [OFF] : « 275+ out-of-the-box connectors », quatre types : natifs (crawl API côté serveur), MCP, Push API (Indexing API), « web history » via extension navigateur. Mise à jour « dès que ça change à la source, permissions comprises ». https://www.glean.com/connectors ; https://developers.glean.com/
- Fraîcheur réelle [TIERS] : les crawls complets vont « de 6 heures à 28 jours selon le connecteur » ; 2-3 jours de crawl initial pour une petite org, plus 2-14 jours d'entraînement ML. https://getunblocked.com/blog/is-glean-good-enough/
- Conversations LLM externes : Glean NE capte PAS les conversations ChatGPT/Claude/Cursor. Ce qui existe [OFF] :
  - « Mémoire » personnelle : « saved memories » (explicites) + « learned/extracted memories » tirées « de vos chats [dans Glean] et de votre activité de travail », consolidées par un processus quotidien. Stockée « au niveau individuel. Pas de partage inter-utilisateurs », admins ne voient pas les mémoires. https://docs.glean.com/user-guide/assistant/memory-personalization
  - Avril 2026 : outil MCP `read_memory` (lecture seule) pour ChatGPT, Claude, Cursor, VS Code, Copilot. https://docs.glean.com/release-notes/releases/2026-04-08-april-release
  - Juin 2026 : écriture de mémoire via MCP (outils `memory` + `memory_schema`, actions add/update/delete, « full source provenance »). Seules les écritures explicites initiées par l'hôte MCP sont capturées : aucune ingestion automatique des conversations. https://docs.glean.com/release-notes/releases/2026-06-03-june-release
  - 8 octobre 2026 : « activity-based memory » généralisée (AWS/GCP/self-hosted), sources d'activité non détaillées. https://docs.glean.com/release-notes/releases/2026-10-08-october-release
  - AI Gateway : observabilité « token spend par modèle et app », « invocations d'outils MCP » ; rien sur la capture du contenu des prompts vers la base de connaissances. https://www.glean.com/blog/glean-ai-gateway
- [DÉD] L'écriture en mémoire depuis un LLM tiers dépend donc d'un appel d'outil par le LLM, exactement le point faible que Leon vise. La mémoire Glean est personnelle, pas une mémoire d'équipe.

## 3. Restitution

[OFF] Recherche web, extension navigateur (Chrome/Safari/Firefox/Edge : sidebar, nouvel onglet, « Ask » ancré sur la page), Glean Assistant, agents, MCP server distant (OAuth 2.1 + PKCE) avec outils `search, read_document, code_search, employee_search, user_activity, memory, memory_schema, web_search`, testé sur 22+ hôtes (Claude Desktop/Teams, ChatGPT dont app marketplace depuis juillet 2026, Cursor, VS Code, Claude Code, Copilot Studio, Gemini Enterprise). Client API, Indexing API, SDK Python/TS/Go/Java, Web SDK. https://docs.glean.com/administration/platform/mcp/about ; https://docs.glean.com/release-notes/releases/2026-07-29-july-release ; https://www.glean.com/platform/browser-extension

## 4. Droits d'accès

[OFF] « Toutes les permissions sont héritées et strictement appliquées » ; les changements d'ACL à la source sont « reflétés immédiatement » ; permissions appliquées « à chaque lecture et écriture » des agents ; contrôle par outil MCP (juillet 2026), audiences sur les skills (août 2026). https://www.glean.com/connectors ; https://www.glean.com/security ; https://docs.glean.com/release-notes/releases/2026-08-31-august-release

[TIERS] Limite : GitHub n'apparaît qu'après un OAuth individuel par ingénieur. https://getunblocked.com/blog/is-glean-good-enough/

## 5. Cible

[OFF] Clients mis en avant : Databricks, Reddit, Pinterest, Samsung, Workday, Confluent ; en Europe Booking.com, GSK, Ericsson, Deloitte comme partenaire. EMEA : hub Londres + Pays-Bas ; France et Allemagne « prochaines », avec bureau physique en France jugé « culturellement et politiquement essentiel » ; stratégie channel-first (50-100 partenaires d'ici fin 2027). https://www.iteuropa.com/news/ai-data-services-player-glean-has-big-emea-channel-scale-plans (26 août 2026)

[TIERS] Pas de self-serve ni d'essai gratuit ; minimum ~100 sièges / ~50-60 k$ selon plusieurs sources, le plus petit contrat Vendr (29 880 $) ≈ 50-55 sièges. Jugé « mal adapté » aux organisations < 200 personnes. https://workativ.com/ai-agent/blog/glean-pricing ; https://www.teamazing.com/blog/glean-alternative-eu/

[DÉD] Glean ne vend pas aux PME de 10-50 personnes et n'a pas l'intention de le faire à court terme.

## 6. Prix

[OFF] Aucun prix publié ; « Get a demo ». https://www.glean.com/pricing

[TIERS] Vendr : médiane 98 890 $/an, fourchette 29 880-208 897 $, minimums « 100-250 utilisateurs », escalade 3-7 %/an, services pro en sus. https://www.vendr.com/marketplace/glean. Par siège : 45-48 $/mois (~200-230 sièges, avril 2026), ~30 $/mois à 700 sièges ; modèle hybride siège + consommation (FlexCredits, modèle Waldo 0,50 $/M tokens in, 2,50 $/M out). https://www.getmacha.com/blog/glean-ai-pricing-explained ; https://techcrunch.com/2026/05/28/gleans-top-line-crosses-300m-as-ai-budget-cutting-becomes-its-major-selling-point/

## 7. Hébergement et conformité

[OFF] SOC 2 Type II, ISO 27001, ISO 42001, HIPAA, GDPR, TX-RAMP L2 ; Trust Center trust.glean.com. https://www.glean.com/security

[OFF] Deux modèles : Glean Hosted (GCP, single-tenant, région par défaut us-central1, « prévenez Glean si vous voulez une autre région », surcoût hors régions préférées) ; Customer Hosted (GCP ou AWS du client). Région EMEA préférée : Pays-Bas europe-west4 ; Francfort, Belgique, Varsovie, Londres possibles. https://docs.glean.com/get-started/prepare/about-deployment ; https://docs.glean.com/get-started/prepare/self-hosted-deployment/gcp/supported-gcp-regions

[TIERS] Politique de confidentialité : données personnelles « peuvent être transférées aux États-Unis » ; pas de liste de sous-traitants publiée. https://www.teamazing.com/blog/glean-alternative-eu/

HDS : non trouvé. [DÉD] L'hébergement UE existe mais est une option négociée, pas le défaut ; éditeur américain soumis au Cloud Act.

## 8. Traction

[TIERS] Fondée en 2019 à Palo Alto (Arvind Jain, ex-Rubrik/Google). Levées : A 15 M$ (2019), B 40 M$ (2021), C 100 M$ à 1 Md$ (2022), D 200 M$+ à 2,2 Md$ (fév. 2024), E 260 M$+ à 4,6 Md$ (sept. 2024), F 150 M$ à 7,2 Md$ (juin 2025). https://en.wikipedia.org/wiki/Glean_Technologies

[OFF/TIERS] ARR 100 M$ (fév. 2025) → 200 M$ (déc. 2025) → 300 M$ (mai 2026), part en run-rate consommation. https://www.glean.com/press/glean-surpasses-300m-arr-unrivaled-enterprise-context-fuels-ai-adoption ; TechCrunch ci-dessus

[TIERS] Clients : « 700+ entreprises » (mai 2026) ; effectifs ~1 000-1 600 selon sources. https://getlatka.com/companies/glean.com (chiffres non vérifiables officiellement)

## 9. Faiblesses

- Prix et opacité : G2 4,7/5 sur ~162-170 avis, mais critiques récurrentes sur l'absence de prix public, la complexité de déploiement (3-6 mois rapportés), l'authentification séparée. https://www.g2.com/products/glean-technologies-glean/reviews ; https://workativ.com/ai-agent/blog/glean-review
- Exactitude [TIERS, HN] : « donne régulièrement des infos incorrectes ou TRÈS incomplètes, attribue du travail à des devs qui ont juste mentionné un projet » ; effet refroidissant sur Slack (les blagues sont indexées comme des faits) ; « shit in, shit out » si les docs sont obsolètes. https://news.ycombinator.com/item?id=41896552
- Résultats personnalisés donc non reproductibles d'un utilisateur à l'autre ; conflits entre sources non résolus ; listes de documents plutôt que synthèse. https://getunblocked.com/blog/is-glean-good-enough/
- Ce qu'ils ne font pas [OFF] : pas de mémoire partagée d'équipe ; pas de capture des conversations LLM externes ; pas de fiches structurées (l'index reste document-centrique) ; pas de self-serve.

## 10. Implications pour Leon

Concurrence frontale : le « read » est identique (MCP server distant branché sur Claude/ChatGPT/Cursor, outils search/read/memory, permissions héritées). Glean a validé le marché, dispose de 275 connecteurs, et son discours « contexte d'entreprise = moins de tokens » recoupe celui de Leon. Si Leon vise des groupes de 500+, il perd.

Différenciation réelle :
1. Segment : Glean refuse de fait les 10-50 personnes (minimum ~50-100 sièges, 30-50 k$+/an, déploiement en mois). À 25 €/siège self-serve, Leon est sur un terrain vide côté Glean.
2. Capture proactive des conversations LLM : Glean ne l'a pas ; sa mémoire MCP dépend d'un appel d'outil explicite par le LLM (juin 2026) et reste strictement personnelle. C'est l'argument technique le plus solide de Leon, à condition de prouver que le robot capte vraiment (extension, export API ChatGPT/Claude Enterprise, hooks Claude Code).
3. Mémoire d'équipe en fiches : Glean est un index de documents + mémoire individuelle. Leon organise en fiches partagées avec droits : objet différent.
4. UE par défaut et éditeur français : Glean est US, région us-central1 par défaut, UE sur demande et plus chère, pas de sous-traitants publiés, Cloud Act. Argument fort auprès des PME françaises.

Risques : Glean itère vite (mémoire activity-based le 8 oct. 2026, 500+ templates MCP en un mois) ; un « Glean Business » self-serve ou un partenaire ESN français pourrait descendre en gamme ; et surtout Notion/Slack/Google/Microsoft occupent déjà la PME. Leon doit se positionner contre eux autant que contre Glean.
