# Startups « mémoire IA » et « mémoire organisationnelle » : santé au 21 octobre 2026

Notes de recherche (agent Claude, 21/10/2026). Complètent l'étude v1 `docs/etudes/concurrents-2026-10/README.md` (Glean, Qontext, Sentra, memory.store, Conxt) sans la répéter : seuls les faits nouveaux ou les mises à jour sont repris pour ces quatre-là.

Avertissement méthodo : environ 30 recherches web, sources majoritairement presse tech, annonces des sociétés et agrégateurs (Tracxn, PitchBook, blogs comparatifs). Les agrégateurs se contredisent souvent sur les montants et les dates : c'est signalé à chaque fois. Aucun fil HN/Reddit n'a été lu directement (les recherches n'en ont pas remonté), donc le « sentiment » repose surtout sur des articles de blog. Tout chiffre antérieur à 2025 est marqué [ancien].

## 1. Quelqu'un capte-t-il déjà les conversations LLM des employés comme connaissance d'entreprise ?

### Takeaway
Non, pas au sens de Leon (capture passive des chats ChatGPT/Claude de tous les employés, versée dans une mémoire d'entreprise partagée avec droits). Trois familles s'en approchent sans le faire : (a) les outils « mémoire perso » par extension (OpenMemory de Mem0, désormais archivé ; Supermemory ; Conxt), mono-utilisateur ; (b) les fournisseurs de LLM (OpenAI, Anthropic) dont la mémoire reste personnelle ou limitée à un projet partagé ; (c) les outils de sécurité/gouvernance IA (Harmonic, Prompt Security racheté par SentinelOne) qui enregistrent bien toutes les interactions IA des employés, mais pour la DLP, pas pour la connaissance. Les nouveaux entrants « équipe » (memory.store, Sentra) lisent les sessions d'agents, pas les chats grand public des employés.

### Cited Findings
**Fournisseurs de LLM**
- OpenAI, ChatGPT Business : mémoire améliorée en juin 2026, elle s'appuie sur les chats passés de l'utilisateur, qui peut la relire, la corriger ou la couper ; la « project-only memory » reste confinée à un projet ; sans surcoût — [OpenAI, notes de version ChatGPT Business](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes)
- Contradiction : la page tarifs d'OpenAI affiche encore « Memory with past chats » en « Coming soon » pour Business — [OpenAI Business Pricing](https://openai.com/business/pricing/)
- ChatGPT « company knowledge » (Business, Enterprise, Edu) : recherche dans les applis connectées avec citations, activée par défaut sur Business, applis choisies par l'admin — c'est de la lecture des outils de travail, pas une capture des chats — [OpenAI, notes de version](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes) ; [usecarly.com (secondaire)](https://www.usecarly.com/blog/chatgpt-company-knowledge/)
- Être membre d'un workspace ne partage pas automatiquement les chats personnels ; le partage passe par des projets partagés, des liens ou des « Spaces » — [OpenAI, notes de version](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes) ; [colombani.ai (secondaire)](https://colombani.ai/en/blog/chatgpt-business-for-companies/)
- Les chats de groupe ChatGPT sont en cours de retrait depuis le 9 juillet 2026 — [eesel.ai (secondaire)](https://www.eesel.ai/blog/chatgpt-group-chat)
- Anthropic : mémoire lancée le 11 septembre 2025 pour Team et Enterprise, rappel automatique des préférences et projets, une mémoire séparée par projet, résumé de mémoire modifiable, désactivation par l'admin Enterprise, export par projet — [SiliconANGLE, 11/09/2025](https://siliconangle.com/2025/09/11/anthropic-lets-claude-remember-previous-interactions-streamline-work/) ; [VentureBeat](https://venturebeat.com/ai/anthropic-adds-memory-to-claude-team-and-enterprise-incognito-for-all)
- 25 août 2026 : Claude (chat) et Cowork partagent désormais une mémoire ; Anthropic a dit à The Register que la mémoire de Claude Code reste séparée — [The Register, 25/08/2026](https://www.theregister.com/ai-and-ml/2026/08/25/claude-and-cowork-now-share-what-they-know-about-you/5292412)
- Claude Code « Projects » relancé le 17 septembre 2026 avec un espace mémoire partagé entre agents, en bêta Pro/Max — source secondaire, non vérifié sur une page Anthropic — [globai.org](https://www.globai.org/blog/claude-code-projects-returns-with-cloud-based-agent-teams)
- Demande ouverte côté communauté : un ticket GitHub de mars 2026 réclame une « shared team memory » pour Claude Code, via un serveur MCP passif qui capterait le contexte de l'équipe — [anthropics/claude-code #38536](https://github.com/anthropics/claude-code/issues/38536)

**Capture par extension (mono-utilisateur)**
- Mem0 a archivé le dépôt de son extension Chrome OpenMemory (mémoire pour ChatGPT, Claude, Perplexity, Grok) en mars 2026 : « no longer actively maintained » ; le dépôt `mem0-mcp` est aussi archivé — [GitHub mem0ai/mem0-chrome-extension](https://github.com/mem0ai/mem0-chrome-extension) ; [memoryplugin.com (concurrent, à prendre avec prudence)](https://www.memoryplugin.com/alternatives/openmemory)
- Supermemory : l'extension Chrome guide l'import depuis ChatGPT, Claude, Grok et Gemini (24/06/2026) et suggère des souvenirs pendant la saisie dans Claude et Gemini (juillet 2026) — [changelog Supermemory](https://supermemory.ai/changelog/browser-extension-support-for-claude-and-gemini.md)
- Supermemory dit capter « en temps réel » les interactions avec ChatGPT, Claude, Cursor et tout client MCP (via son serveur MCP, donc appel d'outil) ; aucune fonction équipe décrite (billet du 25/07/2025) — [blog Supermemory](https://supermemory.ai/blog/unified-memory-that-works-where-you-work-your-second-brain-with-supermemory/)
- Conxt : 13 utilisateurs en août 2026 (déjà dans l'étude v1) — [chrome-stats](https://chrome-stats.com/d/dlkioeiedbkgdkmindkbkbcajgapknpn)

**Mémoire d'équipe qui lit les sessions d'agents**
- memory.store (YC Spring 2026, fondateurs Diwank et Ishita, ex-Julep AI) : sources Slack, Gmail, Granola et sessions Claude (certaines fiches citent aussi Fathom, Codex, Linear), accès par MCP, « Briefs » auto-mis à jour — [YC Launch](https://www.ycombinator.com/launches/QPs-memory-store-your-company-s-brain) ; [fiche YC](https://ycombinator.com/companies/memory-store)
- Sentra capte « meetings, messages, emails & agent traces » et les compile en contexte « permissioned » pour équipes et agents — [sentra.app](https://www.sentra.app/)

**Gouvernance/sécurité IA (enregistrent tout, mais pour la DLP)**
- Harmonic Security : Series B de 50 M$ menée par Crosspoint Capital (article du 14/10/2026), 76 M$ levés au total ; la plateforme enregistre les interactions IA des employés et les classe par tâche avec de petits modèles maison — [Tech Funding News](https://techfundingnews.com/harmonic-security-raises-50m-series-b-crosspoint-capital-ai-governance/)
- SentinelOne a signé le rachat de Prompt Security (supervision en temps réel de l'usage de l'IA générative), environ 250 M$ selon Calcalist, 250-300 M$ selon Globes ; Prompt avait levé 23 M$ ; clôture attendue fin 2025 — [Globes](https://en.globes.co.il/en/article-1001518079) ; [Calcalist](https://www.calcalistech.com/ctechnews/article/bjt0500luxl) ; [NAND Research](https://nand-research.com/tag/prompt-security/)

### Inferences
- Le créneau « capter les chats LLM des employés » a deux acheteurs différents : le RSSI (Harmonic, Prompt : déjà financé, déjà racheté, des dizaines de M$) et le dirigeant/knowledge (Leon : personne). Les outils de sécurité ont déjà résolu techniquement la capture par extension à l'échelle de l'entreprise ; un pivot de l'un d'eux vers « la connaissance » est la menace la plus crédible sur le pari distinctif de Leon. À l'inverse, c'est un argument de vente : « vous enregistrez déjà ces chats pour la sécurité, autant en tirer la mémoire ».
- L'abandon d'OpenMemory par Mem0 (le mieux financé du secteur) est un signal : l'extension de capture mono-utilisateur ne retient pas d'utilisateurs ou coûte trop à maintenir face aux changements d'interface. Cohérent avec le constat v1 sur Conxt.
- OpenAI et Anthropic gardent la mémoire personnelle ou par projet, et séparent explicitement les produits (Claude Code hors mémoire partagée). Tant que c'est le cas, une mémoire inter-LLM et inter-employés reste un espace ouvert ; mais Claude Code Projects (mémoire partagée entre agents) et ChatGPT « company knowledge » montrent qu'ils avancent dans cette direction.

### Gaps
- Pas de confirmation sur une page Anthropic du lancement « Claude Code Projects » du 17/09/2026.
- Pas vérifié si Harmonic ou ses concurrents (Lasso, Nightfall…) proposent un usage « base de connaissance » des interactions enregistrées.
- Aucun outil de « prompts partagés » (Team-GPT, TypingMind Teams…) n'a été examiné faute de temps.

## 2. Les infra mémoire pour développeurs (Mem0, Zep, Letta, Supermemory, Cognee) montent-elles vers un produit B2B pour utilisateurs finaux ?

### Takeaway
Globalement non : en 2026 ils restent des API/SDK pour développeurs d'agents, et quand ils montent d'un étage c'est vers l'agent de code (Letta Code) ou le développeur individuel (Supermemory), pas vers la mémoire d'entreprise d'une PME. Mem0 a même abandonné son produit grand public (OpenMemory). Supermemory a fait le chemin inverse (grand public → B2B API). Aucun n'a de connecteurs Gmail/HubSpot/Notion pour non-techniciens ni de droits par fait vendus à un dirigeant.

### Cited Findings
**Mem0** (YC, San Francisco ; infra développeur)
- 24 M$ annoncés fin octobre 2025 : seed menée par Kindred Ventures, Series A par Basis Set Ventures, avec Peak XV, GitHub Fund, YC ; 3,9 M$ de seed + 20 M$ de Series A selon une source — [Mem0, page Series A](https://mem0.ai/series-a) ; [PR Newswire](https://www.prnewswire.com/news-releases/mem0-raises-24m-series-a-to-build-memory-layer-for-ai-agents-302597157.html) ; [BW Disrupt](https://www.bwdisrupt.com/article/mem0-raises-24-mn-from-basis-set-ventures-peak-xv-partners-others-577381)
- Totaux divergents : 24,5 M$ (Tracxn), 25,5 M$ (PitchBook), 20,5 M$ (StartupIntros) — [Tracxn](https://tracxn.com/d/companies/mem0/__riHY8ukzEVSGW0BHscRB7JqJ2wBYQIFtoxTu17NSD5o) ; [PitchBook](https://pitchbook.com/profiles/company/601565-32) ; [StartupIntros](https://startupintros.com/orgs/mem0)
- Traction déclarée (oct. 2025) : 14 M de téléchargements, 41 000 étoiles GitHub, appels API de 35 M (T1 2025) à 186 M (T3 2025). Usage, pas revenu ; aucun ARR public — [Pulse 2.0](https://pulse2.com/mem0-24-million-raised-for-powering-memory-layer-for-ai-agents/)
- Mem0 se dit « fournisseur mémoire exclusif » du SDK d'agents d'AWS ; Asia Business Outlook conteste (Mem0 n'est qu'une intégration parmi d'autres dans Strands) — [Mem0](https://mem0.ai/series-a) ; [Asia Business Outlook](https://www.asiabusinessoutlook.com/news/mem0-raises-24m-to-power-ai-memory-infrastructure-nwid-10314.html)
- Aucun tour 2026, aucune acquisition trouvés (recherche du 21/10/2026).
- Critiques : un article Towards AI montre qu'un agent Letta avec un simple fichier texte + grep bat le score LoCoMo publié de Mem0 (74,0 % contre 68,5 %) ; un comparatif tiers cite Mem0 à 49,0 % sur LongMemEval contre 63,8 % pour Zep ; un site d'évaluation juge Mem0 « thin wrapper » reproductible en un week-end (opinion isolée) — [Towards AI](https://pub.towardsai.net/mem0-vs-zep-vs-letta-a-folder-of-text-files-shouldnt-beat-the-61k-star-memory-layer-9d7e65c5799c) ; [Stork](https://www.stork.ai/ko/mem0-memory-layer) ; [vectorize.io](https://vectorize.io/articles/mempalace-review)
- Le titre Towards AI parle d'un « 61k-star memory layer » pour Mem0 : nombre d'étoiles 2026 non vérifié directement.

**Zep** (YC W24 ; infra développeur, graphe temporel Graphiti)
- Seul financement connu : seed d'environ 500 k$ (avril 2024) [ancien] ; toujours « seed-stage » — [StartupIntros](https://startupintros.com/orgs/zep-ai) ; [Tracxn](https://tracxn.com/d/companies/zep/__poSadJnSfLWHjz05Xi3U5KwnpCMWSU3aDrihLX_8FLs)
- 240+ clients dont des Fortune 500 (auto-déclaré, août 2026, via agrégateur ; non vérifié sur source primaire) — [ai.engineer](https://ai.engineer/orgs/zep)
- Graphiti : 31 265 étoiles GitHub au 28/09/2026, version v0.30.2 — [mnemoverse (sept. 2026)](https://mnemoverse.com/docs/library/ai-memory-solutions-2026-q3)
- Zep a arrêté la Community Edition open source en 2025 pour concentrer l'open source sur Graphiti — [vectorize.io](https://vectorize.io/articles/mem0-vs-zep)
- Prix : plan Flex à 125 $/mois pour 50 000 crédits (sept. 2026, source tierce) — [mnemoverse](https://mnemoverse.com/docs/library/ai-memory-solutions-2026-q3)

**Letta** (ex-MemGPT, UC Berkeley)
- Seed de 10 M$ menée par Felicis, sept. 2024, valorisation post-money ~70 M$ (non confirmée) [ancien] ; aucun tour 2025-2026 trouvé — [TechCrunch, 23/09/2024](https://techcrunch.com/2024/09/23/letta-one-of-uc-berkeleys-most-anticipated-ai-startups-has-just-come-out-of-stealth) ; [BigDATAwire](https://www.hpcwire.com/bigdatawire/this-just-in/letta-emerges-from-stealth-with-10m-to-build-ai-agents-with-advanced-memory/)
- Montée vers le produit final, mais côté code : Letta Code (agent de code « memory-first », déc. 2025), appli desktop (06/04/2026), « Mods » (24/06/2026), workflows dynamiques (sept. 2026) — [blog Letta](https://www.letta.com/blog/) ; [Letta Code App](https://www.letta.com/blog/introducing-the-letta-code-app/) ; [Mods](https://www.letta.com/blog/introducing-mods/)
- Prix : Personal Pro 20 $/mois, Teams Pro 20 $/siège/mois (relevé tiers du 15/09/2026) — [ai.dosa.dev](https://ai.dosa.dev/tools/letta-code)
- Aucun chiffre de revenu ou de clients trouvé.

**Supermemory** (fondateur Dhravya Shah, 19-20 ans)
- Tour d'environ 3 M$ (seed ou pré-seed selon les sources, 2,6 M$ selon une autre), lead Susa Ventures, avec des cadres de Cloudflare et Google ; date contradictoire (oct. 2025 à juin 2026 selon les agrégateurs) — [The SaaS News](https://www.thesaasnews.com/news/supermemory-raises-3m-pre-seed/) ; [Tracxn](https://tracxn.com/d/companies/supermemory/__pLAZAfS7jagHq_m-58u50kYrRLK-6lY70wYdV2t6F4Y) ; [adng.cam](https://adng.cam/young-founders-supermemory-raises-2-6m-from-cloudflare-and-google-execs/)
- Clients cités : Cluely, Scira, Rets — [startupwire](https://www.startupwire.in/post/supermemory-raises-3m-ai-memory-dhravya-shah)
- Le fondateur écrit que l'appli grand public avait une mauvaise rétention, d'où le pivot B2B « pendant un an » ; relance d'une appli perso en juillet 2025 à 9 $/mois (100 premiers) — [blog Supermemory, 25/07/2025](https://supermemory.ai/blog/unified-memory-that-works-where-you-work-your-second-brain-with-supermemory/)
- Aucun chiffre d'utilisateurs ou de revenu trouvé.

**Cognee** (Berlin, open source, graphe de connaissances)
- Seed de 7,5 M$ le 19/02/2026, menée par Pebblebed (Pamela Vagata, co-fondatrice d'OpenAI ; Keith Adams, fondateur de FAIR), avec 42CAP et Vermilion — [blog Cognee](https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed) ; contredit par [Hyperight](https://hyperight.com/cognee-seed-funding-ai-memory-technology/) (7,5 M€, leads Redalpine et 7percent)
- 12 000+ étoiles GitHub à la levée, 17 000+ en juin 2026 (profil tiers) — [blog Cognee](https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed) ; [rywalker.com](https://rywalker.com/research/cognee)
- Usage prévu des fonds : cloud, moteur Rust embarqué/edge, recherche — c'est de l'infra, pas un produit utilisateur — [Pulse 2.0](https://pulse2.com/cognee-7-5-million-seed-funding-raised-for-building-enterprise-grade-memory-layer-for-ai-agents/)

**Autres outils mémoire développeur**
- Byterover (ex-Cipher) : couche mémoire locale à base de fichiers pour agents de code, TypeScript + Rust, licence MIT, « Central Memory Layer for Dev Teams » lancé le 31/08/2025, partagée entre 22+ agents de code ; papier arXiv avril 2026 (96,1 % LoCoMo, auto-déclaré) ; aucun financement trouvé — [arXiv 2604.01599](https://arxiv.org/pdf/2604.01599) ; [Product Hunt](https://www.producthunt.com/products/byterover/launches/byterover-2)
- Basic Memory (Basic Machines) : mémoire en Markdown local pour Claude/ChatGPT/Cursor via MCP, ~3 400 étoiles, AGPL-3.0, v0.22.1 du 13/06/2026, offre cloud payante (~15 $/siège selon un tiers) ; aucun financement trouvé — [dev.co](https://dev.co/ai/mcp/basic-memory) ; [hjarni.com](https://hjarni.com/blog/best-mcp-memory-server)
- Pieces for Developers : Flat Capital (Stockholm) entré au capital en août 2025, montant non publié ; positionnement « Long-Term Memory » ; rien trouvé sur 2026 — [blog Pieces](https://pieces.app/blog/flat-capital) ; [pieces.app/about](https://pieces.app/about)
- MemPalace : lancement viral (7 000+ étoiles en 48 h, 36 000 en 5 jours, avril 2026) puis benchmarks démontés par les développeurs — [vectorize.io](https://vectorize.io/articles/mempalace-review) ; [agentmarketcap.ai](https://agentmarketcap.ai/blog/2026/04/23/mempalace-memory-agent-viral-launch-benchmark-controversy)

**Verdicts (infra)**
- Mem0 : **stable**, voire florissant en usage (le mieux financé, forte adoption open source), mais aucun revenu public, aucun tour depuis 12 mois, produit grand public abandonné, benchmarks contestés.
- Zep : **stable** (240+ clients revendiqués, Graphiti très suivi) avec un financement minuscule ; dépendance au cloud payant.
- Letta : **stable** ; s'éloigne de la mémoire pure vers l'agent de code, où la concurrence (Claude Code, Codex, Cursor) est écrasante ; pas de tour depuis deux ans.
- Supermemory : **stable/incertain** ; petit tour, clients startups, pas de métriques.
- Cognee : **florissant** pour son stade (seed 2026, communauté en croissance), infra pure.
- Byterover, Basic Memory, Pieces : **niche**, pas de signal de traction commerciale trouvé.

### Inferences
- La menace « infra qui descend vers Leon » est faible à 12 mois : leurs clients sont des développeurs d'agents, ils n'ont ni connecteurs métier ni vente aux PME. Ils sont plutôt des briques possibles (ou des concurrents de la brique interne de Leon) que des concurrents frontaux.
- Les benchmarks publics (LoCoMo, LongMemEval) sont contestés au point qu'un fichier texte + grep fait jeu égal : la « mémoire » comme techno n'est pas une barrière. Cela conforte la thèse que la valeur est dans la capture, les connecteurs et les droits, pas dans l'algorithme.
- La montée d'étage observée va vers le développeur (Letta Code, Byterover, Basic Memory, memory.store) : le segment « équipes tech qui vivent dans Claude Code » est le plus encombré. Leon a intérêt à ne pas s'y enfermer.

### Gaps
- Aucun ARR pour Mem0, Zep, Letta, Supermemory ou Cognee.
- Effectifs non trouvés pour ces sociétés.
- Étoiles GitHub de Mem0 et Letta en octobre 2026 non vérifiées sur GitHub directement.

## 3. Quel financement et quelle traction dans la catégorie en 2025-2026 ? Hype ou vrai revenu ?

### Takeaway
Le vrai revenu est chez ceux qui partent de la réunion (Granola 1,5 Md$ de valorisation, Otter >100 M$ d'ARR, Fireflies rentable et valorisé 1 Md$) et chez la gouvernance IA (Harmonic, Prompt Security). Les « mémoires d'entreprise » pures ont levé de petits tours en 2026 (Sentra 5 M$, Qontext 2,7 M$, memory.store ~500 k$, Cognee 7,5 M$) sans revenu public. Les infra mémoire affichent des métriques d'usage (étoiles, appels API), pas de revenu. Les acteurs de la réunion se repositionnent explicitement en « couche de contexte » d'entreprise, ce qui en fait les concurrents les plus solides de Leon à moyen terme.

### Cited Findings
**Granola** (Londres ; notes de réunion → couche de contexte d'équipe)
- Series C de 125 M$ le 25/03/2026 à 1,5 Md$ de valorisation (×6 en moins d'un an, 250 M$ à la Series B), menée par Index Ventures, avec Kleiner Perkins, Lightspeed, Spark, NFDG ; 192 M$ levés au total — [The Next Web](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context) ; [The SaaS News](https://www.thesaasnews.com/news/granola-raises-125m-series-c-at-1-5b-valuation/)
- Lancement de « Spaces » (espaces d'équipe pour partager et chercher des notes contextuelles entre réunions et canaux), d'une API personnelle, d'une API enterprise (SSO, SCIM, consentement) et d'un serveur MCP ; positionnement « context layer rather than a standalone app » — [The Next Web](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context)
- Clients cités : Vanta, Gusto, Thumbtack, Asana, Cursor, Lovable, Decagon, Mistral AI ; ARR non publié — [The Next Web](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context)
- Enterprise à 35 $/utilisateur/mois (opt-out entraînement IA au niveau organisation réservé à ce plan) — [The SaaS News](https://www.thesaasnews.com/news/granola-raises-125m-series-c-at-1-5b-valuation/)
- Verdict : **florissant**.

**Otter.ai**
- 320 M$ de financement non dilutif (Customer Value Fund de General Catalyst), annoncé le 20/10/2026, pour vendre aux grands comptes un « voice system of record » — [The Tech Portal, 20/10/2026](https://thetechportal.com/2026/10/20/otter-ai-320-million-general-catalyst-customer-value-fund/) ; [The AI Insider](https://theaiinsider.tech/2026/10/20/otter-ai-raises-320m-from-general-catalysts-customer-value-fund-to-expand-enterprise-ai/) ; [TFN](https://techfundingnews.com/otter-ai-secures-320m-from-general-catalyst-to-become-enterprises-voice-system-of-record/)
- ARR passé 100 M$ (date contradictoire : mars 2025 ou fin 2025 selon les sources) ; dernière levée en capital : Series B de 50 M$ en 2021 [ancien] — [FourWeekMBA](https://fourweekmba.com/ai-otter-ai-gets-320m-6x-its-past-funding-without-new-equity/) ; [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/otter-ai-raises-320-million-110000934.html)
- Verdict : **florissant** (revenu réel ; le financement adossé au revenu suppose des flux récurrents prévisibles).

**Fireflies.ai**
- Valorisation de 1 Md$ via une offre secondaire en juin 2025 ; rentable depuis 2023, pas de levée primaire depuis 2021 — [virtualassistantva.com (secondaire)](https://virtualassistantva.com/news/ai-transcription-fireflies-1-billion-valuation-otter-business-adoption-2026)
- Pro à 10 $/utilisateur/mois (annuel) selon un comparatif rédigé par Read.ai — [read.ai](https://www.read.ai/articles/fireflies-vs-read-ai)
- Verdict : **florissant**.

**Read.ai**
- 81 M$ levés au total selon Tracxn, Series B en 2021 [ancien pour le tour] ; aucune levée 2026 trouvée — [Tracxn (via recherche)](https://tracxn.com/d/companies/fireflies/__Or2uIsFu9ZUcCFmE2xXJMNv7F6yan5k-nxkVOfE1cMQ)
- Se vend comme recherche unifiée au-delà des réunions, 15 à 22,50 $/utilisateur/mois (source : Read.ai lui-même) — [read.ai](https://www.read.ai/articles/fireflies-vs-read-ai)
- Verdict : **stable** (pas de signal récent fort).

**Mémoire organisationnelle « pure »** (mises à jour par rapport à l'étude v1)
- Sentra (Dynamis Labs Inc., SF/Toronto) : seed de 5 M$ le 28/01/2026 co-menée par a16z speedrun et Together Fund (avec Parable, Precursor, Inovia…) ; CEO Jae Gwan Park, CTO Andrey Starenky, co-fondateur Ashwin Gopinath (ex-MIT, Reflexion) ; PoC payant avec SoftBank ; étude de cas Lenskart auto-déclarée (−58 % de dépendances bloquées sur 10 départements en 4 semaines, 19 Md de tokens compilés), non vérifiée — [SiliconANGLE, 28/01/2026](https://siliconangle.com/2026/01/28/sentra-app-raises-5m-build-ai-teammate-organize-enterprise-memory/) ; [Forbes, 02/02/2026](https://www.forbes.com/sites/charliefink/2026/02/02/sentra-raises-5-million-to-build-enterprise-general-intelligence/) ; [sentra.app](https://www.sentra.app/) ; [AI CERTs](https://www.aicerts.ai/news/sentra-bets-on-organizational-general-intelligence/). Sentra publie des articles comparatifs ciblant ChatGPT company knowledge et la mémoire Claude pour équipes (SEO offensif) — [sentra.app/articles](https://www.sentra.app/articles/claude-memory-for-teams). Verdict : **stable/prometteur**, financé, pas de revenu PME prouvé.
- Qontext (Berlin) : pré-seed de 2,7 M$ annoncé le 05/02/2026, lead HV Capital avec Zero Prime ; angels fondateurs de n8n, neo4j, Celonis, Cognigy, make.com ; fondateurs Lorenz Hieber et Nikita Kowalski ; intégration Slack pour interroger le dépôt de contexte ou y enregistrer une décision depuis un fil — [Tech.eu, 05/02/2026](https://tech.eu/2026/02/05/qontext-closes-27m-pre-seed-round-to-develop-a-context-layer-for-ai/) ; [blog Qontext](https://qontext.ai/blog/pre-seed) ; [Qontext Engineering](https://qontext.ai/solutions/engineering). Verdict : **stable** (très jeune).
- memory.store : YC Spring 2026, ~500 k$ en janvier 2026 (agrégateur, non confirmé) — [fiche YC](https://ycombinator.com/companies/memory-store) ; [altss.com](https://altss.com/companies/yc/memory-store). Verdict : **trop tôt pour juger**.

**Gouvernance IA** : Harmonic 50 M$ (oct. 2026), Prompt Security racheté ~250-300 M$ (voir section 1).

**Signaux de hype**
- MemPalace : 36 000 étoiles en 5 jours puis benchmarks démontés (avril 2026) — [agentmarketcap.ai](https://agentmarketcap.ai/blog/2026/04/23/mempalace-memory-agent-viral-launch-benchmark-controversy)
- Un blog VC prédit qu'un des acteurs infra (Mem0, Letta, Zep) sera racheté par un hyperscaler ou un labo sous 12-18 mois : spéculation — [valueaddvc.com](https://valueaddvc.com/blog/the-ai-memory-problem-how-startups-are-solving-for-persistent-context)

### Inferences
- L'argent suit le point de capture que les gens adoptent seuls (la réunion) puis remonte vers « la mémoire d'équipe ». Granola fait exactement le chemin que Leon propose, mais à partir des réunions plutôt que des chats LLM, avec 192 M$ et une distribution bottom-up déjà acquise. C'est le concurrent à surveiller en priorité, plus que Mem0 ou Zep.
- Granola Enterprise à 35 $/utilisateur/mois place un plafond de prix crédible : Leon à 20-35 €/siège est dans la même bande, mais doit montrer plus que des notes de réunion.
- Entre infra (usage sans revenu) et mémoire organisationnelle (petits tours, revenu non prouvé), la catégorie « mémoire d'entreprise pour PME » n'a encore aucun gagnant financé : à la fois une ouverture et un signal que les VC n'y croient pas encore massivement.

### Gaps
- ARR de Granola, Fireflies et Read.ai en 2026 non publiés.
- Pas de données G2/Reddit chiffrées sur Granola Spaces ou sur les fonctions « knowledge » de Fireflies/Otter.

## 4. Qu'est-ce qui a échoué (Rewind/Limitless, Mem.ai, autres) et pourquoi ?

### Takeaway
Rewind/Limitless n'a pas trouvé de marché seul : après le pivot du logiciel Mac (Rewind) au pendentif (Limitless), la société a été rachetée par Meta en décembre 2025, a arrêté les ventes et éteint Rewind (dont l'UE). Mem.ai n'est pas mort mais a rétréci en appli de notes perso et s'est relancé en 2.0 (oct. 2025) sans nouvelle levée connue depuis 2022. Le motif commun : la mémoire personnelle à saisie manuelle ou à captation totale ne retient pas (Supermemory le dit aussi de sa propre appli grand public), et l'extension de capture OpenMemory a été abandonnée.

### Cited Findings
**Limitless (ex-Rewind)**
- Meta a racheté Limitless, annonce du 05/12/2025, conditions non divulguées ; le CEO Dan Siroker rejoint Meta pour la « personal superintelligence » — [TechCrunch via scour.ing](https://scour.ing/@emschwartz/p/https://techcrunch.com/2025/12/05/meta-acquires-ai-device-startup-limitless) ; [BetaNews, 08/12/2025](https://betanews.com/2025/12/08/meta-has-acquired-limitless-a-startup-that-produces-ai-powered-wearables/) ; [AI Business](https://aibusiness.com/speech-recognition/meta-acquires-limitless)
- Fin des ventes de pendentifs aux nouveaux clients, support des existants au moins un an, plan Unlimited offert, fonctions hors pendentif comme Rewind arrêtées, nouvelles conditions de confidentialité à accepter — [BetaNews](https://betanews.com/2025/12/08/meta-has-acquired-limitless-a-startup-that-produces-ai-powered-wearables/)
- Arrêt de l'appli Mac Rewind le 19/12/2025 et fin du service dans l'UE et au Royaume-Uni : source concurrente (Hedy), non corroborée — [hedy.ai](https://www.hedy.ai/post/meta-acquires-limitless-ai-privacy/)
- Verdict : **mort comme entreprise indépendante** (acqui-hire matériel).

**Mem.ai**
- Seed de 5,6 M$ (a16z, avril 2021) et Series A de 23,5 M$ (OpenAI Startup Fund, novembre 2022, 110 M$ post-money) [ancien] ; total 29 M$ ou 34,7 M$ selon les sources — [aiwiki.ai](https://aiwiki.ai/wiki/mem_ai) ; [choppingblock.ai](https://www.choppingblock.ai/companies/mem)
- Mem 2.0 lancé sur Product Hunt le 02/10/2025 : « thought partner » perso, Mac/Windows/Web/iOS, refonte complète avec capture vocale, e-mail et web — [hunted.space](https://hunted.space/dashboard/mem-2-0/launches/mem-2-0-2) ; [yespress.io](https://yespress.io/mem.md)
- En 2026 : gratuit limité à 25 chats et 25 pages PDF/mois, Pro ~12-15 $/mois (revue secondaire) — [SolidAITech, juillet 2026](https://www.solidaitech.com/2026/07/mem-ai-note-taking-app-vs-mem0-api.html)
- Aucune levée après 2022 ni licenciements trouvés.
- Verdict : **en difficulté / zombie** (repli B2C, pas de nouvelle levée en presque 4 ans ; pas de preuve d'arrêt).

**Personal.ai**
- 14,1 M$ levés, dernier tour en décembre 2025 (Village Global, Differential, Jane Street), positionné en plateforme no-code pour « équipes d'IA spécialisées » pour entreprises ; un autre profil donne 9,57 M$ et un seed en sept. 2024 ; sources contradictoires sur siège et stade — [VCBacked](https://www.vcbacked.co/company/personal-ai) ; [Caplight](https://www.caplight.com/company/personal)
- Verdict : **en difficulté / incertain** (petit, glissement du B2C mémoire perso vers du B2B agents, pas de métriques).

**Autres abandons**
- Extension OpenMemory de Mem0 archivée en mars 2026 (section 1).
- Zep a arrêté sa Community Edition en 2025 (section 2).
- Supermemory : appli grand public abandonnée pour rétention faible (section 2).

### Inferences
- Pourquoi ça échoue : (1) la capture totale du perso (Rewind enregistrait l'écran, Limitless l'audio) pose des problèmes de vie privée qui ferment l'UE (sortie du marché UE rapportée) et ne crée pas d'habitude ; (2) la mémoire à saisie manuelle (Mem, Supermemory v1) meurt de friction ; (3) la mémoire personnelle se fait absorber par les LLM eux-mêmes (ChatGPT et Claude ont la mémoire depuis 2025). Leon évite (2) par l'ingestion automatique et (3) en étant inter-LLM et inter-employés, mais reste exposé à (1) : la capture des chats des employés doit être opt-in, visible et conforme RGPD, sinon elle reproduit l'erreur de Rewind sur un terrain encore plus sensible (le droit du travail).
- Le passage B2C → B2B est le pivot quasi universel du secteur (Supermemory, Personal.ai, Granola vers l'équipe, Otter vers l'enterprise) : ça valide le choix B2B de Leon dès le départ.

### Gaps
- Effectif et revenu de Mem.ai en 2026 introuvables.
- Le détail officiel (Limitless) sur la sortie du marché UE n'a pas été lu directement.
- Pas trouvé de données sur d'éventuelles fermetures de petites startups « mémoire d'équipe » en 2026 (échecs silencieux non couverts par la presse).
