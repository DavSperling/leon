# Leon (nom de travail ; alternative : Marcel) · Business plan

**Verdict: Not yet**

- ✓ Each siège-mois earns $20.13 before fixed costs (81% contribution).
- ✗ Year 1 operating LOSS: $43,597.
- ✓ Break-even is 337 siège-moiss a day against a capacity of 800.
- ✗ 19 of 100 simulated buyers buy (19%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $25.00 a siège-mois |
| Profit margin at plan | 26% per siège-mois |
| Break-even | 337 siège-moiss a day |
| Year 1 operating profit | $-43,597 |
| Startup spend | $5,750 |
| Cash needed before it pays for itself | $51,307 |
| Startup money earned back | not in year 1 |
| Buyer panel | 19 buy · 81 pass |

## The idea

> Idée telle que présentée au conseil le 17/10/2026 (v1, « mémoire de l'équipe », toutes sources). Après le conseil et le panel, l'offre a été recentrée le 18/10 sur les équipes de développement : voir `offer.md`, `pitch.md` et `summary.md`. Ce fichier est conservé tel quel pour que le plan garde la trace du point de départ.

- **Ce que c'est :** la mémoire de l'équipe, qui garde tout ce qui s'est dit et décidé dans les outils de l'entreprise (emails, réunions, Notion, Linear, GitHub, HubSpot) et dans les conversations des employés avec les IA (Claude Code, ChatGPT), et répond en citant la source exacte, via le LLM que l'équipe utilise déjà (connexion MCP) ou une petite interface de recherche.
- **Pour qui :** les équipes de 5 à 100 personnes, de tout type (développeurs, commerciaux, support, agences, cabinets), en France puis en Europe, qui mélangent plusieurs outils (Google Workspace ou Microsoft 365, plus Notion, Linear, GitHub, HubSpot, des appels) et dont au moins une partie utilise des assistants IA au quotidien.
- **Ce que ça vend, à quel prix :** un abonnement par siège, prix de départ envisagé 25 € HT par siège et par mois (fourchette à tester : 15 à 28 €). Le produit : (1) le brut de toutes les sources, stocké avec les droits d'accès d'origine et indexé par mots exacts et par sens ; (2) une couche légère d'étiquetage automatique (date, participants, entités, marqueurs « décision », « engagement », « plainte ») qui permet de répondre aux questions « combien », « où en est » et « qu'a-t-on promis » ; (3) les décisions prises dans les conversations IA remontées à l'équipe sans exposer les conversations elles-mêmes ; (4) un serveur MCP pour que Claude, ChatGPT ou Cursor lisent cette mémoire, et un chat web en complément.
- **Où et comment :** SaaS hébergé dans l'Union européenne (Supabase à Francfort), vendu en ligne et en direct par les fondateurs, installation par connexion OAuth aux outils plus une extension navigateur et un agent local pour capter les conversations IA. Les clients arrivent par le réseau des fondateurs, LinkedIn, les communautés de développeurs et le bouche-à-oreille.
- **Budget et contraintes :** deux cofondateurs (David, Amos), pas encore de société immatriculée, pas de levée de fonds, autofinancement ; coûts fixes actuels d'environ 500 $/mois ; coût de service estimé 2,5 $ par siège et par mois si la lecture passe par le LLM du client, 4 à 11 $ avec un chat maison ; un premier jet de code existe (TypeScript, Postgres, pipeline, extension, serveur MCP). Déjà décidé : la capture des conversations IA sans dépendre du LLM, les droits d'accès les plus restrictifs sur tout ce qui est dérivé, l'hébergement en UE.

## Summary

**Ce que c'est.** Leon est la mémoire des décisions d'une équipe de développement de 5 à 30 personnes qui travaille dans Claude Code ou Cursor : un agent local garde ce que les développeurs et leurs agents IA décident et pourquoi, y ajoute GitHub, Linear et Notion, et répond depuis l'outil IA que l'équipe utilise déjà, en citant la source exacte ou en disant « je ne sais pas ». 25 € HT par siège et par mois, Solo gratuit pour une personne, 19 € pour les 20 premières équipes.

**Le verdict, calculé par `compile.py` : « Pas encore ».** Deux contrôles passent, deux échouent.
- Chaque siège-mois laisse **20,13 € (81 %)** après ses coûts directs ; le seuil de rentabilité est à **337 sièges**, sous la capacité de 800.
- L'année 1 **perd 43 597 €** (46 750 € de chiffre d'affaires), parce que la rampe part de 0 siège et ne franchit le seuil qu'au mois 11, avec 5 000 €/mois de rémunération des fondateurs dans les coûts fixes. Besoin de trésorerie : **51 307 €**.
- Le panel de 100 acheteurs simulés achète à **19 %**, sous la barre de 25 %. Le re-test de l'offre v2 sur 20 cartes donne 25 %, et surtout 4 acheteurs techniques sur 9 au lieu de 1.

**Ce sur quoi le conseil et le panel sont d'accord.** Le marché n'est pas « les équipes de 5 à 100 personnes », c'est les équipes dev sous Claude Code ou Cursor : le conseil l'a nommé (C1), le panel l'a confirmé (les « power users IA » achètent à 95 %, tous les autres comportements à 0 %). Le bundle à 20 $ (Claude Team, ChatGPT, Notion) est le concurrent réel, pas Glean. Les refus ne sont pas des refus de prix mais de confiance : brancher ses données sur deux fondateurs non immatriculés, sans DPA, avec un agent sur chaque poste. **Là où ils divergent** : le membre Monopole du conseil vote PASS tant qu'aucun avantage ne tient six mois face à Anthropic ; le panel v2 montre que l'offre recentrée convertit des profils prudents, ce que le conseil n'avait pas prévu, mais sur des acheteurs simulés.

**Le plus gros risque.** Que le différenciateur (capter les décisions prises dans les sessions IA) soit vécu comme un mouchard par les développeurs et copié par Anthropic ou OpenAI en une version. Ce qu'on en fait : la relecture par l'auteur (rien ne remonte sans son clic), le cloisonnement par projet (objection n°1 du re-test), une page « ce que l'agent capte et ne capte pas », et le Solo gratuit pour que chaque développeur l'installe lui-même. Et un test de 4 semaines, avant toute dépense, qui peut conclure PASS.

**Ce qu'il faut pour démarrer.** Environ 51 000 € de trésorerie si les fondateurs se paient 2 500 € chacun (environ 12 000 € s'ils ne se paient pas), 5 750 € de dépenses de lancement (immatriculation, marque, avocat pour le DPA et les CGV, site, lancement). Et d'abord le test : du 20 octobre au 14 novembre, un banc d'essai à l'aveugle sur 30 questions, 12 entretiens de CTO hors réseau, deux pages d'atterrissage à 19 € et 29 € avec réservation par carte. **Ligne de succès écrite avant : 5 pilotes réservés avec carte, 3 engagements écrits, et les connecteurs natifs de Claude ou ChatGPT sous 80 % de rappel.** En dessous, retour à l'offre ou au prix, ou PASS.

