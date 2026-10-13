# Brief pour le conseil d'administration : Leon

Ce brief se suffit à lui-même. Il reprend l'idée et tout ce que les fondateurs ont déjà établi (réunion fondatrice du 11 octobre 2026, étude de coûts du 12 octobre, étude concurrentielle du 12 octobre, architecture v1 du 13 octobre). Les chiffres viennent de ces documents ; rien n'a été mesuré chez un client réel. Il n'y a pas encore de client, de pilote lancé ni de produit.

## L'idée

Leon (nom de travail ; alternative : Marcel)

- **Ce que c'est** : une mémoire d'entreprise unifiée qui se remplit toute seule. Un robot va chercher la donnée dans les outils de l'entreprise (Gmail, CRM, docs, tickets) et dans les conversations LLM des employés (Claude, ChatGPT, Cursor, Claude Code), la trie en fiches avec des droits d'accès, puis le LLM de chaque employé la lit via MCP et reçoit un briefing injecté en début de session.
- **Pour qui** : des équipes de 5 à 100 personnes, de tout type (dev, commerciaux, support, dirigeants), sans secteur imposé. Portes d'entrée commerciales envisagées : rénovation énergétique (dirigeant qui veut l'historique client depuis son Claude), appli santé d'une quinzaine de personnes, cabinets d'experts-comptables.
- **Ce qui est vendu, à quel prix** : un abonnement SaaS à environ 25 € par siège et par mois, volume d'ingestion inclus, crédits en plus pour les gros consommateurs (sessions de code brutes, réunions). Proposition à discuter, non validée par un client.
- **Où et comment** : SaaS hébergé en Europe (Francfort), vendu en France d'abord, par démarchage direct des cofondateurs et pilotes chez des PME proches ; un site vitrine minimaliste. Installation : connecteurs côté serveur, plus un agent local et une extension navigateur sur chaque poste pour capter les conversations LLM.
- **Budget et contraintes** : deux cofondateurs (David Sperling, Amos Koskas), pas de levée connue ni de budget chiffré. Coûts fixes de plateforme estimés à ~500 $/mois au démarrage, coût variable IA de 1 à 3,50 $ par collaborateur et par mois. Décidé : le produit est la mémoire unifiée complète, pas un cas d'usage réduit ; hébergement UE. Non tranché : deadline du MVP, pilote gratuit ou payant, nom, stack définitive.

## Le problème tel que les fondateurs le voient

