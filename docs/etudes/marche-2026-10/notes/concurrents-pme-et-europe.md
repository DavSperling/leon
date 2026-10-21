# Concurrents « Glean pour PME » et assistants IA de travail européens : état au 21 octobre 2026

Complète l'étude v1 du 12/10 (`docs/etudes/concurrents-2026-10/README.md`), qui couvrait Glean, Qontext, Sentra et memory.store. Ici, on ne les reprend pas.

Conventions : chaque chiffre est daté. **[agrégateur]** = source secondaire (annuaire, blog comparatif), à vérifier. **[non vérifié]** = une seule source, ou une source peu fiable. **[> 1 an]** = donnée antérieure à 2025.

---

## 1. Qui vend vraiment aux entreprises de 10 à 200 personnes, et à quel prix ?

### Takeaway
Trois acteurs vendent vraiment en self-service à des équipes de 10 à 200 personnes, à un prix de 15 à 30 €/$ par siège et par mois : **Dust** (24 €/siège), **Langdock** (25 €/siège) et **Dropbox Dash** (15-19 $/siège jusqu'à 100 sièges). Leon arrive donc pile dans leur fourchette. Les outils « wiki + IA » (Slite, Tettra, Notion Business) coûtent 8 à 20 $ mais ne cherchent que dans leurs propres documents ou dans une poignée de connecteurs. Aucun ne capte les conversations LLM des employés.

### Cited Findings

**Dust (Paris, fondé en 2022)** : plateforme d'agents IA branchée sur les outils de l'entreprise.
- Prix public (oct. 2026) : plan Business self-service « pour les équipes jusqu'à 100 personnes ». Siège Free à 0 € (500 crédits à vie), Pro à 24 €/mois en annuel ou 30 € en mensuel (8 000 crédits/mois), Max à 120 €/mois en annuel ou 150 € en mensuel (40 000 crédits/mois). Enterprise sur devis. Pas de minimum de sièges affiché — [dust.tt/home/pricing](https://dust.tt/home/pricing)
- Connecteurs (oct. 2026) : plus de 20 sources (Slack, Notion, GitHub, Drive…), mais le tableau limite le plan Business à 3 connecteurs. MCP : « any tool via MCP », jusqu'à 5 serveurs MCP distants en Business, illimités en Enterprise — [dust.tt/home/pricing](https://dust.tt/home/pricing)
- Hébergement : résidence des données US ou UE dès le plan Business, et single-tenant en Enterprise — [dust.tt/home/pricing](https://dust.tt/home/pricing). Une fiche tierce indique que l'UE est la région par défaut **[agrégateur]** — [aiagentrank.io](https://aiagentrank.io/agent/dust)
- Revendiqué (oct. 2026) : « plus de 3 000 équipes » et « plus de 300 000 agents déployés » — [dust.tt/home/pricing](https://dust.tt/home/pricing)
- Avis : 4,9/5 sur 15 avis G2, d'après un résumé de seconde main **[agrégateur, non vérifié sur G2]**. Les points forts cités sont la création d'agents par des non-techniciens et les connecteurs Notion, Drive, Slack, Gong et Salesforce. Les critiques : la qualité dépend du ménage préalable dans les données, et les agents ne s'améliorent pas sans qu'on retouche leurs instructions à la main — [hackceleration.com](https://hackceleration.com/es/labs/resena/dust). Aucune discussion Reddit trouvée, et « 0 community mentions » selon [deepline](https://deepline.com/gtm-stack/providers/dust-tt)

**Langdock (Berlin, YC)** : chat IA multi-modèles pour toute l'entreprise, avec assistants, bases de connaissances et workflows.
- Prix public (oct. 2026) : Business à 25 €/utilisateur/mois HT (siège Business Max à 99 €, 5 fois plus d'usage), jusqu'à 1 000 utilisateurs, SSO/SCIM/SAML inclus. Enterprise sur devis au-delà de 1 000 utilisateurs. -20 % en annuel. Le curseur de prix commence à 100 utilisateurs. Le module Governance est gratuit jusqu'au 01/01/2027, puis facturé 3,50 €/utilisateur/mois — [langdock.com/pricing](https://langdock.com/pricing)
- MCP : seule mention, « MCP governance », marquée « Coming soon ». La page ne liste pas les connecteurs — [langdock.com/pricing](https://langdock.com/pricing)
- Hébergement : sur Azure à Francfort, ISO 27001 et SOC 2 Type II **[agrégateur]** — [bakedwith.com](https://www.bakedwith.com/blog/langdock-im-test). Options cloud managé, cloud du client ou on-prem — [langdock.com/pricing](https://langdock.com/pricing)
- Clients : « plus de 10 000 entreprises » d'après la page de prix (Merck, BASF, Würth, UNICEF, The Economist) — [langdock.com/pricing](https://langdock.com/pricing)

**Dropbox Dash** : recherche universelle avec IA, vendue séparément du stockage Dropbox.
- Prix (2026, tiers) : Dash for Teams à 19 $/utilisateur/mois en mensuel ou 15 $ en annuel, jusqu'à 100 utilisateurs. Dash for Business à 35 $/utilisateur/mois, en annuel seulement, au-delà de 100 utilisateurs. -50 % pour les clients Dropbox existants. Essai de 30 jours, pas de plan gratuit **[agrégateur]**. Effet de seuil : 100 sièges coûtent 18 000 $/an, 101 sièges 42 420 $ — [insearch.ai](https://insearch.ai/dropbox-dash-pricing) ; [clickup.com](https://clickup.com/blog/dropbox-dash-alternatives/)

**Mistral Le Chat (Team / Enterprise)**
- Prix (oct. 2026) : Team à 24,99 $/utilisateur/mois HT. Enterprise sur devis (déploiement privé, modèles et outils sur mesure). Le plan gratuit annonce « 100+ connecteurs » — [mistral.ai/pricing](https://mistral.ai/en/pricing)
- Le Chat Enterprise, lancé en mai 2025 : recherche dans Google Drive, SharePoint, OneDrive, Google Calendar et Gmail, avec respect des ACL. Déploiement auto-hébergé, en cloud privé ou public, ou chez Mistral — [mistral.ai/fr/news/le-chat-enterprise](https://mistral.ai/fr/news/le-chat-enterprise)
- 2 septembre 2025 : mémoire (bêta) et annuaire de plus de 20 connecteurs construits sur MCP (Databricks, Snowflake, GitHub, Atlassian, Stripe), annoncés comme disponibles aussi en gratuit — [mistral.ai/fr/news/le-chat-mcp-connectors-memories](https://mistral.ai/fr/news/le-chat-mcp-connectors-memories) ; [VentureBeat](https://venturebeat.com/ai/mistral-ai-just-made-enterprise-ai-features-free-and-thats-a-big-problem-for)
- Juin 2026 : plus de 60 intégrations. Les « Knowledge Connectors » Drive et SharePoint seraient réservés aux plans Team et Enterprise **[non vérifié, liste communautaire]** — [github.com/rdmgator12/awesome-mistral-connectors](https://github.com/rdmgator12/awesome-mistral-connectors)

**Notion AI (plan Business)**
- Prix (2026) : Business à 20 $/utilisateur/mois en annuel (24 $ en mensuel). Il inclut Notion Agent, AI Meeting Notes et Enterprise Search (en bêta selon une source). Les agents personnalisés consomment des crédits à 10 $ les 1 000 par mois **[agrégateur]** — [gend.co](https://www.gend.co/blog/notion-pricing) ; [eesel.ai](https://eesel.ai/blog/notion-ai-review)
- Connecteurs (mai 2026) : Slack, Google Drive, GitHub, Jira, Teams, OneDrive, SharePoint, Salesforce et Box (ces deux derniers ajoutés en avril 2026) **[agrégateur, une seule source]** — [eesel.ai](https://www.eesel.ai/blog/notion-ai-integration)

**Slite (Paris)**
- Le 10 juin 2026, Super (le produit de recherche IA multi-outils lancé en 2025) devient **Slite Agent**, intégré au produit principal. Les clients Super gardent leur abonnement — [slite.com/fr/blog](https://slite.com/fr/blog/slite-announcing-self-maintaining-knowledge-base)
- Prix (juin 2026) : Pro à 20 $/utilisateur/mois en annuel (agent complet, recherche IA sur plus de 20 outils connectés). Basic à 10 $ (base de connaissances, et Ask limité aux documents Slite). « Des milliers d'équipes », sans chiffre précis — [slite.com/fr/blog](https://slite.com/fr/blog/slite-announcing-self-maintaining-knowledge-base)
- Positionnement 2026 : « base de connaissances qui s'entretient toute seule ». L'agent détecte les écarts entre les outils connectés et propose des mises à jour, validées par un humain **[agrégateur]** — [yespress.io](https://yespress.io/slite.md)

**Tettra (Kai)**
- Prix (vérifiés en juin 2026) : Scaling, avec IA et bot Slack Kai, à 10 $/utilisateur/mois en mensuel ou 8 $ en annuel, de 10 à 250 sièges. Basic sans IA à 5 $ ou 4 $. Professional à 7 200 $/an forfaitaires pour 50 utilisateurs. Pas de plan gratuit **[agrégateur]** — [frontdeskreview.com](https://frontdeskreview.com/software/internal-wiki/tettra/)

**Question Base (Slack)**
- Prix (oct. 2026) : PoC à 1 000 $ pour 2 mois. Annual Pro à partir de 6 000 $/an (5 $/utilisateur/mois). Enterprise+ à partir de 20 000 $/an (15 $/utilisateur/mois, déploiement dans l'AWS du client, HIPAA). Pas d'hébergement UE ni de MCP mentionnés, aucun nombre de clients — [questionbase.com/pricing](https://www.questionbase.com/pricing)
- Lancements Product Hunt en janvier 2023, juin 2024 et octobre 2024. Bot Slack qui renvoie la question vers un expert humain quand il ne trouve pas la réponse **[> 1 an]** — [Product Hunt](https://www.producthunt.com/products/question-base/launches/question-base-4)

**Guru**
- Self-service à environ 25 $/siège/mois en annuel, minimum 10 sièges. Le positionnement glisse vers « la couche de connaissance gouvernée pour l'IA d'entreprise », avec des contrats sur mesure **[agrégateur]** — [getmacha.com](https://www.getmacha.com/blog/guru-complete-guide)

**Swiftask (Nantes)**
- Première levée de 1,55 M€, finalisée en août 2026 (fondateurs et business angels). Plateforme pour créer et gouverner des agents IA, hébergée en France, « Cloud Act Proof », plus de 80 modèles. Revendique plus d'une centaine de clients — [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/swiftask-leve-155-million-deuros-pour-accelerer-le-deploiement-de-ses-agents-ia-2147361) ; [jaimelesstartups.fr](https://www.jaimelesstartups.fr/news/swiftask-levee-de-fonds/)

**Hyperspell (YC F25)** : couche mémoire pour agents (Slack, Gmail, Notion, Drive indexés dans un « context graph »). C'est de l'infrastructure pour développeurs, pas un produit pour PME. Seed d'environ 5,2 M$ au 01/12/2025 d'après CB Insights, d'autres annuaires donnent 1 à 2 M$ **[agrégateur, chiffres contradictoires]** — [cbinsights.com](https://www.cbinsights.com/company/hyperspell/financials) ; [everydev.ai](https://www.everydev.ai/developers/digital-workers-of-california)

**Positionnés enterprise (hors cible PME)** :
- **Kore.ai** : 150 M$ levés en janvier 2024 (FTV, NVIDIA), 223,5 M$ au total. Investissement de croissance d'AllianceBernstein en janvier 2026, montant non communiqué. Aucun signe d'offre PME — [coverager.com](https://coverager.com/kore-ai-raises-150-million/) ; [itbrief.com.au](https://itbrief.com.au/story/kore-ai-secures-new-funding-to-scale-agentic-ai-tools)
- **Credal (New York, YC)** : « control plane » pour agents d'entreprise (registre d'agents et de serveurs MCP, synchronisation des droits, journal d'audit). Seed de 4,8 M$ en octobre 2023 **[> 1 an]**, aucune levée trouvée depuis — [cbinsights.com](https://www.cbinsights.com/company/credal-ai) ; [yespress.io](https://yespress.io/credal-ai.md)
- **LightOn Paradigm (France)** : RAG on-prem ou en cloud privé, licences sur devis **[agrégateur]** — [europeanpurpose.com](https://europeanpurpose.com/tool/lighton)
- **Bloomfire** : aucune actualité 2025-2026 trouvée. Recapitalisé par Primus Capital en 2021 **[> 1 an]** — [mrweb.com](https://www.mrweb.com/drno/printable/pn31937.htm)
- **Needl.ai** : RAG pour secteurs régulés, vendu via AWS Marketplace, sans financement identifié — [needl.ai](https://needl.ai/blog/needl-ai-earns-a-recognition-from-everest-group). À ne pas confondre avec **Needle** (Berlin et San Francisco), seed de 2,2 M$ en mars 2025 — [tech.eu](https://tech.eu/2025/03/03/needle-secures-22m-seed-funding-for-ai-data-search-and-agent-development/)
- **Swifteq** : société de conseil et d'apps pour Zendesk, ce n'est pas un concurrent — [zendesk.com marketplace](https://www.zendesk.com/marketplace/partners/3363/)

### Inferences

**Verdict par acteur** (au 21/10/2026) :

| Acteur | Verdict | Preuve principale |
|---|---|---|
| Dust | **En plein essor** | Série B de 40 M$ (mai 2026), 20 M$ d'ARR, 3 000 clients |
| Langdock | **En plein essor** | 3 000 → 13 000 clients en 2026, 50 M d'ARR, se dit rentable |
| Mistral Le Chat | **En plein essor** (maison mère) | Levée de 1,7 Md€ en 2025, connecteurs MCP |
| Dropbox Dash | **Stable / incertain** | Adoption « encore précoce » selon la direction, aucune métrique Dash publiée |
| Notion AI | **Stable** | Recherche entreprise incluse dans le plan Business, encore en bêta |
| Slite | **Stable, en repli sur son cœur** | Super réabsorbé dans Slite Agent (juin 2026) |
| Tettra | **Stable, niche** | Prix bas, aucun signal de croissance |
| Question Base | **Stable, niche** | Petit acteur Slack, s'oriente enterprise |
| Guru | **Stable, se repositionne** | Bascule vers l'enterprise et la gouvernance |
| Swiftask | **Naissant** | 1,55 M€, une centaine de clients |
| Hyperspell | **Naissant** | Seed de YC F25, infrastructure développeurs |
| Credal | **Stable, enterprise** | Pas de levée depuis 2023 |
| Kore.ai | **Stable, enterprise** | Hors cible |
| Bloomfire | **Stagnant** | Aucune actualité depuis 2023 |
| Dashworks | **Mort** (racheté) | Fermé le 16/07/2025 |
| Qatalog | **Mort** (racheté) | Racheté par ClickUp, 2025 |
| Zive | **Racheté** | Docebo, 2 avril 2026 |
| Unleash | **Racheté** | Zendesk, 18 décembre 2025 |
| Onyx | **Racheté** | Zoom, septembre 2026 |
| Sana | **Racheté** | Workday, 1,1 Md$ |

- Le « prix PME » de 2026 se situe entre 15 et 30 € par siège et par mois. À 20-35 €, Leon est dans le marché, pas en dessous. La guerre des prix est déjà là : Notion inclut la recherche dans un plan à 20 $, Mistral offre ses connecteurs MCP dans le plan gratuit.
- Dust et Langdock ne sont pas des « Glean pour PME ». Ce sont des plateformes de chat et d'agents multi-modèles, avec la connaissance comme fonction parmi d'autres. Le gagnant PME vend « l'accès à l'IA pour toute l'entreprise », pas « la recherche ». Leon devra justifier un abonnement en plus de ces outils, ou s'y brancher par MCP.
- Dust est le concurrent le plus proche de Leon par sa culture produit (MCP, connecteurs, UE, self-service jusqu'à 100 personnes).

### Gaps
- Pas de prix officiel de Dropbox Dash relevé sur dropbox.com (sources tierces seulement).
- Aucun avis G2 ni Capterra consulté en direct (pages bloquées ou non trouvées). Le sentiment client reste mince pour tous, sauf Dust (résumé de seconde main).
- Les connecteurs de Langdock (Gmail, HubSpot, Linear ?) n'ont pas été vérifiés.
- Unique (Suisse), Aleph Alpha (un accord avec Cohere est signalé le 16/09/2026 par une seule source, [benchlm.ai](https://benchlm.ai/best/european-llm), **[non vérifié]**) et les acteurs nordiques autres que Sana ne sont pas couverts.

---

## 2. Qui est mort, a pivoté ou a été racheté, et quelles leçons en tirer ?

### Takeaway
2025-2026 a été une vague de rachats : Dashworks (HubSpot), Qatalog (ClickUp), Unleash (Zendesk), Sana (Workday), Zive (Docebo) et Onyx (Zoom). Les recherches IA pour PME et ETI n'ont pas tenu seules : elles sont devenues des fonctions de plateformes déjà installées (CRM, gestion de projet, support, RH, visio). Aucune faillite sèche trouvée : les sorties sont des acqui-hires ou des rachats de technologie, avec fermeture du produit autonome.

### Cited Findings

**Dashworks → HubSpot (le cas d'école du « Glean pour PME »)**
- Avant le rachat : assistant IA branché sur plus de 50 applications, tourné vers les petites et moyennes entreprises. Il revendiquait « des centaines de clients », un usage doublé chaque trimestre pendant 7 trimestres et un NDR de plus de 200 % (chiffres déclarés par Dashworks) — [vantagepoint.io](https://vantagepoint.io/blog/hs/what-happened-to-dashworks-ai)
- Prix : 12 $/siège/mois sans minimum de sièges, et Dashworks se disait « 2 à 3 fois moins cher que Glean » (2024) **[> 1 an]** — [dashworks.ai/blog](https://www.dashworks.ai/blog/top-3-glean-alternatives-for-enterprise-search-in-2024). Capterra le dit adapté aux entreprises de 30 à 3 000 salariés — [capterra.ie](https://www.capterra.ie/compare/1031332/1050367/glean/vs/dashworks)
- Chronologie : accord annoncé le 16/04/2025 (fin des inscriptions, export ouvert), API coupée le 23/04, rachat finalisé le 01/05/2025, connexions à l'app web et au Slackbot désactivées le **16/07/2025**. Remboursement au prorata, données supprimées sous 30 jours. Montant non communiqué — [vantagepoint.io](https://vantagepoint.io/blog/hs/what-happened-to-dashworks-ai) ; [hubspot.com](https://www.hubspot.com/company-news/hubspot-to-acquire-dashworks) ; [lemondeinformatique.fr](https://www.lemondeinformatique.fr/actualites/lire-hubspot-finalise-l-acquisition-de-dashworks-pour-renforcer-ses-capacites-ia-96651.html)
- Motif affiché par HubSpot : donner à chaque commercial un assistant qui cherche dans les données non structurées hors du CRM, pour Breeze. L'équipe a rejoint le groupe IA de HubSpot — [vantagepoint.io](https://vantagepoint.io/blog/hs/what-happened-to-dashworks-ai)

**Qatalog (Londres) → ClickUp**
- Rachat annoncé en novembre 2025, montant non communiqué. Qatalog avait levé 26 à 29,5 M$ (Salesforce Ventures, Atomico…). Sa techno de recherche « ActionQuery », qui respecte les droits d'accès, est intégrée à ClickUp 4.0 — [sdbj.com](https://www.sdbj.com/technology/software/clickup-acquires-ai-co-qatalog/) ; [businesswire.com](https://businesswire.com/news/home/20251210712132/en/ClickUp-4.0s-Craft-Quality-is-Available-Today-Maximizing-Human-Productivity)
- qatalog.com redirige désormais (301) vers clickup.com/qatalog-acquisition (constaté le 21/10/2026) — [clickup.com](https://clickup.com/qatalog-acquisition)
- Revenu 2024 estimé à 5,9 M$ avec 38 personnes **[agrégateur, non vérifié, page incohérente]** — [getlatka.com](https://getlatka.com/companies/qatalog)
- Pivots successifs : « hub de travail » en 2021-2022, puis génération d'apps métier par IA (Qatalog 2.0), puis recherche — [venturebeat.com](https://venturebeat.com/ai/startup-deploys-generative-ai-to-help-build-business-applications)

**Unleash (Tel Aviv) → Zendesk**
- Rachat annoncé le 18/12/2025, montant non communiqué (estimé à « quelques dizaines de millions de dollars » selon Calcalist). Recherche entreprise générative avec RAG qui respecte les droits, plus de 70 connecteurs. Environ 20 M$ levés, ventes triplées sur un an — [zendesk.com](https://www.zendesk.com/newsroom/articles/zendesk-acquires-unleash) ; [calcalistech.com](https://www.calcalistech.com/ctechnews/article/rj9bvaz7bg) ; [cxtoday.com](https://cxtoday.com/zendesk-acquires-unleash-introduces-ai-enterprise-search-tool)

**Zive (Hambourg) → Docebo**
- Fondé en novembre 2023. Pré-seed de 2,8 M€ (Headline) en septembre 2024, plus de 100 k€ d'ARR trois mois après le lancement, argument RGPD, AI Act et hébergement UE — [startupcity.hamburg](https://startupcity.hamburg/news-events/news/29-million-euros-for-zive-in-pre-seed-round) ; [siliconcanals.com](https://siliconcanals.com/german-startup-zive-raises-2-8m/)
- Racheté par Docebo, finalisé le **02/04/2026** pour environ 7,1 M$ (6,8 M$ en numéraire et 0,2 M$ de retenue), d'après le 6-K du T2. Sa techno alimente « AgentHub » — [sec.gov 6-K T2 2026](https://www.sec.gov/Archives/edgar/data/0001829959/000162828026054559/docebo2026q2mda.htm) ; [startupcity.hamburg](https://startupcity.hamburg/news-events/news/learning-management-system-provider-docebo-acquires-zive)

**Onyx (ex-Danswer, open source) → Zoom**
- Seed de 10 M$ en mars 2025 (Khosla, First Round, YC W24). Clients : Netflix, Thales, Ramp. Plus de 40 connecteurs, droits synchronisés depuis les sources. Édition communautaire sous licence MIT — [TechCrunch](https://www.techcrunch.com/2025/03/12/why-onyx-thinks-its-open-source-solution-will-win-enterprise-search/) ; [globenewswire.com](https://www.globenewswire.com/news-release/2025/03/12/3041638/0/en/Onyx-Raises-10M-To-Help-Teams-Find-Knowledge-Faster-with-Open-Source-AI-Agents.html)
- Rachat par Zoom annoncé par les fondateurs le 23/09/2026 (environ 18 personnes). Le produit reste open source et auto-hébergeable, le prix n'est pas communiqué **[sources secondaires, pas de communiqué Zoom trouvé]**. Plus de 30 000 étoiles GitHub — [shashi.co](https://www.shashi.co/2026/09/zoom-takes-onyx-and-says-search-index.html) ; [ecosistemastartup.com](https://ecosistemastartup.com/zoom-compra-onyx-app-y-suma-30-000-devs-a-su-ia/)

**Sana (Stockholm) → Workday**
- Accord à environ 1,1 Md$ annoncé en septembre 2025, clôture prévue avant le 31/01/2026. Sana Learn et Sana Agents : plus d'un million d'utilisateurs, « des centaines d'entreprises » — [orrick.com](https://www.orrick.com/en/News/2025/09/Workday-to-Acquire-Sana-for-1-Billion) ; [itbrief.co.uk](https://itbrief.co.uk/story/workday-acquires-sana-for-usd-1-1-billion-to-boost-ai-at-work)

**Pivots sans rachat**
- Slite : Super (2025) est réabsorbé dans Slite Agent en juin 2026 — [slite.com](https://slite.com/fr/blog/slite-announcing-self-maintaining-knowledge-base)
- Credal : se repositionne en « control plane d'agents » en janvier 2025 — [yespress.io](https://yespress.io/credal-ai.md)
- Guru : glisse de la base de connaissances vers la gouvernance de la connaissance pour l'IA **[agrégateur]** — [getmacha.com](https://www.getmacha.com/blog/guru-complete-guide)

### Inferences
- **Leçon 1 : la recherche seule est une fonction, pas un produit.** Chaque éditeur de plateforme (CRM, projet, support, LMS, RH, visio) a racheté la sienne plutôt que de payer un tiers. Pour une PME, l'acheteur naturel de « la recherche dans nos outils » est l'éditeur qu'elle utilise déjà.
- **Leçon 2 : le prix bas ne protège pas.** Dashworks à 12 $ sans minimum avait de bonnes métriques déclarées (NDR de plus de 200 %) mais a vendu au bout d'environ 5 ans. Hypothèse : coût des connecteurs et des LLM trop élevé pour un panier de quelques milliers d'euros, et risque d'être écrasé par la recherche « gratuite » de Notion, Slack et Google. Dashworks n'a pas donné ses raisons, c'est une **déduction**.
- **Leçon 3 : les petites sorties sont modestes.** Zive : environ 7 M$ après 2,8 M€ levés et 2,5 ans d'existence. Un acteur européen sur ce créneau sort plutôt par un acqui-hire que par l'hypercroissance, sauf à devenir une plateforme horizontale (Dust, Langdock).
- **Pour Leon** : la capture des conversations LLM et le MCP vers le LLM du client se distinguent de la « recherche ». Ils restent vulnérables à l'intégration native (la mémoire de Mistral, les connecteurs MCP de Claude et ChatGPT).

### Gaps
- Aucun montant de rachat connu sauf Sana (1,1 Md$) et Zive (environ 7,1 M$).
- Les chiffres de Dashworks (clients, ARR) avant le rachat ne sont pas publics, et la raison de la vente n'est pas documentée par les fondateurs.
- Le rachat d'Onyx par Zoom n'est pas confirmé par un communiqué officiel de Zoom.

---

## 3. Quels chiffres de traction existent (ARR, organisations, levées 2024-2026) ?

### Takeaway
Les deux seuls acteurs européens avec une vraie traction publique sont **Langdock** (environ 50 M d'ARR, 13 000 organisations, se dit rentable, environ 65 salariés, septembre 2026) et **Dust** (20 M$ d'ARR, environ 3 000 clients, Série B de 40 M$ en mai 2026). Les autres sont soit rachetés, soit sans chiffres publics.

### Cited Findings
- **Langdock** : 40 M$ d'ARR en juin 2026, avec environ 1 M$ d'ARR ajouté chaque semaine depuis janvier — [deutsche-startups.de](https://www.deutsche-startups.de/2026/06/26/langdock-judith-dada-visionaries-club-robin-capital-philipp-lahm/). Environ 50 M€ d'ARR annoncés en septembre 2026 par le co-CEO Lennard Schmidt, rentabilité revendiquée, plus de 13 000 organisations — [dealroom.co](https://app.dealroom.co/news/note/langdock-hits-50m-arr-55m). Une autre source parle de 50 M$ en août 2026 : **la devise diffère selon les sources** — [rosepartner.de](https://www.rosepartner.de/blog/reverse-flip-des-ki-startups-langdock.html). De 3 000 clients en janvier à plus de 13 000 en septembre 2026 (Handelsblatt, cité par [borncity.com](https://borncity.com/news/langdock-verlegt-sitz-nach-deutschland-ki-plattform-wechselt-zu-se/)). Environ 65 salariés **[non vérifié]** — [dealroom.co](https://app.dealroom.co/news/note/langdock-hits-50m-arr-55m). Financement : seed de 3 à 3,5 M$ (General Catalyst, La Famiglia, YC) en 2024 **[> 1 an, agrégateur]**, avec des investisseurs angels signalés en juin 2026 (Visionaries Club, Robin Capital, Philipp Lahm) — [deutsche-startups.de](https://www.deutsche-startups.de/2026/06/26/langdock-judith-dada-visionaries-club-robin-capital-philipp-lahm/)
- **Dust** : Série B de 40 M$ le 18/05/2026, menée par Sequoia et Abstract, avec Snowflake et Datadog en stratégiques. Plus de 60 M$ levés au total. 20 M$ d'ARR, non rentable, environ 3 000 clients (Alan, Qonto). Fondé en 2022 par deux anciens de Stripe — [mind.eu.com](https://www.mind.eu.com/retail/en/article/dust-raises-us40-million-to-conquer-the-usa/) ; [axios.com](https://axios.com/pro/enterprise-software-deals/2026/05/18/agentic-ai-dust-snowflake-sequoia). Totaux divergents : 56,5 M$ selon Seedtable, 49 M€ selon funding.tech.eu — [seedtable.com](https://www.seedtable.com/companies/dust/changelog)
- **Mistral AI** : Série C de 1,7 Md€ à 11,7 Md€ de valorisation (09/09/2025) — [tech-insider.org](https://tech-insider.org/fr/mistral-ai-11-7-milliards-souverainete-2026/). TechCrunch rapporte une nouvelle levée de 3 Md€ le 08/09/2026 — [techcrunch.com](https://techcrunch.com/2026/09/08/mistral-raises-e3b-as-sovereign-ai-becomes-big-business/). **Les sources se contredisent sur la valorisation actuelle**, à vérifier.
- **Dropbox Dash** : aucune métrique Dash publiée au T2 2026. Au T1 2026, plus de 30 % des utilisateurs hebdomadaires réutilisent les fonctions IA la semaine suivante, et la direction juge l'adoption et la monétisation « encore précoces ». ARR total de Dropbox : 2,566 Md$ (+1 % sur un an) — [sec.gov 8-K T2 2026](https://www.sec.gov/Archives/edgar/data/0001467623/000146762326000045/q22026er-exhibit991q2xq4.htm) ; [nasdaq.com](https://www.nasdaq.com/articles/dropbox-q1-earnings-call-highlights)
- **Onyx** : seed de 10 M$ (03/2025), « des dizaines » de clients enterprise, environ 18 personnes au rachat — [onyx.app/blog/seed-round](https://onyx.app/blog/seed-round) ; [shashi.co](https://www.shashi.co/2026/09/zoom-takes-onyx-and-says-search-index.html)
- **Zive** : plus de 100 k€ d'ARR trois mois après le lancement (2024), racheté pour environ 7,1 M$ — [startupcity.hamburg](https://startupcity.hamburg/zive-makes-company-knowledge-accessible-through-ai) ; [sec.gov](https://www.sec.gov/Archives/edgar/data/0001829959/000162828026054559/docebo2026q2mda.htm)
- **Swiftask** : 1,55 M€ (août 2026), plus de 100 clients — [lejournaldesentreprises.com](https://www.lejournaldesentreprises.com/article/swiftask-leve-155-million-deuros-pour-accelerer-le-deploiement-de-ses-agents-ia-2147361)
- **Credal** : 4,8 M$ en seed (10/2023), et 1,5 M$ de revenu selon Latka **[non vérifié, contradictoire]** — [cbinsights.com](https://www.cbinsights.com/company/credal-ai) ; [getlatka.com](https://getlatka.com/companies/credal.ai)

### Inferences
- Langdock fait environ 3 800 € d'ARR par organisation (50 M / 13 000), soit environ 13 sièges à 25 € par client. Sa base est donc massivement composée de PME. **Calcul déduit**, à vérifier car l'ARR et les comptes ne sont peut-être pas à la même date. C'est la preuve que des PME européennes paient environ 25 € par siège pour de l'IA, mais pour de l'accès aux modèles, pas pour de la mémoire.
- Dust fait environ 6 700 $ d'ARR par client (20 M / 3 000), avec un panier plus gros et plus « tech » que Langdock (calcul déduit).
- La croissance de Langdock (+10 000 organisations en 9 mois avec environ 65 personnes) suggère un canal self-service et du bouche-à-oreille dans le Mittelstand. C'est le modèle de distribution à étudier.

### Gaps
- Pas de levée Série A ou B de Langdock trouvée : son financement post-seed est inconnu.
- Aucun ARR pour Slite, Tettra, Question Base, Guru ou Notion AI.
- Effectifs LinkedIn non relevés pour la plupart des acteurs.

---

## 4. Comment les européens utilisent-ils la souveraineté et le RGPD, et est-ce que ça marche ?

### Takeaway
La souveraineté est devenue un argument actif, et elle s'est durcie en 2026 autour du Cloud Act : Langdock a rapatrié son siège des États-Unis vers une SE allemande, Swiftask se dit « Cloud Act Proof ». Mais les gagnants (Langdock, Dust) combinent l'UE avec un produit self-service bon marché et multi-modèles (y compris OpenAI et Anthropic). L'UE seule n'a pas sauvé Zive, revendu pour environ 7 M$.

### Cited Findings
- **Langdock** déplace en septembre 2026 son siège juridique des États-Unis (Delaware) vers l'Allemagne, en SE, en citant les risques juridiques du Cloud Act et du Patriot Act — [borncity.com](https://borncity.com/news/langdock-verlegt-sitz-nach-deutschland-ki-plattform-wechselt-zu-se/) ; [rosepartner.de](https://www.rosepartner.de/blog/reverse-flip-des-ki-startups-langdock.html) ; [tagesspiegel.de](https://background.tagesspiegel.de/digitalisierung-und-ki/briefing/langdock-verlegt-sitz-zurueck-nach-deutschland). Premier centre de données en propre annoncé (10 à 15 M€) **[non vérifié]** — [borncity.com](https://borncity.com/news/langdock-verlegt-sitz-nach-deutschland-ki-plattform-wechselt-zu-se/)
- Critique : selon un blog, des praticiens jugent le tampon « conforme RGPD » de ce type de plateforme souvent une « solution de façade » (hébergement Azure, modèles américains) **[opinion, source non neutre]** — [xpert.digital](https://xpert.digital/?p=52494)
- **Dust** propose la résidence des données US ou UE dès le plan Business, mais sa Série B est pilotée par des fonds américains pour « conquérir les USA » : l'UE est une option, pas l'identité — [dust.tt/home/pricing](https://dust.tt/home/pricing) ; [mind.eu.com](https://www.mind.eu.com/retail/en/article/dust-raises-us40-million-to-conquer-the-usa/)
- **Mistral** met en avant les modèles à poids ouverts et le contrôle des données, et la souveraineté est son argument central. Le Chat Enterprise se déploie sur site ou en cloud privé — [techcrunch.com](https://techcrunch.com/2026/09/08/mistral-raises-e3b-as-sovereign-ai-becomes-big-business/) ; [mistral.ai](https://mistral.ai/fr/news/le-chat-enterprise)
- **Zive** vendait la conformité RGPD et AI Act, l'hébergement UE et l'absence d'accès tiers, puis a été revendu pour environ 7 M$ — [theaiinsider.tech](https://theaiinsider.tech/2024/09/05/hamburg-startup-zive-announces-e2-8m-for-its-enterprise-ai-platform/) ; [sec.gov](https://www.sec.gov/Archives/edgar/data/0001829959/000162828026054559/docebo2026q2mda.htm)
- **Swiftask** : hébergement en France, « Cloud Act Proof », French Tech Scale-Up Excellence (juin 2026) — [jaimelesstartups.fr](https://www.jaimelesstartups.fr/news/swiftask-levee-de-fonds/)
- **LightOn Paradigm** : on-prem ou cloud privé, RGPD, SOC 2 Type 1 **[agrégateur]** — [europeanpurpose.com](https://europeanpurpose.com/tool/lighton)
- Les acteurs américains vendus aux PME n'affichent pas d'hébergement UE sur leurs pages de prix (Question Base, Slite ne le mentionne pas sur le billet consulté) — [questionbase.com/pricing](https://www.questionbase.com/pricing) ; [slite.com](https://slite.com/fr/blog/slite-announcing-self-maintaining-knowledge-base)

### Inferences
- La souveraineté **fonctionne comme filtre d'achat** dans le Mittelstand allemand (succès de Langdock, présenté partout comme « DSGVO-konform »), mais **pas comme moteur de valeur seul** (Zive). Ça confirme la conclusion de l'étude v1 : l'UE est nécessaire, pas différenciante.
- L'argument monte en gamme en 2026 : on est passé de « données hébergées en UE » à « société de droit UE, hors Cloud Act ». Un Leon français, hébergé chez Supabase à Francfort (AWS), serait exposé à la même critique que Langdock sur Azure. À anticiper dans le discours (sous-traitants, chiffrement, DPA).
- Le multi-modèles, y compris américain, n'a pas freiné Langdock : le client PME veut GPT et Claude, avec un contrat et une facturation européens. Leon, qui se branche sur le LLM du client par MCP, est cohérent avec ce schéma.

### Gaps
- Aucun sondage ni chiffre mesurant l'effet du RGPD sur la conversion des PME françaises.
- Pas de source française (Les Echos, Maddyness) consultée sur Dust ou sur la souveraineté côté PME, faute de temps.