**Ce qui change le verdict.** Le contrôle « année 1 » tombe si les pilotes de décembre sont payants (la rampe n'a plus deux mois à zéro) ou si les fondateurs reportent leur rémunération ; le contrôle « panel » n'a pas vocation à passer avec des acheteurs simulés, il passe avec 5 pilotes réels. Ne pas bricoler `numbers.json` pour y arriver.

**La chose à faire cette semaine.** Trancher le nom (« Leon » n'est pas tenable en marque publique : Leon AI, 17 000 étoiles GitHub, npm pris ; `brand.md` propose « Acquis ») et lancer les deux pages d'atterrissage, parce que tout le reste du calendrier, l'immatriculation comprise, attend ce nom.

Ces chiffres sont des projections et le panel est composé d'acheteurs simulés ; de vrais clients et de vrais devis les confirment. Ceci n'est pas un conseil financier, juridique ou fiscal.

## What the board said

Trois membres, trois lentilles (Offres, Monopole, Produit), mémos dans `board/`. Les lentilles sont des résumés de cadres publiés ; personne ne parle au nom de leurs auteurs.

### Le vote

**2 FUND IF, 1 PASS. Note moyenne : 3,7 / 10.**

| Lentille | Note | Vote |
|---|---|---|
| Offres | 4 | FUND IF |
| Monopole | 3 | PASS |
| Produit | 4 | FUND IF |

### Les risques soulevés par plus d'un membre

1. **Le bundle à 20 $ (les trois).** Claude Team, ChatGPT Business, Copilot, Gemini, Notion incluent déjà la recherche multi-sources avec citations. Leon demande 25 € *en plus*. Dashworks, sur ce créneau, a fermé. Tant que Leon n'est pas dix fois meilleur sur une question précise, c'est une fonction que l'acheteur possède déjà.
2. **Aucune preuve, aucun client (les trois).** Zéro équipe en usage, zéro personne qui a dit « je paie pour ça », zéro salarié qui a accepté l'agent local. La probabilité perçue est nulle. Le prix de 25 € est une opinion.
3. **Le marché n'est pas choisi (Offres, Monopole).** « 5 à 100 personnes, tout type » est un recensement, pas un marché. Les deux lentilles nomment le même candidat : les équipes de développement de 5 à 30 personnes qui vivent dans Claude Code ou Cursor.
4. **L'effort d'installation (Offres, Produit).** Cinq ou six consentements OAuth, une extension, un agent local sur chaque poste, une configuration MCP, l'information des salariés et le CSE. Les cinq premières minutes n'existent pas ; la mémoire est vide le jour 1. Chiffres manquants : minutes jusqu'à la première réponse utile, part d'employés qui finissent l'installation.
5. **La capture des conversations IA est une hypothèse, pas encore un secret (Monopole, Produit).** Elle est fragile (les interfaces de ChatGPT et Claude changent, précédent Slack), copiable par Anthropic ou OpenAI en une version, et juridiquement sensible (suivi d'activité). Personne ne l'a demandée.
6. **La frontière privé/partagé (Produit, Monopole).** Un classifieur se trompera dans les deux sens ; une fuite suffit à tuer la confiance. Pas de relecture par l'auteur ni de taux d'erreur annoncés.

### Désaccords à conserver

- **Monopole** vote PASS parce qu'aucun avantage ne tient six mois face à un copieur, et qu'aucun petit marché n'est nommé. **Offres** et **Produit** jugent que la douleur et le parti pris « brut d'abord » valent un financement conditionnel.
- **Offres** veut *empiler* l'offre (rétro-chargement, pack CSE, registre des engagements, garantie) et tester à 50 €. **Produit** veut *couper* jusqu'à une seule chose (capture IA → décisions → MCP) et retirer le chat web, HubSpot, Linear, Notion et les comptages. Les deux ne sont pas incompatibles si l'empilement se fait autour de la chose unique, mais la tension est réelle.
- **Produit** considère que lire par MCP déplace l'hallucination dans le LLM du client et laisse l'écran principal à quelqu'un d'autre ; **Monopole** et le dossier y voient le coût de service le plus bas. À arbitrer avec des mesures.

### Les conditions, fusionnées (liste à cocher pour la suite du pack)

- [ ] **C1. Un seul marché initial, nommé et chiffré** : combien d'équipes en France de 5 à 30 personnes utilisent Claude Code ou Cursor au quotidien ? (→ `/founder-competitors`, `/founder-consumer`)
- [ ] **C2. Une seule chose avant toute vente** : capture des conversations IA, remontée des décisions avec leur raison, lecture par MCP. Chat web, HubSpot, Linear, Notion, comptages : plus tard, sur demande de clients payants. (→ `/founder-offer`)
- [ ] **C3. Preuve d'usage** : cinq équipes hors du réseau des fondateurs, huit semaines, avec par équipe : questions par semaine, part de réponses correctes avec citation exacte, taux d'installation de l'agent local, un cas « la réponse n'existait nulle part ailleurs ». (→ `/founder-launch`)
- [ ] **C4. Première réponse citée en moins de dix minutes** sur un poste non technique, sans aide, chrono en main. Rétro-chargement de l'historique pour que la mémoire ne soit pas vide le jour 1. (→ `/founder-ops`, `/founder-launch`)
- [ ] **C5. Dix fois mieux, mesuré** : sur « pourquoi a-t-on choisi X ? » et « comment avait-on réglé cette erreur ? », Leon répond là où Claude Team et Notion Business ne répondent pas, sur un jeu de questions fixé. Mesurer aussi le taux de citations inventées côté LLM client. (→ test à l'aveugle)
- [ ] **C6. Signal visible de capture et relecture par l'auteur** avant toute remontée à l'équipe, tant que le taux d'erreur du classifieur n'est pas mesuré. (→ `/founder-ops`)
- [ ] **C7. Volonté de payer réelle** : lettres d'intention ou prépaiements signés entre 15 et 28 €, et le test « à 50 €, est-on encore le choix évident ? ». (→ `/founder-consumer`, `/founder-pricing`)
- [ ] **C8. Réécrire l'offre autour du résultat** (nom, rétro-chargement, pack conformité CSE, garantie écrite du type « cinq questions d'un nouvel arrivant sans réponse, remboursé »). (→ `/founder-offer`)
- [ ] **C9. Coût d'acquisition et attrition** : montrer le remboursement du CAC sous 12 mois avec 3 à 5 % d'attrition mensuelle. (→ `/founder-cfo`, `/founder-marketing`)
- [ ] **C10. Réponse juridique écrite** sur le régime de la capture (suivi d'activité, CSE) avant le premier client de plus de 50 personnes. (→ `/founder-ops`)

### La version la plus forte que le conseil voit

Ce n'est pas celle qui a été présentée. Le conseil ne voit pas « la mémoire de l'équipe, toutes sources, tout type d'équipe » : c'est le produit que l'acheteur reçoit déjà dans son abonnement à 20 $, et celui sur lequel Dashworks est mort. La version la plus forte est étroite : **pour les équipes de développement de 5 à 30 personnes qui travaillent dans Claude Code ou Cursor, Leon capte ce que les agents et les développeurs ont décidé et pourquoi, le remonte à l'équipe sans exposer les conversations, et le sert dans l'outil IA que l'équipe utilise déjà.** Une question de démo : « pourquoi on a choisi Postgres pour le billing ? », avec la citation de la session où le choix a été fait. Le brut des emails, de Notion et du CRM reste le socle technique et s'ajoute ensuite, connecteur par connecteur, quand des clients payants le demandent. Le membre Monopole précise que même cette version ne le ferait voter FUND qu'avec un marché chiffré, dix équipes payantes hors réseau, et la mesure du « dix fois mieux ».

## The competition

17 octobre 2026 · relevé par un agent Claude (« scout concurrents ») · données brutes dans [`competitors.csv`](competitors.csv)

Règles suivies : sources publiques uniquement, chaque fait avec son lien, prix relus ce jour sur les pages officielles quand elles étaient accessibles. Quand une page officielle était bloquée (403), tronquée ou en délai d'attente, c'est dit et une source tierce est citée à la place. Les citations d'avis sont verbatim, en anglais. Complète l'[étude du 12/10](../concurrents-2026-10/README.md) (Glean, Qontext, Sentra, memory.store), dont les fiches ne sont pas refaites ici.

Pages inaccessibles ce jour : G2 et Capterra (403 sur toutes les fiches ; notes et nombres d'avis relevés dans les extraits de recherche, en le signalant), openai.com et help.openai.com (403), microsoft.com/copilot/business (délai dépassé), cloud.google.com/gemini-enterprise (contenu tronqué), old.reddit.com (bloqué), Gartner Peer Insights et TrustRadius (403), le post X d'Anthropic (402), emarketer et CNBC (403).

### 1. Le tableau, du plus direct au moins direct

Prix : l'article le plus proche de Leon (un siège par mois, facturation annuelle quand elle existe). Notes : G2 sauf mention.

| # | Nom | Type | Lieu / canal | Prix comparable (siège/mois) | Ce que ça vend | Accroche (verbatim) | Note / avis |
|---|---|---|---|---|---|---|---|
| 1 | [Sentra](https://www.sentra.app/pricing) | direct | San Francisco ; libre-service 2-20 | 16 $ (gratuit au lancement) : Slack, Gmail, Calendar, Outlook, GitHub, Linear, notes de réunion | Mémoire organisationnelle : faits horodatés, servis aux humains et aux agents | « Your company may forget. But Sentra doesn't. » | aucun avis public |
| 2 | [Dust](https://dust.tt/pricing) | direct | Paris ; libre-service + direct | Pro 24 € (annuel, 30 € mensuel), **3 connecteurs max**, 8 000 crédits ; Enterprise sur devis | Agents IA sur données internes, 70+ connecteurs, [3 000+ organisations](https://dust.tt/) | « Multiplayer AI for human-agent collaboration » | 4,9 / 20 ([G2](https://www.g2.com/products/dust-dust/reviews), page bloquée) |
| 3 | [Notion Business](https://www.notion.com/pricing) | direct | San Francisco ; libre-service | 20 $ (mensuel ; jusqu'à -20 % annuel) : Notion AI, Enterprise Search (bêta), AI Meeting Notes | Docs + wiki + projets + recherche sur outils connectés | « One tool to run your company. » | 4,6 / 13 876 ([G2](https://www.g2.com/products/notion/reviews)) |
| 4 | [Guru](https://www.getguru.com/pricing) | direct | Philadelphie ; vente directe | non public (« tailored to your organization's scale ») | Base de connaissances vérifiée + recherche IA, 100+ intégrations, MCP | « Stop running your business on confidently wrong AI. » | 4,7 / 2 323 ([G2](https://www.g2.com/products/guru/reviews)) |
| 5 | [Dropbox Dash](https://dash.dropbox.com/plans) | direct | San Francisco ; libre-service, < 100 utilisateurs | Teams 15 $ (annuel, 19 $ mensuel) ; Business 35 $ au-delà de 100 | Recherche IA sur apps connectées, résumés | « Find what matters fast across all connected apps » (page tarifs) | 4,2 / 86 ([G2](https://www.g2.com/products/dropbox-dash/reviews), page bloquée) |
| 6 | [Onyx](https://www.onyx.app/pricing) | direct | San Francisco ; open source ; [racheté par Zoom le 23/09/2026](https://seedtable.com/exits/onyx-2) | Business 20 $ (annuel), 40+ connecteurs | Recherche + assistant IA auto-hébergeable | « Complete Context for Your Humans and Agents » | [aucun avis G2 (août 2026)](https://www.teamazing.com/blog/onyx-ai-enterprise-review-2026/) |
| 7 | [GoSearch](https://www.gosearch.ai/pricing) | direct | San José ; libre-service, gratuit sans minimum | Pro 20 $ | Recherche IA + agents + workflows | « Automate work with search, agents, and workflows, grounded in company context » | 4,8 / 14 ([G2](https://www.g2.com/products/gosearch-ai-enterprise-search/reviews), page bloquée) |
| 8 | [Slite](https://slite.com/pricing) | direct | Paris ; libre-service | Pro 20 $ : « Ask » sur Slack, HubSpot, Linear, Jira, Drive, GitHub… | Base de connaissances avec agent | « An agent-powered knowledge base that stays in sync with your tools. » | non relevé |
| 9 | [Context Link](https://www.context-link.ai/) | direct | lieu non trouvé ; libre-service | 19 $ | Notion, Drive, email, site, fichiers interrogeables par Claude/ChatGPT/Gemini | « Give AI a way to talk to your business » | aucun |
| 10 | [Unblocked](https://getunblocked.com/pricing) | direct (dev) | [Vancouver](https://www.crunchbase.com/organization/getunblocked) ; libre-service | Platform 29 $ (annuel, 35 $ mensuel), MCP vers Claude/Cursor/Copilot | Contexte code + Slack + Jira + Confluence pour développeurs | « More context. Better code. » | 5,0 / 4 (Product Hunt) |
| 11 | [Hymalaia](https://www.hymalaia.com/) | direct (France) | [Paris, 8 personnes, 10 clients, seed 850 k€](https://www.mind.eu.com/retail/en/article/agentic-ai-hymalaia-attracts-retailers-and-announces-imminent-fundraising/) | non public | Agents IA, RAG, 50+ connecteurs, AI Act | « Secured agentic Platform to turn business knowledge into action » | aucun |
| 12 | [Qontext](https://qontext.ai/pricing) | direct (agents) | Berlin ; libre-service + démo | Build 500 €/mois par espace, 5 sources (pas de prix par siège) | Contexte Markdown versionné pour agents | « Make your company AI-native. » | aucun |
| 13 | [memory.store](https://mem.store/) | direct (startups tech) | San Francisco, YC S26 | 150 $ | Mémoire partagée équipe + agents via MCP | « Give your AI your team's context. » | aucun |
| 14 | [Glean](https://www.glean.com/) | direct, hors segment | Palo Alto ; vente directe, 50-100 sièges minimum | non public ; [médiane Vendr 98 890 $/an](https://www.vendr.com/marketplace/glean) | Recherche + agents, 275+ connecteurs | « Enterprise AI that understands your company » | 4,7 / 170 ([G2](https://www.g2.com/products/glean-technologies-glean/reviews)) |
| 15 | [Qatalog](https://clickup.com/qatalog-acquisition) | direct, disparu | Londres ; [racheté par ClickUp le 12/11/2025](https://www.morningstar.com/news/business-wire/20251112532324/clickup-acquires-254m-funded-qatalog-to-accelerate-ai-convergence) | plus vendu seul | intégré à ClickUp | – | – |
| 16 | [Claude Team](https://claude.com/pricing) | indirect | San Francisco ; libre-service 2-150 | 20 $ (annuel, 25 $ mensuel) : « Enterprise search across your organization », connecteurs Drive, Gmail, Calendar, GitHub, M365, Slack ([support](https://support.claude.com/en/articles/9266767-what-is-the-team-plan)) | Assistant d'équipe + recherche d'entreprise | « The Team plan is a paid plan for our Claude chat experience built for ambitious teams. » | 4,6 / 393 (G2, fiche Claude) |
| 17 | ChatGPT Business | indirect | San Francisco ; libre-service 2+ ; page officielle 403 | 20 $ (annuel, 25 $ mensuel) : connecteurs M365, Drive, Slack, GitHub, Linear, Figma, « company knowledge » ([eesel, 12/07/2026](https://www.eesel.ai/blog/chatgpt-work-pricing)) | Assistant d'équipe + réponses citées depuis les outils | accroche non relevée (page bloquée) | 4,7 / 2 879 (G2, fiche grand public) |
| 18 | Microsoft 365 Copilot Business | indirect | Redmond ; via M365, ≤ 300 utilisateurs ; page officielle en délai | 21 $ depuis le 01/12/2025 ([Trusted Tech Team](https://www.trustedtechteam.com/blogs/microsoft-365/microsoft-365-copilot-business-everything-you-need-to-know)) | Copilot dans la suite, chat et recherche « grounded in your organization's internal data » | [« Empowering Small and Medium Businesses with AI »](https://techcommunity.microsoft.com/blog/microsoft-copilot-blog/introducing-microsoft-365-copilot-business-empowering-small-and-medium-businesse/4469700) | 4,6 / 14 (G2, fiche M365 Copilot) |
| 19 | Gemini Enterprise Business | indirect | Mountain View ; 1-300 sièges ; page officielle tronquée | 21 $, 25 Gio d'indexation/siège, connecteurs Workspace, M365, Jira, GitHub, HubSpot, Slack ([coworker.ai, 30/09/2026](https://coworker.ai/blog/gemini-enterprise-pricing)) | Agents + recherche sur les données, écosystème Google | « AI for business » (titre de [la page](https://cloud.google.com/gemini-enterprise/business)) | non relevé |
| 20 | [Atlassian Rovo](https://www.atlassian.com/software/rovo/pricing) | indirect | Sydney ; inclus dans Jira/Confluence | inclus, 25 crédits/utilisateur/mois en Standard | Recherche + chat + agents Atlassian et connecteurs | « AI that knows your business » | 4,7 / 6 (G2) |
| 21 | [Slack Business+](https://slack.com/pricing) | indirect | San Francisco | 15 $ (annuel, 18 $ mensuel) avec Slack AI ; Enterprise Search réservé à Enterprise+ | Messagerie + résumés IA | « Choose a paid plan built for businesses… » | non relevé |
| 22 | [Granola](https://www.granola.ai/pricing) | indirect, réunions | Londres ; [125 M$ à 1,5 Md$ le 25/03/2026](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context) | Business 14 $ : historique illimité, chat entre réunions, MCP, API | Notes de réunion sans bot, Spaces d'équipe | « The AI notepad for back-to-back meetings. Notes, actions and memory. Without a meeting bot. » | 4,7 / 34 (G2) ; 4,8 / 56 ([Product Hunt](https://www.producthunt.com/products/granola/reviews)) |
| 23 | Fireflies | indirect, réunions | San Francisco ; page tarifs chargée sans les prix | Business 19 $ (annuel, 29 $ mensuel) ([usagepricing](https://www.usagepricing.com/blueprint/fireflies-ai)) | Bot de réunion, transcription, recherche | « The #1 AI Assistant For Your Meetings » | 4,7 / 754 (G2) |
| 24 | [Modjo](https://www.modjo.ai/pricing) | indirect, ventes | Paris ; « optimal from 3 sales reps » | non public (formulaire) | Capture des appels commerciaux, CRM | « AI powering top-performing revenue team » | 4,7 / 86 (G2) |
| 25 | [Supermemory](https://supermemory.ai/pricing) | indirect, mémoire d'agents | San Francisco | Pro 19 $/mois (3 sièges, API) | API de mémoire pour agents | « Memory and continual learning for agents » | aucun |
| 26 | [Mem0](https://mem0.ai/pricing) | indirect, mémoire d'agents | San Francisco | Starter 19 $/mois (pas par siège) | Couche de mémoire pour agents | « The Memory layer for AI Agents » | aucun |
| 27 | [Engram](https://www.prnewswire.com/news-releases/engram-launches-with-98m-to-build-ai-that-actually-knows-your-organization-302807126.html) | indirect, menace grands comptes | sortie de furtivité le 23/06/2026, 98 M$, partenaires Microsoft, Notion, Harvey | non public | Modèles qui « apprennent » l'organisation en amont | « Build AI That Actually Knows Your Organization » (titre) | aucun |
| 28 | [Google Workspace natif](https://workspace.google.com/pricing) | substitut | déjà installé | Business Standard 13,60 € (6,80 € promo 3 mois), Gemini inclus | Recherche par application, Gemini dans Gmail/Meet | « Try Google Workspace for 14 days » | – |
| 29 | [Slack Pro natif](https://slack.com/pricing) | substitut | déjà installé | 7,25 $ (annuel) | Recherche dans Slack seul | – | – |
| 30 | [Wiki Notion à la main](https://www.notion.com/pricing) | substitut | déjà installé | Plus 10 $ | Pages maintenues par l'équipe | – | 4,6 / 13 876 |
| 31 | Demander à un collègue | substitut | interne | 0 € ; coût caché (61 % des développeurs > 30 min/jour à chercher, Stack Overflow 2024, brief) | Mémoire humaine, part avec les gens | – | – |

Autres noms vus dans les listes « Glean alternative » et écartés : Agiled, CustomGPT, Meilisearch, Slite déjà inclus ([customgpt.ai](https://customgpt.ai/glean-alternatives/), [agently.dev](https://agently.dev/blog/glean-alternative)). Dashworks, le « Glean pour PME », a été [fermé le 16/07/2025 après rachat par HubSpot](https://vantagepoint.io/blog/hs/what-happened-to-dashworks-ai).

### 2. Fourchette de prix (siège/mois, facturation annuelle)

Sur les 17 produits avec un prix par siège public :

- **Plus bas : 14 $** (Granola Business), puis 15 $ (Dash Teams), 16 $ (Sentra Team, gratuit au lancement).
- **Médian : 20 $**. Huit produits sont exactement à 20 $ : Notion Business, Onyx, GoSearch, Slite, Claude Team, ChatGPT Business ; 21 $ pour Copilot Business et Gemini Business ; 19 $ pour Context Link et Fireflies.
- **Plus haut : 150 $** (memory.store) ; en dessous, 29 $ (Unblocked), 24 € ≈ 26 $ (Dust Pro), et Glean non public à ~30-48 $ par siège selon des tiers.

Leon à 25 € HT (≈ 27 $) se place **au-dessus de la médiane et au-dessus de Dust Pro (24 €)**, la référence française, et au-dessus des trois suites (Claude, ChatGPT, Copilot, Gemini) qui incluent déjà la recherche multi-sources à 20-21 $. La fourchette testée de 15 à 28 € va du prix de Dash au prix d'Unblocked. Seul memory.store vend plus cher, sans client nommé.

Deux prix cachés à noter : Dust Pro plafonne à **3 connecteurs** (Enterprise sur devis au-delà), et Gemini Enterprise facture [la consommation au-delà des quotas](https://coworker.ai/blog/gemini-enterprise-pricing) (« the seat fee is not the whole bill »).

### 3. Carte de positionnement

Deux axes qui comptent pour une équipe de 5 à 100 personnes : **la largeur des sources** (une seule application → toutes les sources de l'entreprise, y compris les conversations IA) et **la profondeur de la mémoire** (retrouver un document → répondre « qui a décidé quoi, quand, et est-ce encore vrai »).

```
Profondeur de la mémoire
(décisions, engagements, chronologie)
 ^
 |                                           Sentra (16 $, US)
 |   Granola (14 $, réunions seulement,      memory.store (150 $)
 |   vise la « company memory »)             Qontext (500 €/mois, agents)
 |                                                             [ Leon visé ]
 |   Guru (non public,                       Glean (non public, 100+ sièges)
 |   cartes vérifiées à la main)             Engram (98 M$, grands comptes)
 |
 |   Unblocked (29 $, code)                  Dust (24 €, 3 connecteurs)
 |   Modjo (ventes)                          Claude Team / ChatGPT Business (20 $)
 |   Fireflies (19 $)                        Copilot Business / Gemini Business (21 $)
 |                                           Notion Business (20 $, search bêta)
 |   Slack Pro / Gmail / Drive natifs        Dash (15 $), GoSearch (20 $), Onyx (20 $)
 |   Wiki Notion à la main (10 $)            Slite (20 $), Context Link (19 $)
 +------------------------------------------------------------------------->
   Une application                   Toutes les sources SaaS      + conversations IA
                                     Largeur des sources
```

Lecture :

- **En bas à droite, c'est plein.** La recherche multi-sources « retrouver le document » est devenue une fonction incluse à 20 $ chez Anthropic, OpenAI, Microsoft, Google, Notion, et chez une demi-douzaine de spécialistes (Dash, GoSearch, Onyx, Slite, Context Link). Personne ne gagnera plus d'argent là-dessus seul.
- **En haut à droite, il n'y a que des Américains chers ou inaccessibles** : Sentra (US, données chez OpenAI, 2-20 sièges mais le CEO vise l'enterprise, [annexe 3](../concurrents-2026-10/annexes/03-sentra.md)), memory.store (150 $), Glean (100+ sièges), Engram (grands comptes). Aucun n'est en France ni hébergé en UE par défaut.
- **Granola monte** : depuis mars 2026 elle se présente comme [« a context layer rather than a standalone app, something other AI tools can query rather than compete with »](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context), avec MCP, Spaces et API. Elle part des réunions, pas des mails ni des chats IA.
- **La colonne « + conversations IA » est vide**, comme l'avait établi l'étude du 12/10 : tous les produits listent Claude, ChatGPT et Cursor comme destinations de lecture, aucun comme source. Et les deux acteurs qui possèdent ces conversations (Anthropic, OpenAI) ne les partagent pas à l'équipe.

### 4. Ce que leurs clients reprochent

Lu : avis 1 à 4 étoiles et fils HN/Product Hunt sur Glean, Guru, Notion, Granola, Dust, ChatGPT « company knowledge », Copilot, Dash, Fireflies. Reddit et G2 étaient bloqués en accès direct : les quelques citations Reddit viennent de pages tierces qui les reprennent. Un thème est marqué **mince** sous 3 avis.

#### A. Réponses fausses ou incomplètes, présentées avec assurance (6 avis)

- Glean, HN, mvdtnz : « It routinely gives incorrect or VERY incomplete information, misattributes work to developers who may have casually mentioned a project at some time and worst of all presents jokes or sarcastic responses as fact. » ([HN 41896552](https://news.ycombinator.com/item?id=41896552))
- Glean, G2 via eesel : « hit-or-miss, especially when dealing with older or poorly-tagged documents » ([eesel](https://www.eesel.ai/blog/glean-reviews))
- Glean, Gartner via eesel : « unexpected data disclosure » ([eesel](https://www.eesel.ai/blog/glean-reviews))
- Dust, G2 (page bloquée, extrait) : « occasional instances where the AI agent missed information present in heavily loaded Google Drive storage spaces » ([G2](https://www.g2.com/products/dust-dust/reviews))
- Fireflies, revue tl;dv : le résumé « mentioned that we were planning a trip in 2024 » sur un appel courant ([tl;dv](https://tldv.io/blog/fireflies-review/))
- Notion, Product Hunt : catégorie « ai accuracy issues (2) » sans citation détaillée ([Product Hunt](https://www.producthunt.com/products/notion/reviews))

Ce que ça dit pour Leon : la plainte n'est pas « ça ne trouve pas », c'est « ça affirme ». Le brut comme source de vérité et la citation exacte répondent directement à ça. C'est aussi la plainte que Guru a prise pour accroche (« confidently wrong AI »).

#### B. La mémoire ne vaut que ce qu'on y met : contenu obsolète, maintenance à la main (5 avis)

- Glean, HN, sofixa : « If your Google Docs and wikis contain obsolete information (because nobody updated them), it's just going to be shit in, shit out. _Curating_ the input data is the challenging part. » ([HN 41896552](https://news.ycombinator.com/item?id=41896552))
- Guru, Gartner via eesel : « The only challenge has been keeping content verified. You need clear ownership of pages for it to stay useful. » ([eesel](https://www.eesel.ai/blog/guru-review))
- Guru, Capterra via eesel : « as the content in our Guru grew, it was difficult to find and update information in our Guru. » ([eesel](https://www.eesel.ai/blog/guru-review))
- Guru, Capterra via eesel : recherche « awful », « like trying to look for a needle in a haystack » ([eesel](https://www.eesel.ai/blog/guru-review))
- Glean, HN, rendang : « it is amusing when I ask it about a project and the source cited is a Slack thread I wrote 2 days prior. » ([HN 41896552](https://news.ycombinator.com/item?id=41896552))

Ce que ça dit : un wiki (Guru, Notion) demande de l'entretien ; une recherche (Glean) ne sait pas qu'une page est périmée. Ni l'un ni l'autre ne gère « ce qui a été dit après ». C'est l'argument de la mémoire qui se remplit toute seule **et** qui date chaque fait.

#### C. Qui a dit quoi : l'attribution est un pile ou face (3 avis)

- Granola, Product Hunt, Asad M. : « Speaker attribution on a four person call is still a coin flip » ([Product Hunt](https://www.producthunt.com/products/granola/reviews))
- Fireflies, G2, Ken S. : « weak speaker identification (supposedly only works when a speaker identifies themselves) » ([G2](https://www.g2.com/products/fireflies-ai/reviews/fireflies-ai-review-11128439))
- Glean, HN, mvdtnz : « misattributes work to developers who may have casually mentioned a project » ([HN 41896552](https://news.ycombinator.com/item?id=41896552))

Ce que ça dit : « qu'a-t-on promis à ce client, et qui ? » dépend d'une attribution fiable ; les outils de réunion ne la garantissent pas.

#### D. Périmètre et droits : « je ne peux pas brancher ça » (6 avis)

- ChatGPT company knowledge, HN, theshrike79 : « They still don't have any scoping for the connectors. There's ZERO way our legal team will let us connect ChatGPT to Google Drive for example. » ([HN 45692241](https://news.ycombinator.com/item?id=45692241))
- Idem, andy_ppp : « This is a fishing expedition for even more data » ([HN 45692241](https://news.ycombinator.com/item?id=45692241))
- Copilot, Gartner via Computerworld : « Around 64% of respondents… reported that information governance and security risks required significant time and resources to deal with, with concerns about data 'oversharing' causing 40% to delay rollouts by three months or more. » ([Computerworld](https://www.computerworld.com/article/3542000/microsoft-365-copilot-rollouts-slowed-by-data-security-roi-concerns.html))
- Dash, G2 (extrait) : « concerns about data privacy » ([G2](https://www.g2.com/products/dropbox-dash/reviews))
- Granola, Reddit via tl;dv : « Is it weird that [Granola] doesn't tell other people that it's recording? » ([tl;dv](https://tldv.io/blog/granola-review/))
- Granola, tl;dv : « everything sits on AWS servers in the United States » ([tl;dv](https://tldv.io/blog/granola-review/))

Ce que ça dit : les droits hérités de la source **et** un périmètre réglable par dossier sont une condition d'achat, pas un bonus. L'hébergement UE est un argument de conformité concret face aux suites américaines.

#### E. Les notes restent dans l'outil, personne n'agit dessus (4 avis)

- Granola, Kai : « everything Granola produces stays inside the notes app. The action items it lists don't become tracked work anywhere unless you wire up Zapier » ([hirekai](https://hirekai.ai/blog/granola-review))
- Granola, Reddit via Kai : « Meeting notes stay isolated instead of flowing into existing workflows » ([hirekai](https://hirekai.ai/blog/granola-review))
- Glean, Slite via eesel : excellent à « finding » mais pas à « act » ([eesel](https://www.eesel.ai/blog/glean-reviews))
- Contexte d'entreprise, HN, condwanaland : « Storing it the way this article presents makes it usable for agents, but not humans » ([HN 47324448](https://news.ycombinator.com/item?id=47324448))

Ce que ça dit : servir la mémoire **dans** l'outil où l'on travaille (MCP vers Claude/Cursor, chat Slack) compte plus qu'une belle interface de recherche.

#### F. Recherche par mots plutôt que par sens (3 avis)

- Granola, Product Hunt, Asad M. : « Search across old meetings is better at words than at meaning » ([Product Hunt](https://www.producthunt.com/products/granola/reviews))
- Guru, via eesel : résultats seulement « unless the exact keyword or specific term is used » ([eesel](https://www.eesel.ai/blog/guru-review))
- Dash, G2 (extrait) : « inconsistent search functionality, resulting in irrelevant files » ([G2](https://www.g2.com/products/dropbox-dash/reviews))

#### G. Le prix ne se justifie pas / minimum de sièges (4 avis)

- Copilot, Gartner via Computerworld : seulement « 3% of respondents… said M365 Copilot provides 'significant' value at this stage » ([Computerworld](https://www.computerworld.com/article/3542000/microsoft-365-copilot-rollouts-slowed-by-data-security-roi-concerns.html))
- Guru : « cost concerns surface repeatedly across G2 reviews, particularly from small businesses and growing teams » ([getmacha](https://www.getmacha.com/blog/guru-complete-guide))
- Granola, YouTube via tl;dv : prix « steep », IA sans « full workspace context » ([tl;dv](https://tldv.io/blog/granola-review/))
- Glean : pas de libre-service, 50-100 sièges minimum ([annexe 1](../concurrents-2026-10/annexes/01-glean.md))

#### H. Non-anglais mal servi, **mince mais pertinent pour la France** (3 avis)

- Dust, via maqtoob/metaflow : « better interface localization for non-English teams » demandée ([maqtoob](https://maqtoob.com/tool/dust-tt/))
- Fireflies, Chrome Web Store via tl;dv : « platform's interface is still English only » ([tl;dv](https://tldv.io/blog/fireflies-review/))
- Granola, Product Hunt, Andrew Wang (2/5) : « Granola doesn't work for the Chinese language » ([tl;dv](https://tldv.io/blog/granola-review/))

#### I. Le généraliste ne s'y consacrera pas, **mince** (1 avis)

- ChatGPT company knowledge, HN, arnvald : « for OpenAI it's one of dozens of tools they launch, so it's hard to believe they'll keep dedicating adequate resources. » ([HN 45692241](https://news.ycombinator.com/item?id=45692241))

#### J. Ce qui n'est jamais écrit, **mince** (1 avis)

- HN, yumiatlead : « what about the stuff that never gets written down at all, like whose informal veto actually kills a project? » ([HN 47324448](https://news.ycombinator.com/item?id=47324448))

Note sur Dust : les avis négatifs sont quasi inexistants en public (« Negative sentiment is sparse in public listings », [metaflow](https://metaflow.life/blog/dust-tt-reviews)) ; les seuls reproches trouvés sont « minor speed hiccups », « rough UI edges » et la localisation. Sentra, Onyx, Context Link, Hymalaia, Qontext et memory.store n'ont aucun avis public.

### 5. Le trou

Il y a un trou, mais il est plus étroit que « la mémoire d'entreprise pour PME ». Ce que personne ne fait bien, relié aux preuves :

1. **Dater et attribuer chaque fait, et dire ce qui est encore vrai.** Les recherches (Glean, Claude, ChatGPT, Dash) retrouvent un document mais le présentent sans date ni auteur fiable (thèmes A, B, C : « source cited is a Slack thread I wrote 2 days prior », « coin flip », « shit in, shit out »). Les wikis (Guru, Notion) demandent qu'un humain vérifie. Sentra promet le versionnage des faits mais [ne l'expose pas aux agents et met 30 s à 3 min](../concurrents-2026-10/annexes/03-sentra.md) ; memory.store est à 150 $. La couche légère d'étiquetage de Leon (date, participants, marqueurs décision/engagement/plainte) sur du brut cité mot pour mot est exactement la réponse à A + B + C, et aucun produit à 20 $ ne la vend.
2. **Les conversations avec les IA comme source.** Confirmé sur 27 produits : toujours destination, jamais source. Vide technique intact depuis le 12/10. Mais aucune plainte client ne le réclame : c'est un trou de **produit**, pas un trou de **demande** exprimée. Il faudra le faire désirer par la démo, pas le vendre sur une douleur dite.
3. **Multi-sources, droits par dossier, hébergé en UE, en français, dès 5 sièges.** Les suites à 20 $ font du multi-sources mais sans périmètre fin (thème D : « ZERO way our legal team will let us connect ChatGPT to Google Drive ») et sur des serveurs américains ; Dust est en UE mais plafonne à 3 connecteurs à 24 € ; Hymalaia et Modjo sont français mais vendent par démo aux grands comptes ou aux commerciaux. Personne ne combine les quatre pour une équipe de 5 à 100 personnes.

Ce qui n'est **pas** un trou : « chercher dans tous mes outils depuis mon assistant IA ». C'est inclus chez Claude Team, ChatGPT Business, Copilot Business, Gemini Business et Notion Business à 20-21 $. Si Leon est perçu comme ça, il est trop cher de 5 € et en concurrence frontale avec Anthropic, OpenAI, Microsoft et Google.

### 6. La menace

**Le plus rapide à copier Leon : Anthropic et OpenAI.** Ils possèdent déjà les conversations IA (le point 2 du trou), la recherche multi-sources, les connecteurs, 20 $ le siège, et la base installée. ChatGPT a déjà une mémoire personnelle et « company knowledge » ; Claude Team a l'« enterprise search » et les connecteurs Gmail/Drive/GitHub/M365/Slack. Il leur suffit d'un réglage d'administration « remonter à l'équipe les décisions prises dans les chats » pour fermer le différenciateur numéro un de Leon en un trimestre. Deux limites les retiennent pour l'instant : chacun ne voit que ses propres conversations (un salarié sur Claude Code, l'autre sur ChatGPT), et HN leur reproche déjà de ne pas scoper les connecteurs ni de se consacrer au sujet (thèmes D et I). Leon doit être neutre entre modèles et sérieux sur les droits : c'est ce que ces deux-là feront le moins vite.

**Deuxième menace, Granola.** 1,5 Md$, 14 $ le siège, Londres, et une repositionnement explicite en « company memory » avec MCP, Spaces et API depuis mars 2026. Elle a la capture passive (desktop, sans bot) et la chronologie des réunions ; il lui manque les mails, le CRM et les chats IA. Une extension navigateur Granola qui lit claude.ai et chatgpt.com est à la portée d'une personne (l'étude du 12/10 le montre avec Conxt). Si Granola le fait, elle a Leon pour les équipes qui vivent en réunion.

**Troisième, Dust.** À Paris, 3 000 organisations, 40 M$ levés en mai 2026, hébergement UE, et déjà la recherche + agents sur 70 connecteurs. Dust ne fait pas de mémoire datée ni de capture des chats, et plafonne les PME à 3 connecteurs ; mais une offre « Dust Memory » lèverait les deux et prendrait le réseau français avant Leon. C'est aussi, à l'inverse, le partenaire ou l'acquéreur naturel.

Les quatre rachats de 2025-2026 (Dashworks → HubSpot, Qatalog → ClickUp, Onyx → Zoom, Sana → Workday) disent la même chose : la recherche d'entreprise pour PME ne survit pas seule, elle se fait absorber par une suite. La thèse de Leon doit tenir sans être une recherche : une mémoire datée, attribuée, qui se remplit toute seule y compris depuis les IA, et que n'importe quel assistant peut lire.

### Méthode et limites

Un agent, une session, le 17 octobre 2026. Prix relevés sur les pages officielles sauf : ChatGPT Business (eesel, 12/07/2026), Copilot Business (Trusted Tech Team), Gemini Business (coworker.ai, 30/09/2026), Fireflies (usagepricing). Notes G2 relevées dans les extraits de recherche car G2 renvoyait 403 sur toutes les fiches ; les nombres d'avis G2 varient d'une source à l'autre (Dust : 20 ou 86 selon la fiche ; Glean : 170 ou 336 ; GoSearch : 14 ou 21). Les thèmes de plaintes reposent sur 30 à 40 avis lus, pas sur une analyse exhaustive ; Reddit n'était pas accessible directement, les trois citations Reddit transitent par des blogs tiers. Non testés en main : tout. Non trouvés : des avis clients de Sentra, Onyx, Context Link, Hymalaia, Qontext, memory.store.

## The buyer panel

**19 buy · 81 pass** (19% buy) out of 100 simulated buyers. Seed 7, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Fondateur d'une petite équipe de 5 à 15 personnes très utilisatrice d'IA | 15 | 27% |
| Dirigeant d'une agence ou d'un cabinet (conseil, expertise comptable, agence web ou marketing) de 5 à 40 personnes | 25 | 24% |
| CTO ou lead dev d'une startup ou scale-up tech de 10 à 60 personnes | 35 | 17% |
| Directeur commercial ou des opérations d'une PME de services ou d'un SaaS de 20 à 100 personnes | 25 | 12% |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Power user IA | 20 | 95% |
| Déjà tout équipé | 20 | 0% |
| Prudent sécurité et RGPD | 15 | 0% |
| Demande à son réseau | 10 | 0% |
| Compte les euros | 15 | 0% |
| Sceptique des démos IA | 15 | 0% |
| Surchargé | 5 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| $66,000 to $81,000 | 32 | 22% |
| under $66,000 | 33 | 21% |
| $81,000 and up | 35 | 14% |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 60 | "Le problème est réel, je passe mes journées à réexpliquer aux deux nouveaux où sont les choses, mais je ne vais pas installer une extension navigateur qui lit les conversations ChatGPT de mes devs : je sais déjà comment ça sera reçu en interne. Et pour le reste, on a Gemini dans Workspace et Notion AI, je pars du principe que c'est déjà couvert." (P001) · "Le problème est réel, je passe mes journées à répéter aux deux nouveaux pourquoi on a fait tel choix, et je testerais l'essai gratuit sur GitHub, Linear et Notion avec mon seul compte dès ce soir. Mais brancher le Gmail et le Drive de la boîte, plus une extension qui lit ce que mes devs disent à Claude, sur un service tenu par deux personnes sans structure derrière, je ne le ferai pas et je ne paierai donc pas de sièges." (P002) |
| need | 8 | "Mon vrai problème c'est Slack, et Slack n'est pas dans la liste. Brancher Gmail et Drive sans Slack, ça me donne une mémoire à moitié vide, et 25 € par siège pour ça, c'est le prix de ChatGPT Team en plus de ce que je paie déjà." (P007) · "Je paie déjà Google Workspace, Notion Business et ChatGPT Team, et je suis justement en train de me demander ce qu'on utilise vraiment : ChatGPT Team se branche déjà sur le Drive et Notion a sa recherche IA, donc à mes yeux c'est « déjà inclus ». Rajouter 25 € par tête, soit près de 1 000 € par mois pour mes 40 personnes, pour une quatrième brique qui promet à peu près la même chose, je ne le défends pas en comité de direction." (P019) |
| habit | 6 | "Je paie déjà Google Workspace, Notion Business et ChatGPT Team, et ChatGPT Team se branche déjà sur mon Drive et mon Notion ; à 25 € par siège en plus des 20 € de ChatGPT, ça fait doubler la ligne IA pour une quinzaine de personnes sans que je sois sûr de ce que ça apporte de plus. Le vrai sujet, c'est que mes deux nouveaux me posent des questions toute la journée, mais je me dis que ça se règle en rangeant mieux Notion, pas avec un outil de plus." (P034) · "Je paie déjà Workspace, Notion Business et ChatGPT Team, et je pars du principe que la mémoire d'équipe finira dans l'un des trois. Mon vrai problème, c'est de perdre le fil de ce que mes agents décident dans Claude Code, et l'offre parle d'une extension navigateur pour Claude et ChatGPT, pas de mon terminal." (P055) |
| price | 3 | "La promesse me parle, là tout de suite j'ai un client qui conteste un périmètre validé par email, mais ce mail je sais le retrouver dans Gmail en dix minutes. Payer 25 € par tête, soit autant que ChatGPT et deux fois Notion, pour gagner ces dix minutes quelques fois par mois, je ne sais pas le justifier à mon associé." (P021) · "Mon litige de périmètre, je le règle en dix minutes en cherchant l'email de validation dans Gmail, gratuitement. 750 € par mois pour 30 sièges, c'est plus que ce que je paie à Notion, et personne ne me montre le gain mesurable en face." (P026) |
| convenience | 3 | "Le prix est raisonnable à côté du devis Glean, mais je paie déjà Workspace, Notion Business et ChatGPT Team, et je pars du principe qu'ils finiront par couvrir ça. Brancher six outils puis déployer une extension navigateur sur quarante postes, ce n'est pas dix minutes, c'est un projet que je n'ai pas le temps de porter ce trimestre." (P029) · "Mon équipe vit dans Slack et Slack n'est même pas dans la liste des outils branchés, donc Leon passerait à côté de la moitié de ce qu'on se dit. Et je n'ai ni le temps ni l'envie de faire installer une extension navigateur sur quinze postes pour une boîte de deux personnes que je ne connais pas." (P062) |
| timing | 1 | "Je paie déjà Notion Business et ChatGPT Team sans savoir ce que mon équipe utilise vraiment ; je ne vais pas empiler un troisième abonnement à 25 € par tête avant d'avoir fait le ménage. Et « dix minutes » plus une extension à déployer sur tous les postes, je connais la chanson, je n'ai pas le temps de porter ça." (P094) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| need | 19 | "Je perds tous les jours le fil de ce que mes agents ont décidé et de ce qu'on a promis aux clients, et à 25 € le siège sans engagement, je lance l'essai le jour même pour moi et trois personnes : si les citations de source tiennent, je convertis à la fin des 30 jours sans réfléchir." (P009) · "Je passe mes journées à répéter aux deux nouveaux pourquoi on a fait tel choix et où est tel bug réglé ; si Leon répond à ça depuis Claude Code en citant la PR ou le ticket, ça me rend des heures. Je prends l'essai sur 5 sièges côté tech, branché seulement sur GitHub, Linear et Notion, sans Gmail ni l'extension." (P011) |

### What would flip a no

- Pouvoir déployer Leon uniquement sur Drive, Notion, Linear et GitHub, sans l'extension ni la capture des conversations IA, et constater pendant l'essai que mes deux nouveaux trouvent seuls des réponses sourcées que Gemini et Notion AI ne sortent pas.
- Une société immatriculée avec un DPA signable et une page sécurité sérieuse (chiffrement, sous-traitants, pentest), et la possibilité de choisir connecteur par connecteur, pour démarrer avec GitHub, Linear et Notion sans jamais donner Gmail.
- Un DPA et une liste de sous-traitants publiés, un export complet et lisible de toute la mémoire à tout moment (pas seulement à la résiliation), un engagement écrit de suppression, et idéalement la possibilité de commencer sur un périmètre restreint (Notion et Linear seulement, sans Gmail) pour l'essai.
- Un DPA signable, la liste des sous-traitants (notamment le LLM utilisé et sa localisation), une politique de rétention claire, et un essai limité à un seul outil (Drive ou Notion) sur un périmètre restreint avant de brancher Gmail et les conversations IA.
- Un pair de mon réseau, dans une boîte de notre taille, qui l'utilise depuis trois mois et me dit qu'il répond « je ne sais pas » plutôt que d'inventer ; plus un connecteur Slack.
- Un directeur commercial ou un dirigeant d'agence que je connais qui l'utilise depuis six mois et me dit que ça lui a réellement évité un litige client, et la possibilité de démarrer sur cinq sièges avec Gmail et HubSpot seulement, sans extension à déployer sur toute l'équipe.
- Un connecteur Slack avec le respect des canaux privés, démontré en direct sur mon espace pendant l'essai, et un prix dégressif à partir de 10 sièges.
- Un essai sur mon vrai compte où je crée un accès pour une recrue, je vérifie moi-même qu'elle ne voit rien de ce qu'elle ne devrait pas voir, et je constate qu'en deux semaines elle m'a posé moitié moins de questions.
- Un essai sur mon seul poste, limité à GitHub, Linear et Claude Code, sans Gmail ni extension pour l'équipe, qui me montre en deux semaines qu'il retrouve vraiment pourquoi un agent a pris telle décision ; plus une tarification par équipe ou dégressive et un export complet des données en cas de départ.
- Un pair de mon Slack de fondateurs qui l'utilise depuis trois mois et me dit que ça tient, plus la possibilité de brancher d'abord GitHub, Linear et les conversations Claude Code sans toucher à Gmail.
- Une démo sur mes propres outils où je vérifie moi-même qu'un commercial ne tombe pas sur les dossiers RH ou la marge d'un autre compte, et un tarif autour de 12 à 15 € le siège.
- Un essai sur un périmètre restreint (un seul compte Gmail et un seul dépôt), où je vérifie moi-même vingt questions contre les sources, avec zéro réponse inventée, plus une page sécurité sérieuse (chiffrement, sous-traitants, droit à l'effacement, qui chez eux peut lire quoi).

Buyers say they would buy **1.0 times** in the first month on average.

100 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

Trois sources : le panel de 100 acheteurs simulés (`pricing-curve.md`), les prix publics des concurrents (`competitors.md`) et les chiffres du CFO (`numbers.json`, outil `unit_economics.py`). Les réponses de prix du panel servent à choisir ce qu'on teste, pas à fixer le prix.

### 1. Ce que les acheteurs ont dit

Courbe de Van Westendorp sur 100 réponses complètes (€ HT par siège et par mois) :

| point | prix | lecture |
|---|---:|---|
| Trop bon marché (PMC) | 5 € | en dessous, « trop bon marché pour être sérieux » |
| Point d'indifférence (IPP) | 15 € | autant le trouvent bon marché que cher |
| Trop cher (PME) | 40 € | au-dessus, trop de refus |

Médianes : trop bon marché 5 €, bonne affaire 12 €, cher 35 €, trop cher 60 €. **25 € est dans la fourchette acceptable (5 à 40 €), mais au-dessus du point d'indifférence (15 €).**

Deux lectures à garder :
- **Les 19 acheteurs** répondent presque tous 5 / 12 / 40 / 60-80. Pour eux, 25 € n'est pas un obstacle.
- **Les 81 refus** ne sont pas des refus de prix : 60 invoquent la confiance, 3 seulement le prix. Baisser le prix ne convertit pas un acheteur qui refuse de brancher son Gmail sur une société de deux personnes.

Un signal secondaire : plusieurs CTO de petites équipes (P087, P026, P052) demandent un **forfait équipe** plutôt que du par-siège, et plusieurs (P007, P010) un **prix dégressif à partir de 10 sièges**.

### 2. Ce que les concurrents facturent (siège et mois, annuel)

| | prix | ce que ça inclut |
|---|---:|---|
| Granola | 14 $ | notes de réunion + couche de contexte |
| Dropbox Dash | 15 $ | recherche multi-sources, < 100 utilisateurs |
| Claude Team, ChatGPT Business, Copilot Business, Gemini Business, Notion Business | 20-21 $ | l'assistant **et** la recherche multi-sources, déjà payés |
| Dust Pro (Paris) | 24 € | agents sur données internes, 3 connecteurs maximum |
| Glean | 30-48 $ | 50 sièges minimum, contrat médian ~99 k$/an |

Médiane du marché : **20 $**. Leon à 25 € HT se place au-dessus de la médiane et au niveau de Dust, **en plus** de l'abonnement IA que l'équipe paie déjà. C'est ce que les acheteurs « déjà équipés » (0 % d'achat) refusent.

### 3. Ce que l'entreprise a besoin d'encaisser

Sorties de `unit_economics.py` (hypothèses dans `cfo-sources.md`, dont une rémunération minimale des fondateurs de 5 000 €/mois) :

| prix | contribution par siège | marge au plan (500 sièges) | seuil de rentabilité |
|---:|---:|---:|---:|
| 15 € | 9,0 € (60 %) | **−31 %** | 759 sièges |
| 20 € | 14,0 € (70 %) | 2 % | 488 sièges |
| **25 €** | **19,0 € (76 %)** | **21 %** | **360 sièges** |

À 15 €, le point d'indifférence du panel, l'entreprise perd de l'argent à 500 sièges. À 20 €, elle est à l'équilibre. **25 € est le prix minimum qui laisse une marge avec deux fondateurs payés.**

### 4. Décision

#### Le prix : 25 € HT par siège et par mois, inchangé

- Dans la fourchette acceptable du panel, en dessous du seuil « cher » (35 €) des acheteurs.
- Le seul prix des trois qui donne une marge (21 % au plan, seuil à 360 sièges).
- Les refus viennent de la confiance et de l'effort, pas du prix : c'est l'offre (`offer.md`) qui doit les traiter, pas une baisse.

#### L'échelle

| palier | prix | pour qui | raison de monter |
|---|---:|---|---|
| **Solo** | 0 € | une personne, Claude Code ou Cursor + GitHub, lecture par MCP, mémoire privée | c'est le « power user IA » (95 % d'achat au panel) qui fait entrer Leon dans l'équipe ; coût de service ~2,5 €/mois, c'est le coût d'acquisition |
| **Équipe** | 25 €/siège, 3 sièges minimum | l'équipe de développement de 3 à 30 personnes | les décisions partagées entre membres, Linear, Notion, le registre des décisions, le DPA |
| **Entreprise** | sur devis à partir de 50 sièges | équipes de 50 à 100 avec DPO et CSE | SSO, DPA négocié, dossier CSE, connecteurs Gmail et HubSpot, dégressif |

Le forfait équipe demandé par plusieurs CTO est couvert par le minimum de 3 sièges (75 €/mois) : lisible, et compatible avec le par-siège.

#### L'offre d'ouverture

**« Équipe fondatrice » : 19 € HT par siège, garanti 12 mois, pour les 20 premières équipes, jusqu'au 31 janvier 2027.** La limite est réelle : deux fondateurs ne peuvent pas accompagner plus de 20 équipes en pilote. À 19 €, la contribution reste de 13 € par siège (70 %). Après la date, 25 €, sans autre remise. Pas de « prix barré » : 25 € n'aura jamais été facturé avant.

#### À tester avec de vrais acheteurs

Deux prix dans la fourchette, sur deux pages d'atterrissage identiques, avec une réservation de pilote payante (pas un clic) :
- **A : 19 €/siège** (le prix d'ouverture) ;
- **B : 29 €/siège** (au-dessus du prix de liste, pour mesurer si la valeur tient jusqu'au seuil « cher » du panel).

Mesure : le nombre de pilotes réservés avec une carte bancaire, par variante, sur 4 semaines. Si B convertit autant que A, le prix de liste monte à 29 €.

### 5. Les objections de prix du panel, mot pour mot

1. « 25 € par tête, soit autant que ChatGPT et deux fois Notion, pour gagner ces dix minutes quelques fois par mois, je ne sais pas le justifier à mon associé. » (P021, dirigeant d'agence)
2. « Rajouter 25 € par tête, soit près de 1 000 € par mois pour mes 40 personnes, pour une quatrième brique qui promet à peu près la même chose, je ne le défends pas en comité de direction. » (P019, directrice commerciale)
3. « 750 € par mois pour 30 sièges, c'est plus que ce que je paie à Notion, et personne ne me montre le gain mesurable en face. » (P026, dirigeant d'agence)

Le marketing doit répondre avec un gain mesuré, pas un prix plus bas : « combien d'heures par semaine, chez une équipe de votre taille ».

## The offer

Méthode : la lentille Offres de `board/lenses.md` (un résumé de cadre publié, jamais présenté comme les mots de son auteur). Matière première : `board.md` (conditions C1 à C10), `panel/results.md` (19 achats sur 100, 60 refus pour « confiance »), `competitors.md` (le trou : dater et attribuer chaque fait sur du brut cité, y compris depuis les conversations IA ; la menace : Anthropic et OpenAI), `pricing.md` (25 €), `numbers.json`.

### 1. Ce qu'on vend aujourd'hui, et pourquoi ça ne s'achète pas

`pitch-v1.md` vendait « la mémoire de votre équipe » : sept connecteurs, Gmail en tête, une extension navigateur, une interface, 25 €. Le panel a dit non à 81 %. Les 60 refus pour « confiance » tiennent en une phrase, celle de P002 : *« brancher le Gmail et le Drive de la boîte, plus une extension qui lit ce que mes devs disent à Claude, sur un service tenu par deux personnes sans structure derrière, je ne le ferai pas »*. Le conseil avait dit la même chose (C2, C4, C6). L'offre v1 demandait le maximum d'effort et de confiance avant de montrer la moindre preuve.

### 2. La liste des problèmes de l'acheteur

Dans ses mots, depuis le panel et les avis des concurrents. Avant, pendant, après.

**Avant d'acheter**
1. « Claude, ChatGPT ou Notion le font déjà pour 20 € » (20 acheteurs « déjà équipés », 0 % d'achat).
2. « Confier Gmail et Drive de toute la boîte à deux cofondateurs non immatriculés » (P002, P003, P010, P017, P023…).
3. « Pas de DPA, pas de liste de sous-traitants, où tourne le LLM ? » (P004, P018, P036, P045, P053).
4. « Et si Leon disparaît dans six mois, je fais quoi de ma mémoire ? » (P003, P020, P022, P082, P088).
5. « Ça va halluciner avec assurance sur nos données en français » (P005, P039, P047, P069).
6. « La promesse "chacun ne voit que ce à quoi il a accès", on me l'a déjà faite et ça a fuité » (P008, P009, P063, P072, P092, P095).
7. « Personne de mon réseau ne l'utilise » (10 acheteurs « demande à son réseau », 0 %).
8. « 25 € × 30 = 750 €/mois, pour quel gain mesurable ? » (P021, P026, P019).
9. « Mon équipe vit dans Slack, et Slack n'est pas dans la liste » (P005, P007, P022, P062, P097, P099).
10. « L'extension navigateur ne capte pas Claude Code, qui tourne dans mon terminal » (P009, P048, P055, P073).

**Pendant l'installation et l'essai**
11. « Six consentements OAuth, une extension sur quarante postes : ce n'est pas dix minutes, c'est un projet » (P029, P062, P094 ; lentille Produit).
12. « Mes salariés vont le vivre comme de la surveillance ; et le CSE ? » (P001, P010, P011, P065, P099).
13. « Le jour 1, la mémoire est vide » (lentille Produit, C4).
14. « Comment je sais que ça capte encore ? » (lentille Produit).
15. « Je veux vérifier moi-même, avec des questions dont je connais la réponse » (P042, P051, P056, P069, P079, P089).

**Après**
16. « Ça va me ressortir une vieille décision sans dire qu'elle a changé » (P068, P073 ; avis Glean et Notion dans `competitors.md`).
17. « Qui a dit quoi, c'est peu fiable » (avis concurrents).
18. « Un passage privé remonté par erreur à l'équipe, et c'est fini » (C6).
19. « Je paie des sièges pour des gens qui ne s'en servent pas » (P063 : « le per-seat laisse les deux tiers de l'équipe dehors »).
20. « Anthropic peut ajouter la même chose en une version » (lentille Monopole ; `competitors.md`).

### 3. Les solutions, notées et triées

Valeur pour l'acheteur (1-5) × coût de livraison (1-5, d'après `numbers.json` et le code existant). On garde haute valeur, bas coût.

| problème | solution | valeur | coût | gardé ? |
|---|---|:-:|:-:|:-:|
| 2, 11, 12 | **Pas de Gmail, pas de Drive, pas d'extension par défaut.** Le produit démarre sur Claude Code/Cursor + GitHub + Linear/Notion. Chaque connecteur s'ajoute connecteur par connecteur, quand l'acheteur le décide. | 5 | 1 (c'est du retrait) | oui, c'est le cœur |
| 10 | **Un agent local qui lit les sessions Claude Code et Cursor dans le terminal**, pas une extension navigateur. L'import Claude Code existe déjà (`src/cli/import-claude-code.ts`). | 5 | 2 | oui |
| 1, 20 | **Lecture par MCP depuis Claude, Cursor ou ChatGPT.** Leon ne remplace pas l'assistant, il l'alimente. Le serveur MCP existe. | 4 | 1 | oui |
| 5, 15, 8 | **Le test des 20 questions.** À l'installation, l'équipe écrit 20 questions dont elle connaît la réponse. Un tableau de bord montre le score. Moins de 15 bonnes réponses avec la bonne source au jour 30 : rien n'est facturé. | 5 | 2 (un formulaire, un compteur, un coût modélisé à 0,20 €/siège) | oui, c'est la garantie |
| 3, 4 | **Pack confiance** : DPA signable, liste des sous-traitants (quel LLM, hébergé où), export complet à tout moment (pas seulement à la résiliation), suppression sous 30 jours, page sécurité. | 5 | 2 (2 500 € d'avocat déjà dans `startup`) | oui, bonus n°1 |
| 18, 12 | **Relecture par l'auteur** : rien ne remonte à l'équipe sans un clic de la personne qui a eu la conversation. Signal visible de capture. | 5 | 2 (un écran de validation ; `triage.ts` propose déjà) | oui, bonus n°2 |
| 16 | **Chaque décision est datée, et « remplacée par » quand elle change.** Le modèle bi-temporel existe (`0003-memoire.sql`). | 4 | 2 | oui, bonus n°3 |
| 5, 17 | **« Je ne sais pas » plutôt qu'inventer**, et la citation exacte vérifiée (`quote.ts`). | 5 | 1 | oui, dans la promesse |
| 13 | **Rétro-chargement de l'historique** GitHub, Linear, Notion et des sessions existantes dès la première heure. | 4 | 2 (0,40 €/siège amorti) | oui |
| 19 | **Solo gratuit pour une personne**, puis 3 sièges minimum. On ne paie que les sièges actifs. | 4 | 2 (0,60 €/siège) | oui |
| 7 | **Référence par un pair** : trois équipes pilotes nommées et joignables. | 5 | 3 (il faut les gagner) | pas encore livrable, c'est le but de `launch.md` |
| 9 | **Slack en recherche fédérée** (API officielle Real-time Search, rien n'est copié). | 4 | 4 | plus tard, pas dans la promesse |
| 11 | Chat web Leon | 2 | 3 | retiré (lentille Produit) |
| 1 | HubSpot, Gmail, Drive, Meet | 3 | 4 | plus tard, à la demande d'équipes payantes |
| 2 | Immatriculation de la société | 5 | 1 | condition préalable, pas un argument |

### 4. L'offre empilée

**Le nom : « Leon, la mémoire des décisions de votre équipe dev »**, et l'offre de lancement **« Équipe fondatrice »**.

**Le cœur**, décrit par le résultat : *« Pourquoi on a fait ce choix, et comment on avait réglé ce bug : la réponse, avec la source, depuis l'outil IA que vous utilisez déjà. »* Capture des sessions Claude Code et Cursor par un agent local, GitHub, Linear, Notion, lecture par MCP.

**Les bonus**, chacun tue une objection :
1. **Pack confiance** (objections 3 et 4) : DPA, sous-traitants, export à tout moment, suppression sous 30 jours.
2. **Relecture par l'auteur** (objections 12 et 18) : rien ne remonte sans un clic.
3. **Décisions datées et remplacées** (objection 16).

**La garantie** : le test des 20 questions. Moins de 15 sur 20 au jour 30, rien n'est facturé. Coût modélisé dans `numbers.json` : 10 % des équipes non facturées le premier mois, soit 0,20 € par siège et par mois. La contribution reste à 20,24 € (81 %).

**Urgence et rareté, vraies** : 20 équipes fondatrices à 19 € garanti 12 mois, jusqu'au 31 janvier 2027. Deux fondateurs ne peuvent pas accompagner davantage de pilotes avec le test des 20 questions.

**Ce qui est retiré** : le chat web, Gmail, Drive, HubSpot et Meet au lancement, l'extension navigateur comme capteur principal, les questions « combien » dans la promesse.

### 5. L'équation de valeur, avant et après

| | v1 | v2 | ce qui bouge |
|---|:-:|:-:|---|
| Résultat rêvé | 7 | 7 | inchangé : « pourquoi on a fait ce choix » parle déjà |
| Probabilité perçue d'y arriver | 2 | 6 | le test des 20 questions, « je ne sais pas » plutôt qu'inventer, la citation vérifiée, le pack confiance |
| Temps jusqu'au résultat | 3 | 6 | rétro-chargement, pas de Gmail à faire valider, Solo gratuit en dix minutes |
| Effort et sacrifice | 2 | 7 | pas d'extension sur chaque poste, connecteur par connecteur, relecture par l'auteur, MCP dans l'outil existant |

Le score monte surtout sur l'effort et la probabilité, les deux lignes où la lentille Offres voit mourir la plupart des offres. Le résultat rêvé ne bouge pas : il était déjà bon.

**Le test « à 50 € » (C7)** : à 50 €, l'offre v2 reste-t-elle le choix évident pour une équipe de dix développeurs qui vivent dans Claude Code ? Le panel place le seuil « trop cher » à 60-80 € chez les acheteurs. À 50 €, elle reste achetable pour eux, mais plus « évidente » : le choix évident s'arrête vers 35 €. C'est la marque d'une offre qui n'est pas encore un commodity, sans être encore irrésistible.

### 6. Le re-test sur le panel

Mêmes 20 premières cartes que le panel de 100 (P001 à P020, graine 7), avec `pitch.md` v2. Résultat dans `panel-v2/results.md`.

**Résultat : 5 achats sur 20 en v2, contre 5 sur 20 pour les mêmes acheteurs en v1. Le taux global ne bouge pas ; la composition change complètement.**

| | v1 (« mémoire de l'équipe », 7 connecteurs) | v2 (« décisions de l'équipe dev ») |
|---|:-:|:-:|
| Profils techniques (CTO, fondateur très IA), 9 cartes | 1 achat (P011) | **4 achats** (P002, P003, P011, P017) |
| Profils commerciaux et agences, 11 cartes | 4 achats (P009, P013, P016, P020) | 1 achat (P009) |

Trois acheteurs basculent de non à oui, tous techniques : une CTO « power user » (P002), une fondatrice « prudente RGPD » (P003, c'est la première conversion de ce comportement, à 0 % sur 100 en v1) et un CTO « surchargé » (P017, idem). Trois basculent de oui à non, tous commerciaux ou agences : *« le produit parle à une équipe de développement ; moi je suis côté commercial »* (P013), *« rien ne capte les réunions ni les mails, donc les engagements clients, qui sont ma vraie fuite, resteraient dehors »* (P016).

**Ce que le re-test confirme** : le recentrage sur les équipes dev (condition C1 du conseil) fait passer le taux d'achat de ce segment de 11 % à 44 % sur 20 cartes, et il convertit pour la première fois des profils prudents. Il perd les agences et les commerciaux, ce qui est le prix d'un marché choisi.

**Les objections qui restent, dans l'ordre** :
1. **« Qui voit quoi une fois la décision remontée ? »** (9 acheteurs sur 20 : P007, P008, P013, P014, P017, P018, P019). La v2 répond à la confidentialité individuelle (« privée à son auteur ») mais pas au cloisonnement **par projet ou par équipe**. C'est l'objection n°1 de la v2 et elle est bon marché à traiter : des espaces par projet avec des membres, ce que les ACL par tableau `uuid[]` du code permettent déjà. **À ajouter à l'offre avant tout lancement.**
2. **« Un agent sur chaque poste, mes devs vont y voir un mouchard »** (P001, P010, P011, P012, P015). La relecture par l'auteur ne suffit pas à l'écrit : il faut une page « ce que l'agent capte et ne capte pas », et un déploiement **à l'initiative de chaque développeur** (le Solo gratuit), pas imposé par le CTO.
3. **« Si personne ne clique, la mémoire reste vide »** (P004, P006) : la relecture par l'auteur a un coût d'adoption. À mesurer sur les pilotes (part des décisions proposées qui sont validées).
4. Pour les non-dev : les emails, les réunions et Slack. Ce sont les connecteurs à venir, à la demande d'équipes payantes, pas une raison de ré-élargir l'offre maintenant.

Les prix ne bougent pas : les acheteurs v2 répondent 5 / 12 / 40 / 70, comme en v1.

Limite habituelle : acheteurs simulés, 20 cartes. Le signal porte sur la direction (dev oui, non-dev non) et sur les objections, pas sur le taux.

### Règles respectées

- Chaque promesse est livrable : l'agent local et l'import Claude Code, le serveur MCP, la vérification des citations, le modèle bi-temporel et le tri existent dans le code ; le DPA et la page sécurité sont budgétés.
- Pas de faux avis, pas de fausse rareté : la limite de 20 équipes vient de la capacité de support des fondateurs.
- Les garanties et les mentions sur les données doivent être relues par un avocat (droit de la consommation, RGPD). Ce document n'est pas un avis juridique.

## The numbers

### La note du CFO

Chiffres de `unit_economics.py` sur `numbers.json` (offre v2, équipes dev, prix 25 € HT). Sources et hypothèses dans `cfo-sources.md`. Revenus hors taxes ; la TVA française (20 %) s'ajoute aux factures. Un expert-comptable doit valider la structure, les charges sociales des fondateurs et la fiscalité avant tout mouvement d'argent ; ceci n'est pas un conseil financier.

**La marge.** Un siège-mois à 25 € laisse **20,13 € de contribution (81 %)** après ses coûts directs (4,87 €, dont 1,50 € de temps fondateur en support et 1,20 € de recherche et rerank). Au plan de 500 sièges, la **marge nette est de 26 %** après les 6 770 € de coûts fixes mensuels. Le **seuil de rentabilité est à 337 sièges** (17 équipes de 20).

**La ligne à surveiller : la rampe.** Avec 0 siège les deux premiers mois puis +30 % par mois, l'année 1 fait **46 750 € de chiffre d'affaires et perd 43 597 €**. Le seuil n'est franchi qu'au mois 11. Si le volume est 20 % sous le plan, la marge tombe à 13 % ; à la moitié du plan (250 sièges), elle est de **−28 %** et la perte de l'année 1 monte à 62 916 €. Le prix pèse moins : −10 % sur le prix (soit l'offre fondatrice à 19 €, si elle devenait la norme) ramène la marge à 18 % et le seuil à 385 sièges. À 19 € sur tous les sièges, la marge au plan n'est que de 3 %.

**Cash.** Le besoin de trésorerie avant que l'entreprise se paie elle-même est de **51 307 €** (le creux cumulé du mois 10, lancement compris, après retrait de la ligne CASA inutile à l'offre v2). Dont 5 000 €/mois de rémunération minimale des fondateurs, hypothèse à corriger par eux : sans rémunération, les coûts fixes tombent à 1 770 €, le seuil à 90 sièges et le besoin de trésorerie à environ 12 000 €.

**Trois façons d'améliorer la marge, mesurées avec l'outil :**
1. **Tenir le prix de liste à 25 € et borner l'offre à 19 € aux 20 premières équipes** : chaque siège à 19 € au lieu de 25 coûte 6 € de contribution ; sur 20 équipes de 10, c'est 1 200 €/mois pendant 12 mois. Acceptable comme coût d'acquisition, pas comme prix.
2. **Raccourcir la rampe de deux mois** (pilotes payants dès le mois 1 plutôt que gratuits) : le seuil est franchi au mois 9 et le creux de trésorerie baisse d'environ 13 000 €. C'est le levier le plus fort.
3. **Réduire le temps de support par siège** (1,50 € → 0,75 €, avec le test des 20 questions automatisé) : la contribution passe à 20,88 €, le seuil à 325 sièges. Faible. Le coût unitaire n'est pas le problème ; le volume l'est.

**Les conditions du conseil qui touchent à l'argent.**
- C9, remboursement du CAC sous 12 mois avec 3 à 5 % d'attrition : à 20,13 € de contribution par siège et 10 sièges par équipe, une équipe rapporte ~200 €/mois. Un CAC de 1 200 € (hypothèse `board.md`, scénario optimiste) se rembourse en 6 mois ; un CAC de 3 000 € en 15 mois, **hors cible**. Le CAC réel manque toujours : c'est `marketing.md` et `launch.md` qui le mesurent.
- C7, volonté de payer : non testée avec de vrais acheteurs. Le panel donne une fourchette, pas une preuve.

**Ce que dit le CFO en une phrase** : l'unité est saine (81 % de contribution), le prix est le bon, et tout se joue sur la vitesse à laquelle 340 sièges arrivent, donc sur l'acquisition, pas sur les coûts.

---

## Unit economics: Leon pour les équipes de développement : abonnement par siège (unité = un siège Équipe pendant un mois). Montants en euros HT, 1 $ = 0,92 € (hypothèse, voir cfo-sources.md). Offre v2 du 18/10/2026.

Every number below comes from the input file. Nothing is looked up or guessed.

### One siège-mois

| line | per siège-mois |
| --- | ---: |
| Price | $25.00 |
| Embeddings du flux (voyage-4) | -$0.04 |
| Étiquetage léger Haiku 5.5 (contexte, entités, marqueurs décision) | -$0.28 |
| Reprise de l'historique GitHub, Linear, Notion et sessions, amortie sur 12 mois | -$0.40 |
| Stockage Postgres et pgvector (Supabase) | -$0.09 |
| Recherche et rerank (440 requêtes/mois) | -$1.20 |
| Génération via MCP : payée par l'abonnement LLM du client | -$0.00 |
| Sièges Solo gratuits (1 pour 4 sièges payants, ~2,4 € chacun) | -$0.60 |
| Frais de paiement Stripe (1,5 % + 0,25 € par transaction, plus Billing 0,7 % pour les abonnements, réparti) | -$0.56 |
| Support, onboarding et test des 20 questions (temps fondateur) | -$1.50 |
| Garantie « 15 sur 20 » : 10 % des équipes non facturées le premier mois, réparti | -$0.20 |
| **Contribution** (what each siège-mois leaves to pay the fixed costs) | **$20.13** (81%) |

### The margin that matters

Fixed costs: $6,770 a month (Rémunération minimale des deux fondateurs (hypothèse à corriger) $5,000, Hébergement, base, files, LLM de développement $650, Outils (GitHub, domaine, email, compta, monitoring) $150, Expert-comptable $150, Assurance RC pro et cyber $120, Marketing (LinkedIn, contenu, événements) $500, Sécurité (pentest annuel amorti, outils de sécurité) $200).

- **Break-even: 337 siège-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (500 a day): **26%** of every sale, after every cost.
- Capacity: 800 a day.

### Year 1, month by month

| month | siège-moiss a day | revenue | profit | cumulative (after $5,750 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$6,770 | -$12,520 |
| 2 | 10 | $250 | -$6,569 | -$19,089 |
| 3 | 25 | $625 | -$6,267 | -$25,355 |
| 4 | 45 | $1,125 | -$5,864 | -$31,220 |
| 5 | 70 | $1,750 | -$5,361 | -$36,580 |
| 6 | 100 | $2,500 | -$4,757 | -$41,338 |
| 7 | 140 | $3,500 | -$3,952 | -$45,289 |
| 8 | 185 | $4,625 | -$3,046 | -$48,335 |
| 9 | 235 | $5,875 | -$2,039 | -$50,375 |
| 10 | 290 | $7,250 | -$932 | -$51,307 |
| 11 | 350 | $8,750 | $276 | -$51,032 |
| 12 | 420 | $10,500 | $1,685 | -$49,347 |

- **Year 1 operating profit: -$43,597** on $46,750 of revenue.
- After the $5,750 startup spend: -$49,347.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$51,307**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 26% | 337 | -$43,597 |
| Price -10% | 18% | 385 | -$48,272 |
| Volume -20% | 13% | 337 | -$51,126 |
| Unit costs +15% | 23% | 349 | -$44,963 |

### Red flags

- Year 1 loses money on operations (-$43,597).
- The startup spend is not earned back within year 1.

## Marketing

Rôle : directeur marketing du pack fondateurs. Matière première : `panel/results.md` (100 acheteurs simulés, 19 achats, les « power users IA » à 95 %, tous les autres comportements à 0 %, 60 refus pour « confiance »), `panel-v2/results.md` et `offer.md` §6 (offre recentrée sur les équipes dev : les profils techniques passent de 1/9 à 4/9), `competitors.md` (le trou, la menace), `offer.md` (l'offre empilée, le test des 20 questions, « Équipe fondatrice »), `pricing.md` (25 €, Solo gratuit, 19 € pour 20 équipes jusqu'au 31/01/2027), `numbers.json` et `cfo.md` (20,24 € de contribution par siège-mois, 10 sièges par équipe, seuil 337 sièges), `board.md` (C1 à C10), `pitch.md`, `customer.json`.

Avertissement qui vaut pour tout le document : **les acheteurs du panel sont simulés.** Leurs mots servent à choisir quoi dire et à qui ; ils ne sont jamais cités dans une publicité, et chaque choix ci-dessous est à confirmer avec les cinq équipes pilotes de la condition C3.

### En une page

- **À qui on parle** : les CTO et fondateurs techniques d'équipes de 5 à 30 personnes, en France, qui vivent dans Claude Code ou Cursor. C'est le seul public qui achète dans les deux panels (19/19 acheteurs v1 sont des « power users IA » ; 4 des 5 acheteurs v2 sont techniques).
- **Ce qu'on dit** : Leon est la mémoire des décisions de l'équipe dev. « Pourquoi on a choisi ça » et « comment on avait réglé ce bug », avec la session, la PR ou le ticket en source, ou « je ne sais pas ».
- **Par où** : le Solo gratuit comme produit-canal (un dev l'installe, l'équipe suit), les communautés Claude Code et Cursor plus les annuaires MCP, et un Show HN le jour du lancement. En soutien, non payé : LinkedIn des fondateurs et un meetup à Paris.
- **Ce qu'on ne fait pas** : publicité LinkedIn ou Google, salons, Product Hunt avant d'avoir cinq équipes hors réseau, partenariats écoles.
- **Combien** : 1 500 € de lancement et 500 €/mois, dont 0 € de publicité. CAC cible **1 350 € par équipe** (maximum théorique 4 050 € à 5 % d'attrition, divisé par 3).
- **Quand** : lancement le **mardi 12 janvier 2027** (c'est un mardi, pas un lundi : le lundi est le 11). La date tient si l'immatriculation et le DPA sont prêts le 19 décembre ; sinon, mardi 19 janvier et fin de l'offre fondatrice repoussée au 7 février.

### 1. Ce que les preuves disent

1. **Un seul comportement achète.** Sur 100 cartes v1, les 19 acheteurs sont tous des « power users IA » (19 sur 20, 95 %) ; « déjà équipé », « prudent RGPD », « compte les euros », « sceptique des démos », « demande à son réseau » : 0 %. Le marketing n'a pas à convaincre les six autres comportements, il doit **trouver** les power users et leur rendre l'essai sans risque.
2. **Le recentrage dev fonctionne, et perd le reste.** Mêmes 20 cartes, offre v2 : les profils techniques passent de 1 achat sur 9 à 4 sur 9 (P002, P003, P011, P017), et pour la première fois une « prudente RGPD » (P003) et un « surchargé » (P017) achètent. Les commerciaux et agences repassent de 4 à 1 : *« le produit parle à une équipe de développement ; moi je suis côté commercial »* (P013). C'est le prix d'un marché choisi (C1).
3. **Le refus n'est pas le prix, c'est la confiance.** 60 refus sur 81 en v1. Les acheteurs répondent 5 / 12 / 40 / 60-80 € : 25 € n'est pas un obstacle pour eux (`pricing.md`). Baisser le prix ne convertit personne ; montrer ce que l'agent capte, oui.
4. **Les trois objections qui restent en v2**, dans l'ordre (`offer.md` §6) : « qui voit quoi, par projet ? » (9 cartes sur 20), « mes devs vont y voir un mouchard » (P001, P010, P011, P012, P015), « si personne ne clique, la mémoire reste vide » (P004, P006). Les trois se traitent par du contenu montré, pas par un slogan.
5. **Le trou du marché** (`competitors.md` §5) : dater et attribuer chaque fait sur du brut cité, y compris depuis les conversations IA ; aucun produit à 20 $ ne le vend ; la colonne « conversations IA comme source » est vide chez 27 produits. Mais c'est un trou de produit, pas une douleur exprimée : il se fait désirer par la démo.
6. **Ce qui n'est pas un trou** : « chercher dans tous mes outils depuis mon assistant IA ». C'est inclus chez Claude Team, ChatGPT Business, Copilot, Gemini et Notion à 20-21 $. Si Leon se présente comme ça, il est trop cher de 5 € et meurt comme Dashworks (`board.md`, risque 1).

### 2. Le positionnement

Format : « Pour <segment>, qui <problème dans leurs mots>, Leon est <catégorie> qui <le trou>, contrairement à <l'alternative la plus proche>. »

#### Version A, recommandée : « pourquoi on a fait ce choix »

> **Pour les CTO et fondateurs techniques d'équipes de 5 à 30 personnes qui vivent dans Claude Code ou Cursor, qui passent leurs journées à réexpliquer aux nouveaux pourquoi on a fait tel choix et comment on avait réglé tel bug, Leon est la mémoire des décisions de l'équipe dev qui répond avec la session, la PR ou le ticket en source, ou dit « je ne sais pas », contrairement à la recherche de Claude Team, ChatGPT Business ou Notion, qui retrouve un document mais ne sait ni ce qui a été décidé dans vos sessions IA, ni quand, ni si c'est encore vrai.**

Preuve du panel :
- P011 (CTO, power user, v1 et v2) : *« Je passe mes journées à répéter aux deux nouveaux pourquoi on a fait tel choix et où est tel bug réglé ; si Leon répond à ça depuis Claude Code en citant la PR ou le ticket, ça me rend des heures. »* En v2 : *« Un outil qui répond en citant la PR ou dit « je ne sais pas », avec un test à 20 questions où je ne paie rien si ça rate, je l'installe dès cette semaine en solo gratuit. »*
- P002 (CTO, power user, bascule non → oui en v2) : *« Je passe mes journées à réexpliquer aux deux nouveaux pourquoi on a fait tel choix, et tout ça dort dans mes sessions Claude Code et nos PR. »*
- P099 (CTO, power user, v1) : *« « pourquoi on a choisi Postgres » avec la PR en source, c'est ce que je demande à mon équipe sans jamais l'obtenir. »*
- P043 (CTO, v1) : *« « on a déjà eu ce bug, comment on l'avait réglé ? » avec la PR citée, c'est exactement le trou que j'ai dans l'équipe. »*
- Le « contrairement à » vient de P001 v2, qui refuse justement parce qu'il *« part du principe que la recherche dans [Notion et ChatGPT] finira par faire le travail »* : c'est l'objection que la ligne doit couper, et le conseil (C5) demande de la mesurer sur un jeu de questions fixé.

Pourquoi celle-ci : c'est la raison d'achat des quatre acheteurs techniques v2 et de la majorité des CTO acheteurs v1 ; la question de démo (« pourquoi on a choisi Postgres pour le billing ? ») est celle que le conseil a retenue ; et la catégorie « mémoire des décisions » tient à l'écart du « search » à 20 $.

#### Version B : « quelqu'un est parti avec tout dans la tête »

> Pour les CTO d'équipes de 5 à 30 développeurs qui viennent de perdre quelqu'un avec tout ce qu'il savait dans la tête, Leon est le registre des décisions de l'équipe qui se remplit tout seul depuis Claude Code, Cursor, GitHub et Linear, contrairement au wiki Notion que personne ne met à jour.

Preuve : P003 v2 (*« On vient de perdre quelqu'un avec tout ce qu'il savait dans la tête, donc le problème est concret pour moi cette semaine »*), P017 v2 (*« Je viens de perdre un dev qui avait tout dans la tête »*), P043 v1, P049 v1. Et `competitors.md` thème B (*« shit in, shit out »*, Guru : « keeping content verified »).
Limite : c'est un déclencheur (un départ), pas une douleur quotidienne ; 4 acheteurs sur 24. À garder comme **accroche** (n°6), pas comme positionnement.

#### Version C : « ce que mes agents ont décidé »

> Pour les fondateurs techniques qui passent deux heures par jour dans Claude Code et perdent le fil de ce que leurs agents ont décidé, Leon est la mémoire partagée des décisions des agents de l'équipe, contrairement à la mémoire de Claude ou de ChatGPT, qui reste individuelle et ne remonte rien à l'équipe.

Preuve : P009 v1 et v2 (*« Je perds tous les jours le fil de ce que mes agents ont décidé »*), P073 v1 (*« Une « extension navigateur », ça ne voit pas Claude Code dans mon terminal, là où mes agents prennent vraiment leurs décisions »*), P010, P012, P014 v2 (même phrase, mais refus pour confiance).
Limite : c'est l'angle le plus copiable par Anthropic et OpenAI en une version (`competitors.md` §6), et `competitors.md` note qu'aucun client de concurrent ne le réclame. À garder comme accroche (n°10) et comme démo, pas comme ligne de positionnement.

**Décision : A.** B et C deviennent des accroches de A.

### 3. Les canaux

Le premier public : CTO et fondateurs techniques « power users IA », 5 à 30 personnes, France. Coûts marqués [E] : estimation à vérifier par devis ; aucun tarif de newsletter ni de lieu n'a été demandé à ce jour.

| canal | pourquoi ça colle à cet acheteur | coût approximatif | on saura que ça marche si |
|---|---|---|---|
| **Solo gratuit + annuaires MCP** (registre MCP officiel, annuaire de connecteurs de Claude, `cursor.directory`, Smithery, Glama, PulseMCP ; noms à revérifier au lancement, ces annuaires bougent) | Le power user *« essaie chaque nouvel outil »* (`customer.json`) et cherche ses serveurs MCP là. L'acheteur v2 veut *« commencer par la version solo gratuite »* (P010, P012, P014) : le Solo est le canal, pas une remise. « Un dev l'installe, l'équipe suit » répond à l'objection « mouchard » : déploiement à l'initiative de chaque dev, pas imposé par le CTO (`offer.md` §6). | 0 € en argent ; ~2,4 €/mois par Solo actif, déjà dans `numbers.json` (0,60 € par siège payant) | Solo actifs par semaine (≥ 1 question via MCP) ; part des Solo qui invitent ≥ 2 collègues sous 30 jours (cible 10 %) |
| **Communautés Claude Code et Cursor** (Discord Claude Developers, r/ClaudeAI, r/ClaudeCode, forum Cursor, X) | C'est là que le power user passe son attention et pose ses questions sur la mémoire de ses agents. Règle : on répond, on montre, on ne spamme pas ; une publication par communauté au lancement, en respectant les règles d'auto-promotion de chacune. | 0 € ; 3 à 5 h de fondateur par semaine | Installations Solo attribuées (lien avec paramètre par communauté) ; au moins un fil où quelqu'un d'autre que nous recommande Leon |
| **Show HN** (une fois, J0) | Les CTO français lisent HN ; les fils HN sur Glean et ChatGPT company knowledge (`competitors.md` §4) montrent que l'audience a exactement nos objections (scoping, « confidently wrong »). Un Show HN honnête avec des mesures, c'est notre genre. | 0 € ; une journée des deux fondateurs à répondre | ≥ 50 points et des questions techniques de fond ; installations Solo dans les 48 h ; au-dessous de 10 points, pas grave, c'est un coup de dé |
| **LinkedIn, organique seulement** (profils des fondateurs) | Les CTO y sont, mais passifs. Sert aux coulisses (le test des 20 questions, le coût par siège) et à la preuve de sérieux pour le « prudent RGPD ». | 0 € | Demandes de démo ou d'intro depuis LinkedIn ; faible attente |
| **Newsletters dev françaises** (candidats : Human Coders News, la communauté Tech.Rocks de CTO, le Journal du Hacker en soumission gratuite ; à vérifier) | Le seul canal payant qui touche des CTO *français* sans algorithme ; répond à « personne de mon réseau ne l'utilise » en apparaissant là où ses pairs lisent. Toujours annoncé comme sponsorisé. | 200 à 600 € l'insertion [E] ; soumission gratuite au Journal du Hacker | Installations Solo attribuées dans les 7 jours ≥ 10 par insertion, sinon on arrête |
| **Meetups à Paris** (soirées Claude Code / Cursor / IA engineering, Tech.Rocks ; en hôte ou en intervenant) | Le « demande à son réseau » (10 % du panel, 0 % d'achat) ne bascule que sur *« un CTO que je connais qui l'a fait tourner trois mois »* (P012 v2). Un meetup fabrique ces rencontres ; on y fait le test des 20 questions en direct sur notre propre repo. | 0 à 300 € (lieu prêté, pizzas) [E] | 3 à 5 CTO qui installent le Solo le soir même ; une équipe pilote hors réseau par meetup |
| **Product Hunt** | Audience large, anglophone, orientée « makers » ; les acheteurs « demande à son réseau » ne lisent pas les badges. Sans preuve d'usage, on attire des touristes. | 0 € | Reporté : après cinq équipes hors réseau (C3) |
| **Partenariats agences dev et écoles** | Les agences vendent du temps, pas des outils ; les étudiants n'achètent pas. Un accord payé devrait être annoncé et coûterait plus que le CAC cible. | temps + commission | Pas maintenant ; à rouvrir si une agence pilote le demande |

#### Ce qu'on choisit pour démarrer

1. **Le Solo gratuit et les annuaires MCP** : le produit est le canal. Tout le reste y renvoie.
2. **Les communautés Claude Code et Cursor, plus le Show HN le jour J** : c'est là que les power users sont, et ça ne coûte que du temps.
3. **Un meetup à Paris à J+9 et une insertion dans une newsletter dev française** : la seule part payée, pour la dimension française et l'objection « un pair de mon réseau ».

LinkedIn organique accompagne, sans budget.

#### Ce qu'on ne fait pas, et pourquoi

- **Publicité LinkedIn ou Google.** Un clic LinkedIn B2B coûte plusieurs euros ; à 1 350 € de CAC cible et 500 €/mois, ça finance une poignée de visites par mois vers un public qui n'achète pas sans essai. Le panel dit que le refus est la confiance, pas la notoriété.
- **Salons** (Viva Technology, salons RH ou SaaS). Billets et stand dépassent le budget annuel pour un public « dirigeant PME » qui refuse à 0 % hors power users.
- **Product Hunt avant la preuve d'usage.** Voir le tableau.
- **Influenceurs payés et « vu dans ».** Interdits par nos règles ; et le « prudent RGPD » y voit un signal négatif.
- **Le test A/B 19 € contre 29 € de `pricing.md` pendant le lancement public.** Afficher 29 € à certains visiteurs pendant qu'on publie partout « 19 € pour les 20 premières équipes » serait vécu comme un piège. Le test se fait après le 31 janvier, sur le prix de liste (25 contre 29 €), à l'abri de l'offre fondatrice.

### 4. Le calendrier, de J−14 à J+16

Date cible : **mardi 12 janvier 2027** (J0). Les 14 jours d'avant tombent sur les fêtes (J−14 = mardi 29 décembre) : la première semaine est de la préparation silencieuse, la seconde (à partir du lundi 4 janvier, premier jour de rentrée) est la seule qui a un public. Le 12 janvier est tenable à deux conditions : société immatriculée et DPA relu par l'avocat **avant le vendredi 19 décembre** (les avocats ferment entre Noël et le jour de l'an), et page sécurité en ligne à J−7. Si l'une manque, **lancer le mardi 19 janvier** et repousser la fin de l'offre fondatrice au dimanche 7 février ; chaque ligne ci-dessous glisse alors de sept jours. Un mardi vaut mieux qu'un lundi pour le Show HN (publier vers 15 h de Paris, 9 h sur la côte est). L'offre fondatrice ferme le dimanche 31 janvier, soit J+19 : il y a 19 jours pour la vendre.

Les textes entre guillemets sont des messages prêts à publier ; « (a) » renvoie aux accroches de la section 5.

| jour | date | canal | ce qui part | message |
|---|---|---|---|---|
| J−14 | mar. 29/12 | interne | Gel du contenu : page d'accueil, page sécurité, page « ce que l'agent capte et ne capte pas », page « export et fermeture », formulaire du test des 20 questions. Relecture avocat des mentions de garantie. | – |
| J−13 | mer. 30/12 | interne | Enregistrement de la démo de 90 s : « pourquoi on a choisi Postgres pour le billing ? » sur le repo de Leon, avec la session citée, puis une question sans réponse où Leon dit « je ne sais pas ». Une prise, sans musique. | (a2) en ouverture |
| J−12 | jeu. 31/12 | interne | Le test des 20 questions sur notre propre repo : on écrit les 20 questions, on mesure, on garde le chiffre quel qu'il soit. Mesure aussi du taux de citations inventées côté LLM client (C5) et du temps d'installation chrono en main (C4). | – |
| J−11 à J−9 | ven. 1er → dim. 3/01 | rien | Fêtes. Préparer les textes des annuaires MCP et le brouillon du Show HN (texte, captures, FAQ des objections). | – |
| J−8 | lun. 4/01 | LinkedIn (David), X | Rentrée. Premier billet de coulisses : « On a passé le test des 20 questions sur notre propre repo. Score : N/20. Voici les 5 qu'on a ratées et pourquoi. » Lien vers une liste d'attente Solo (adresse e-mail, rien d'autre). | (a5) |
| J−7 | mar. 5/01 | annuaires MCP | Soumission du serveur MCP de Leon aux annuaires (registre officiel, Claude, cursor.directory, Smithery, Glama, PulseMCP). Fiche : une phrase de positionnement A, la démo, le lien Solo. Les délais de validation prennent souvent plusieurs jours, d'où J−7. | « Leon : la mémoire des décisions de votre équipe dev, lue depuis Claude Code ou Cursor. Cite la session, la PR ou le ticket, ou dit « je ne sais pas ». Solo gratuit. » |
| J−6 | mer. 6/01 | LinkedIn (Amos), X | Coulisses n°2 : « Ce que l'agent Leon lit sur votre poste, et ce qu'il n'envoie jamais. » La page telle qu'on la donne à un CSE, avec le trafic réseau visible. | (a4) |
| J−5 | jeu. 7/01 | e-mail à la liste d'attente ; réseau direct des fondateurs | Mail court aux inscrits et aux 20 à 30 CTO du réseau : « Leon ouvre le 12. Si vous voulez être dans les 20 équipes fondatrices (19 € garanti 12 mois, jusqu'au 31 janvier), répondez à ce mail, on fait le test des 20 questions avec vous. » Pas de compte à rebours, pas de compteur. | offre fondatrice |
| J−4 | ven. 8/01 | newsletter dev française | Dernier délai pour réserver l'insertion de la semaine du 19 (sponsorisée, marquée comme telle). Texte : positionnement A + Solo gratuit + « 20 équipes jusqu'au 31/01 ». | (a1) |
| J−3, J−2 | sam. 9, dim. 10/01 | rien | Répétition du Show HN à deux : chacun joue un commentateur hostile de `competitors.md` §4 (scoping, « confidently wrong », « fishing expedition for data »). | – |
| J−1 | lun. 11/01 | interne | Vérification : Solo installable en moins de dix minutes sur un poste neuf (C4), pages en ligne, DPA téléchargeable, Stripe en mode réel, page d'état. Rien ne part. | – |
| **J0** | **mar. 12/01** | **Show HN (15 h), Discord Claude Developers, forum Cursor, r/ClaudeAI, r/ClaudeCode, X, LinkedIn** | Lancement. Show HN le matin côté US ; les communautés dans la foulée, une publication par lieu, adaptée aux règles de chacun ; LinkedIn en fin de journée avec la démo. Les deux fondateurs répondent à tout jusqu'au soir. | (a3) pour HN ; (a1) pour les communautés |
| J+1 | mer. 13/01 | HN, communautés | Réponses, encore. Si un fil HN pose la question du scoping ou des citations inventées, on y répond avec le chiffre mesuré à J−12. Publication des réponses longues sur le site sous « Questions qu'on nous a posées le jour du lancement ». | – |
| J+2 | jeu. 14/01 | LinkedIn, X | Coulisses n°3 : « 25 € par siège : ce que ça coûte à faire tourner, ligne par ligne », d'après `numbers.json`. | (a7) |
| J+3 | ven. 15/01 | e-mail aux Solo installés depuis J0 | Mail de J+3 : « Trois questions à poser à Leon aujourd'hui » (pourquoi ce choix ; ce bug déjà vu ; ce qui a été décidé pendant mon absence). Rappel du bouton « inviter l'équipe ». | – |
| J+4, J+5 | sam. 16, dim. 17/01 | rien | Lecture des chiffres de la première semaine (section 7). | – |
| J+6 | lun. 18/01 | LinkedIn, X, blog | Coulisses n°4 : « Première semaine : N installations Solo, M équipes en test des 20 questions, et les 3 questions qu'on nous a le plus posées. » Chiffres vrais, même petits. | (a9) si la question de la fermeture est revenue |
| J+7 | mar. 19/01 | newsletter dev française | Parution de l'insertion sponsorisée. | (a1) |
| J+8 | mer. 20/01 | e-mail aux Solo actifs | « Comment le test des 20 questions se passe chez vous : on le fait avec vous en 30 minutes, prenez un créneau. » Lien d'agenda, pas de relance automatique. | offre fondatrice |
| J+9 | jeu. 21/01 | meetup à Paris | Soirée (hôte ou intervenant dans un meetup Claude Code / Cursor / IA engineering existant, ou la nôtre si aucun n'a de créneau). Format : le test des 20 questions en direct sur le repo de Leon, puis sur le repo d'un volontaire qui a installé le Solo. Pizzas, pas de goodies. | (a2) en ouverture, (a8) en démo |
| J+10 | ven. 22/01 | LinkedIn, X | Compte rendu du meetup : ce que Leon a raté en direct, ce qu'on corrige. Photos avec accord des personnes. | – |
| J+11, J+12 | sam. 23, dim. 24/01 | rien | – | – |
| J+13 | lun. 25/01 | e-mail à la liste, LinkedIn, communautés (une seule mention, en réponse dans les fils existants) | « L'offre Équipe fondatrice ferme dimanche. Il reste K places sur 20. » K est le vrai chiffre, publié tel quel, y compris s'il est 17. | offre fondatrice |
| J+14 | mar. 26/01 | LinkedIn, X | Coulisses n°5 : « Part des décisions proposées que les auteurs valident » (objection n°3 de la v2), mesurée sur les équipes en test, anonymisée et avec leur accord. | – |
| J+15 | mer. 27/01 | e-mail aux Solo actifs non convertis | Dernier mail avant la fermeture : « Si le test des 20 questions vous tente, mercredi et jeudi on a encore des créneaux. » Puis plus rien sur l'offre. | offre fondatrice |
| J+16 | jeu. 28/01 | interne, puis LinkedIn | Bilan à 16 jours contre les trois chiffres de la section 7 ; décision « on continue / on change » ; publication du bilan en coulisses n°6 à J+20. | – |

Après J+19 (dimanche 31 janvier) : l'offre ferme, le prix passe à 25 € pour toute nouvelle équipe, **sans prolongation**. Prolonger tuerait la seule rareté vraie qu'on ait.

### 5. Dix accroches

Chacune répond à une objection du panel ou reprend une raison d'achat. Format indiqué : ligne d'ouverture de 3 secondes pour une vidéo (V), titre pour un billet ou une publication (T), première phrase d'un Show HN (HN).

1. **(T) « "Pourquoi on a choisi Postgres pour le billing ?" La réponse était dans une session Claude Code de mars. »** Raison d'achat P011, P002, P099 : réexpliquer aux nouveaux. C'est l'accroche par défaut des communautés et de la newsletter.
2. **(V) « Voici Leon qui répond "je ne sais pas". C'est la fonction dont on est le plus fiers. »** Objection « ça affirme avec assurance » (P005, P039, P047, P069 ; thème A de `competitors.md`, « confidently wrong »). Ouverture de la démo et du meetup.
3. **(HN) « Show HN: Leon – a decision memory for dev teams that cites the Claude Code session or PR, or says "I don't know". »** Puis, deuxième phrase : « We ran our own 20-question test on Leon's repo: N/20, here is what it missed. » N est le chiffre mesuré à J−12. Objections « deux personnes sans structure » et « démo brillante » : on ouvre par une mesure, pas par une promesse.
4. **(T) « Ce que l'agent Leon lit sur votre poste, et ce qu'il n'envoie jamais : la page qu'on donne au CSE. »** Objection n°2 de la v2 : *« mes devs vont d'abord y voir un mouchard »* (P011), *« une page claire sur ce que l'agent local capte et ne capte pas, que je puisse donner telle quelle aux devs et au CSE »* (P010).
5. **(T) « On a posé nos 20 questions à Claude Team, à Notion AI et à Leon sur notre propre repo. Voici les scores, et là où on a perdu. »** Objection « c'est déjà inclus pour 20 € » (20 cartes « déjà équipé », 0 % ; P001, P034). Condition C5 du conseil. À publier avec les scores réels, même si Leon perd une colonne.
6. **(V) « Un dev part. Que reste-t-il de ce qu'il savait ? »** Raison d'achat P003, P017, P043, P049 ; version B du positionnement.
7. **(T) « 25 € par siège : ce que ça coûte à faire tourner, ligne par ligne. »** Objection « pour quel gain mesurable ? » (P021, P026, P019). On ne promet pas d'heures gagnées tant qu'elles ne sont pas mesurées ; on montre où va l'argent (embeddings 0,04 €, étiquetage 0,28 €, recherche 1,20 €, support 1,50 €, d'après `numbers.json`). Le seul chiffre externe autorisé : « 61 % des développeurs passent plus de 30 minutes par jour à chercher des réponses » (Stack Overflow Developer Survey 2024, lien à mettre en note et formulation exacte à revérifier sur la page de l'enquête avant publication).
8. **(V) « Créez un accès pour un stagiaire. Vérifiez vous-même qu'il ne voit que son projet. »** Objection n°1 de la v2 : *« qui voit quoi une fois la décision remontée »* (P007, P008, P013, P014, P017, P018, P019) ; *« je ne crois pas sur parole au "chacun ne voit que ce à quoi il a accès" tant que je ne l'ai pas testé avec un stagiaire »* (P078). Ne se publie que lorsque les espaces par projet sont livrés (`offer.md` §6 : à ajouter avant tout lancement).
9. **(T) « Si Leon ferme, vous repartez avec tout : l'export, son format, et ce qu'on supprime sous 30 jours. »** Objection « et si la startup disparaît dans six mois » (P003, P020, P022, P082, P088, P093). Avec un vrai fichier d'export en exemple.
10. **(V) « Combien de décisions vos agents ont prises aujourd'hui sans vous ? »** Raison d'achat P009, P073 ; version C. Suivie de la démo « qu'est-ce qui a été décidé sur le projet Search pendant mes congés ? » (`pitch.md`).

Et l'offre, qui n'est pas une accroche mais une phrase fixe : **« 20 équipes fondatrices à 19 € HT par siège, garanti 12 mois, jusqu'au 31 janvier 2027. Pourquoi 20 : parce qu'on fait le test des 20 questions avec chacune, et qu'à deux on ne peut pas en accompagner plus. »** C'est vrai (`offer.md` §4), c'est la seule raison qu'on donne, et on publie le nombre réel de places restantes.

### 6. Quand il n'y a rien de neuf : les coulisses

Un rythme d'une publication par semaine, en alternant les deux fondateurs. Chaque sujet est une mesure, publiée bonne ou mauvaise, parce que c'est précisément ce que le « sceptique des démos IA » (15 % du panel, 0 % d'achat) et le conseil (« aucune preuve ») reprochent.

1. **Le test des 20 questions sur le repo de Leon lui-même**, refait chaque mois avec le même jeu de questions : le score, les questions ratées, la cause (source absente, citation fausse, décision périmée non signalée).
2. **Le taux de citations inventées** côté LLM client (C5) : sur 100 réponses lues depuis Claude et Cursor, combien citent une source qui n'existe pas ou qui ne dit pas ça. Méthode et chiffre.
3. **Le coût par siège**, mis à jour avec les coûts réels (`numbers.json` contre les factures Supabase, Voyage, Anthropic) ; quand le coût réel diverge de l'estimation, on le dit.
4. **Le temps jusqu'à la première réponse citée** sur un poste neuf, chrono en main (C4), et la part des devs d'une équipe qui finissent l'installation.
5. **La part des décisions proposées que les auteurs valident** (objection « si personne ne clique »), anonymisée, avec l'accord des équipes.
6. **Ce que Leon ne fait pas** : Slack, Gmail, Drive, les réunions. Une page tenue à jour « demandé par N équipes payantes », pour que les non-dev sachent qu'on les a entendus sans qu'on ré-élargisse l'offre (`offer.md` §6, point 4).
7. **Les fils HN et Reddit des concurrents** (`competitors.md` §4) commentés sans les nommer en mal : « voici comment on traite le scoping », avec la démo.

Ce qu'on ne publie pas : des « témoignages » tirés du panel (c'est de la recherche), des compteurs d'utilisateurs arrondis, des « vu dans », des gains d'heures non mesurés.

### 7. Budget, CAC et les trois chiffres

#### Répartition du budget

**Lancement, 1 500 €** (`numbers.json`, « Publicités et outils de lancement ») :

| poste | montant | note |
|---|---:|---|
| Insertion sponsorisée dans une newsletter dev française, annoncée comme telle | 500 € [E] | une seule ; la deuxième se décide au résultat |
| Meetup à Paris (lieu prêté, boissons, pizzas pour 30 à 40 personnes) | 300 € [E] | 0 € si on intervient dans un meetup existant |
| Démo vidéo (licence d'enregistrement d'écran, micro) | 150 € | une prise, pas de montage payé |
| Pages de lancement, mesure d'audience sans cookies, e-mail transactionnel, lien d'agenda | 150 € | le site lui-même est déjà dans « Site et pages de test » (500 €) |
| Réserve | 400 € | deuxième insertion newsletter si la première amène ≥ 10 Solo actifs ; sinon rendu au trésor |
| Publicité LinkedIn, Google, influenceurs, salons | 0 € | voir §3 |

**Mensuel, 500 €** (`numbers.json`, « Marketing ») :

| poste | montant |
|---|---:|
| Outils (mesure d'audience, e-mail, enregistrement, lien d'agenda) | 100 € |
| Meetups et déplacements (une soirée par mois, Paris, puis Lyon ou Nantes) | 150 € |
| Provision newsletter (une insertion tous les deux mois, si le seuil des 10 Solo tient) | 250 € |
| Publicité | 0 € |

Le temps des fondateurs n'est pas dans ces 500 € : le CFO compte déjà 1,50 € par siège de support ; le temps de marketing (estimation : 2 jours par semaine à deux pendant le lancement, puis 1 jour) est à valoriser à 30 €/h (`cfo-sources.md`) dans le CAC chargé ci-dessous.

#### Le maximum qu'on peut payer pour gagner une équipe

Données du CFO : contribution **20,24 €** par siège-mois, **10 sièges** par équipe en moyenne, attrition de **3 à 5 %** par mois.

1. Contribution par équipe et par mois : 20,24 € × 10 = **202,40 €**.
2. Durée de vie moyenne d'une équipe : 1 / attrition = **33,3 mois** à 3 %, **20 mois** à 5 %.
3. Contribution sur la vie de l'équipe (le maximum théorique, celui où on ne gagne rien) : 202,40 € × 20 = **4 048 €** à 5 % ; 202,40 € × 33,3 = **6 747 €** à 3 %.
4. **Cible de CAC = maximum ÷ 3 : 1 350 €** à 5 % d'attrition, 2 250 € à 3 %. On pilote sur le chiffre prudent : **1 350 € par équipe**.
5. Vérification contre C9 (remboursement sous 12 mois) : la contribution cumulée des 12 premiers mois, attrition comprise, est de 202,40 × (1 − 0,95¹²) / 0,05 = **1 861 €** à 5 % (2 066 € à 3 %). Un CAC de 1 350 € se rembourse en moins de 12 mois dans les deux cas ; un CAC de 3 000 € (scénario pessimiste de `board.md`) ne se rembourse pas.
6. Cas des 20 équipes fondatrices : à 19 € le siège pendant 12 mois, la contribution tombe à 14,24 € par siège (`cfo.md` : « chaque siège à 19 € au lieu de 25 coûte 6 € »), soit 142,40 € par équipe et par mois la première année ; la vie d'une équipe fondatrice vaut 4 048 − 720 = **3 328 €** à 5 %, et la cible de CAC devient **1 110 €**. Les 6 € de remise sont donc bien un coût d'acquisition : 720 € par équipe sur 12 mois, à compter dans le CAC de ces 20 équipes.

Ce que ça dit du budget : 2 000 € sur le mois de lancement à 1 350 € de CAC, c'est 1,5 équipe par de l'argent. Le plan ne peut donc pas acheter des équipes ; il achète de la portée pour le Solo gratuit, et les équipes viennent du produit (« un dev l'installe, l'équipe suit ») et des pairs. C'est cohérent avec le panel : l'acheteur veut essayer seul avant de payer.

#### Les trois chiffres à suivre chaque semaine

Lus le lundi matin, à deux, écrits dans un fichier daté. Les niveaux viennent de la rampe du CFO (10 sièges au mois 2, 25 au mois 3) et de la condition C3 (5 équipes hors réseau en 8 semaines) : 5 équipes à 10 % de passage Solo → équipe demandent ~50 Solo actifs, soit **15 par semaine** sur la fenêtre de lancement.

| chiffre | définition | cible | niveau « changer quelque chose » | ce qu'on change |
|---|---|---:|---|---|
| **Solo actifs** | installations Solo qui ont posé ≥ 1 question via MCP dans les 7 derniers jours, par canal d'origine | 15 nouveaux par semaine dès J+7 | < 5 deux semaines de suite | le message ou le canal ne porte pas : passer de l'accroche 1 à la 2 ou la 4, ou déplacer l'effort vers le canal qui a le meilleur ratio installations / heures passées |
| **Passage Solo → équipe** | part des Solo actifs qui lancent le test des 20 questions avec ≥ 3 sièges sous 30 jours | 10 % | < 3 % à J+30 | ce n'est plus du marketing : l'objection « qui voit quoi » ou « mouchard » bloque dans le produit ; appeler 5 Solo actifs qui n'ont pas invité leur équipe et noter leurs mots |
| **CAC réel** | (dépenses marketing + heures fondateurs × 30 €) ÷ équipes facturées (test réussi à J+30), cumulé | ≤ 1 350 € | > 2 000 € fin mars 2027 | couper tout euro payé (newsletter, meetup payant) ; ne garder que le Solo, les communautés et les coulisses ; revoir la rampe avec le CFO |

Garde-fou, à côté des trois : le **score du test des 20 questions** par équipe. En dessous de 15/20 chez plus d'une équipe sur dix, la garantie coûte plus que les 0,20 € par siège modélisés et le marketing doit se taire jusqu'à ce que le produit tienne sa promesse.

### 8. Les règles qu'on se donne

- Pas de faux avis, pas de faux compteurs, pas de « vu dans ». Le nombre de places restantes de l'offre fondatrice est le vrai, publié même s'il est peu flatteur.
- Les citations du panel sont de la recherche ; elles n'apparaissent dans aucune publicité, aucune page de vente, aucune vidéo. Quand une équipe pilote réelle accepte d'être citée, c'est nommé, daté et relu par elle.
- Les insertions payées (newsletter, meetup sponsorisé) sont marquées comme telles.
- Aucune allégation non mesurée : pas de « gagnez 2 h par semaine » tant que ce n'est pas mesuré chez des équipes réelles ; le seul chiffre externe est celui de Stack Overflow 2024, cité avec sa source. Les chiffres de coulisses sont publiés bons ou mauvais.
- Les mentions de garantie, de données et de suppression sont relues par l'avocat avant J−14 (`offer.md`, règles). Ce document n'est pas un avis juridique.

### Limites

Acheteurs simulés, 100 puis 20 cartes : le signal porte sur la direction et les objections, pas sur les taux. Aucun tarif de newsletter ni de lieu n'a été demandé ; les montants [E] sont à remplacer par des devis avant J−14. Les noms d'annuaires MCP et de communautés sont ceux connus au 18 octobre 2026 ; à revérifier en décembre. La date du 12 janvier dépend de `launch.md` (immatriculation, DPA), écrit en parallèle : si `launch.md` retient une autre date, le calendrier glisse d'autant et la fin de l'offre fondatrice avec lui.

## Brand

Rôle : designer de marque du pack fondateurs. Matière première : `idea.md`, `pitch.md`, `offer.md` (l'offre v2 : « la mémoire des décisions de votre équipe dev », capture Claude Code/Cursor, test des 20 questions, pack confiance), `competitors.md`, `panel/results.md` et `panel-v2/results.md`, `board.md` (section « La version la plus forte »). `marketing.md` n'existait pas au moment d'écrire ; je suis parti de `board.md` et de `offer.md` section 4.

**Ce que ce document est, et n'est pas.** Toutes les vérifications ci-dessous sont des recherches publiques faites le 18 octobre 2026 (WHOIS, DNS, registre npm, API GitHub, Product Hunt, recherche web). Je n'ai pas pu interroger les bases de marques : `data.inpi.fr` renvoie 403 à un robot et `euipo.europa.eu/eSearch` exige JavaScript. Je n'ai donc **vérifié aucune marque déposée**. Ce n'est pas un avis juridique : un conseil en propriété industrielle confirme, et rien n'est protégé tant que rien n'est déposé. Un nom « libre » ici veut dire « je n'ai rien trouvé », pas « disponible ».

### 1. Ce que le nom doit porter

Trois choses, dans l'ordre, tirées des panels et du conseil :

1. **« Pourquoi on a fait ce choix »**, **« on a déjà eu ce bug »** : la raison derrière la décision, pas la recherche de documents (le bas droit de la carte de `competitors.md` est plein ; le nom ne doit pas sonner « recherche d'entreprise »).
2. **La source exacte, ou « je ne sais pas »** : la citation, jamais l'invention. C'est ce que Guru a pris pour accroche (« confidently wrong AI ») et ce que les acheteurs du panel demandent (P042, P051, P056, P069).
3. **Pas un mouchard** : 60 refus sur 100 pour « confiance » en v1 ; en v2, « un agent sur chaque poste, mes devs vont y voir un mouchard » (P001, P010, P011, P012, P015). Le nom ne doit évoquer ni l'œil, ni l'oreille, ni la surveillance, ni le « cerveau » de l'IA.

À éviter aussi : tout ce qui ressemble aux concurrents de `competitors.md` (Glean, Dust, Sentra, Granola, Unblocked, Onyx, Guru, Dash, memory.store, Qontext, Hymalaia, Context Link, Engram, Supermemory, Mem0), c'est-à-dire le champ « mémoire/memory/mem », les mots « context », « knowledge », « search », et les noms en « -ai » ou « -gram ».

### 2. Dix candidats

Pour chacun : ce qu'il dit ; à l'oral en français et en anglais ; sur une icône de 32 px ; dans un terminal (`<nom> login`) et comme nom de serveur MCP ; le risque. Les vérifications sont celles du 18/10 ; « NS » veut dire que le domaine a des serveurs de noms (il est pris) ; « aucun NS » veut dire qu'il n'en a pas (peut-être libre, à confirmer chez un registrar).

#### 2.1 Leon (prénom, nom de travail)

- **Dit** : un collègue de confiance, un ancien qui se souvient. Chaleureux, français.
- **Oral** : « Léon » en français, « Lee-on » en anglais ; deux prononciations, deux graphies (Leon/Léon).
- **Icône 32 px** : un « L » ; rien de distinctif.
- **Terminal / MCP** : `leon login`, serveur `leon`. Court, agréable.
- **Risque, élevé** :
  - **Leon AI**, assistant personnel open source d'un développeur français, 17 000 étoiles GitHub, org `leon-ai`, site getleon.ai, paquet npm `@leon-ai/cli`, et surtout positionné « tools, context, memory, agentic execution » ([github.com/leon-ai/leon](https://github.com/leon-ai/leon), [getleon.ai](https://getleon.ai/)). Même public (développeurs), même champ (mémoire, agents), même pays. Un serveur MCP nommé `leon` sera pris pour le leur.
  - **Prénom** : 8e prénom masculin en France en 2025, 2 835 naissances, +40 % en cinq ans ([INSEE](https://www.insee.fr/fr/statistiques/8595099?sommaire=8595113), [prenoms.top](https://prenoms.top/garcon/L%C3%A9on.php)). Très bien pour l'affect, très mal pour la recherche web et le référencement.
  - **Domaines** : leon.com, leon.fr, leon.dev pris (NS actifs) ; leon.ai parqué à la vente chez Afternic.
  - **Identifiants** : npm `leon` pris (un sérialiseur JS), GitHub `leon` pris (utilisateur), Product Hunt `leon` pris. X et LinkedIn non vérifiables sans compte.
  - Marques : « LEON » existe dans beaucoup de classes (restauration, mobilier, mode) ; en classes 9 et 42, non vérifié.
- **Verdict** : **pas tenable comme marque publique** d'un outil pour développeurs. Tenable comme nom de code interne, et c'est tout. Le changement est bon marché aujourd'hui (le mot n'apparaît que dans `(auth)/layout.tsx` et les docs) ; il coûtera cher dans six mois.

#### 2.2 Marcel (prénom, alternative)

- **Dit** : même registre que Leon, un cran plus « bistrot ».
- **Oral** : identique dans les deux langues, c'est son seul avantage.
- **Icône** : un « M ».
- **Terminal / MCP** : `marcel login` ; bien.
- **Risque, rédhibitoire** : **Marcel est le nom de la plateforme IA de connaissance interne de Publicis Groupe** (100 000 salariés, graphe de connaissance Microsoft, application iOS/Android « Publicis Marcel ») ([Publicis](https://www.publicisgroupe.com/en/news/press-releases/publicis-groupe-unveils-marcel), [App Store](https://apps.apple.com/us/app/publicis-marcel/id1399650746)). C'est exactement notre catégorie, avec marcel.ai chez Publicis (NS `publicisgroupe.com`). Marcel est aussi une application VTC du groupe Renault ([App Store](https://apps.apple.com/ag/app/marcel-chauffeur-privé-vtc/id803227884)). marcel.com, .fr, .dev pris ; npm `marcel` pris (générateur de sites).
- **Verdict** : non.

Note sur la famille « prénom » : Alan, Marcel, Hector, Gaston, Rosalie… la mode des prénoms français en startup est saturée depuis 2020, les bons sont pris, et un prénom ne dit rien du produit à un CTO qui lit une config MCP. Je n'en propose pas d'autre.

#### 2.3 Pourquoi (descriptif)

- **Dit** : la question de la démo, mot pour mot (« pourquoi on a choisi Postgres pour le billing ? »). Le produit répond à « pourquoi », pas à « où est le document ».
- **Oral** : évident en français ; en anglais, « pourquoi » est dans les dictionnaires et se dit « poor-KWAH », tout le monde le reconnaît. Huit lettres, c'est long mais ça se tape.
- **Icône** : un « P » ou un point d'interrogation ; le « ? » est générique, il faudra autre chose (voir le brief du logo).
- **Terminal / MCP** : `pourquoi login`, serveur `pourquoi`. Un dev tape `pourquoi` et sourit. Dans un fichier de config MCP en anglais, c'est lisible et sans accent.
- **Risque, moyen** :
  - Mot courant : marque peu distinctive si l'INPI la juge descriptive d'un service d'information ; pour un logiciel elle reste déposable, mais la protection sera étroite. À demander au conseil.
  - pourquoi.fr est un site de vulgarisation (« Parce que tout s'explique ») ; pourquoi.com un site anglophone de développement personnel ; pourquoi.ai parqué à la vente ; pourquoi.app et .eu pris. **pourquoi.dev, .io, .so, .team, .tools : aucun NS.**
  - npm `pourquoi` : libre (404). GitHub org `pourquoi` : libre ; l'utilisateur `pourquoi` est pris. Product Hunt : libre. LinkedIn `/company/pourquoi` existe (200), à regarder.
  - Peut paraître enfantin (« l'âge du pourquoi ») à certains acheteurs ; à tester sur cinq CTO.

#### 2.4 Filrouge (évocateur)

- **Dit** : « je perds le fil de ce que mes agents décident » est la phrase exacte de l'acheteur P055 ; le fil rouge, c'est la ligne qui tient un projet d'un bout à l'autre.
- **Oral** : « fil rouge » en français ; en anglais « feel-ROOZH », expression connue des designers et des gens de marque, inconnue des autres.
- **Icône** : un trait rouge continu ; mais notre accent n'est pas rouge (voir §5), donc l'icône mentirait ou imposerait le rouge.
- **Terminal / MCP** : `filrouge login`, serveur `filrouge` ; deux mots collés, on hésitera entre `filrouge`, `fil-rouge`, `fil_rouge`.
- **Risque, élevé** : « Fil Rouge » est un nom d'agence très répandu en France ; filrouge.com et .fr appartiennent à Altavia Fil Rouge (merchandising), filrouge.ai et .app pris ; seuls .dev, .io, .so, .team, .tools sont sans NS. npm libre, GitHub org libre, Product Hunt libre, LinkedIn `/company/filrouge` existe. La classe 35 sera encombrée.
- **Verdict** : beau, mais trop partagé.

#### 2.5 Parce (inventé)

- **Dit** : « parce que » coupé net : la réponse commence par « parce que ». En anglais, ça se lit « parse », mot de développeur.
- **Oral** : « parss » en français, « parse » en anglais : même son, ce qui est rare.
- **Icône** : un « P » ; ou « parce » en minuscules en Plex Mono, ça tient en 32 px.
- **Terminal / MCP** : `parce login`, serveur `parce` ; cinq lettres, très bon.
- **Risque, moyen à élevé** : paquet npm `parce` pris (déprécié, mais le nom est bloqué) ; org GitHub `PARCE` prise depuis 2013 (parce.tv) ; parce.co est une agence web à New York ; « PARCE Mobile » est une application de productivité d'équipe sortie en 2025 ([App Store](https://apps.apple.com/us/app/parce-mobile/id6747766143)) ; Parce GmbH, domotique à Munich. parce.com, .fr, .ai, .dev tous pris. En Colombie, « parce » veut dire « pote », ce qui est plutôt sympathique.
- **Verdict** : bon son, identifiants bouchés.

#### 2.6 Greffe (lieu, institution)

- **Dit** : le greffe est l'endroit où le tribunal conserve ses décisions et où l'on vient chercher l'acte original. Exactement notre fonction, en un mot que tout dirigeant français connaît (Kbis, Infogreffe).
- **Oral** : « grèf » en français ; en anglais, imprononçable et inconnu (« greff ? graph ? »), et le mot veut aussi dire transplantation d'organe.
- **Icône** : un « G ».
- **Terminal / MCP** : `greffe login` ; les accents absents, ça passe, mais un anglophone ne le retiendra pas.
- **Risque, élevé** : **Infogreffe** est une marque forte en France dans le registre et les données d'entreprise ; confusion probable. greffe.fr pris, org GitHub `greffe` prise (vide, 2018), npm libre.
- **Verdict** : parfait pour la France seule, mort à la première équipe à Berlin.

#### 2.7 Acquis (mot français court)

- **Dit** : « c'est un acquis » : ce qui a été établi et sur quoi on ne revient pas sans raison. En droit européen, « l'acquis » est le corps des décisions accumulées que tout nouvel entrant doit reprendre : la métaphore exacte du nouvel arrivant qui hérite des décisions de l'équipe. Et ça dit « on ne vous surveille pas, on garde ce qui est acquis ».
- **Oral** : « a-ki » en français ; en anglais, « a-KEE » pour qui connaît le terme (Bruxelles, juristes), « ACK-wiss » pour les autres. C'est le vrai coût du nom : il faudra l'écrire phonétiquement une fois sur la page d'accueil (« Acquis, prononcez a-ki »).
- **Icône** : un « A » ou le guillemet « (voir logo), six lettres qui tiennent en 32 px en Plex Serif.
- **Terminal / MCP** : `acquis login`, serveur `acquis` ; six lettres, aucun caractère spécial, aucune collision connue.
- **Risque, faible à moyen** :
  - Identifiants : **npm `acquis` libre (404), org GitHub `acquis` libre, utilisateur GitHub `acquis` libre, Product Hunt libre, LinkedIn `/company/acquis` renvoie 404 (pas de page)**. X non vérifiable sans compte.
  - Domaines : acquis.com (Acquis Consulting, États-Unis), acquis.fr (OVH, aucun site qui répond), acquis.dev (enregistré, aucun site), acquis.app, .io, .eu pris ; **acquis.ai parqué à la vente chez Afternic** (prix non relevé) ; **.so, .team, .tools sans NS**.
  - Homonymes : Acquis Consulting (États-Unis) vend « AcquisLink », une plateforme d'intégration de données « AI-native » ([acquisconsulting.com](https://www.acquisconsulting.com/technology-solutions/acquislink/)) : classe 42, à montrer au conseil ; Acquis Software (conseil IT, Inde) ; acquis.my (développement sur mesure, Malaisie). Aucun ne vend aux équipes de développement européennes, aucun n'a de visibilité en France.
  - Marques : non vérifié (INPI et EUIPO inaccessibles). Le mot est courant mais arbitraire pour un logiciel, donc a priori distinctif.
- **Verdict** : le meilleur rapport sens / disponibilité / sérieux de la liste.

#### 2.8 Motif (mot court, bilingue)

- **Dit** : « le motif de la décision » ; se lit tel quel en anglais.
- **Oral** : identique dans les deux langues ; cinq lettres.
- **Icône** : un « M », ou un motif graphique, trop facile.
- **Terminal / MCP** : `motif login`, serveur `motif`.
- **Risque, rédhibitoire** : **Motif est une marque déposée de The Open Group** pour la boîte à outils graphique X11, connue de tout développeur Unix de plus de quarante ans ([opengroup.org](https://www.opengroup.org/openbrand/prodstds/x98uc.htm)) ; classe 9, même public. npm `motif` pris ; motif.ai parqué, motif.dev pris, motif.com et .fr pris.
- **Verdict** : non.

#### 2.9 Provenance (mot technique)

- **Dit** : la provenance des données, la source exacte. Terme exact de notre promesse, identique en anglais.
- **Oral** : identique dans les deux langues ; dix lettres, c'est long.
- **Icône** : un « P ».
- **Terminal / MCP** : `provenance login` ; trop long à taper, tout le monde abrègera.
- **Risque, élevé** : générique (provenance blockchain, Provenance.org, des dizaines d'outils de traçabilité) ; npm, org GitHub, Product Hunt pris ; provenance.com et .dev pris. Marque faible, impossible à défendre.
- **Verdict** : non. Le mot reste bon dans nos textes (« chaque fait avec sa provenance »).

#### 2.10 Cairn (évocateur)

- **Dit** : le tas de pierres que ceux qui sont passés avant laissent pour marquer le chemin. Même mot en anglais.
- **Oral** : « kèrn » ; cinq lettres.
- **Icône** : trois pierres empilées, lisible en 32 px, déjà vu cent fois.
- **Terminal / MCP** : `cairn login`.
- **Risque, rédhibitoire** : **Cairn Software**, studio d'agents et d'outils pour développeurs créé en octobre 2025, org GitHub `cairn` (8 dépôts), cairn.dev ([cairn.github.io](https://cairn.github.io/)) ; un autre `cairn-dev/cairn`, agent de fond sur dépôts GitHub ; et **Cairn.info**, le portail français des revues en sciences humaines. npm `cairn` pris.
- **Verdict** : non.

**Écartés en route**, pour mémoire : *Attendu* (les « attendus » d'un jugement, et « résultat attendu » dans un test : très joli, mais Attendu est un éditeur de logiciel événementiel, attendu.com et .dev, org GitHub depuis 2017) ; *Rationale* (outil de décision IA de Jina AI, [rationale.jina.ai](https://jina-ai-gmbh.ghost.io/podcast/introducing-rationale-decision-making-tool-powered-latest-gpt-context-learning/)) ; *Dixit* (le jeu de société, trop connu en France) ; *Codex* (OpenAI) ; *Verbatim* (le fabricant de supports de stockage, classe 9) ; *Dossier* (connotation de fichage en anglais, l'inverse de ce qu'on veut) ; *Retenu* (« la solution retenue », identifiants libres, mais « retenue » veut aussi dire punition et prélèvement).

### 3. Liste courte

| | Acquis | Pourquoi | Parce |
|---|---|---|---|
| Ce qu'il dit | ce qui est établi, l'héritage de décisions | la question à laquelle on répond | « parce que », et « parse » |
| Oral FR / EN | a-ki / à expliquer une fois | évident / reconnu | parss / parse |
| Terminal, MCP | `acquis` | `pourquoi` | `parce` |
| npm | libre | libre | pris |
| GitHub org | libre | libre | pris (PARCE, 2013) |
| Product Hunt | libre | libre | libre |
| .com / .fr / .ai / .dev | pris / pris / à vendre / pris | pris / pris / à vendre / aucun NS | pris × 4 |
| Sans NS le 18/10 | .so, .team, .tools | .dev, .io, .so, .team, .tools | aucun |
| Homonyme gênant | AcquisLink (intégration, US) | aucun en logiciel | PARCE Mobile (productivité, 2025) |
| Confusion avec `competitors.md` | aucune | aucune | aucune |

**Recommandé : Acquis.** Il dit la promesse (ce qui est acquis, pas ce qui est espionné), il sonne institutionnel et européen, ce qui sert le pack confiance (DPA, Francfort, export), ses identifiants techniques sont libres, et il ne ressemble à aucun concurrent. Son défaut, la prononciation anglaise, se règle avec une ligne. **Pourquoi** est le second : plus chaud, plus évident, mais plus faible comme marque. **Parce** est le troisième : le meilleur son, les identifiants les moins libres ; à garder si les deux premiers tombent au dépôt.

Si « Acquis » est retenu, le nom complet d'usage serait **Acquis** tout court, avec la ligne descriptive « la mémoire des décisions de votre équipe dev » dessous, jamais « Acquis AI ».

#### Ce que les fondateurs doivent vérifier eux-mêmes (pour les trois)

Je n'ai fait que des recherches publiques, sans accès aux bases de marques. À faire dans l'ordre, avant d'imprimer quoi que ce soit :

1. **Marques, France** : [data.inpi.fr](https://data.inpi.fr/) → Marques → recherche sur le mot exact puis sur les variantes phonétiques (« aki », « acqui », « akis »), classes **9** (logiciel), **42** (SaaS, services informatiques) et **35** (gestion de données, publicité). Regarder aussi les dénominations sociales (le registre du commerce est dans la même base).
2. **Marques, Union européenne** : [euipo.europa.eu/eSearch](https://euipo.europa.eu/eSearch/) (mêmes classes) et [TMview](https://www.tmdn.org/tmview/) pour couvrir d'un coup les offices nationaux. Chercher aussi « ACQUIS » en marque figurative.
3. **Conseil en propriété industrielle** : lui montrer les homonymes trouvés ici (AcquisLink pour Acquis, PARCE Mobile pour Parce) et demander une recherche d'antériorité avec similitudes. Compter 300 à 800 € pour la recherche, puis le dépôt INPI (190 € pour une classe, 40 € par classe supplémentaire, tarifs 2026 à revérifier sur inpi.fr) ; le dépôt EUIPO est plus cher et peut attendre les premiers clients hors de France.
4. **Domaines** : acheter avant d'annoncer. Pour Acquis : demander le prix de acquis.ai (Afternic), et réserver tout de suite ce qui est sans NS (.so, .team, .tools), plus une forme longue en .com et .fr (par exemple `getacquis` ou `acquis-app`, à vérifier). Le .fr n'a pas de site : voir chez l'AFNIC qui le tient et s'il est à vendre. Même méthode pour Pourquoi (.dev, .io en priorité).
5. **Identifiants** : créer l'org GitHub, le compte npm (le paquet de l'agent local, par exemple `acquis` ou `@acquis/agent`), le compte X, la page LinkedIn, le compte Product Hunt **le même jour**, avant tout post public. X et LinkedIn n'ont pas pu être vérifiés sans compte.
6. **Concurrents** : relire le tableau 1 de `competitors.md` avec le nom choisi à voix haute ; aucun des trois ne se rapproche d'un nom de la liste.
7. **À l'oral** : demander à cinq personnes (dont deux anglophones) de lire le nom écrit et de le dire. Si plus d'une prononciation sort, prévoir la ligne « prononcez… » sur la page d'accueil.

### 4. La voix et la promesse

#### La promesse, en une ligne

**Chaque réponse cite sa source exacte, ou dit « je ne sais pas ».**

C'est ce que le client peut vérifier à chaque fois, lui-même, dès la première question. C'est aussi la base du test des 20 questions : la promesse et la garantie sont la même phrase. Tout ce que la marque affirme en découle : on ne garde que ce qui est cité, on ne remonte que ce que l'auteur a validé, on ne fait jamais semblant de savoir.

#### Trois accroches

1. **« Pourquoi on a fait ça ? » La réponse, avec la source.**
2. **Ce que l'équipe a décidé, et pourquoi. Jamais inventé.**
3. **Vos décisions, retrouvées. Vos conversations, chez vous.**

La première est la question de démo ; la deuxième est la promesse ; la troisième répond au « mouchard ». Aucune ne reprend une accroche de `competitors.md` (« Your company may forget. But Sentra doesn't. », « More context. Better code. », « Stop running your business on confidently wrong AI. », « Give your AI your team's context. »…) : vérifié mot à mot.

#### La voix, en trois adjectifs

**Franche.** On dit ce qui est capté et ce qui ne l'est pas, dans la même phrase, avant qu'on nous le demande.
- À faire : « L'agent lit les fichiers de session de Claude Code et de Cursor sur votre poste. Il ne lit ni l'écran, ni le clavier, ni le navigateur, ni vos autres fichiers. » (à faire valider ligne par ligne par l'implémentation réelle avant publication).
- À éviter : « Vos données sont en sécurité », « respect total de votre vie privée », toute phrase rassurante sans fait vérifiable derrière.

**Précise.** On nomme la source, la date, l'auteur ; on compte ; on dit « je ne sais pas ».
- À faire : « 17 réponses sur 20 avec la bonne source au jour 30 » ; « supprimé sous 30 jours » ; « hébergé à Francfort chez Supabase ».
- À éviter : « toute la connaissance de votre entreprise », « intelligent », « puissant », « magique », « révolutionnaire », les superlatifs et tout adjectif qu'on ne peut pas mesurer.

**Sobre.** Phrases courtes, pas de point d'exclamation, pas d'emoji, pas d'étincelles, pas de « IA » dans le nom. Le ton d'un collègue sérieux, pas d'un vendeur.
- À faire : « Si Acquis se trompe, il montre la source et vous jugez. »
- À éviter : « Libérez la puissance de votre mémoire collective ! », les « Oups », les formules de bienvenue, le tutoiement de vendeur. Le registre anti-« AI slop » de `docs/specs/2026-10-13-design.md` s'applique aux mots comme aux pixels.

Règle commune aux trois : **la voix ne séduit pas, elle montre.** Face à l'objection « mouchard », on ne répond jamais « faites-nous confiance » ; on répond par la liste de ce qui est lu, l'endroit où ça va, le bouton pour arrêter, et la commande pour voir ce qui est parti.

#### Réécriture avant / après

Ligne de `pitch.md` : *« Un petit agent sur chaque poste garde ce que vos développeurs et leurs agents IA décident dans Claude Code ou Cursor, et pourquoi. »*

Ce qui cloche : « petit » rassure sans informer, « sur chaque poste » sonne déploiement imposé (P001, P010), « garde ce que vos développeurs décident » se lit comme une surveillance des personnes.

Après : *« Chaque développeur installe l'agent lui-même. Il lit les fichiers de session de Claude Code et de Cursor sur son poste, rien d'autre, et lui propose les décisions qu'il y trouve, avec leur raison. Rien ne part vers l'équipe sans son clic. »*

Ce qui change : qui installe (le dev, pas le CTO), ce qui est lu (nommé), ce qui ne l'est pas (« rien d'autre »), qui décide de partager (l'auteur). Quatre faits à la place d'un adjectif.

### 5. Le look : brief

#### Point de départ : ce que le repo fait déjà

Deux sources qui ne disent pas la même chose :

- La spec `docs/specs/2026-10-13-design.md` (Amos, 13/10) prescrit **IBM Plex Sans / Serif / Mono**, des neutres chauds (« papier » `#FAF9F7`), et un **accent unique bleu pétrole `#0B5D5B`**, en s'interdisant explicitement « indigo, violet ou bleu par défaut de Tailwind » et en notant que Qontext utilise Inter et un accent indigo/violet.
- Le code sur `main` (PR #11) utilise **Inter** pour l'interface (`src/app/layout.tsx`), Plex Serif et Plex Mono pour les citations et le brut, un fond gris neutre `#f5f5f4` et un **accent indigo `#4f46c8`** (`src/app/globals.css`, lignes 64-74, commentaire « accent indigo pour les liens et la sélection »).

**Décision proposée : revenir à la spec du 13/10 pour la marque, et réaligner le code dessus.** Raisons : l'indigo sur blanc est l'accent par défaut de la catégorie (Qontext, Linear, et la moitié des SaaS IA de 2024-2026 ; je n'ai pas relevé la palette de chaque concurrent de `competitors.md`, c'est une observation, pas une vérification) ; la spec l'interdisait déjà ; le pétrole sur papier est rare dans la catégorie et dit « registre, encre, document tenu » plutôt que « dashboard IA ». Inter est une bonne police, mais c'est aussi celle de Qontext et de la moitié du marché ; une seule famille (Plex) en trois graisses coûte zéro licence et donne une identité d'un coup. Le changement dans le code tient en une importation (`layout.tsx`) et quatre valeurs de variables (`globals.css`).

#### Couleurs

Trois couleurs de base, plus une signature. Ratios WCAG 2.2 calculés le 18/10 (formule de luminance relative, sRGB).

| Rôle | Nom | Hex | Usage | Contraste |
|---|---|---|---|---|
| Fond | **Papier** | `#FAF9F7` | fond de page, de l'app, des emails | – |
| Texte | **Encre** | `#1C1B19` | tout le texte courant, le logo en monochrome | 16,4:1 sur Papier ; 17,2:1 sur blanc (AAA) |
| Accent unique | **Pétrole** | `#0B5D5B` | liens, bouton principal, focus, sélection, le logo en couleur | 7,3:1 sur Papier ; blanc sur Pétrole 7,7:1 (AAA) |
| Signature | **Citation** | `#F6EFD9` | fond des citations de source, et seulement d'elles | Encre dessus 15,0:1 ; Pétrole dessus 6,7:1 (AAA) |

La signature est le point : partout où la marque montre une source citée, elle est sur ce fond « papier jauni », dans l'app, dans le rapport des 20 questions, sur la page d'accueil. C'est la preuve rendue visible, et c'est ce que personne d'autre ne montre.

Pour un thème sombre (plus tard) : Papier sur Encre 16,4:1 ; accent clair `#7FC6C2` sur Encre 8,8:1 ; Citation sur Encre 15,0:1. Les couleurs sémantiques (succès, avertissement, erreur, information) restent celles du tableau de la spec du 13/10, toutes au-dessus de 5,7:1.

Règles : un seul accent, jamais deux ; la couleur ne porte jamais seule un sens (icône ou mot avec) ; pas de dégradé, pas de violet, pas de « glow ».

#### Typographie

Une famille, trois coupes, toutes sous **SIL Open Font License 1.1** (licence vérifiée sur [github.com/IBM/plex](https://github.com/IBM/plex/blob/master/LICENSE.txt)) et servies par Google Fonts (API vérifiée le 18/10 pour les trois) :

- **Titres : IBM Plex Serif**, 600 pour les titres, 400 italique pour les citations. [fonts.google.com/specimen/IBM+Plex+Serif](https://fonts.google.com/specimen/IBM+Plex+Serif). Le serif dit « document tenu », pas « app IA », et c'est déjà la police des citations dans l'app.
- **Texte : IBM Plex Sans**, 400 / 500 / 600. [fonts.google.com/specimen/IBM+Plex+Sans](https://fonts.google.com/specimen/IBM+Plex+Sans). À la place d'Inter dans `layout.tsx`.
- **Code, identifiants, commandes : IBM Plex Mono**, 400 / 500. [fonts.google.com/specimen/IBM+Plex+Mono](https://fonts.google.com/specimen/IBM+Plex+Mono). C'est aussi la police de `acquis login` dans toute la communication : le terminal fait partie de la marque.

Fichiers complets sur [github.com/IBM/plex/releases](https://github.com/IBM/plex/releases) pour l'auto-hébergement (préférable au chargement depuis Google pour la page sécurité : aucune requête tierce). Rien d'autre : pas de police d'affichage, pas de police payante, pas d'image de banque sans licence.

#### Le logo : brief

**Ce qu'il doit dire** : « nous citons ». Le signe proposé est le **guillemet ouvrant français « »** (deux chevrons), en Pétrole, suivi du nom en Plex Serif 600. Le guillemet, c'est la citation de source, ce que le produit fait et ce que les concurrents ne montrent pas ; les deux chevrons se lisent aussi comme un retour en arrière (l'historique) et rappellent l'invite d'un terminal. Il ne dit ni mémoire (cerveau, éléphant), ni recherche (loupe), ni IA (étincelles), ni surveillance (œil, radar).

**Où il doit marcher** :
- **Favicon 16 et 32 px** : le « seul, Pétrole sur Papier ; version monochrome Encre.
- **Icône de barre de menus (agent local, macOS)** : le « seul en « template image » (noir, transparence), 18 px ; **deux états obligatoires** : capture active (chevrons pleins) et capture en pause (chevrons en contour). C'est le « signal visible de capture » de la condition C6 du conseil ; le logo porte l'état, pas une pastille de couleur.
- **Avatar GitHub / npm / X / LinkedIn** : le « blanc sur carré Pétrole, coins 4 px.
- **En-tête de page et email** : « + nom, Encre, 24 px de haut ; version Pétrole sur Papier pour la page d'accueil.
- **Terminal** : le nom seul en Plex Mono, pas de logo ASCII.

**À éviter** : cerveau, éléphant, ampoule, loupe, œil, cadenas, robot, étincelles, bulle de dialogue, dégradé, 3D, mascotte, « AI » dans la marque, animation du logo. Pas d'icône générée par IA sans retravail : le trait doit être propre en 16 px. Le logo final sera fait par un graphiste (budget 500 à 1 500 € pour un signe + un mot-symbole + une planche d'usages), à partir de ce brief.

#### Les cinq premiers points de contact

1. **La page d'accueil.** Une colonne, Papier, pas de héros illustré. En haut : le nom, la ligne « la mémoire des décisions de votre équipe dev », puis **une vraie question et une vraie réponse citée** sur fond Citation (« pourquoi on a choisi Postgres pour le billing ? » → trois lignes de réponse, la session citée, la date, l'auteur). En dessous, trois blocs texte : ce qui est capté et ce qui ne l'est pas (la liste, pas une promesse) ; le test des 20 questions ; le pack confiance (DPA, Francfort, export, suppression, « vos données n'entraînent aucun modèle »). Un seul bouton Pétrole : « Installer en solo, gratuit ». Prix en clair en bas. Aucune logo-wall, aucun témoignage inventé.

2. **L'écran d'installation de l'agent local (le moment « mouchard »).** C'est le point de contact le plus important de la marque, avant la page d'accueil. Plein écran, avant toute collecte, lisible en trente secondes :
   - **Ce que l'agent lit** : « les fichiers de session de Claude Code (`~/.claude/…`) et de Cursor sur ce poste » (chemins exacts affichés).
   - **Ce qu'il ne lit pas** : écran, clavier, navigateur, autres fichiers, autres applications (à valider par l'implémentation).
   - **Où ça va** : « sur votre espace, hébergé à Francfort ; rien n'est visible de l'équipe tant que vous n'avez pas cliqué "partager" sur une décision ».
   - **Comment arrêter** : « `acquis pause` ou l'icône de la barre de menus ; `acquis status` montre la dernière lecture et ce qui est parti ».
   - Un seul bouton : « Je comprends, démarrer la capture ». Refuser laisse l'agent inactif, sans relance.
   - Même texte, mot pour mot, sur une page publique « Ce que l'agent capte », que le CTO peut donner telle quelle aux développeurs et au CSE (demande explicite d'un acheteur v2). Le texte est en Plex Sans, les chemins et commandes en Plex Mono, aucune illustration.

3. **L'email de confirmation et le rapport du test des 20 questions.** Email texte, Papier, logo en-tête 24 px, pas de bannière. Objet : « Vos 20 questions sont enregistrées ; rendez-vous le [date] ». Le rapport au jour 30 est un tableau : question, réponse donnée, source citée (sur fond Citation), juste / faux / « je ne sais pas », avec le total en première ligne (« 17 sur 20 avec la bonne source ») et la conséquence écrite (« au-dessus de 15 : votre abonnement démarre ; en dessous : rien n'est facturé »). Les « je ne sais pas » sont comptés à part et présentés comme ce qu'ils sont : la promesse tenue, pas un échec maquillé.

4. **Le premier post (LinkedIn, puis X et une communauté de développeurs).** Pas d'annonce de lancement ; une question et sa réponse citée, en capture d'écran du terminal (Plex Mono, Papier, Pétrole), avec les mots du pitch : « pourquoi on a choisi Postgres pour le billing ? », la réponse, la session citée, la date. Trois lignes en dessous : ce que ça lit, ce que ça ne lit pas, le lien vers « Ce que l'agent capte ». Signé des deux fondateurs par leur nom. Pas de « nous sommes ravis d'annoncer », pas d'emoji fusée.

5. **La réponse à la première plainte publique** (elle viendra, probablement « c'est un mouchard » sur un fil de développeurs). La voix s'applique en entier : répondre sous une heure, par un fondateur nommé, en trois parties : (a) merci, c'est la bonne question ; (b) la liste exacte de ce qui est lu et de ce qui ne l'est pas, avec le lien vers le code de l'agent s'il est public ; (c) ce qu'on change si la critique est juste, avec une date. Jamais « vous n'avez pas compris », jamais de réponse générée, jamais de suppression du fil. Si la plainte révèle un vrai défaut (par exemple une décision privée remontée par erreur), le dire, le dater, le corriger, et publier la correction au même endroit. La marque se construira plus sur cette réponse-là que sur le logo.

### 6. Ce qui reste à faire

- Choisir entre Acquis, Pourquoi et Parce après les vérifications du §3 et un test oral sur cinq personnes.
- Dépôt INPI classes 9, 42, 35, puis domaines et identifiants le même jour.
- Réaligner le code sur la spec (Plex Sans à la place d'Inter, Pétrole à la place de l'indigo) et remplacer « Leon » dans `src/app/(auth)/layout.tsx`, le `README`, le nom du serveur MCP et le paquet de l'agent.
- Brief graphiste pour le signe « et la planche d'usages.
- Faire relire par l'avocat les textes de l'écran d'installation et de la page « Ce que l'agent capte » : ce sont des engagements.

## Operations

Comment Leon tourne au quotidien, avec quoi, avec qui, et ce qui peut casser. Matière première : `offer.md` (l'offre v2 : agent local Claude Code et Cursor, GitHub, Linear, Notion, lecture par MCP, test des 20 questions, pack confiance, relecture par l'auteur, cloisonnement par projet), `numbers.json` et `cfo-sources.md`, `board.md` (conditions C3, C4, C6, C10), l'architecture (`../architecture-2026-10/`) et l'étude de coûts (`../couts-2026-10/`). Prix publics relevés le 18/10/2026, 1 $ = 0,92 € (hypothèse du CFO). Légende : [V] vérifié sur la page du fournisseur ce jour ; [E] estimation ; [D] sur devis.

**Ce document n'est pas un avis juridique ni comptable.** Les règles changent (tarifs de greffe chaque année, doctrine CNIL, AI Act en cours d'application) : un avocat relit la section 6 et l'expert-comptable la section 3 avant tout mouvement d'argent.

### 0. En une page

- **Le service, c'est une boucle de six heures** : une session captée sur un poste le matin devient une proposition « à relire » pour son auteur avant midi, et une décision visible du projet dès qu'il clique. Tout ce qui est visible du client (signal de capture, propositions, réponses MCP avec citation, score des 20 questions, facture) est marqué « 👁 client » dans la section 1.
- **La pile minimale tient en 12 outils**, dont 8 gratuits au départ : Supabase Pro (25 $), Vercel Pro (20 $/membre), Fly.io (quelques dollars), Anthropic Haiku 5.5, Voyage, Stripe Billing, GitHub Team, Resend, Sentry Team, Better Stack (gratuit), Crisp (gratuit), Yousign One (9 €), Qonto Basic, Dougs ou Keobiz, Attio (gratuit). Détail et prix en sections 2 et 5.
- **`numbers.json` : une ligne modifiée.** Stripe passe de 0,45 € à 0,56 € par siège : les abonnements passent par Stripe Billing, qui ajoute 0,7 % du volume aux 1,5 % + 0,25 € par transaction [V]. Les autres lignes tiennent (section 2.4). Deux points pour le CFO : la validation CASA (2 000 € au lancement + part des 250 €/mois) ne sert que si Gmail arrive, or l'offre v2 l'a retiré ; et la capacité de 2 000 sièges est à mon avis trop haute (section 3).
- **Deux fondateurs accompagnent 20 équipes en pilote à la fois, et 50 à 60 équipes en régime de croisière** (environ 500 à 800 sièges). Au-delà, le support et l'onboarding mangent un fondateur entier.
- **Premier recrutement : un ingénieur support et déploiement** (bilingue, capable de déboguer l'agent sur macOS, Windows et Linux et de mener un onboarding), vers le mois 9 ou 10, quand 25 à 30 équipes paient, ou dès qu'un fondateur passe plus de la moitié de sa semaine en support. Pas un commercial : les ventes restent aux fondateurs jusqu'à 50 équipes.
- **Les trois risques qui tuent** : un passage privé remonté par erreur (section 7, n°2), la capture qui casse en silence quand Anthropic ou Cursor change un format (n°1), et une clé API captée dans une session et stockée chez nous (n°5).

### 1. Le cycle du service

#### 1.1 Chaque jour, du premier événement au dernier

| # | Étape | Ce qui se passe, et où | Ce que voit le client | Signal de santé chez nous |
|---|---|---|---|---|
| 1 | **Capture** | Le binaire `leon` sur le poste du développeur lit `~/.claude/projects/<cwd>/<uuid>.jsonl` au fil de l'eau (Claude Code efface après 30 jours) et reçoit les hooks Cursor (`afterAgentResponse`, `beforeSubmitPrompt`). Il retire mécaniquement `tool_result`, `thinking`, pièces jointes et checkpoints (91 % du volume), et envoie les tours `user` / `assistant` bruts à `/v1/ingest` avec le jeton du trousseau. | 👁 `leon status` et le badge « dernier message capté il y a 4 min » dans l'interface, par poste. 👁 `leon pause` et `leon exclude <dossier>` pour couper. | Comptes canari (nos propres postes, une version de Claude Code et de Cursor chacun) : si le volume capté par version de parseur chute de moitié sur 24 h, alerte. |
| 2 | **Ingestion** | L'API (Hono, Fly.io Francfort) valide le schéma `Turn`, déduplique par (source, id externe, version), écrit dans `turns` (Supabase Francfort) et empile un job pg-boss. Les connecteurs GitHub, Linear et Notion arrivent par webhooks signés et par rattrapage paginé. | 👁 Compteur « reçu aujourd'hui » par source dans la page Capture. | File pg-boss : âge du plus vieux job en attente < 15 min ; taux d'erreur par connecteur. |
| 3 | **Étiquetage** | Filtre mécanique en défense côté serveur, puis Haiku 5.5 : triage (catégorie, langue, `partageable` ou `sensible` sur liste fermée), extraction avec citation littérale vérifiée dans la source (`quote.ts`, sinon rejet), résolution d'entités (clés dures d'abord, jamais de fusion automatique entre deux emails différents), rangement dans une fiche, détection « remplace » ou « contredit ». | 👁 Rien encore : tout fait tiré d'une conversation appartient à son auteur seul. | Coût LLM par siège et par jour (table `llm_usage`) ; part de citations rejetées à l'extraction ; temps par étape. |
| 4 | **Index** | Embeddings voyage-4 et `tsvector` sur les faits, avec l'ACL par fait (intersection des droits des preuves). Les dérivés (résumés, embeddings de fiche) portent l'ACL la plus restrictive. | Rien. | Lag d'indexation < 10 min ; tests pgTAP allow/deny verts en CI à chaque déploiement. |
| 5 | **Relecture par l'auteur** | Les faits extraits de sa conversation attendent le développeur dans « à relire ». Un clic valide (le fait s'ouvre aux membres du projet concerné), un clic rejette, un clic corrige. Les faits `sensible` ne sont jamais proposés en partage. | 👁 L'écran « à relire » (dans l'interface et par un résumé quotidien par mail, 9 h, s'il y a quelque chose). 👁 Pour l'équipe : le registre des décisions, datées, avec « remplacée par » quand elles changent. | Part des propositions validées (objection n°3 de `offer.md`) ; délai médian entre capture et validation. |
| 6 | **Requêtes MCP** | Depuis Claude Code, Cursor, Claude ou ChatGPT, l'utilisateur appelle `search` puis `fetch` sur le serveur MCP (OAuth 2.1 par utilisateur, RLS de session). Recherche hybride + rerank Voyage ; `fetch` écrit `read_log`. Le LLM du client génère la réponse. | 👁 La réponse dans son outil, avec la citation (session, PR, ticket) ou « je ne sais pas ». 👁 Son journal « qui a lu quoi » dans l'interface. | Latence p95 de `search` < 2 s ; taux de « je ne sais pas » ; échantillon quotidien de 10 réponses pour la mesure des citations inventées (1.2). |
| 7 | **Support** | Boîte support@ (Crisp, gratuit, 2 sièges) tenue par le fondateur d'astreinte. Réponse sous 4 h ouvrées, correction de capture sous 24 h (engagement de l'architecture). Hors heures ouvrées : alertes Better Stack seulement. | 👁 Le chat et le mail ; la page statut (status.leon…) en cas d'incident. | Tickets ouverts > 24 h ; tickets par équipe (une équipe à plus de 3 par semaine, c'est un problème produit). |
| 8 | **Facturation** | Chaque nuit, un job compte les **sièges actifs** du mois (un siège = un utilisateur avec au moins un tour capté ou une requête MCP dans le mois) et pousse l'usage à Stripe Billing. Facture mensuelle à terme échu, prélèvement carte ou SEPA. Le test des 20 questions bloque la première facture tant que le score n'est pas ≥ 15 au jour 30. | 👁 La facture par mail, le portail Stripe pour changer de carte ou télécharger les factures, le compteur de sièges actifs dans l'interface. | Écart entre sièges actifs et sièges facturés = 0 ; échecs de paiement relancés sous 3 jours (Stripe Smart Retries). |
| 9 | **Sauvegardes** | Supabase Pro : sauvegarde quotidienne, 7 jours de rétention [V]. En plus, `pg_dump` chiffré chaque nuit vers un bucket objet Scaleway Paris (hors Supabase, autre fournisseur, autre pays). **Le plan gratuit actuel n'a aucune sauvegarde : passer en Pro avant la première donnée de pilote.** | Rien, sauf la mention sur la page sécurité. | Taille et date du dernier dump ; test de restauration mensuel (1.3). |
| 10 | **Surveillance** | Better Stack (uptime de l'API, du MCP, de l'interface, de la page de consentement OAuth), Sentry (erreurs, région UE), console Anthropic (budget quotidien avec alerte à 150 % de la moyenne), Supabase (CPU, disque, connexions du pooler). Quinze minutes de revue le matin par le fondateur d'astreinte. | 👁 La page statut, alimentée par Better Stack. | Tout ce qui précède, sur un seul tableau de bord Better Stack. |

#### 1.2 Chaque semaine (lundi matin, 1 h à deux)

1. **Revue des pilotes**, une ligne par équipe : sièges installés / sièges prévus (taux d'installation de l'agent, C3), tours captés, propositions validées / proposées, requêtes MCP, score aux 20 questions, tickets. Une équipe sans capture depuis 3 jours reçoit un appel, pas un mail.
2. **Test des 20 questions**, rejoué automatiquement (script `pnpm essai …` sur les questions fixées à l'onboarding, par équipe) : nombre de réponses correctes **avec la bonne source**. Le score est affiché dans le tableau de bord de l'équipe (👁) ; un score qui baisse d'une semaine à l'autre déclenche une analyse avant de toucher au pipeline.
3. **Mesure des citations inventées** (C5) : 50 réponses MCP de la semaine, tirées au sort dans `read_log` sur nos comptes canari et sur les pilotes qui l'acceptent ; pour chaque citation produite par le LLM du client, vérification mécanique que le passage cité existe dans la source. On publie le taux dans la page sécurité une fois qu'il est stable.
4. **Santé de capture par version d'éditeur** : versions de Claude Code et de Cursor vues cette semaine, fixtures de `packages/capture` à jour, parseurs cassés.
5. **Coût LLM de la semaine** par siège, comparé aux 0,28 € + 0,40 € modélisés.
6. **Déploiements** : du mardi au jeudi seulement, jamais le vendredi, jamais pendant un onboarding.

#### 1.3 Chaque mois (premier jour ouvré, 3 h, SOP g)

1. Clôture de la facturation (sièges actifs, garantie « 15 sur 20 », avoirs).
2. Rapport de coûts : factures Anthropic, Voyage, Supabase, Vercel, Fly, Stripe, rapprochées de `numbers.json` ; mise à jour des lignes variables si l'écart dépasse 20 %.
3. **Suppression des comptes résiliés depuis plus de 30 jours** (SOP c) : purge, preuve de purge archivée, sauvegardes expirées.
4. Test de restauration d'un dump dans un projet Supabase jetable, chronométré.
5. Revue de la liste des sous-traitants (changements annoncés par Supabase, Anthropic, Voyage) et du registre des traitements ; mise à jour de la page sécurité.
6. Rotation des clés (jetons d'agent de plus de 90 jours, clés API internes), revue des accès (qui a un accès prod).
7. Synthèse des 20 questions sur toutes les équipes, et des citations inventées : deux chiffres pour `launch.md` et pour le conseil.

### 2. Fournisseurs, ligne par ligne

Pour chaque ligne de `numbers.json` et chaque brique : deux ou trois fournisseurs, le prix public, les minimums et les délais. Le fournisseur retenu est en gras.

#### 2.1 Coûts variables (par siège et par mois)

| Ligne `numbers.json` | Fournisseurs et prix publics | Minimum, délai, paiement | Tient ? |
|---|---|---|---|
| Embeddings du flux, 0,04 € | **Voyage AI voyage-4 : 0,06 $/M tokens, les 200 premiers millions de tokens gratuits par compte** [V, docs.voyageai.com/docs/pricing]. Alternatives : voyage-4-lite 0,02 $/M ; Cohere embed-v5 0,08 à 0,12 $/M (annexe 1 des coûts, 30/09) ; gemini-embedding-2 0,20 $/M. | Carte bancaire, à l'usage, pas de minimum. Le quota gratuit couvre ~280 sièges-mois à 0,7 M tokens/siège. | Oui. Les premiers mois sont gratuits. |
| Étiquetage Haiku 5.5, 0,28 € | **Anthropic Claude Haiku 5.5 : 0,10 $/M entrée, 0,50 $/M sortie, lectures de cache 0,01 $/M, Batch −50 % (0,05 / 0,25)** ; prompts > 100 k tokens à 0,50 / 2,50 [V, platform.claude.com/docs/en/about-claude/pricing]. Via **Bedrock, profil `eu.anthropic.claude-haiku-5-5` (routage dans les régions UE, pas « in-region » Francfort)** : +10 % sur les points régionaux [V, doc Anthropic ; docs.aws.amazon.com model card Haiku 5.5]. Vertex AI : même principe. | Anthropic : prépaiement par crédits, pas de minimum ; `inference_geo` ne propose que `us` ou `global`, pas d'UE [V]. Bedrock : compte AWS, facturation mensuelle, crédits AWS Activate possibles après immatriculation. | Oui (0,30 $ → 0,28 €). En UE via Bedrock : 0,31 €. |
| Reprise de l'historique, 0,40 € | Mêmes fournisseurs ; Batch API −50 % mais non compatible avec la rétention zéro [annexe 1 des coûts]. | — | Oui. |
| Stockage Supabase, 0,09 € | **Supabase Pro : 25 $/mois, 8 Go de disque inclus, 0,125 $/Go au-delà, 100 Go de fichiers, 10 $ de crédit compute (Micro) ; Small 15 $, Medium 60 $, Large 110 $ ; PITR 100 $/mois par 7 jours** [V, supabase.com/pricing]. Alternatives Francfort : Neon (annexe 4 des coûts : Launch 2 CU ~190 $/mois en continu), Scaleway DB-PRO2-XXS ~97 $/mois (Paris, souverain). | Carte, mensuel, sans engagement. Région choisie à la création du projet, DPA auto-incorporé [V, supabase.com/legal/dpa]. | Oui. |
| Recherche et rerank, 1,20 € | **Voyage rerank-2.5 : 0,05 $/M tokens, 200 M gratuits** ; rerank-2.5-lite 0,02 $/M [V]. Alternative : Cohere Rerank (prix non vérifié ce jour). | À l'usage. | Oui, et gratuit les premiers mois. C'est la ligne variable la plus lourde : à mesurer (440 requêtes/mois est une hypothèse). |
| Génération via MCP, 0 € | Payée par l'abonnement Claude, ChatGPT ou Cursor du client. | — | Oui. |
| Sièges Solo, 0,60 € | Interne. | — | — |
| **Frais Stripe, 0,45 € → 0,56 €** | **Stripe France : 1,5 % + 0,25 € par carte EEE standard ; 2,8 % + 0,25 € cartes premium ; 2,5 % + 0,25 € cartes UK ; 3,15 % + 0,25 € + 2 % de change hors Europe ; prélèvement SEPA 0,35 € ; Stripe Billing 0,7 % du volume (ou forfait dès 500 €/mois) ; Stripe Tax 0,5 %** [V, stripe.com/fr/pricing]. Alternatives : GoCardless pour le SEPA seul ; Paddle ou Lemon Squeezy en « merchant of record » (TVA gérée pour nous, prix non vérifiés ce jour, de l'ordre de 5 % + 0,50 $, à confirmer). | Compte vérifié avec SIREN, statuts et pièce d'identité du dirigeant : **impossible d'encaisser avant l'immatriculation**. Premier virement sous 7 jours, puis glissant. | **Non : modifié.** Client moyen de 20 sièges à 25 € = 500 € ; 7,50 + 0,25 + 3,50 (Billing) = 11,25 € → 0,56 €/siège. |
| Support et onboarding, 1,50 € | Temps fondateur (section 3). Outils gratuits (Crisp, Cal.com ou Google Agenda). | — | Oui au plan ; sous-estimé en phase pilote (section 3). |
| Garantie « 15 sur 20 », 0,20 € | Interne. | — | — |

#### 2.2 Coûts fixes mensuels

| Ligne `numbers.json` | Fournisseurs et prix publics | Minimum, délai, paiement | Tient ? |
|---|---|---|---|
| Hébergement, base, files, LLM de dev, 650 € | **Vercel Pro : 20 $/membre/mois, 20 $ de crédit d'usage, 1 To de transfert, 1 M d'invocations ; région `fra1` à forcer (défaut aux États-Unis)** [V, vercel.com/pricing]. **Fly.io : machines à la seconde, shared-cpu-1x 256 Mo 2,19 $/mois, 2x 512 Mo 4,39 $, 4x 1 Go 8,78 $ ; volumes 0,15 $/Go ; support Standard 29 $/mois** [V, fly.io/pricing]. **Supabase Pro 25 $ + Small 15 $** [V]. Alternatives : Railway (Amsterdam seulement), Hetzner + Coolify (phase 2), Scaleway Paris (souverain). | Carte, mensuel. Vercel compte chaque membre de l'équipe (2 × 20 $). | Oui, avec marge : ~60 $ Vercel + ~30 $ Fly + ~40 $ Supabase + ~20 $ sauvegardes Scaleway + 100 à 300 $ de LLM de développement ≈ 250 à 450 $. Garder 650 € : le LLM de dev varie beaucoup (les essais du 15/10 ont coûté 4 $ pour une journée). |
| Outils (GitHub, domaine, email, compta, monitoring), 150 € | GitHub Team 4 $/utilisateur/mois (2 000 à 3 000 min Actions) [V] ; domaine OVHcloud .fr 4,99 € HT la 1re année puis 7,79 €/an, .com 7,99 puis 13,49 € [recherche, 2026] ; Google Workspace Business Starter ~6,80 € HT/utilisateur/mois [recherche] ; Resend gratuit jusqu'à 3 000 mails/mois (100/jour), Pro 20 $ [V] ; Postmark 100 mails/mois gratuits puis 15 $/10 000 [V] ; Sentry Team 26 $/mois en annuel, 29 $ en mensuel, 50 000 erreurs, région UE à choisir à la création [V] ; Better Stack Uptime gratuit (10 moniteurs à 30 s, 1 page statut), astreinte 29 à 34 $/répondant [V] ; Crisp gratuit 2 sièges, Mini 45 $/espace [V] ; Attio gratuit jusqu'à 3 sièges [V] ; Yousign One 9 € HT/mois [recherche] ; Qonto Basic 9 € HT/mois en annuel, 11 € en mensuel [recherche]. | Mensuel, sans engagement sauf Workspace et Sentry en annuel pour la remise. | Oui : ~70 à 110 €/mois au total. |
| Expert-comptable, 150 € | **Dougs : 79 €/mois pour une société** ; Keobiz : Easy 89, Confort 109, Plus 139, Premium 179 € HT/mois ; Pennylane (logiciel seul) 14 à 49 € HT/mois + cabinet partenaire [recherches 2026, pages non officielles : à confirmer par devis]. | Engagement annuel fréquent ; bilan compris ou en sus selon l'offre ; paie en option (inutile sans salarié). | Oui, dans la fourchette. |
| Assurance RC pro et cyber, 120 € | RC pro freelance informatique : Hiscox dès 12,70 €/mois, Orus dès 13 € HT, Stello dès 15 € [recherche] ; cyber : Stoïk 44 à 172 €/mois affichés pour une PME, Hiscox cyber dès 9,99 €/mois pour une petite structure, sinon devis [recherche]. Pour un éditeur SaaS qui traite des données de salariés, les assureurs demandent un questionnaire (hébergeur, sauvegardes, MFA, chiffrement) et cotent **sur devis** [D]. | Annuel, payable mensuellement ; attestation sous 48 h en ligne (Orus, Stello, Hiscox). | Plausible (30 à 60 € RC pro + 50 à 100 € cyber). Devis à demander à Orus, Hiscox et Stoïk avec le questionnaire rempli, après immatriculation. |
| Marketing, 500 € | Hors périmètre de ce document (`marketing.md`). | — | — |
| Sécurité et conformité (CASA, pentest, amortis), 250 € | Pentest d'une application web de PME : 2 500 à 6 500 € HT, 4 000 à 8 000 € avec API et auth, Vaadata de 750 à 30 000 € selon périmètre [recherche, devis obligatoire, D] ; CASA Tier 2 : TAC Security 540 à 1 800 $ par appli et par an, tarif négocié par Google [recherche, D]. | Pentest : devis sous une semaine, créneau 4 à 8 semaines, paiement à la commande. | Oui pour un pentest par an (3 000 €). **Mais CASA ne sert que si Gmail/Drive entre dans l'offre** (section 2.4). |

#### 2.3 Dépenses de lancement

| Ligne `numbers.json` | Fournisseurs et prix publics | Délai | Tient ? |
|---|---|---|---|
| Immatriculation SAS, statuts, dépôt de capital, 1 000 € | Frais légaux 2026 : greffe 33,83 €, annonce légale forfaitaire SAS 199 € HT (233 € Réunion et Mayotte), bénéficiaires effectifs 19,33 €, soit **252,16 € HT au minimum** [recherche recoupée sur 4 sites, tarifs par arrêté] ; formalités en ligne Legalstart ou LegalPlace 0 € (Starter), 99 € (Standard), 199 € (Premium/Express) hors frais légaux [recherche] ; dépôt de capital Qonto ~69 €, ou forfait Basic + dépôt 169 € HT/an [recherche]. Statuts et pacte d'associés relus par un avocat : 500 à 1 500 € [E]. | Guichet unique INPI (formalites.entreprises.gouv.fr) : récépissé immédiat, Kbis en 3 à 10 jours ouvrés. | Oui comme plafond : 350 à 500 € en ligne, ~1 000 € avec avocat. |
| Marque INPI, 250 € | **INPI : 190 € pour une classe, 40 € par classe supplémentaire** (classes 9 et 42 pour Leon = 230 €) [V, inpi.fr]. | Dépôt en ligne, publication sous 6 semaines, enregistrement ~4 mois. | Oui. |
| CGV, DPA, RGPD, registre (avocat), 2 500 € | Cabinet spécialisé RGPD/SaaS [D]. Alternatives moins chères : modèles de DPA (celui de la CNIL n'existe pas ; les clauses contractuelles types « art. 28 » de la Commission existent) remplis par nous puis relus 2 h par un avocat (~600 à 1 000 €) [E]. | 2 à 4 semaines. | Oui, à confirmer par deux devis. |
| **CASA Tier 2, 2 000 €** | TAC Security 540 à 1 800 $ ; la vérification OAuth Google elle-même est gratuite mais dure 4 à 8 semaines [recherche ; annexe 7 de l'architecture]. | — | **Prix plus bas que modélisé (≤ 1 656 €) et surtout hors offre v2** : Gmail et Drive sont retirés du lancement. Décision CFO : sortir la ligne du lancement et la remettre le jour où une équipe payante demande Gmail. |
| Site et pages de test, 500 € ; publicités, 1 500 € | Hors périmètre. | — | — |

#### 2.4 Écarts avec `numbers.json`

1. **Modifié : Stripe, 0,45 € → 0,56 € par siège** (Billing 0,7 % ajouté aux 1,5 % + 0,25 €). Le CFO relance `unit_economics.py` : la contribution passe d'environ 20,24 € à 20,13 €, le seuil de rentabilité bouge de quelques sièges.
2. **Non modifié, mais à trancher par le CFO : CASA.** 2 000 € au lancement et une part des 250 €/mois de conformité pour un audit que l'offre v2 ne requiert plus. Le prix public maximal est de 1 800 $ (≈ 1 656 €).
3. **Non modifié : capacité 2 000 sièges.** Estimation d'ops en section 3 : 800 sièges sans recrutement.
4. Tout le reste tient, souvent avec marge (outils : 70 à 110 € mesurés pour 150 € modélisés ; hébergement : 250 à 450 $ pour 650 €).

### 3. Les personnes

#### 3.1 Mois 1 (0 à 10 sièges, pilotes gratuits)

| Domaine | Qui | Quoi, concrètement |
|---|---|---|
| Développement | David (pipeline, base, infra, MCP), Amos (agent local, connecteurs, interface) : répartition proposée d'après ce que chacun a porté jusqu'ici, à inverser si vous préférez | Une seule chose avant toute vente (C2) : capture → relecture → MCP. Les espaces par projet (objection n°1 de la v2) avant le premier pilote. Fixtures de capture par version d'éditeur. |
| Onboarding des pilotes | Un fondateur « référent » par équipe pilote, fixé à la signature | SOP a et b. Quatre heures par équipe la première semaine, puis une heure par semaine pendant un mois. |
| Support | Astreinte **hebdomadaire alternée** (lundi 9 h au lundi 9 h) : boîte Crisp, alertes Better Stack, revue de 15 min le matin | Heures ouvrées 9 h-19 h, réponse sous 4 h ouvrées, capture réparée sous 24 h. Pas d'astreinte de nuit en pilote : on l'écrit dans le pack confiance (« pas de SLA en pilote »). |
| Ventes | Les deux, sur leur réseau ; une démo type de 20 minutes (la question « pourquoi on a choisi Postgres pour le billing ? ») | Objectif : 5 équipes hors réseau en 8 semaines (C3). |
| Administratif | Le fondateur qui sera président de la SAS | Immatriculation (section 6), Qonto, Stripe, assurance, expert-comptable, DPA, registre des traitements. Deux à trois jours de travail étalés sur trois semaines. |

**Charges sociales des fondateurs : à signaler à l'expert-comptable, pas à calculer ici.** Dans une SAS, le président (et un DG) est **assimilé salarié** au régime général : des cotisations seulement s'il se verse une rémunération, pas de cotisations minimales sans rémunération, mais pas de protection sociale non plus ; le statut TNS n'existe pas pour un dirigeant de SAS (il existe pour le gérant majoritaire de SARL). Les 2 × 2 500 € de `numbers.json` sont un net ou un brut ? Le coût chargé peut être presque le double. Points à poser à l'expert-comptable : rémunération ou dividendes, ARE et ACRE si l'un des fondateurs y a droit, TVA sur option dès le départ pour la déduire sur les achats, impôt sur les sociétés à taux réduit.

#### 3.2 Au plan (500 sièges, ~50 équipes)

| Domaine | Charge mensuelle | Qui |
|---|---|---|
| Support de niveau 1 (tickets, capture cassée, questions de facturation) | ~1 h par équipe et par mois une fois le pilote passé (`cfo-sources.md`) = 50 h, plus les pics quand Claude Code ou Cursor change de version | Le fondateur d'astreinte, un tiers de son temps |
| Onboarding des nouvelles équipes | 4 à 6 h par équipe (SOP a + b), 5 à 8 nouvelles équipes par mois à +30 % par mois = 30 à 50 h | L'autre fondateur, un quart de son temps |
| Développement et capture | Le reste, soit à peine plus d'un fondateur en tout | — |
| Ventes | 2 à 3 démos par semaine, suivi des lettres d'intention | Partagé |
| Administratif et mensuel (SOP g) | 1 jour par mois | Le président |

**Combien d'équipes deux personnes peuvent-elles accompagner ?** Avec le test des 20 questions et l'installation d'un agent sur chaque poste : **20 équipes en pilote simultané** (la limite écrite dans `offer.md` : 20 × 1 h de suivi hebdomadaire = une demi-semaine de fondateur), et **50 à 60 équipes en régime de croisière, soit 500 à 800 sièges**, à condition que le test des 20 questions soit rejoué automatiquement et que l'onboarding se fasse en visio de groupe. Au-delà, l'un des deux fondateurs ne code plus. La capacité de 2 000 sièges de `numbers.json` suppose un support presque entièrement automatisé ou un recrutement : je recommande de la ramener à 800 dans le modèle, ou d'y adosser le salaire ci-dessous.

**Premier recrutement : un ingénieur support et déploiement** (« customer engineer »), bilingue, à l'aise sur les trois OS, capable de lire un `.jsonl` de session et de corriger une fixture de capture, et de mener un onboarding seul. Déclencheur : **25 à 30 équipes payantes (mois 9 ou 10 du plan), ou un fondateur à plus de 50 % en support deux semaines de suite.** Coût à faire chiffrer par l'expert-comptable (ordre de grandeur en France : 45 à 55 k€ brut, 65 à 80 k€ chargés ; un freelance deux jours par semaine d'abord si la trésorerie l'exige). Il n'est pas dans `numbers.json` : avec lui, le point mort recule d'environ 300 sièges. Le commercial vient après, quand les démos entrantes dépassent ce que deux fondateurs peuvent tenir, pas avant 50 équipes.

### 4. Les routines (SOP)

À suivre le premier jour. Chaque routine a un propriétaire (le référent de l'équipe, ou le fondateur d'astreinte) et laisse une trace écrite (ticket Crisp ou fiche dans Attio).

#### (a) Onboarding d'une équipe pilote et lancement du test des 20 questions

1. **Avant le rendez-vous** : fiche Attio créée (équipe, CTO, nombre de devs, outils, date de fin de pilote), DPA et liste des sous-traitants envoyés avec le lien de signature Yousign, page « ce que l'agent capte et ne capte pas » envoyée au CTO pour qu'il la diffuse à ses développeurs **avant** l'installation (section 6, information des salariés).
2. **Kick-off, 45 min, en visio** : la promesse (« pourquoi on a fait ce choix, avec la source »), les limites (pas de Gmail, pas de Slack, « je ne sais pas » plutôt qu'inventer), la relecture par l'auteur, le cloisonnement par projet.
3. **Création de l'espace** : organisation, projets (un par dépôt ou par équipe, jamais « tout le monde voit tout » par défaut), membres invités par email, connecteurs GitHub (GitHub App), Linear et Notion branchés par le CTO lui-même, **rétro-chargement lancé séance tenante** (C4 : la mémoire ne doit pas être vide le jour 1).
4. **Les 20 questions, écrites par l'équipe pendant la séance**, dans le formulaire prévu : 20 questions dont elle connaît la réponse **et la source** (une PR, un ticket, une page, une session). Au moins 10 doivent porter sur des décisions (« pourquoi X ? ») et 5 sur des incidents (« comment on avait réglé Y ? »). Chaque question a sa réponse attendue et sa source attendue, saisies par l'équipe, invisibles pour Leon. Horodatage du jour 0.
5. **Installation de l'agent sur le poste du CTO en direct** (SOP b), puis chaque développeur installe seul avec le guide de 5 minutes ; le référent vérifie le lendemain que chaque poste a un « dernier message capté ».
6. **Chrono C4** : sur un poste, sans aide, mesurer le temps jusqu'à la première réponse citée depuis Claude Code ou Cursor. Noter le chiffre dans la fiche Attio.
7. **Jour 7** : premier score des 20 questions rejoué par le script, envoyé au CTO avec les questions ratées et la raison (source non connectée, fait non validé par son auteur, vraie lacune).
8. **Jour 14 et jour 21** : même chose, plus la part de propositions validées par les auteurs. Si elle est sous 30 %, appel aux développeurs : c'est l'adoption, pas le pipeline.
9. **Jour 30** : score final. ≥ 15 avec la bonne source → passage en facturation (offre fondatrice 19 €). < 15 → rien n'est facturé, et on demande la permission de continuer 30 jours de plus en expliquant ce qu'on corrige.
10. **Après le pilote** : demande de référence (une phrase citable, un cas « la réponse n'existait nulle part ailleurs », C3) et de lettre d'intention (C7).

#### (b) Installation de l'agent local sur un poste

1. **Dire avant d'installer**, en une page remise au développeur et affichée par `leon install` avant toute capture : **ce qui est capté** (vos messages et les réponses de Claude Code et de Cursor, dans les dossiers de projet que vous choisissez) ; **ce qui ne l'est jamais** (les fichiers lus, les sorties de commandes, le raisonnement du modèle, les pièces jointes, les autres applications, le navigateur, les frappes au clavier) ; **qui voit quoi** (vos conversations restent privées ; seules les décisions que vous validez d'un clic deviennent visibles des membres du projet) ; **comment arrêter** (`leon pause`, `leon exclude <dossier>`, désinstallation en une commande) ; **comment voir** (`leon preview` montre ce qui part, l'interface montre tout ce qui a été capté de votre poste).
2. Installation : `brew install leon` (macOS), MSI signé (Windows), deb/rpm (Linux). Le binaire est signé et notarisé ; le développeur peut vérifier la signature.
3. `leon login` : device flow dans le navigateur, jeton rangé dans le trousseau du système, jamais dans un fichier.
4. `leon setup` : choix des dossiers de projet à inclure (rien par défaut), hooks Claude Code et Cursor, configuration MCP de Claude Code, Cursor, Codex en une commande. Montrer `leon preview` sur une vraie session.
5. `leon status` : « dernier message capté il y a 0 min », par source. Vérifier le même signal côté interface.
6. **Premier passage de la session en cours en moins de 10 minutes** : faire poser une question dans Claude Code via MCP et obtenir une citation. Si rien ne sort, c'est un incident de capture (SOP e), pas un « ça viendra ».
7. Le développeur reçoit par mail le résumé quotidien « à relire » le lendemain à 9 h ; le référent vérifie qu'il l'a reçu.

#### (c) Demande d'export ou de suppression (délai 30 jours)

1. Réception (Crisp, mail, ou bouton « exporter / supprimer » dans l'interface d'administration du client). Ticket ouvert avec la date de réception : **le délai de 30 jours court de là**. Accusé de réception sous 1 jour ouvré.
2. **Vérifier l'identité et l'autorité** : la demande vient-elle d'un administrateur de l'organisation (suppression de compte) ou d'un utilisateur pour ses propres données (droit d'accès ou d'effacement RGPD, qui passe normalement par l'employeur, responsable du traitement, et qu'on redirige vers lui sauf si le contrat nous confie la réponse) ? En cas de doute, appel au contact signataire du DPA.
3. **Export** (à tout moment, pas seulement à la résiliation, c'est dans l'offre) : job `export` qui produit un ZIP (faits, citations, sources, fiches, journal « qui a lu quoi », en JSON et en Markdown), déposé dans un bucket privé, lien signé valable 7 jours, envoyé à l'administrateur. Objectif : sous 5 jours ouvrés.
4. **Suppression** : jour J, désactivation des jetons d'agent et MCP, et marquage « résilié » ; **J+30 au plus tard**, purge des tables (`sources`, `turns`, faits, embeddings, `read_log`), des fichiers objets, et de la file ; les sauvegardes Supabase (7 jours) et nos dumps (30 jours de rétention, à fixer ainsi) expirent d'eux-mêmes dans le délai. Les journaux techniques (Sentry, logs) sont purgés par leur rétention (30 jours).
5. **Preuve** : un fichier de purge (compte, horodatage, nombre de lignes supprimées par table, hash) archivé chez nous et envoyé au client. Fermeture du ticket avec la date, qui doit être < réception + 30 jours. Le SOP g du mois suivant vérifie qu'aucun ticket de suppression n'est resté ouvert.
6. Ce qu'on garde : la facture (obligation comptable, 10 ans), le DPA signé, le ticket lui-même. Rien d'autre.

#### (d) Fuite de périmètre suspectée (« qui a vu quoi »)

1. **Dès le signalement, geler** : désactiver le partage du fait ou de la fiche en cause (ACL remise à l'auteur seul), sans attendre l'enquête. Si le périmètre est inconnu, couper le serveur MCP de l'organisation concernée (page statut : « incident en cours, lecture suspendue pour une organisation »).
2. **Mesurer avec `read_log`** : pour chaque fait concerné, la liste des utilisateurs qui l'ont lu (fetch, search, briefing, chatbot), avec l'heure et l'outil. C'est pour cela que `fetch` écrit `read_log` : la réponse à « qui a vu quoi » doit sortir en moins d'une heure.
3. **Trouver la cause** : ACL calculée à tort (bug d'intersection), fait `sensible` classé `partageable` par Haiku puis validé par l'auteur sans lire, membre ajouté au mauvais projet par l'administrateur, dérivé (résumé, embedding) construit sur un fait restreint. Le test pgTAP « un fait visible par Paul seul n'apparaît jamais pour Marie » est rejoué sur le cas réel.
4. **Prévenir le client sous 24 h**, par écrit, avec : ce qui a été exposé, à qui, depuis quand, ce qui a été fait, ce qui reste à faire. Le client (responsable du traitement) décide s'il y a violation de données à notifier à la CNIL (72 h, art. 33 RGPD) ; le DPA prévoit qu'on l'aide. Si l'exposition sort de l'organisation du client (un autre tenant), c'est nous qui notifions, et c'est l'incident maximal.
5. Correctif déployé avec son test ; post-mortem écrit en 48 h, publié sur la page sécurité en version anonymisée ; ajout du cas au jeu d'or.

#### (e) Panne de capture silencieuse

1. **Détection** : alerte Better Stack ou canari (volume d'une source par version de parseur en chute de moitié sur 24 h, ou « dernier message capté » > 24 h sur plus de 20 % des postes d'une organisation), ou ticket d'un développeur.
2. **Qualifier en 30 min** : un poste (jeton expiré, dossier exclu, démon arrêté, mise à jour d'OS), une organisation (jeton d'app GitHub révoqué, webhook Linear cassé), ou **tous les postes d'un éditeur** (Claude Code ou Cursor a changé de format ou de chemin : la version apparaît dans les métadonnées des tours).
3. **Un poste** : `leon status` et `leon doctor` par le développeur, correction guidée par chat, sous 4 h.
4. **Tous les postes d'un éditeur** : page statut « capture Claude Code dégradée depuis la version X » dans l'heure ; récupérer un échantillon anonymisé sur un compte canari ; corriger `packages/capture` (le serveur absorbe les ruptures, l'agent n'a pas à être republié) ; ajouter la fixture de la nouvelle version ; déployer ; **rejouer les tours bruts reçus pendant la panne** (ils sont stockés tels quels dans `turns`). Objectif : 24 h, c'est l'engagement de l'architecture.
5. **Si l'agent lui-même doit changer** (nouveau chemin de fichiers, SQLite Cursor) : build signé, manifeste d'auto-update, déploiement par vagues (canari, 10 %, 100 %) sur 48 h.
6. Mail aux administrateurs des organisations touchées : période de trou, ce qui a été récupéré, ce qui est perdu (Claude Code efface après 30 jours : au-delà, c'est perdu, et on le dit).
7. Ajout du cas aux fixtures CI et à la liste de veille (notes de version Claude Code et Cursor lues chaque lundi, SOP 1.2).

#### (f) Réponse à une plainte publique

1. **Dans l'heure** : accuser réception publiquement, en une phrase, sans se justifier, au nom d'un fondateur nommé (« Merci, on regarde, je reviens vers vous aujourd'hui »), et prendre la conversation en privé (mail ou DM).
2. **Qualifier** : incident réel (capture, fuite, facturation) → SOP d, e ou g et page statut ; désaccord sur le produit ou le prix → réponse factuelle et courte ; mise en cause d'une pratique (« mouchard », « surveillance des devs ») → renvoyer à la page « ce que l'agent capte », au DPA et au Solo gratuit à l'initiative du développeur, et proposer un appel.
3. **Ne jamais** : contester les faits en public, révéler des données du client, promettre une date qu'on ne tient pas, répondre après 19 h sous le coup de l'émotion (l'autre fondateur relit avant publication).
4. **Sous 24 h** : réponse publique de fond, avec ce qui a été corrigé ou ce qu'on a décidé de ne pas faire et pourquoi. Si on avait tort, le dire.
5. Fiche Attio « plainte publique » avec le lien, la réponse, la leçon ; revue le lundi.

#### (g) Clôture mensuelle

1. **Facturation** (jour 1) : export des sièges actifs par organisation, contrôle de 5 organisations à la main contre `turns` et `read_log`, poussée à Stripe Billing, émission des factures ; avoirs pour les équipes sous 15/20 au jour 30 ; relance des échecs de paiement ; export des factures vers le dossier de l'expert-comptable (Pennylane ou Dougs récupère Stripe et Qonto automatiquement).
2. **Coûts** (jour 1) : factures Anthropic (console, usage par clé), Voyage, Supabase, Vercel, Fly, Stripe, Google Workspace, Sentry ; tableau « coût variable par siège réel vs `numbers.json` » ; si une ligne dévie de plus de 20 %, note au CFO.
3. **Citations inventées** (jour 2) : agrégation des échantillons hebdomadaires, taux du mois par outil client (Claude Code, Cursor, ChatGPT), publication sur la page sécurité si stable, note au conseil (C5).
4. **20 questions** : score médian et distribution sur toutes les équipes, questions ratées les plus fréquentes → backlog produit.
5. **Suppressions** : liste des organisations résiliées depuis > 30 jours, purge (SOP c), preuves archivées, vérification qu'aucun ticket de suppression n'est en retard.
6. **Restauration** : un dump restauré dans un projet Supabase jetable, chronométré, projet détruit ensuite.
7. **Accès et clés** : revue des accès prod, rotation des jetons > 90 jours, liste des sous-traitants et registre des traitements relus.
8. **Trésorerie** : solde Qonto, factures fournisseurs, note de 5 lignes au CFO.

### 5. La plus petite pile d'outils

| Besoin | Retenu | Prix public | Alternatives vérifiées |
|---|---|---|---|
| Paiement et abonnements | **Stripe Billing** (sièges à l'usage, portail client, Smart Retries, factures conformes) | 1,5 % + 0,25 € par transaction + 0,7 % Billing [V] ; Stripe Tax 0,5 % si l'on vend hors France | GoCardless (SEPA seul), Paddle / Lemon Squeezy (merchant of record, prix à vérifier) |
| Helpdesk | **Crisp** (boîte partagée support@, chat sur le site, 2 sièges) | Gratuit ; Mini 45 $/espace/mois [V] | Help Scout gratuit 5 utilisateurs puis 25 $/utilisateur [V] ; une boîte Google Workspace partagée (6,80 €/utilisateur) |
| Page statut | **Better Stack** (1 page statut incluse dans Uptime gratuit) | Gratuit [V] | Instatus gratuit sans domaine personnalisé, Pro 20 $/mois [V] ; Atlassian Statuspage gratuit (100 abonnés), Hobby 29 $ [V] |
| Monitoring et alertes | **Better Stack Uptime** (10 moniteurs à 30 s, alertes mail/Slack) + **Sentry Team** (erreurs, région UE) | Gratuit + 26 à 29 $/mois [V] ; astreinte téléphonique Better Stack 29 à 34 $/répondant si besoin | Better Stack Logs Europe (Nano 30 $/mois) pour les journaux, plus tard ; Grafana Cloud (non vérifié ce jour) |
| Signature électronique | **Yousign One** (DPA, lettres d'intention, pacte) | 9 € HT/mois, 10 signatures/mois ; gratuit à 2 signatures/mois [recherche, page tarifs redirigée vers youtrust.com, non lue] | DocuSign (non vérifié ce jour) |
| Compta et banque | **Qonto Basic** + **Dougs** (ou Keobiz) ; Pennylane si le cabinet choisi l'impose | 9 à 11 € HT/mois + 79 €/mois [recherche] | Shine, Blank (banques) ; Keobiz 89 à 179 € |
| CRM léger | **Attio** (pilotes, lettres d'intention, plaintes) | Gratuit jusqu'à 3 sièges ; Plus 35 à 44 $/utilisateur [V] | HubSpot CRM gratuit, Starter ~15 à 20 €/utilisateur [recherche] ; une base Notion |
| Code et CI | **GitHub Team** | 4 $/utilisateur/mois [V] | — |
| Email transactionnel | **Resend** (résumés « à relire », factures, alertes) | Gratuit jusqu'à 3 000/mois, Pro 20 $ [V] | Postmark 15 $/10 000 [V] ; Brevo (non vérifié) |
| Email pro et agenda | **Google Workspace Business Starter** | ~6,80 € HT/utilisateur/mois [recherche] | Microsoft 365 Business Basic (non vérifié) |
| Domaine et DNS | **OVHcloud** (.fr et .com) | 7,79 € et 13,49 € HT/an en renouvellement [recherche] | Gandi (renouvellements chers : 28,78 € le .fr), Cloudflare Registrar (non vérifié) |
| Mots de passe et secrets | Un gestionnaire d'équipe (1Password ou Bitwarden, prix non vérifiés) ; secrets d'infra dans Fly et Vercel, jamais dans le dépôt | — | — |

Total de la pile au mois 1 : **environ 120 à 160 € par mois** hors hébergement et LLM.

### 6. Licences, permis, conformité

France, SaaS qui traite des données de salariés de ses clients. Chaque point renvoie à la page officielle. **Les règles changent ; un avocat et l'expert-comptable confirment. Ce n'est pas un avis juridique.**

| # | Obligation | Ce qu'il faut faire, en bref | Quand | Page officielle |
|---|---|---|---|---|
| 1 | **Immatriculation de la SAS** | Statuts, dépôt du capital (attestation de la banque), annonce légale (199 € HT forfait SAS 2026), dépôt sur le guichet unique INPI ; greffe 33,83 €, bénéficiaires effectifs 19,33 €. Kbis sous 3 à 10 jours. Condition préalable à Stripe, à l'assurance, au DPA et à la première facture. | Avant le premier pilote payant, donc maintenant | https://formalites.entreprises.gouv.fr/ · https://entreprendre.service-public.gouv.fr/vosdroits/F32886 (créer une SAS) · https://entreprendre.service-public.gouv.fr/vosdroits/R61572 (téléservice) |
| 2 | **Numéro de TVA intracommunautaire** | Attribué par le SIE après immatriculation ; obligatoire sur les factures et le site. Franchise en base possible sous les seuils, mais pour vendre en B2B et déduire la TVA sur les achats, l'option TVA dès le départ est en général préférable : à trancher avec l'expert-comptable. Facturation électronique obligatoire en réception depuis septembre 2026 pour toutes les entreprises (Pennylane et Dougs la gèrent). | À l'immatriculation | https://entreprendre.service-public.gouv.fr/vosdroits/F23570 |
| 3 | **Mentions légales du site** | Dénomination, siège, RCS, SIREN, TVA, directeur de la publication, hébergeur, contact. | Avant la mise en ligne de la page de test | https://entreprendre.service-public.gouv.fr/vosdroits/F37351 · https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter |
| 4 | **CGV / CGU** | En B2B, les CGV sont communiquées à tout client qui les demande (art. L441-1 code de commerce) ; les nôtres sont en ligne et acceptées à l'inscription. Y mettre la garantie « 15 sur 20 », la résiliation, l'export, la suppression sous 30 jours, le plafond de responsabilité, la loi applicable. Relues par l'avocat (2 500 € déjà budgétés). | Avant le premier pilote | https://entreprendre.service-public.gouv.fr/vosdroits/F33527 |
| 5 | **RGPD : rôles et registre** | Pour les données des salariés du client, **le client est responsable du traitement, Leon est sous-traitant** (art. 28). Pour nos propres données (comptes, facturation, prospects Attio), nous sommes responsables. Tenir le **registre des activités de traitement** (deux volets : sous-traitant et responsable). Désigner un référent RGPD (DPO non obligatoire a priori pour une PME sans traitement à grande échelle : à confirmer). | Avant le premier pilote | https://www.cnil.fr/fr/le-registre-des-activites-de-traitement · https://eur-lex.europa.eu/eli/reg/2016/679/oj (art. 28, 30, 33, 35) |
| 6 | **DPA (art. 28)** | Contrat de sous-traitance avec chaque client : objet, durée, nature, catégories de données, instructions, confidentialité, sécurité, sous-traitants ultérieurs (liste publiée, préavis de changement), assistance (droits des personnes, violations), suppression ou restitution à la fin, audits. Signé via Yousign à l'onboarding. Nos propres DPA de sous-traitant : Supabase (auto-incorporé, région au choix) [V], Vercel (page DPA en ligne) [V], Anthropic (incorporé aux Commercial Terms, liste de sous-traitants publiée) [V], Voyage (opt-out de rétention à activer, sinon le contenu peut servir à l'amélioration du service) [recherche], Fly.io (politique de confidentialité ; DPA à demander). | Avant le premier pilote | https://www.anthropic.com/subprocessors · https://supabase.com/legal/dpa · https://supabase.com/legal/customer-resources/subprocessor-list · https://vercel.com/legal/dpa |
| 7 | **AIPD (analyse d'impact)** | Probablement **requise** : la liste CNIL (délibération 2018-327) vise la « surveillance constante de l'activité des employés », et l'art. 35 vise la surveillance systématique et les données à grande échelle. Même si Leon n'est pas conçu pour surveiller, il capte des conversations de salariés en continu. L'AIPD est l'affaire du responsable du traitement (le client), mais c'est à nous de **fournir une AIPD type** du produit (outil PIA de la CNIL, gratuit) que chaque client adapte : c'est un argument de vente pour les équipes de plus de 50. | Rédigée avant le premier client de plus de 50 salariés (C10), et de préférence avant le premier pilote | https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd · https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000037560659/ · https://www.cnil.fr/fr/outil-pia-telechargez-et-installez-le-logiciel-de-la-cnil |
| 8 | **Information des salariés du client** | Aucune information concernant personnellement un salarié ne peut être collectée par un dispositif qui n'a pas été porté préalablement à sa connaissance (art. L1222-4 code du travail) ; proportionnalité (L1121-1) ; la CNIL rappelle l'information individuelle (finalités, base légale, destinataires, durées, droits) et le registre. Notre page « ce que l'agent capte et ne capte pas » et le déploiement à l'initiative du développeur (Solo) servent à cela ; le client doit en plus informer par écrit (note de service, mise à jour de la charte informatique). | Avant toute installation sur un poste | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900861 (L1222-4) · https://www.cnil.fr/fr/les-outils-informatiques-au-travail · https://www.cnil.fr/fr/travail-et-donnees-personnelles |
| 9 | **CSE à partir de 50 salariés** | Information **et consultation** du CSE avant la décision de mise en œuvre de tout moyen permettant un contrôle de l'activité des salariés (art. L2312-38, d'ordre public). Sans cela, le dispositif est inopposable et les preuves illicites. Fournir au client un **dossier CSE type** (ce que capte Leon, ce qu'il ne capte pas, qui voit quoi, droits, AIPD). | Avant le premier client de plus de 50 salariés (C10) | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035610275/ (L2312-38) |
| 10 | **Hébergement des données en UE** | Supabase Francfort (base), Fly.io Francfort (API, workers), Vercel `fra1` (interface, à forcer), Scaleway Paris (dumps). Données au repos et traitements principaux en UE. Les journaux Sentry : région UE, mais comptes et journaux d'audit aux États-Unis (annexe 6 de l'architecture). | Déjà fait pour la base ; Vercel et Fly à confirmer | https://supabase.com/docs/guides/platform/regions · https://vercel.com/docs/regions · https://docs.fly.io/reference/regions |
| 11 | **Sous-traitant LLM : où tournent les modèles ?** | **Anthropic en direct** : `inference_geo` ne propose que `global` (défaut) ou `us` (+10 %), pas d'UE ; le contenu transite donc hors UE. Anthropic **n'est pas certifié Data Privacy Framework** [recherche] : le transfert repose sur les clauses contractuelles types incluses dans son DPA. Rétention : contenu supprimé sous 30 jours, jamais utilisé pour l'entraînement sans accord, rétention zéro possible sur demande (Haiku 5.5 y est éligible ; les modèles Fable/Mythos non). **Option UE : Amazon Bedrock, profil `eu.anthropic.claude-haiku-5-5` (routage limité aux régions UE, +10 %), AWS étant alors le sous-traitant et les données restant en UE** ; Vertex AI en équivalent Google. **Recommandation : Bedrock UE par défaut dès qu'un compte AWS existe (après immatriculation, avec les crédits Activate) ; d'ici là, Anthropic direct, dit tel quel dans la liste des sous-traitants.** Voyage AI (MongoDB) : activer l'opt-out de rétention ; localisation non vérifiée, à demander. | Liste des sous-traitants publiée avant le premier pilote ; Bedrock avant le premier client payant | https://platform.claude.com/docs/en/manage-claude/data-residency · https://platform.claude.com/docs/en/manage-claude/api-and-data-retention · https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data · https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html · https://docs.voyageai.com/docs/faq |
| 12 | **Violation de données** | Le sous-traitant notifie le responsable « dans les meilleurs délais » ; le responsable notifie la CNIL sous 72 h (art. 33). SOP d. | Procédure écrite avant le premier pilote | https://eur-lex.europa.eu/eli/reg/2016/679/oj (art. 33, 34) |
| 13 | **Assurance RC pro et cyber** | Pas obligatoire par la loi pour un éditeur de logiciel, mais exigée par la plupart des DPA et des acheteurs de plus de 50 personnes (montant de garantie, attestation annuelle). | Après immatriculation, avant le premier client payant | Devis (section 2.2) |
| 14 | **AI Act (règlement 2024/1689)** | À faire qualifier par l'avocat : l'annexe III classe à haut risque les systèmes d'IA destinés à **suivre et évaluer les performances et le comportement des travailleurs**. Leon ne note personne et ne décide rien, mais il capte l'activité : la qualification « pas haut risque » doit être écrite et argumentée (finalité : mémoire des décisions, pas évaluation ; relecture par l'auteur ; pas de métrique individuelle). Obligations de transparence des fournisseurs de modèles : chez Anthropic. | Avant le premier client de plus de 50 salariés | https://eur-lex.europa.eu/eli/reg/2024/1689/oj |
| 15 | **CASA Tier 2 (si Gmail ou Drive arrivent)** | Vérification OAuth Google pour les scopes restreints : écran de consentement, politique de confidentialité, vidéo de démonstration, puis audit CASA Tier 2 par un laboratoire agréé (TAC Security 540 à 1 800 $/an), 4 à 8 semaines, à renouveler chaque année. Un seul audit pour Gmail, Drive et Agenda. | Le jour où une équipe payante demande Gmail, pas avant | https://developers.google.com/workspace/guides/configure-oauth-consent · annexe 7 de l'architecture |
| 16 | **Marque** | Dépôt INPI classes 9 et 42 (230 €) après une recherche d'antériorité ; « Leon » est un prénom courant : vérifier la disponibilité avant d'imprimer quoi que ce soit. | Avant le site public | https://www.inpi.fr/proteger-vos-creations/proteger-votre-marque/les-etapes-cles-du-depot-de-marque |

### 7. Registre des risques

Probabilité sur 12 mois (faible < 20 %, moyenne 20 à 60 %, haute > 60 %) ; gravité de 1 (gênant) à 5 (tue le produit). Propriétaire : le fondateur d'astreinte, sauf mention.

| # | Risque | Prob. | Grav. | Prévention | Plan si ça arrive |
|---|---|:-:|:-:|---|---|
| 1 | **Anthropic ou Cursor change le format des sessions, la capture casse** | Haute (Claude Code sort une version par semaine ; Cursor a déjà changé de `state.vscdb` en hooks) | 4 | Fixtures par version en CI ; comptes canari testés chaque jour ; notes de version lues le lundi ; l'agent n'interprète rien, le serveur absorbe les ruptures ; tours bruts conservés pour rejeu. | SOP e : page statut dans l'heure, correctif serveur sous 24 h, rejeu des tours reçus, mail aux administrateurs. Si l'agent doit changer, auto-update par vagues sur 48 h. |
| 2 | **Un passage privé remonte par erreur à l'équipe** | Moyenne (Haiku sur-signale le sensible, mais une validation distraite suffit) | 5 | ACL = intersection des preuves, dérivés à l'ACL la plus restrictive, tests pgTAP allow/deny à chaque déploiement, relecture par l'auteur obligatoire, faits `sensible` jamais proposés en partage, `read_log` sur chaque lecture, espaces par projet. | SOP d : gel immédiat, « qui a vu quoi » en 1 h, client prévenu sous 24 h, post-mortem public à 48 h. Un seul cas avéré suspend la remontée automatique pour tout le monde jusqu'à correction. |
| 3 | **Un fondateur malade ou indisponible plusieurs semaines** | Moyenne | 4 | Tout est dans le dépôt et dans Attio ; les deux ont les accès prod, Stripe, Qonto, registrar, Anthropic ; mots de passe dans un gestionnaire partagé ; SOP écrites pour qu'un seul suive ; pas de déploiement le vendredi. | Mode dégradé écrit : support et facturation d'abord, développement gelé, onboardings reportés avec un mot honnête aux pilotes ; freelance ponctuel (budget conformité) si > 4 semaines. |
| 4 | **Supabase en panne ou projet perdu** | Faible pour une panne de quelques heures (déjà vu chez tous les hébergeurs), très faible pour une perte | 4 | Plan Pro (sauvegardes quotidiennes, 7 jours) ; `pg_dump` nocturne chiffré chez Scaleway ; extensions Postgres standard seulement, donc restauration possible chez Neon ou Scaleway en quelques heures ; test de restauration mensuel. L'agent local met les tours en file sur le poste tant que l'API ne répond pas (à vérifier dans le code : c'est une exigence). | Page statut ; lecture MCP indisponible le temps de la panne ; si > 4 h, restauration du dernier dump sur Scaleway Paris et bascule DNS ; perte maximale : une nuit de données, rejouée depuis les agents. |
| 5 | **Une clé API ou un secret collé dans une session captée et stocké chez nous** | Haute (ça arrive dans toutes les sessions de code) | 4 | Détection de secrets dans l'agent avant envoi (motifs `sk-`, `ghp_`, `AKIA`, JWT, chaînes de haute entropie) : le secret est remplacé par `[secret masqué]` sur le poste, jamais transmis ; seconde passe côté serveur ; les faits ne citent jamais un passage masqué. | Si un secret passe : notification au développeur dans l'heure pour révocation, purge de la ligne dans `turns` et des dérivés, mention dans le post-mortem. Le secret n'a jamais vocation à être « utile » : aucune exception. |
| 6 | **Un client demande la suppression et on rate les 30 jours** | Moyenne (deux fondateurs, une demande par mail oubliée) | 3 (contractuel et RGPD) | SOP c avec ticket daté à réception ; bouton de suppression en libre-service qui lance le job sans nous ; SOP g qui vérifie les tickets ouverts ; rétention des dumps fixée à 30 jours. | Exécuter sous 48 h, envoyer la preuve, dire la date réelle au client par écrit, geste commercial, et corriger le SOP. |
| 7 | **Le test des 20 questions échoue chez un pilote (< 15)** | Moyenne (une fiche sur deux mal choisie au 15/10, remplacements rarement détectés) | 3 (une équipe non facturée), 4 si plusieurs | Rétro-chargement dès l'heure 1 ; questions écrites avec leur source attendue ; score hebdomadaire et analyse des échecs (source non branchée, fait non validé, vraie lacune) avant le jour 30 ; plafond de 300 € de calcul par pilote. | Ne rien facturer, comme promis ; 30 jours de plus avec un plan de correction écrit ; si la cause est l'adoption (personne ne valide), le dire au CTO ; deux échecs sur la même cause = sujet produit n°1 de la semaine. |
| 8 | **Anthropic (ou OpenAI, Cursor) lance la même fonction** | Haute sur 12 mois (mémoire d'équipe dans Claude Team, « memory » dans Claude Code) | 4 | Ce que le conseil a demandé : un marché étroit, des références nommées, et ce qu'un éditeur de modèle ne fera pas : plusieurs outils IA et plusieurs sources dans une seule mémoire, hébergée en UE, avec DPA, export complet, cloisonnement par projet et citation vérifiée. Mesurer le « dix fois mieux » (C5) sur un jeu fixe contre Claude Team et Notion. | Repositionner sur ce qui reste : multi-outils, UE, export ; accélérer Codex, Gemini CLI, ChatGPT côté capture ; si le marché bascule, l'actif qui reste est le pipeline de faits sourcés et les clients. |
| 9 | **Stripe bloque ou retient le compte** | Faible (activité SaaS B2B classique), moyenne au démarrage si le KYB est incomplet | 4 (plus d'encaissement) | Compte ouvert avec les vrais documents dès le Kbis ; description d'activité claire ; pas de prépaiement avant l'immatriculation ; volumes réguliers ; SEPA proposé en second moyen. | Répondre sous 24 h à la demande de pièces ; basculer les prélèvements SEPA sur GoCardless le temps du blocage ; facturer manuellement par virement Qonto pour les 10 premiers clients. |
| 10 | **La facture LLM explose** (volume non filtré, boucle de rejeu, prompt > 100 k tokens facturé 5 fois plus cher sur Haiku 5.5) | Moyenne (déjà vu : 17 $ par personne avant optimisation au 14/10) | 3 | Filtre mécanique avant tout appel ; plafond de tokens par tour et par siège et par jour dans le pipeline ; alerte budget console Anthropic ; `llm_usage` relu chaque semaine ; Batch pour la reprise d'historique ; plafond de 300 € par pilote. | Couper l'étiquetage (les tours restent stockés, l'index plein texte continue de servir), trouver la cause, rejouer en Batch ; si un siège coûte > 5 € dans le mois, le signaler au client (crédits d'ingestion prévus dans l'offre). |

### 8. Questions ouvertes (ne se savent que sur devis ou par essai)

1. Assurance RC pro + cyber pour un éditeur SaaS traitant des données de salariés : trois devis (Orus, Hiscox, Stoïk) après immatriculation.
2. Avocat : deux devis pour CGV + DPA + AIPD type + dossier CSE type + qualification AI Act (le pack à 2 500 € couvre-t-il tout ?).
3. Expert-comptable : Dougs ou Keobiz, avec la question des charges du président (section 3.1) et de l'option TVA.
4. Pentest : devis Vaadata et un second cabinet, périmètre API + MCP + agent, pour le trimestre 2.
5. Bedrock UE : disponibilité réelle et latence du profil `eu.anthropic.claude-haiku-5-5` à mesurer ; les crédits AWS Activate supposent une société immatriculée.
6. Voyage AI : localisation des serveurs et DPA (page tarifs vérifiée, localisation non).
7. Fly.io : DPA formel (page `/legal/dpa` absente ; politique de confidentialité seulement).
8. Paddle ou Lemon Squeezy comme alternative « merchant of record » : prix non vérifiés ce jour.
9. Dans le code : la mise en file locale des tours quand l'API ne répond pas, et la détection de secrets avant envoi (risques 4 et 5) sont-elles implémentées ? À vérifier avant le premier pilote.
10. Yousign : la page tarifs redirige vers youtrust.com (404 ce jour) ; prix pris sur des comparatifs 2026, à confirmer.

### Sources

Prix vérifiés le 18/10/2026 sur la page du fournisseur [V] : supabase.com/pricing · vercel.com/pricing · fly.io/pricing · docs.voyageai.com/docs/pricing · platform.claude.com/docs/en/about-claude/pricing · platform.claude.com/docs/en/manage-claude/data-residency · platform.claude.com/docs/en/manage-claude/api-and-data-retention · privacy.claude.com (rétention 30 jours) · stripe.com/fr/pricing · github.com/pricing · resend.com/pricing · postmarkapp.com/pricing · sentry.io/pricing · betterstack.com/pricing · crisp.chat/en/pricing · instatus.com/pricing · atlassian.com/software/statuspage/pricing · helpscout.com/pricing · attio.com/pricing · supabase.com/legal/dpa · inpi.fr.

Recherches web du 18/10/2026 (pages non officielles, recoupées sur plusieurs sites, à confirmer par devis) : frais de greffe et annonce légale 2026 (shine.fr, legalstart.fr, legalplace.fr, captaincontrat.com) ; Legalstart et LegalPlace ; Qonto ; Dougs, Keobiz, Pennylane ; Yousign ; Google Workspace ; OVHcloud et Gandi ; Hiscox, Orus, Stello, Stoïk ; pentest (yeeply, matproof, laucked, vaadata.com) ; CASA (deepstrike.io, switchlabs.dev) ; Bedrock Haiku 5.5 en UE (docs.aws.amazon.com) ; certification DPF d'Anthropic (companyscope.io, sonomos.ai).

Pages officielles citées en section 6 : service-public (R61572, F32886, F23570, F37351, F33527), formalites.entreprises.gouv.fr, economie.gouv.fr, cnil.fr (registre, AIPD, outil PIA, outils informatiques au travail, travail et données personnelles), legifrance.gouv.fr (L1222-4, L2312-38, délibération CNIL 2018-327), eur-lex (RGPD 2016/679, AI Act 2024/1689), anthropic.com/subprocessors, supabase.com (DPA, sous-traitants, régions), vercel.com (DPA, régions), docs.fly.io/reference/regions, developers.google.com (écran de consentement OAuth).

Études internes : `../architecture-2026-10/README.md` et annexes 3, 5, 6, 7 ; `../couts-2026-10/README.md` et annexes 1, 4, 6 ; `offer.md`, `pitch.md`, `board.md`, `cfo.md`, `cfo-sources.md`, `numbers.json`.

## Launch plan

Responsable du lancement. Matière première : `board.md` (C1 à C10, trois expériences), `offer.md` (offre v2, objection n°1 : le cloisonnement par projet), `pricing.md` (A/B 19 € et 29 €), `panel/results.md` et `panel-v2/results.md` (19 % puis 25 % d'achat simulé : une **borne haute**, pas une prévision), `numbers.json` et `cfo.md` (seuil 337 sièges, trésorerie 53 686 €, levier n°1 : raccourcir la rampe), `customer.json`.

`marketing.md`, `brand.md` et `ops.md` n'existaient pas au moment d'écrire. Tout ce qui en dépend est marqué **[H]** (hypothèse à remplacer par leur contenu) : calendrier marketing J−14, CAC maximum, délais fournisseurs, routines.

**État technique réel au 18/10** (`docs/specs/2026-10-13-premier-jet.md`, `main` au 14/10, mémoire des sessions) : TypeScript, Postgres avec RLS par fait, pipeline triage → extraction → rangement (Haiku 5.5, décision D16 du 15/10), import des sessions Claude Code (`src/cli/import-claude-code.ts`), extension navigateur, serveur MCP à jeton personnel, interface de lecture. **Pas encore faits** : l'inversion « brut + étiquetage léger + pgvector » (le code cherche en plein texte, migrations 0001 à 0006 sans embeddings), l'agent local Cursor, le cloisonnement par projet (les principals sont « moi » et « l'équipe », rien entre les deux), la relecture par l'auteur (le tri propose, l'écran « À vérifier » existe en spec, pas le flux complet), le tableau de bord des 20 questions, **les connecteurs GitHub, Linear et Notion** (aucun fichier dans `src/server` sur `main` ; ils sont en cours dans les PR #18 à #20 d'Amos « Connecteurs v1 », ouvertes le 15/10 et non fusionnées au 18/10, ce qui raccourcit le chemin critique si elles passent), l'export et la suppression, le déploiement. La société n'est pas immatriculée, il n'y a pas de DPA, et la base Supabase n'a pas de sauvegarde.

Ce dernier paragraphe est la contrainte principale du plan : l'offre v2 promet plus que le code ne fait, et le calendrier ci-dessous dit dans quel ordre le code rattrape l'offre.

---

### Étape 1. Le test avant de dépenser (lundi 20 octobre → vendredi 14 novembre 2026)

Leon est un abonnement. Le test adapté n'est pas une pré-vente de produit mais une **offre « membre fondateur » payée d'avance** : l'« Équipe fondatrice » de `offer.md` (19 € par siège garanti 12 mois, 20 équipes, jusqu'au 31/01/2027), vendue avant que le produit complet existe, à des gens qui mettent une carte. Les trois expériences du conseil s'y ajoutent : elles répondent à trois questions différentes et aucune ne remplace les autres.

| expérience | question à laquelle elle répond | condition du conseil |
|---|---|---|
| (a) banc d'essai à l'aveugle | le produit est-il **dix fois mieux** que ce que l'acheteur possède déjà ? et l'inversion brut-d'abord tient-elle ? | C5 |
| (b) 12 entretiens | le **problème** existe-t-il chez des gens qu'on ne connaît pas, et paient-ils ? | C1, C7 |
| (c) deux pages d'atterrissage | des inconnus mettent-ils **une carte**, et à quel prix ? | C7 |

#### La ligne de succès, écrite avant

> **Au vendredi 14 novembre 2026 à 18 h : 5 pilotes réservés avec carte bancaire (pages A + B), dont au moins 3 hors du réseau proche, et 3 engagements écrits issus des entretiens (lettre d'intention ou prépaiement). Et le banc d'essai n'a pas tué le pivot (connecteurs natifs < 80 %).**

Les trois conditions sont cumulatives. 5 pilotes réservés avec 2 engagements écrits : on continue, mais on le dit. 5 pilotes tous issus du réseau : ça ne compte pas comme preuve.

**Comparaison avec le panel.** Le panel donne 19 % (100 cartes, v1) puis 25 % (20 cartes, v2), et 44 % sur les profils techniques en v2. Ce sont des acheteurs simulés qui ont lu le pitch et devaient répondre ; ce n'est pas un taux de conversion de page. Sur une page d'atterrissage réelle, une réservation payante convertit typiquement **0,5 à 3 % des visiteurs** [H] : avec 300 à 600 visites en 4 semaines (voir le budget), on attend 2 à 15 réservations. La ligne de succès (5) est dans le bas de cette fourchette, volontairement. **Si les vrais acheteurs et le panel se contredisent, les vrais acheteurs priment**, dans les deux sens : 25 % simulés et 0 carte réelle, c'est un non.

**Ce qu'on fait selon le résultat (décidé maintenant, pas le 14 novembre) :**

| résultat au 14/11 | lecture | décision |
|---|---|---|
| ≥ 5 réservations, ≥ 3 engagements, banc d'essai OK | l'offre v2 s'achète | **GO** : l'étape 2 continue sans changement ; les 5 pilotes démarrent le 17/11 |
| 2 à 4 réservations, ou 1 à 2 engagements | le problème est là, l'offre ou le prix coince | **retour à l'offre** : les entretiens disent quelle objection (cloisonnement, agent « mouchard », connecteurs) ; une seule itération de 2 semaines (17/11 → 28/11) sur la page gagnante ; le lancement glisse au 26/01 (voir étape 2) |
| 0 ou 1 réservation avec ≥ 300 visites, 0 engagement écrit sur 12 entretiens | personne ne paie | **PASS** ou retour au conseil : on ne lance pas le compte à rebours juridique (pas d'avocat, pas d'immatriculation) tant que ce n'est pas tranché |
| connecteurs natifs ≥ 80 % au banc d'essai | pas de « dix fois mieux » | **le pivot pur est mort** : Leon n'est pas un produit de recherche ; ce qui reste à vendre, c'est la capture des sessions et les décisions validées ; on retourne au conseil avec les chiffres |
| B (29 €) réserve autant que A (19 €) | la valeur tient | le prix de liste passe à 29 € ; l'offre fondatrice reste à 19 € |

**Ce qui se dépense pendant le test** (plafond 1 200 €, sans la société) : ~500 € de trafic payant, 150 à 300 € pour le tiers qui note le banc d'essai, 0 € pour les entretiens, un devis d'avocat (gratuit) et, en cas de GO le 14/11, le lancement des frais juridiques. **Rien d'irréversible avant le 14 novembre.**

#### Calendrier des 4 semaines

| semaine | (a) banc d'essai, David | (b) entretiens, David + Amos | (c) pages, Amos |
|---|---|---|---|
| **S1** 20-24/10 | lun-mar : 30 questions et corrigé écrits, gel des données au 20/10 ; mer-ven : prototype brut + pgvector v0 (branche `david/brut-pgvector`) | liste de 40 noms hors réseau, 12 rendez-vous pris d'ici vendredi ; guide validé ; modèle de lettre d'intention ; tiers évaluateur recruté | pages A et B écrites et en ligne jeudi 23/10 ; parcours de réservation testé ; mesure en place ; préalable Stripe tranché (voir encadré) |
| **S2** 27-31/10 | prototype v0 fini mer 29/10 ; lun-mer : les 3 systèmes répondent aux 30 questions ; jeu-ven : le tiers note à l'aveugle | 4 entretiens (2 chacun) ; notes rédigées le jour même ; première demande d'engagement en fin d'entretien | trafic lancé lun 27/10 (250 €) ; lecture quotidienne visites → clic → carte ; posts des fondateurs |
| **S3** 2-6/11 | résultats dépouillés lun 2/11, note d'une page mardi : rappel, précision, citations inventées, par système | 5 entretiens ; relances des engagements | second budget (250 €) sur la page qui convertit le mieux ; ajustement du texte **seulement** si une objection revient 3 fois |
| **S4** 9-13/11 (mer 11/11 férié) | si l'hybride est validé : spec de l'inversion pour l'étape 2 ; sinon, note pour le conseil | 3 entretiens ; synthèse des 12 jeudi 12/11 ; compte des engagements écrits | arrêt du trafic jeu 12/11 ; comptage final **ven 14/11 à 18 h** |

**Vendredi 14 novembre, 17 h : revue de fin de test**, les deux fondateurs, une heure, décision écrite dans ce dossier (`launch-decision-2026-11-14.md`) selon la table ci-dessus.

#### (a) Le banc d'essai à l'aveugle sur 30 questions

**Les données.** Celles de David et Amos : les sessions Claude Code depuis septembre, le dépôt `leon` (PR, commentaires, commits), `docs/`. Gelées au lundi 20/10 (un export daté, le même pour les trois systèmes). Ce sont de vraies données de travail avec de vraies décisions (D6b, D15, D16, choix de Postgres, port 3002, Haiku vs Sonnet…) et de vrais bugs réglés.

**Les 30 questions**, écrites avant toute réponse, chacune avec sa réponse attendue et sa source exacte (id de session, PR, fichier). Chaque fondateur en écrit 15 sur ce qu'**il** sait, pour que le corrigé soit sûr.

| type | nombre | exemple |
|---|:-:|---|
| « pourquoi a-t-on choisi X ? » | 10 | « pourquoi l'extraction est-elle passée de Sonnet à Haiku ? » |
| « comment avait-on réglé cette erreur ? » | 8 | « pg-boss relançait les erreurs LLM : qu'a-t-on fait ? » |
| « qu'est-ce qui a été décidé sur… / état actuel » | 7 | « quel modèle fait le rangement aujourd'hui ? » (la réponse a changé : teste le « remplacé par ») |
| **pièges** : la réponse n'existe nulle part dans les données | 5 | « pourquoi a-t-on écarté Neon ? » (jamais discuté) : la bonne réponse est « je ne sais pas » |

**Les trois systèmes**, dans les mêmes conditions (même question, un seul essai, pas de relance) :

1. **Connecteurs natifs** : Claude (Team ou Pro) avec le connecteur GitHub et les docs en projet, **ou** ChatGPT avec ses connecteurs ; les sessions Claude Code sont fournies comme fichiers dans le projet, puisque c'est ce qu'un acheteur « déjà équipé » pourrait faire au mieux. C'est le bundle à 20 $ du conseil.
2. **Prototype brut + vecteurs** : les tours bruts + étiquetage léger + pgvector (embeddings Voyage, `cfo-sources.md`), servis à Claude Code par MCP. À construire en S1-S2 (v0 : une colonne vector, un index, un outil MCP `search` hybride plein-texte + vecteurs ; pas d'interface). C'est l'inversion de `idea.md`.
3. **Faits actuels** : le pipeline de `main` (extraction Haiku, fiches, citations vérifiées par `quote.ts`), servi par le MCP existant.

**La notation.** Un tiers (un développeur hors du projet, payé 150 à 300 € pour une demi-journée ; pas un ami de l'un des deux) reçoit, pour chaque question, les trois réponses dans un ordre tiré au sort, sans le nom du système, avec le corrigé. Il note par réponse : **correcte** (0/1), **source exacte citée** (0/1 ; la citation doit pointer sur le bon tour, la bonne PR), **citation inventée** (0/1 : une source qui n'existe pas ou ne dit pas ça), **« je ne sais pas » à bon escient** sur les pièges (0/1). David compile : rappel (part des 25 questions à réponse traitées correctement), précision (part des réponses données qui sont correctes), taux de citations inventées, score sur les pièges.

**Critères d'arrêt, écrits avant :**
- **Connecteurs natifs ≥ 80 % de rappel → le pivot pur est mort.** Le bundle à 20 $ fait déjà le travail ; Leon ne peut pas vendre « la réponse avec la source » comme résultat. Reste à vendre ce que les connecteurs ne voient pas : les décisions des sessions, validées par l'auteur, remontées à l'équipe. Retour au conseil.
- **Brut > faits sur le rappel → l'hybride est validé** : le brut devient la source de vérité, l'étiquetage léger reste pour les dates, les entités et le « remplacé par », l'extraction en faits n'est plus le chemin principal. L'étape 2 construit ça.
- **Brut < faits sur le rappel** : l'inversion ne paie pas ; on garde le pipeline de faits et on y ajoute pgvector comme second chemin. L'étape 2 change de spec (moins de travail, pas plus).
- **Citations inventées > 5 % sur le meilleur système** : la promesse « citation exacte ou je ne sais pas » n'est pas tenable en l'état ; on ne lance pas sans un garde-fou (le MCP ne rend que des citations vérifiées).
- Le « dix fois mieux » : on le lit comme l'écart Leon (meilleur système) − connecteurs natifs sur les questions « pourquoi » et « comment réglé ». **Moins de 20 points d'écart : pas dix fois mieux**, et `marketing.md` ne doit pas le prétendre.

Limite dite d'avance : 30 questions sur les données de deux personnes, c'est un signal de direction, pas une mesure publiable. Les pilotes (étape 2) refont la mesure avec leurs 20 questions.

#### (b) 12 entretiens de CTO et fondateurs techniques hors du réseau proche

**« Hors du réseau proche »** : pas d'amis, pas d'anciens collègues, pas de cofondateur de quelqu'un qu'on connaît. Le second degré par introduction est accepté (« tu connais un CTO d'une boîte de 10 à 30 devs qui vit dans Cursor ? »), à condition que l'interlocuteur ne nous doive rien.

**Où les trouver** (viser 40 noms pour 12 rendez-vous ; les communautés sont à vérifier, **[H]**) :
- **GitHub** : organisations françaises dont les dépôts publics contiennent un `CLAUDE.md`, un `.cursor/rules` ou `.cursorrules` ; c'est le signal le plus direct « cette équipe vit dans Claude Code ou Cursor ». Recherche de code, puis le CTO sur LinkedIn.
- **Les offres d'emploi** (Welcome to the Jungle, LinkedIn) de boîtes de 10 à 60 personnes qui mentionnent Cursor ou Claude Code dans la stack.
- **Communautés de CTO et de fondateurs** : Tech.Rocks, les Slack d'incubateurs (Station F et programmes régionaux), les Discord de Cursor et de Claude (canaux francophones), les meetups parisiens (Paris.js, meetups IA dev) et lyonnais.
- **LinkedIn au second degré** : 5 demandes d'introduction par fondateur à des contacts de premier degré, vers des gens qu'ils connaissent et que nous ne connaissons pas.
- **Les visiteurs des pages A/B** qui laissent un email sans réserver : ce sont les entretiens les plus précieux (ils ont vu le prix et n'ont pas mis la carte).

Message de prise de contact (3 lignes, pas de pitch) : « Nous construisons un outil pour les équipes dev qui travaillent dans Claude Code ou Cursor. Avant d'écrire une ligne de plus, nous voulons comprendre comment les équipes comme la vôtre retrouvent "pourquoi on a fait ce choix". 25 minutes en visio, pas de démo. »

**Le guide d'entretien, façon Mom Test** : on parle de leur passé et de leur vie, pas de notre idée ; pas de « est-ce que vous achèteriez ». 25 minutes, 8 questions, dans l'ordre, et on se tait après chaque.

1. « Racontez-moi la dernière fois où quelqu'un dans l'équipe a demandé *pourquoi on a fait ce choix* et que personne n'a retrouvé la réponse. Qu'est-ce qui s'est passé ensuite, et combien de temps ça a pris ? »
2. « Combien de vos développeurs passent leur journée dans Claude Code ou Cursor ? Que deviennent ces sessions une fois fermées ? Quelqu'un les relit ? »
3. « Votre dernier arrivé : comment a-t-il appris pourquoi le code est comme il est ? Combien de semaines avant qu'il arrête de vous poser des questions ? »
4. « Qu'avez-vous déjà essayé pour ça : ADR, Notion, Claude Team, Copilot, un canal Slack ? Qu'est-ce qui a tenu six mois, qu'est-ce qui est mort, et pourquoi ? »
5. « La dernière fois qu'on a voulu installer quelque chose sur le poste de chaque dev (un outil de suivi, une extension, un agent), qui a dit non, et à quoi exactement ? »
6. « Qui décide et qui paie un outil à 75 € par mois chez vous ? Pour le dernier outil acheté, combien de temps entre l'essai et la carte bancaire ? »
7. « Qu'est-ce qui vous empêcherait de brancher GitHub et Linear sur un outil tiers de deux personnes ? Qui devrait relire quoi (DPO, avocat, client) ? »
8. « Si demain un outil retrouvait la réponse à vingt questions de ce type sur vos propres données, avec la session ou la PR en source, qu'est-ce que vous feriez cette semaine ? » (La seule question sur le futur, en dernier, et elle amène la demande.)

**La demande d'engagement** (après la question 8, seulement si les questions 1 à 3 ont montré une douleur vécue) : « Nous prenons 20 équipes fondatrices à 19 € par siège garanti 12 mois, avec le test des 20 questions : si moins de 15 réponses justes avec la source au jour 30, rien n'est facturé. Il y a deux façons de réserver : la page avec votre carte (0 € aujourd'hui, le premier mois débité au démarrage du pilote), ou une lettre d'intention d'une page que je vous envoie ce soir. Laquelle ? » **Un « c'est intéressant, recontactez-moi » compte comme un non.**

Lettre d'intention (une page, pas un contrat) : nom de la société, taille de l'équipe dev, outils (Claude Code, Cursor, GitHub, Linear, Notion), nombre de sièges envisagés, prix 19 €/siège, date de démarrage souhaitée, les deux conditions de l'acheteur (ex. « DPA relu », « relecture par l'auteur en place »), signature. Non engageante juridiquement, mais écrite et signée : c'est la preuve que le conseil demande (C7).

**Seuil : 3 engagements écrits sur 12.** Sous 3, on relit les notes avant de conclure : si les 12 décrivent la douleur (questions 1 à 3) mais refusent la demande (questions 5 à 7), c'est l'offre ou la confiance ; si la douleur elle-même n'est pas là, c'est le marché (C1), et c'est plus grave.

Discipline : notes rédigées le jour même dans `interviews/AAAA-MM-JJ-<societe>.md` (pas d'enregistrement sans accord écrit), avec trois champs obligatoires : la douleur dans leurs mots, ce qu'ils ont déjà essayé, la réponse à la demande.

#### (c) Deux pages d'atterrissage, A à 19 € et B à 29 €

**Identiques à un chiffre près.** Le texte est `pitch.md` v2 mis en page : le résultat (« pourquoi on a fait ce choix, avec la source, depuis Claude ou Cursor »), les trois objections tuées (pack confiance, relecture par l'auteur, décisions datées), le test des 20 questions, l'offre Équipe fondatrice. **Une seule différence : le prix du siège, 19 € sur A, 29 € sur B**, présenté comme le prix fondateur garanti 12 mois. Répartition 50/50 par tirage au sort côté serveur (un cookie, pour qu'un visiteur revoie toujours la même page). Pas de prix barré, pas de faux compteur ; le compteur « il reste N places sur 20 » est vrai et mis à jour à la main.

**Honnêteté obligatoire sur la page** : « société française en cours d'immatriculation », la liste des sous-traitants prévus, et ce que l'agent capte et ne capte pas (un paragraphe, avant la page complète de l'étape 2). C'est l'objection n°2 de la v2 ; la cacher coûterait plus cher que la dire.

**La réservation de pilote avec carte.** C'est l'action mesurée : un bouton « Réserver un pilote », un formulaire court (email pro, taille de l'équipe dev, Claude Code ou Cursor, GitHub / Linear / Notion), puis Stripe Checkout. **Ce qui est débité** : 0 € le jour de la réservation ; le premier mois (3 sièges minimum, soit 57 € sur A, 87 € sur B) au démarrage du pilote ; remboursé si le test des 20 questions échoue au jour 30. Annulable par un email jusqu'au démarrage.

> **Préalable à trancher lundi 20/10 : qui encaisse avant le Kbis ?** La société n'existe pas ; Stripe n'active pas un compte « en cours de formation ». Trois options, de la plus propre à la moins propre : (1) **empreinte de carte sans débit** (Stripe Checkout en mode `setup`) sur un compte Stripe ouvert au nom de l'un des fondateurs en entrepreneur individuel, s'il en a déjà un ; débit au démarrage du pilote, après Kbis, par la SAS ; (2) la même chose sur une micro-entreprise ouverte en 48 h via le guichet unique pour ce seul usage, fermée après : à faire valider par l'expert-comptable avant ; (3) si ni l'un ni l'autre n'est possible avant le 23/10, la réservation devient une **lettre d'intention signée avec mandat de prélèvement SEPA à activer au démarrage**, et la ligne de succès est lue avec cette réserve (un mandat signé pèse moins qu'une carte). **Ce que la page mesure ne change pas : un inconnu qui s'engage à payer.** Les actes signés « pour le compte de la société en formation » sont repris par la SAS après immatriculation (c'est le mécanisme habituel ; à confirmer par l'avocat dans son devis).

**Le trafic, ~500 €** [H, à recaler avec `marketing.md`] : 250 € en S2 et 250 € en S3, en annonces LinkedIn ciblées (CTO, lead dev, VP engineering, France, entreprises de 11 à 200 personnes ; CPC attendu 5 à 10 €, donc 50 à 100 clics payés en tout) ; le reste du trafic vient des posts des deux fondateurs, des communautés où les entretiens sont sourcés, et des 40 personnes contactées. Attente : **300 à 600 visites** en 4 semaines. Sous 300 visites au 7/11, on ajoute 150 € plutôt que de conclure sur rien.

**Mesure** (Plausible ou l'analytique de l'hébergeur, sans cookie tiers) : visites par variante → clics « Réserver » → formulaire envoyé → carte enregistrée. On lit le taux à chaque étape, par variante, chaque matin, et on ne touche à rien avant 100 visites par variante. Les emails des formulaires non terminés sont relancés une fois, à la main, par David (« qu'est-ce qui vous a arrêté ? ») : c'est l'entretien gratuit.

**Ligne de succès de (c), rappel : 5 réservations avec carte (A + B) en 4 semaines, dont ≥ 3 hors réseau.** Lecture du prix : si B ≥ A en réservations (avec au moins 3 sur B), le prix de liste monte à 29 € ; si B convertit à moins de la moitié de A, 25 € reste le prix de liste et 29 € n'est jamais affiché.

---

### Étape 2. Le compte à rebours jusqu'au lancement public

#### La date retenue : lundi 12 janvier 2027, avec une date de repli

**12 janvier 2027** tient, à une condition : **les 5 pilotes démarrent le lundi 17 novembre**. Huit semaines de pilote (C3) à partir du 17/11 finissent le dimanche 11 janvier ; la marge est de zéro jour. Les deux autres chaînes (juridique, produit) ont trois à quatre semaines de marge. Donc :

- **Date cible : lundi 12 janvier 2027.**
- **Date de repli : lundi 26 janvier 2027**, décidée au plus tard à la revue du **lundi 22 décembre** (J−21) si l'une de ces trois choses est vraie : les pilotes ont démarré après le 24 novembre ; le Kbis n'est pas arrivé au 18 décembre ; la relecture par l'auteur n'est pas en production au 5 décembre. Si on glisse, **l'offre fondatrice passe du 31 janvier au 28 février 2027** (sinon il ne reste que cinq jours pour la vendre au public), et `pricing.md` est mis à jour.
- Ce qu'on ne fait pas : lancer le 12 janvier avec six semaines de pilote « parce que la date est prise ». Avec sept semaines (démarrage le 24/11), on lance en le disant ; en dessous, on glisse.

Deux remarques sur le calendrier : les semaines du 21 décembre et du 28 décembre sont mortes pour la vente et pour les pilotes (usage divisé par deux ou trois), et le calendrier marketing « J−14 » [H] tombe le 29 décembre ; **tout le contenu du J−14 est donc produit et programmé avant le 18 décembre**, et le 5 janvier est le vrai J−7 de terrain. Le 1er novembre, le 11 novembre, le 25 décembre et le 1er janvier sont fériés.

#### Qui porte quoi (proposition, à échanger entre vous)

- **David** : juridique et argent, banc d'essai, inversion brut + pgvector, connecteur GitHub, tableau de bord des 20 questions, export et suppression, marketing, pilotes (relation).
- **Amos** : agent local Cursor, relecture par l'auteur, cloisonnement par projet, page « ce que l'agent capte », marque et pages, déploiement et sauvegardes, pilotes (installation et support).
- **Les deux** : entretiens (6 chacun), revues du vendredi, soft launch, jour J.

Règle : un propriétaire par tâche, jamais deux ; l'autre relit la PR (CLAUDE.md).

#### Les blocs hebdomadaires

Chaque ligne : tâche, propriétaire, échéance. **CC** = sur le chemin critique. Les semaines 1 à 4 recouvrent l'étape 1 ; les tâches de test y sont rappelées en une ligne.

**S1 · 20-24 octobre**
- Étape 1 lancée : questions et corrigé (David, 21/10) ; 12 rendez-vous pris (les deux, 24/10) ; pages A/B en ligne (Amos, 23/10) ; préalable Stripe tranché (David, 20/10).
- Juridique : choisir le nom de la société et son siège, vérifier la disponibilité INPI et le domaine pour « Leon » et « Marcel » (Amos, 23/10) ; brief envoyé à deux avocats pour devis : CGV, DPA, politique de confidentialité, registre, note sur le régime de la capture (suivi d'activité, information des salariés, CSE : C10), reprise des actes de la société en formation (David, 23/10). Choisir l'expert-comptable (David, 24/10).
- Produit : prototype brut + pgvector v0 pour le banc d'essai (David, 29/10, **CC**) ; sauvegardes quotidiennes activées sur Supabase et testées par une restauration (Amos, 24/10 : aucun pilote sur une base sans sauvegarde).
- Argent : rien n'est dépensé au-delà du test.

**S2 · 27-31 octobre**
- Étape 1 : banc d'essai joué et noté (David, 31/10) ; 4 entretiens ; trafic lancé (27/10).
- Marque : **nom tranché** (les deux, 31/10) ; domaine acheté, identifiants (GitHub, LinkedIn, X) réservés (Amos, 31/10). Le nom conditionne les statuts, le DPA, la marque INPI : c'est la première décision irréversible et elle est bon marché.
- Juridique : statuts rédigés (modèle SAS, deux associés, à faire relire par l'expert-comptable), compte de dépôt de capital ouvert auprès d'une banque en ligne qui accepte les sociétés en formation (David, 31/10). **Rien n'est déposé au guichet unique avant la revue du 14/11** : l'immatriculation coûte ~1 000 € et n'a de sens que si le test est GO. Exception : si le test est manifestement bon au 7/11 (≥ 3 réservations), on dépose une semaine plus tôt.
- Produit : spec de l'agent local Cursor (où Cursor range ses conversations, format, fréquence de lecture) (Amos, 31/10).

**S3 · 2-6 novembre**
- Étape 1 : résultats du banc d'essai écrits (David, 3/11) ; 5 entretiens ; second budget sur la page gagnante.
- Produit : agent local Cursor, lecture des sessions et envoi au serveur avec le même contrat `Turn` que l'import Claude Code (Amos, 20/11) ; **signal visible de capture** : horodatage de la dernière capture, visible dans l'interface et dans l'agent, alerte après 24 h sans capture (Amos, 20/11, C6).
- Produit : si l'hybride est validé, spec de l'inversion en production : le brut comme source de vérité, étiquetage léger (date, participants, entités, marqueur décision, « remplacé par »), pgvector, rétro-chargement des sessions existantes (David, 6/11).
- Marketing [H] : première version de `marketing.md` demandée ; liste d'attente ouverte sur la page (email seul, pour ceux qui ne réservent pas) (David, 6/11).

**S4 · 9-13 novembre** (11/11 férié)
- Étape 1 : 3 derniers entretiens, synthèse (12/11) ; **revue de fin de test ven 14/11 17 h** (les deux). Décision écrite.
- Juridique : devis d'avocat accepté et date de livraison fixée pour un premier jet au 27/11 (David, 13/11).
- Produit : inversion brut + pgvector en production, avec le pipeline de faits conservé comme second chemin ou retiré selon le banc d'essai (David, 20/11) ; déploiement de production (hébergeur UE, domaine, HTTPS, journaux, alertes) (Amos, 14/11, **CC** : les pilotes s'installent dessus le 17/11).
- Pilotes : les 5 équipes choisies parmi les réservations et les engagements, **hors réseau**, 5 à 30 développeurs, Claude Code ou Cursor, prêtes à démarrer le 17/11 (David, 14/11, **CC**). Leur CTO reçoit le vendredi : le guide d'installation Solo, la page « ce que l'agent capte » en version courte, le formulaire des 20 questions à écrire **avant** l'installation (sinon la mesure est biaisée).

**S5 · 16-20 novembre**
- Juridique (si GO) : dépôt de capital, annonce légale, **dossier déposé au guichet unique** (David, 18/11, **CC**). Kbis attendu vers le 2/12 [H : 1 à 3 semaines après un dossier complet ; un rejet pour pièce manquante coûte une à deux semaines, et c'est fréquent]. Compte Stripe créé en mode test, parcours Solo → Équipe construit (David, 20/11).
- Produit : agent Cursor et signal de capture livrés (Amos, 20/11) ; inversion livrée (David, 20/11) ; **page « ce que l'agent capte et ne capte pas »** publiée, donnée telle quelle aux développeurs des pilotes et au CSE s'il y en a un (Amos, 20/11 ; relue par l'avocat la semaine suivante).
- **Pilotes, phase 1 « Solo »** (du 17/11 au 30/11) : chaque développeur installe l'agent **de sa propre initiative** (objection n°2 de la v2), mémoire privée à son auteur, lecture par MCP depuis son propre Claude Code ou Cursor. Rétro-chargement de ses sessions existantes (C4). Rien ne remonte à l'équipe pendant la phase 1 : la relecture par l'auteur n'est pas encore là, et C6 interdit de partager sans elle. Mesure dès la première semaine : minutes jusqu'à la première réponse citée, part des devs de l'équipe qui ont installé.
- Pilotes : appel de 30 minutes par équipe chaque semaine, même jour, même heure, jusqu'au 9/1 (David pour la relation, Amos pour les bugs) [H, routine à reprendre dans `ops.md`].

**S6 · 23-27 novembre**
- Produit : **relecture par l'auteur** en production (Amos, 27/11, **CC**) : les décisions proposées par le tri s'affichent à leur auteur, rien ne remonte sans son clic, un lot validable en une fois, une raison obligatoire quand il refuse (c'est la donnée qui mesure le taux d'erreur du classifieur). Connecteur GitHub (PR, revues, issues, commits, par OAuth GitHub App, droits d'origine conservés) (David, 4/12).
- Juridique : **premier jet de l'avocat** : CGV, DPA, politique de confidentialité, note C10 (David, 27/11, **CC** pour les pilotes : P003 et les profils « prudents » ne passent pas à la phase 2 sans DPA à relire). Registre des traitements rédigé par les fondateurs sur le modèle de la CNIL (David, 27/11). Devis d'assurance RC pro et cyber demandés (David, 27/11) [H : 1 semaine, signature après Kbis].
- Marque : page d'accueil publique écrite à partir de la page gagnante du test (Amos, 4/12).

**S7 · 30 novembre - 4 décembre**
- Produit : **cloisonnement par projet** (Amos, 4/12, **CC**) : des espaces par projet avec des membres ; une décision validée remonte aux membres du projet, pas à toute l'organisation ; un développeur choisit le projet à la validation ; le MCP filtre par projet ; migration sur les ACL `uuid[]` existantes (voir `offer.md` §6). Tableau de bord des 20 questions : saisie des questions à l'installation, score mis à jour à chaque réponse marquée juste ou fausse par l'équipe, règle « moins de 15 au jour 30 : rien n'est facturé » visible (David, 11/12).
- **Pilotes, phase 2 « Équipe »** (du 1/12 au 9/1) : partage activé pour les équipes dont le DPA est relu, avec la relecture par l'auteur ; cloisonnement par projet activé au 4/12 pour celles qui ont plusieurs projets. Mesure C3 à partir d'ici : questions par semaine, part de réponses justes avec la citation exacte (sur leurs 20 questions puis sur l'usage réel), taux d'installation de l'agent, part des décisions proposées qui sont validées, et **un cas « la réponse n'existait nulle part ailleurs »** par équipe, écrit dans leurs mots.
- Juridique : Kbis reçu (limite tolérable 18/12) ; compte bancaire définitif ; **Stripe activé** (SIREN, Kbis, IBAN ; 2 à 7 jours [H]) (David, 11/12). Dès l'activation, **les pilotes paient** : 19 € par siège actif à partir du mois de décembre, débités le 15/12, remboursables par la garantie au jour 30. C'est le levier n°1 du CFO : la rampe de `numbers.json` (0 siège en mois 1 et 2) est remplacée par des sièges payants dès le premier mois.

**S8 · 7-11 décembre**
- Juridique : **version finale** des CGV, du DPA et de la politique de confidentialité, avec le SIREN ; page sécurité (chiffrement, sous-traitants et leur localisation, rétention, qui chez Leon peut lire quoi, sauvegardes, procédure d'incident) (David pour le contenu, Amos pour la page, 11/12). **AIPD** : la capture de sessions de salariés relève a priori du suivi d'activité ; une analyse d'impact est rédigée par les fondateurs sur l'outil PIA de la CNIL et relue par l'avocat (David, 18/12) [H : « a priori » ; l'avocat tranche dans sa note C10]. Assurance signée (David, 11/12). Dépôt de marque INPI (Amos, 11/12).
- Produit : tableau de bord des 20 questions livré (David, 11/12) ; connecteur Linear (David, 18/12) ; parcours Solo autonome chronométré sur un poste neuf : **objectif C4, première réponse citée en moins de dix minutes sans aide**, mesuré sur 3 personnes hors projet (Amos, 11/12).
- Revue de mi-parcours (ven 11/12) : état des pilotes à J+24, Kbis, Stripe ; première lecture des chiffres C3.

**S9 · 14-18 décembre**
- **Soft launch, lundi 15 décembre** : l'offre Équipe fondatrice ouverte aux 20 équipes : les 5 pilotes (déjà dedans) + 15 places proposées à la liste d'attente, aux lettres d'intention et aux réservations non pilotes, par email personnel, paiement Stripe en production. Objectif : 12 équipes signées au 9/1, 20 au 31/1. Chaque équipe fondatrice a le même parcours que les pilotes (20 questions, appel d'installation de 30 minutes).
- Produit : **export complet** (archive lisible de toute la mémoire d'un utilisateur et d'une organisation, à tout moment) et **suppression** (compte, organisation, sous 30 jours, avec journal) (David, 18/12) ; gel des fonctionnalités le ven 18/12 à 18 h : jusqu'au 4/1, seulement des corrections.
- Marketing [H] : tout le contenu du J−14 au J−1 écrit, relu et programmé : annonce, post technique « ce que l'agent capte », post « les chiffres de nos pilotes » (avec les chiffres réels, ou pas de post), email à la liste d'attente, messages aux communautés (David, 18/12).
- Marque : page d'accueil et page sécurité en production, sans le bouton public (Amos, 18/12).

**S10 · 21-25 décembre** (25/12 férié)
- **Revue J−21, lundi 22 décembre, 10 h** : go pour le 12/1, ou repli au 26/1, selon les trois critères ci-dessus. Décision écrite.
- Astreinte à tour de rôle sur la production et les pilotes ; pas de livraison ; relecture des documents juridiques finaux par les deux.
- Notion : s'il reste du temps, connecteur Notion (David) ; sinon, il est annoncé « février » au lancement et retiré de la phrase d'accueil. **Ne pas tenir la date avec Notion inachevé.**

**S11 · 28 décembre - 1er janvier** (1/1 férié)
- Astreinte ; collecte des chiffres des pilotes à J+42 ; rédaction du post de lancement avec ces chiffres (David) ; rien d'autre.

**S12 · 4-8 janvier**
- Lun 5/1 : J−7 de terrain [H] : les posts programmés partent selon `marketing.md` ; relance personnelle des 15 places fondatrices.
- Mer 7/1, 14 h : **répétition générale** : le jour J joué en deux heures sur la production (inscription Solo, paiement Équipe avec une vraie carte et remboursement, bascule de la page, les cinq scénarios de panne de l'étape 3 simulés un par un, le message de la page de statut).
- Jeu 8/1 : chiffres finaux des 5 pilotes à 7 semaines et demie (C3), relus par les deux, écrits dans `pilotes-2027-01-08.md` ; c'est ce que le lancement dit, rien de plus.
- **Ven 9/1, 17 h : go / no-go final** (les deux). Critères : production stable 7 jours sans incident de capture ; Stripe en production ; CGV, DPA, politique de confidentialité, page sécurité en ligne ; au moins 4 pilotes sur 5 avec un score ≥ 15/20 ; export et suppression testés ; astreinte du week-end nommée.
- Lun 12/1 : **jour J** (étape 3).

#### Le chemin critique, vérifié

Trois chaînes, par marge croissante :

1. **Les pilotes (marge : 0 jour).** Recrutement au 14/11 → démarrage 17/11 → 8 semaines → 11/1 → lancement 12/1. Tout retard de démarrage décale la date, ou raccourcit la preuve C3. C'est **le** chemin critique, et il est tenu par l'étape 1 : la date de lancement est en réalité décidée le 14 novembre.
2. **La relecture par l'auteur (27/11) et le DPA relisible (27/11), puis le cloisonnement par projet (4/12) → phase 2 des pilotes (1/12) → 6 semaines de données d'équipe (marge : une semaine).** C6 interdit de partager sans relecture ; les acheteurs prudents n'ouvrent pas sans DPA ; l'objection n°1 de la v2 exige le cloisonnement. Un glissement d'une semaine ici est absorbé ; deux semaines ramènent la preuve d'équipe à quatre semaines et imposent le repli au 26/1.
3. **L'immatriculation (dépôt 18/11 → Kbis ~2/12, limite 18/12) → Stripe en production (11/12, limite 23/12) → soft launch payant (15/12) et lancement (marge : trois semaines, variance forte).** Elle n'est pas la plus courte mais c'est la moins contrôlable (greffe, rejets de dossier, délais de décembre). Sans Stripe au 12/1, on ne vend pas : la marge de trois semaines est là pour ça.

**Verdict sur l'hypothèse de départ** (« immatriculation + DPA et cloisonnement par projet ») : à moitié juste. Le DPA et le cloisonnement sont bien sur le chemin critique, mais via les pilotes, pas via la date ; l'immatriculation a de la marge mais c'est le risque de variance le plus fort ; **et la pièce la plus critique, qui manquait, est la relecture par l'auteur** (sans elle, pas de partage d'équipe du tout, donc pas de phase 2, donc pas de C3) et **le démarrage des pilotes le 17 novembre**, qui n'a aucune marge.

Deux coupes possibles si ça glisse, par ordre : Notion (annoncé en février), puis Linear (idem). Jamais : la relecture par l'auteur, le signal de capture, l'export, le DPA.

Note pour `cfo.md` : la ligne « CASA Tier 2 pour Google Workspace, 2 000 € » de `numbers.json` n'a pas lieu d'être au lancement, puisque l'offre v2 ne branche ni Gmail ni Drive ; elle sort des dépenses de lancement (−2 000 €) jusqu'au jour où une équipe payante demande Google Workspace. Et la rampe (0 siège en mois 1 et 2) est remplacée par les pilotes payants de décembre : c'est le levier n°1 du CFO, mis en pratique.

---

### Étape 3. Le jour J : lundi 12 janvier 2027, heure par heure

**Les rôles.** David parle en public (posts, communautés, presse s'il y en a) et tient la boîte de support et Stripe. Amos tient la production, l'agent et les réponses techniques. Une seule voix publique ; l'autre ne poste rien sans relecture. Un canal privé entre les deux, ouvert toute la journée, où chaque incident est horodaté.

**L'offre du jour J** : Solo gratuit (une personne, Claude Code ou Cursor + GitHub, mémoire privée) ; Équipe 25 € HT par siège, 3 sièges minimum, sans engagement, le test des 20 questions (moins de 15 au jour 30, rien n'est facturé) ; Équipe fondatrice 19 € garanti 12 mois pour **les places restantes sur 20** (le chiffre vrai du 9/1), jusqu'au 31/01/2027. Pack confiance en ligne : DPA, sous-traitants, export, suppression, page sécurité.

| heure | qui | quoi | canal |
|---|---|---|---|
| 07:00 | Amos | Vérification de la production : capture (dernier horodatage de chaque agent pilote < 12 h), pipeline (file vide ou en cours), base et sauvegarde de la nuit, MCP répond, page de statut verte | interne |
| 07:00 | David | Test Stripe réel (1 siège avec sa propre carte, puis remboursement), boîte de support vide, textes du jour relus une dernière fois | interne |
| 08:00 | les deux | Go / no-go de 15 minutes : rien de rouge depuis vendredi ? Sinon, on décale de 24 h et on prévient les 20 équipes, pas le public | appel |
| 08:30 | Amos | Bascule : page d'accueil publique, tarifs, inscription Solo et paiement Équipe ouverts, page sécurité et documents juridiques liés depuis le pied de page | site |
| 09:00 | David | Email aux 20 équipes fondatrices (« c'est en ligne, merci, voici le lien à partager ») et à la liste d'attente (le texte programmé en S9, avec les chiffres des pilotes du 8/1) | email |
| 09:30 | David | Post de lancement : l'histoire, les chiffres des pilotes, le test des 20 questions, le lien | LinkedIn, X |
| 09:45 | Amos | Post technique : « ce que l'agent capte et ne capte pas », le modèle de droits, la relecture par l'auteur | LinkedIn, blog du site |
| 10:00 | David | Messages dans les communautés où les entretiens ont été sourcés (Tech.Rocks, Slack d'incubateurs, Discord Cursor et Claude, canaux francophones), un message par communauté, écrit pour elle, pas copié-collé [H] | communautés |
| 10:30 | David | Relance personnelle, un par un, des réservations et lettres d'intention qui n'ont pas encore signé (téléphone ou message direct) | direct |
| 12:00 | les deux | Premier point chiffres : visites, inscriptions Solo, équipes payantes, erreurs Stripe, erreurs d'agent, tickets ; décision sur les scénarios de panne s'il y en a | appel 10 min |
| 13:00-18:00 | David | Support : réponse à tout message en moins d'une heure ; questions de prix et de contrat ; Stripe | email, communautés |
| 13:00-18:00 | Amos | Production : erreurs d'installation de l'agent, MCP, premières captures des nouveaux Solo ; corrections immédiates seulement si sans risque, sinon le lendemain | interne, réponses techniques |
| 14:30 | David | Show HN (en anglais, horaire du matin américain) si décidé en S9 [H] ; sinon rien | Hacker News |
| 15:00 | les deux | Second point chiffres ; décision sur le plafond Solo (voir pannes) | appel 10 min |
| 17:00 | les deux | Troisième point ; liste des bugs du lendemain triée | appel 10 min |
| 18:00 | David | Post « jour 1 » avec les vrais chiffres, bons ou mauvais (inscriptions, équipes, et ce qui a cassé) | LinkedIn |
| 18:30 | les deux | Débrief écrit de 20 minutes : ce qui a marché, ce qui a cassé, les trois choses à faire mardi | `jour-j.md` |
| 22:00 | Amos | Dernière vérification de la capture et de la file ; astreinte de nuit | interne |

**Si quelque chose casse** (les cinq scénarios répétés le 7/1 ; chaque fiche dit : qui, en combien de temps, quoi dire) :

1. **Capture en panne** (plus de 20 % des agents sans horodatage depuis 15 minutes, ou une version d'agent qui échoue à l'installation). Amos. Dans les 15 minutes : page de statut « capture suspendue depuis HH:MM », bandeau dans l'interface, retour à la version précédente de l'agent. **Jamais de trou silencieux** : la date et l'heure du trou sont enregistrées et visibles dans la mémoire de chaque utilisateur touché (C6). Pas de correction en production après 16 h ; on vit avec la version précédente jusqu'au lendemain.
2. **Fuite suspectée** (quelqu'un dit voir une décision ou un passage qu'il ne devrait pas voir). Les deux. Dans les 10 minutes : **le partage d'équipe est coupé** par l'interrupteur prévu (tout redevient privé à son auteur), pas de débat. David appelle la personne qui signale ; Amos sort les journaux d'ACL du fait concerné. Si c'est confirmé : équipe touchée prévenue par écrit dans les 2 heures, incident consigné, avocat appelé pour la question des 72 heures (notification CNIL) et des personnes concernées, post-mortem public sous 7 jours. Si c'est infirmé : réponse écrite à la personne avec la preuve, partage réactivé, et on dit publiquement qu'on a coupé pour vérifier. **On ne discute pas en public d'une fuite ; on coupe, on vérifie, on écrit.**
3. **Afflux de Solo gratuits** (plus de 200 inscriptions par heure, ou dépense LLM et embeddings de la journée au-delà de 150 €) [H sur les seuils]. Amos. Rétro-chargement limité aux 30 derniers jours de sessions pour les nouveaux Solo (le reste en file de nuit), étiquetage en Batch, alerte de budget chez chaque fournisseur réglée dès le 9/1, et si ça ne suffit pas, **file d'attente d'inscription Solo** (« vous êtes 312e, vous recevrez votre accès sous 48 h »), jamais de dégradation pour les équipes payantes. Un Solo coûte ~2,4 €/mois (`numbers.json`) : 1 000 Solo le premier jour, c'est 2 400 € par mois ; c'est le coût d'acquisition, pas un accident, mais il se décide à 15 h, pas par surprise.
4. **Stripe en erreur** (paiement refusé pour tous, webhook silencieux, compte restreint). David. Dans les 15 minutes : formulaire de secours « réservez votre équipe sans payer, nous vous facturons sous 48 h » déjà prêt ; vérification de la page de statut Stripe ; factures manuelles depuis le tableau de bord si l'API est en cause ; **jamais de blocage des inscriptions à cause du paiement**. Si le compte est restreint (demande de pièces), c'est la seule tâche de David jusqu'à résolution.
5. **Mauvaise réponse en public** (quelqu'un publie une réponse fausse ou une citation qui n'existe pas). David répond en moins d'une heure, sur le même canal : merci, on regarde, quel était l'identifiant de la question. Amos reproduit. Deux cas : la citation vient de Leon et est fausse (la vérification de `quote.ts` a laissé passer : correction, et on le dit) ; ou le LLM du client a brodé sur du brut correct (le MCP ne rend que des extraits vérifiés : on montre l'extrait, on explique la frontière, et on en fait un paragraphe de la page sécurité). Dans les deux cas, réponse publique le jour même avec le résultat. **On ne supprime pas, on ne discute pas le ton, on montre.**

Et le sixième, pas dans la liste mais le plus probable : **rien ne se passe** (50 visites, 3 Solo, 0 équipe). On ne change rien le jour J ; on tient les 30 jours de l'étape 4 avant de conclure.

---

### Étape 4. Les 30 premiers jours (12 janvier → 11 février 2027)

Les chiffres sont relevés chaque **lundi matin** par David, écrits dans `metrics/2027-SS.md`, relus ensemble à 10 h. Chaque ligne a un niveau qui déclenche un changement, décidé maintenant, pour ne pas le négocier avec soi-même le moment venu.

| chiffre | comment on le mesure | objectif J+30 | niveau qui déclenche un changement | le changement |
|---|---|---|---|---|
| **Sièges actifs payants** (vs seuil 337) | sièges Équipe facturés avec au moins une question ou une capture dans la semaine | ≥ 80 (deux mois d'avance sur la rampe de `numbers.json`) ; J+7 : 40, J+14 : 60 | < 40 à J+30 | la rampe du CFO est fausse dans le mauvais sens : on refait `numbers.json` avec la vraie courbe, et le besoin de trésorerie avec ; décision de fond à J+30 |
| **Solo installés → équipes converties** | Solo dont l'agent a capté au moins une session ; équipes payantes dont le premier membre était un Solo | ≥ 150 Solo ; ≥ 10 % convertis en 30 jours [H] | conversion < 3 % avec ≥ 100 Solo | le Solo plaît mais ne tire pas l'équipe : revoir le moment et le message de l'invitation (« invitez votre équipe » après la première réponse utile), et le minimum de 3 sièges (P014 : « j'en ai besoin de deux ») |
| **Score moyen au test des 20 questions** | au jour 30 de chaque équipe, sur ses propres questions | ≥ 15/20 en moyenne, ≥ 80 % des équipes au-dessus de 15 | moyenne < 13, ou plus de 30 % des équipes sous 15 | **arrêt de l'acquisition payante** ; la garantie coûte plus que 10 % ; on corrige la recherche (brut, rerank, rétro-chargement) avant d'ajouter une seule équipe |
| **Décisions proposées validées par l'auteur** | validées / proposées, par semaine, et le délai médian de validation | ≥ 40 % validées ; délai médian < 48 h [H] | < 15 %, ou délai > 7 jours | la mémoire d'équipe reste vide (objection n°3 de la v2) : validation par lot, rappel hebdomadaire, défaut « partagé au projet » proposé par le tri quand la confiance est haute ; et on lit les raisons de refus pour mesurer le classifieur |
| **Citations inventées** | vérification automatique (`quote.ts`) sur toutes les réponses MCP, plus 20 réponses tirées au sort relues à la main chaque semaine | ≤ 2 % | > 5 % sur une semaine | le MCP ne rend plus que des extraits vérifiés mot à mot ; « je ne sais pas » plus tôt ; note publique sur la page sécurité |
| **Désinstallations de l'agent** | agents sans capture depuis 7 jours après une installation réussie, et désinstallations déclarées (avec la raison, question posée à la désinstallation) | ≤ 10 % des installations à 30 jours | > 25 % | le « mouchard » n'est pas réglé : relire les raisons, revoir la page « ce que l'agent capte », un réglage « pause de capture » visible dans l'agent |
| **CAC réel vs maximum** | (dépenses marketing + temps fondateur de vente valorisé 30 €/h) / nouvelles équipes payantes, par semaine et en cumul | CAC ≤ 1 500 € par équipe [H, à fixer dans `marketing.md` ; à 10 sièges, 20,24 € de contribution, c'est 7,5 mois de remboursement] | > 2 500 € en cumul à J+30 (plus de 12 mois de remboursement, hors C9) | couper le canal payant le plus cher, garder le bouche-à-oreille et les communautés ; refaire le calcul avec l'attrition réelle dès qu'elle existe |
| **Première réponse citée** (C4) | délai médian inscription → première réponse MCP avec citation, sur les Solo | < 10 min | médiane > 20 min, ou moins de 60 % des inscrits y arrivent | l'installation est le problème, pas le produit : on regarde où ils s'arrêtent (étape de l'agent, du MCP, du jeton) et on corrige ça en priorité |
| **Capture** | jours avec un trou de capture par agent | 0 trou silencieux | un trou non signalé | incident, même sans plainte : le signal de capture est la promesse C6 |
| **Attrition** | équipes qui résilient ou invoquent la garantie | trop tôt pour un taux à 30 jours ; on note chaque départ avec sa raison | 2 des 5 pilotes partent après la garantie | ce ne sont pas des clients : retour à l'offre avant d'en chercher d'autres |

#### Les revues

**J+7, lundi 19 janvier.** Questions à trancher :
1. La capture a-t-elle tenu sept jours sans trou ? Sinon, rien d'autre ne compte cette semaine.
2. Combien d'équipes payantes, combien de Solo, et quel délai jusqu'à la première réponse ? Les trois chiffres contre les objectifs J+7.
3. Le support tient-il à deux (temps par équipe, nombre de tickets) ? Si une équipe de 10 coûte plus de 2 heures par semaine, le coût de support de `numbers.json` (1,50 €/siège) est faux.
4. Continue-t-on la dépense marketing de la semaine 2, au même niveau ?
5. Quels sont les trois bugs qui coûtent des inscriptions, dans l'ordre ?

**J+14, lundi 26 janvier.** Questions à trancher :
1. **Le prix** : ce que les 14 jours disent du 25 € (abandons sur la page de paiement, demandes de remise, réaction des équipes à 29 € si B avait gagné). Le prix de liste est confirmé ou changé **une fois**, ici, puis plus pendant six mois.
2. **L'offre fondatrice** : combien des 20 places sont prises ? Si moins de 15 au 26/1, on choisit entre fermer à la date (31/1) avec les places prises, ou prolonger au 28/2 ; on ne prolonge pas deux fois.
3. Faut-il plafonner les Solo (coût réel mesuré par Solo sur 14 jours, contre 2,4 € prévus) ?
4. Le taux de validation par l'auteur : est-ce un problème d'interface ou de volonté (lire les raisons de refus) ?
5. Les premières 20 questions : quelles familles de questions ratent (pourquoi, comment réglé, état actuel) ? C'est la liste de travail produit de février.

**J+30, mercredi 11 février.** Questions à trancher :
1. **La trajectoire vers 337 sièges** : avec la courbe réelle de 30 jours, le seuil est-il atteignable au mois 9 (cfo, levier n°1), au mois 11 (plan initial), ou jamais ? Refaire `numbers.json` avec les vrais chiffres (sièges, coût par Solo, support, CAC) et relire le besoin de trésorerie.
2. **Les pilotes** : sur les 5, combien paient encore après la garantie, et combien ont un cas « la réponse n'existait nulle part ailleurs » qu'ils acceptent de signer comme référence (C3, et le bonus « référence par un pair » de `offer.md`) ?
3. **CAC et attrition** (C9) : le CAC cumulé contre 1 500 €, les premiers départs et leurs raisons ; le remboursement sous 12 mois tient-il ?
4. **Le périmètre** : quelle demande revient le plus chez les équipes payantes (Notion, Slack, réunions, Gmail) ? Un connecteur n'entre au plan que s'il est demandé par au moins trois équipes payantes, dans cet ordre.
5. **La décision de fond** : continuer en autofinancement avec cette courbe, chercher un financement avec ces chiffres, ou s'arrêter. Les niveaux : ≥ 80 sièges payants, score ≥ 15, CAC ≤ 1 500 € → on continue tels quels ; 40 à 80 sièges → on continue, mais on retourne au conseil avec le dossier ; < 40 sièges, ou score < 13, ou 2 pilotes partis → on ne dépense pas un mois de plus sans changer l'offre, et c'est le conseil qui tranche.

---

### En une page, pour le mur

- **Ligne de succès du test (14/11)** : 5 pilotes réservés avec carte (dont 3 hors réseau), 3 engagements écrits, et le banc d'essai n'a pas tué le pivot. Les vrais acheteurs priment sur le panel.
- **Lancement** : lundi 12 janvier 2027 ; repli : lundi 26 janvier, décidé le 22 décembre.
- **Chemin critique** : les 5 pilotes doivent démarrer le 17 novembre (zéro marge) ; la relecture par l'auteur, le DPA et le cloisonnement ouvrent leur phase 2 le 1er décembre (une semaine de marge) ; le Kbis puis Stripe ont trois semaines de marge mais la variance la plus forte.
- **Jour J** : une voix publique, cinq fiches de panne, l'interrupteur du partage d'équipe à portée de main, les vrais chiffres à 18 h.
- **30 jours** : neuf chiffres chaque lundi, un niveau de déclenchement par chiffre, trois revues avec leurs questions écrites.

Ce document n'est pas un avis juridique ni comptable : les délais du greffe, de Stripe et de l'assurance sont des hypothèses, et tout ce qui touche à la capture des sessions de salariés, aux CGV, au DPA et à l'AIPD est relu par l'avocat avant d'être affiché.

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