- Les employés d'une PME utilisent plusieurs LLM (Claude, ChatGPT, Gemini, Cursor, Copilot) et des dizaines de SaaS (Gmail, Slack, CRM, Notion…). Le contexte est éparpillé ; chaque conversation LLM repart de zéro ; ce qu'un employé dit à ChatGPT, ses collègues et ses outils ne le savent pas.
- Les solutions de mémoire existantes (Supermemory et consorts) dépendent d'un appel d'outil (MCP) que le LLM doit penser à faire pour **écrire** en mémoire. Les LLM sont paresseux en écriture : ils ne le font presque jamais. C'est la plainte n°1 sur Reddit à propos de ces outils.
- Un des deux fondateurs (Amos) ressent ce besoin au quotidien. L'autre (David) veut s'assurer qu'on règle un vrai problème facile à vendre, pas un produit dont personne n'a besoin. Réponse d'Amos : l'usage se construit aussi avec le produit, comme ChatGPT en 2022.
- Un dirigeant en rénovation énergétique a dit vouloir utiliser deux outils (CRM et Gmail) sans pouvoir les relier ; il voudrait demander à son Claude l'historique d'un client (ce qu'on lui a posé, à quel prix, s'il paie encore). Ce profil de client a payé 20 000 € par mois pour la précédente solution de David (robots d'appel), un mois après la rencontre.

## Le différenciateur : « bypasser l'appel MCP » côté écriture

- Leon va chercher lui-même la donnée à la source (API des SaaS, agent local qui lit l'historique de Claude Code/Codex/Cursor sur le poste, extension navigateur qui lit chatgpt.com, claude.ai, Gemini) et l'ingère sans attendre que le LLM appelle un outil. En lecture, un appel MCP classique depuis le LLM de l'utilisateur convient très bien.
- Intérêt vu par les fondateurs : barrière à l'entrée et maîtrise de la donnée. Hypothèse : le surcoût technique n'est pas énorme. Plan B si irréalisable : MCP classique.
- Limite connue : capter les conversations LLM passe par le compte **du client** chez OpenAI/Anthropic. Si le client a une offre Enterprise (rare en PME), l'admin donne un accès serveur. Sinon il faut installer un programme local et une extension sur chaque poste, ce qui est faisable mais fragile (chaque changement d'interface de ChatGPT ou Claude peut casser la capture). Claude Code efface ses sessions locales après 30 jours par défaut : l'agent doit capter au fil de l'eau.

## Ce qui est prévu dans le produit (architecture v1, 13 octobre 2026)

- Monorepo TypeScript (Next.js, Hono, Drizzle, Better Auth, extension WXT) + agent local en Rust. Postgres seul, avec sécurité par ligne (RLS) par fait. Pipeline d'ingestion en six étapes.
- Règle n°1 sur les droits : l'ACL d'un fait est l'intersection des droits de ses preuves ; par défaut, seul l'auteur y accède. Faits partagés sauf sensibles.
- Restitution : 4 outils MCP, un briefing injecté au début de chaque session LLM, un chatbot de recherche. Interface en arborescence façon éditeur de code, vue par SaaS.
- Connecteurs dans l'ordre : conversations LLM d'abord (code + web), puis Notion, Linear, GitHub, Google Workspace (audit Google CASA nécessaire dès le jour 1 pour lire Gmail), HubSpot. Slack exclu en V1 (conditions de l'API). Hébergement Vercel/Fly/Neon à Francfort ; Claude via AWS Bedrock en région UE.
- Design : pas une priorité ; SaaS brut au départ.

## Les coûts (étude du 12 octobre 2026, non mesurés chez un client)

- Pipeline en cascade : un filtre mécanique retire le bruit, un petit modèle (Haiku) trie, un modèle plus fort (Sonnet) écrit les fiches, un briefing par personne est régénéré 2 fois par jour. Coût variable : **1 à 3,50 $ par collaborateur et par mois** (dev 3,46 $, bureau 1,60 $, terrain 1,03 $). Si on ingère les sessions de code brutes sans filtre avec un gros modèle : 121 $/mois par dev.
- Coûts fixes au démarrage : ~500 $/mois (infra 300 $, audit Google CASA ~150 $/mois, outillage 50 $). Avec un seul client de 15 personnes, le coût total revient à ~30 € par collaborateur ; dès 10 clients, moins de 5 €.
- À 25 € par siège : marge brute de 80 % avec 10 clients ; 2 clients de 15 personnes couvrent les coûts fixes (hors salaires).
- Fine-tuning d'un petit modèle sur nos GPU : pas rentable avant ~130 clients de 15 personnes (cas pessimiste : 20). Intérêt indépendant du coût : souveraineté (le texte ne quitte jamais nos serveurs).
- Un pilote gratuit de 3 mois pour 15 personnes coûte ~122 € de calcul. Le débat gratuit/payant ne porte donc pas sur le coût mais sur la valeur perçue et la conversion.
- Import de l'historique : 45 $ pour 3 mois, 109 $ pour 2 ans (entreprise tech de 15 personnes).
- Non inclus : salaires, développement, acquisition client, juridique (consentement des salariés, droit du travail), conformité (SOC 2 : 25 à 50 k$ la première année ; nécessaire seulement pour viser plus grand que les PME ; hébergement HDS à vérifier pour la santé).
- Levier de risque n°1 sur le coût : les hypothèses du pipeline (part de donnée pertinente, contexte relu, fréquence des briefings) ne sont pas mesurées.

## Les concurrents (étude du 12 octobre 2026)

| | Glean | Qontext | Sentra | memory.store | Leon |
|---|---|---|---|---|---|
| Base | Palo Alto, 2019 | Berlin, 2025 | San Francisco, 2025 | San Francisco, 2025 | France |
| Financement | Valo 7,2 Md$, ARR 300 M$ | 2,7 M$ pré-seed | 5 M$ seed (a16z) | YC, ~500 k$ | – |
| Cible | 100+ sièges | Mid-market « AI-native » | 2-20 self-service, vise l'enterprise | Startups tech | Équipes 5-100 |
| Prix | 30-50 k$/an minimum | 500 à 2 000 €/mois | 16 $/siège, gratuit au lancement | 150 $/siège | ~25 €/siège |
| Ingestion SaaS proactive | Oui, 275 connecteurs | Oui, 10 | Oui, 6 | Oui, 5 | Oui |
| Capture des conversations LLM | Non | Non | Non | Non | Oui |
| Écriture en mémoire par le LLM | Appel d'outil | Appel d'outil | Appel d'outil | Appel d'outil | Pas nécessaire |
| Droits hérités des sources | Oui | Non, à la main | Oui, à la requête | Opaque | Prévu, par fiche |
| Mémoire partagée d'équipe | Non, personnelle | Oui | Oui | Oui | Oui |
| Hébergement UE | Sur demande | Oui, Francfort, ISO 27001 | Non | Non | Oui |
| Avis utilisateurs | G2 4,7/5 | Aucun | Aucun | Aucun | – |

- Glean prouve que des grandes entreprises paient (contrats médians 99 k$/an), mais refuse de fait les moins de 100 sièges. Les trois autres ont levé 8 M$ cumulés en 2026 sur la thèse « mémoire partagée humains + agents » et n'ont aucun avis public. Qontext a sorti sa 1.0 le 6 octobre 2026. Tout le monde part en même temps.
- Aucun des quatre ne capte les conversations LLM des employés. Les extensions qui le font (Conxt : 13 utilisateurs, un fondateur seul ; OpenMemory, etc.) sont des projets personnels sans utilisateurs. La capture par extension est à la portée d'une personne seule ; la difficulté est de la garder stable face aux changements d'interface.
- Sentra est jugé le plus dangereux : même thèse d'ingestion proactive, même tranche de prix, un client de 20 000 salariés en production, un discours abouti sur les faits contradictoires versionnés dans le temps. Son CEO dit que l'argent est chez les grands comptes et qu'un dirigeant de PME ne sait pas ce qu'est une « mémoire organisationnelle ».
- Le vrai concurrent en PME est ce qui est déjà installé : Notion, Google Workspace, Microsoft 365 (et bientôt leurs fonctions de mémoire IA). Glean itère vite (mémoire « activity-based » le 8 octobre 2026) et arrive en France d'ici fin 2027.
- L'hébergement UE est nécessaire, pas différenciant (Qontext est déjà à Francfort).
- Aucun concurrent n'a prouvé qu'une PME paie pour ça. Le premier à y arriver aura un vrai signal.

## Positionnement proposé par les fondateurs

« Leon : la mémoire d'entreprise qui se remplit toute seule, pour les PME. » Trois piliers : (1) elle se remplit toute seule, avec pour démo « une info dite à ChatGPT lundi, retrouvée dans Claude mardi, sans rien faire » ; (2) clé en main pour un dirigeant de PME, 25 € par siège tout inclus, installé en une journée ; (3) française, hébergée en Europe.

Position ferme des fondateurs : le produit est la mémoire unifiée complète. Les cas concrets par secteur (« historique client » en rénovation énergétique) sont des portes d'entrée commerciales, pas le produit.

## Pilotes envisagés

- Appli santé (mentor d'Amos) : ~15 personnes, CA autour de 1 M€ à confirmer.
- Un contact de David, validé comme pilote possible.
- Une boîte d'un ami aux États-Unis : équipes de développeurs, « un peu requins ».
- Cabinets d'experts-comptables (réseau d'Amos) : à explorer.
- Rénovation énergétique (PAC, photovoltaïque) : gros budgets, anciens clients des robots d'appel de David.
- Critère : des dirigeants investis dans une boîte qui tourne.
- Désaccord ouvert : David veut des pilotes gratuits ; Amos les veut payants ou gratuits avec plafond d'usage. L'étude concurrentielle recommande qu'au moins un pilote paie.

## L'équipe

Deux cofondateurs, chacun travaillant avec ses agents Claude. David a déjà vendu une solution (robots d'appel) à des PME de la rénovation énergétique, à 20 000 € par mois pour certains clients. Amos pilote l'étude de coûts et a un réseau d'experts-comptables et de PME. Ni l'un ni l'autre ne connaît Rust. Un MVP est visé « au plus vite », testé d'abord par les fondateurs eux-mêmes, puis chez une ou deux PME proches. Amos refuse une deadline ; David en voulait une.

## Ce qui n'est pas encore su

- Taille du marché adressable en France et en Europe pour des équipes de 5 à 100 personnes.
- Coût d'acquisition d'un client ; canal au-delà du réseau des fondateurs.
- Si un dirigeant de PME paie 25 € par siège pour ça, et combien de temps il reste.
- Si la capture sans MCP tient techniquement dans le temps (test prévu, pas fait).
- Consentement des salariés et droit du travail sur la lecture de leurs conversations LLM et de leurs mails.
