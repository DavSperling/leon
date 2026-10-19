# Leon (nom de travail) · Business plan

**Verdict: Not yet**

- ✓ Each siège-mois earns $13.55 before fixed costs (71% contribution).
- ✓ Year 1 operating profit: $7,464.
- ✗ 18 of 100 simulated buyers buy (18%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $19.00 a siège-mois |
| Profit margin at plan | 54% per siège-mois |
| Break-even | 60 siège-moiss a day |
| Year 1 operating profit | $7,464 |
| Startup spend | $8,052 |
| Cash needed before it pays for itself | $10,284 |
| Startup money earned back | not in year 1 |
| Buyer panel | 18 buy · 82 pass |

## The idea

> Idée validée par David le 19/10/2026, avant le passage du pack founder-skill. Elle reprend la description produit du 18/10 et l'étude sur les agents Glean (`docs/etudes/glean-agents-2026-10/`).

- **Ce que c'est :** la mémoire de l'entreprise. Leon garde en brut tout ce qui se dit et se décide dans les outils de l'équipe, et répond à n'importe quelle question en citant la source exacte (le mail, la minute de réunion, le message, le ticket), avec les droits d'accès de chacun. S'il ne sait pas, il le dit.
- **Pour qui :** les sociétés de 10 à 200 personnes, en France puis en Europe, qui mélangent plusieurs outils : Google Workspace, plus Slack, Notion, Jira ou Linear, Zoom, GitHub et un CRM (HubSpot, Pipedrive). Le produit sert chaque équipe : sales, support, dev, RH, marketing, direction. L'acheteur est le dirigeant. Personne ne les sert bien aujourd'hui :
  - la plupart sont sous le seuil de Glean (contrat minimum d'environ 60 k$ par an, soit 100 à 250 utilisateurs) ; au-dessus, Glean coûte environ 30 à 48 $ par utilisateur et par mois ;
  - Gemini ne va pas chercher dans leurs autres outils ;
  - ChatGPT et Claude interrogent ces outils au moment de la question, sans rien garder, et ils sont paresseux : ils font une ou deux recherches et répondent avec les premiers résultats.
- **Ce que ça vend, à quel prix :** un abonnement par utilisateur et par mois, entre 20 et 35 € HT ; le prix exact n'est pas encore fixé. Le produit :
  1. des connecteurs en un clic, installés en 15 minutes sans équipe IT ;
  2. tout stocké en brut et indexé par mots exacts et par sens, avec un étiquetage léger (date, participants, client, projet ; marqueurs décision, engagement, plainte) ;
  3. les permissions de l'outil d'origine, la possibilité d'exclure des dossiers, des boîtes ou des canaux, et les droits les plus restrictifs sur tout ce qui est dérivé ;
  4. une option que le dirigeant active ou non : la capture des conversations de l'équipe avec ChatGPT et Claude. Ces conversations restent privées à leur auteur ; seules les décisions qu'il valide sont partagées ;
  5. des « recettes » prêtes à l'emploi par équipe, plutôt qu'un éditeur d'agents : fiche client avant un rendez-vous, « ce bug est-il connu ? », onboarding projet, livret d'accueil interrogeable, rapport de la semaine pour le dirigeant ;
  6. un accès depuis l'application Leon, ou depuis ChatGPT, Claude et Cursor par MCP.
- **Où et comment :** un SaaS en ligne hébergé en Europe. Pour les clients prudents : une instance dédiée, ou une installation sur leur propre cloud (AWS, GCP). Vente en direct par les deux fondateurs, via leur réseau, LinkedIn et le bouche-à-oreille.
- **Budget et contraintes :** deux cofondateurs (David, Amos). Le budget de lancement n'est pas fixé : les fondateurs mettront ce qu'il faut. Ils ne se rémunèrent qu'une fois l'activité bien rentable. Coûts fixes actuels d'environ 500 $ par mois ; coût de service estimé à 2,5 $ par siège et par mois si la lecture passe par le LLM du client, 4 à 11 $ avec le chat de Leon ; un premier jet de code existe. Déjà décidé : hébergement en UE, et les droits les plus restrictifs sur tout ce qui est dérivé.

## Summary

19/10/2026 · Pack founder-skill complet, passé sur la fiche validée par David (`idea.md`).

**Verdict : Pas encore.** Calculé par l'outil du pack, pas écrit à la main.

### Ce qui doit changer d'abord

Le seul contrôle qui échoue est la demande : **18 acheteurs simulés sur 100 achètent, sous la barre de 25 %**. Ce n'est pas le prix qui bloque, c'est la confiance (67 refus sur 82). La nouvelle offre « Le pilote 30 jours » fait passer les mêmes 20 acheteurs de 25 % à 45 % (`offer.md`). Mais ce « oui » veut dire « je lance le pilote gratuit », pas « je paie ». Aucun panel ne peut dire combien de pilotes deviendront payants : c'est le test réel de `launch.md` qui le dira. Si ce test échoue (2 réservations ou moins sur 20 rendez-vous), on revient à l'offre et au prix.

### L'entreprise en deux phrases

Une mémoire d'entreprise qui garde ce qui se dit et se décide dans les outils de l'équipe, et répond en citant la source exacte ou en disant « je ne sais pas ». Elle s'adresse d'abord aux dirigeants de sociétés de 10 à 80 personnes noyés dans leurs outils, en France.

### Les trois chiffres (an 1, au prix de lancement de 19 € par utilisateur actif)

| | |
|---|---|
| Marge au plan (250 sièges) | 54 % ; chaque siège-mois laisse 13,55 € |
| Seuil de rentabilité | 60 sièges payants, soit environ 6 sociétés de 10 personnes |
| Résultat d'exploitation de l'année 1 | 7 464 € ; −588 € après les dépenses de départ |

### Là où tout le monde est d'accord

- Le conseil, le panel et les concurrents disent la même chose : **la cible est trop large** et **la confiance passe avant le prix**.
- Le cœur de l'offre n'a pas de trou de marché (8 acteurs à 15-21 $). Ce qui reste : la qualité des réponses prouvée sur les données du client, le droit d'accès vérifié avant branchement, et une offre qui tient de 10 à 200 personnes.
- **Qui achète** : les dirigeants noyés dans les outils (65 %), avec un déclencheur concret : un chef de projet qui part, un client qui conteste. **Qui n'achète pas** : les prudents sur la sécurité et le RGPD, et ceux qui ont déjà ChatGPT Business ou Claude Team (0 %).

### Là où ils divergent

- La grille Monopole vote PASS : marché encombré, copiable par Anthropic et OpenAI en un trimestre. Les grilles Offres et Produit votent FUND IF, sous condition d'une seule cible, de preuves et d'une garantie.
- Le panel trouve le prix acceptable (5 à 30 €), mais les concurrents sont à 20 $ : 25 € n'est tenable que si la différence se voit au pilote.

### Le plus gros risque

Une fuite de droits : quelqu'un voit dans une réponse un document auquel il n'avait pas accès. Réponse prévue : l'audit des partages avant branchement, la paie et la finance exclues par défaut, la procédure d'incident de `ops.md`. Deuxième risque : Google. L'évaluation de sécurité (CASA) pour lire Gmail et Drive est sur le chemin critique du lancement (`launch.md`).

### Ce qu'il faut pour démarrer

- **Trésorerie** : environ 10 300 € avant que l'activité s'autofinance, ou environ 6 300 € si l'audit de sécurité tiers est reporté après les premiers pilotes payants (`cfo.md`).
- **Le premier test** : du 9 novembre au 4 décembre 2026, 20 rendez-vous avec des dirigeants noyés dans les outils. Ligne de succès écrite d'avance : 5 réservations de pilote avec carte ou mandat SEPA, et 3 lettres d'engagement signées (`launch.md`).

### La seule chose à faire cette semaine

**Choisir le nom avant le 30 octobre.** Il bloque tout le reste : domaine, site, politique de confidentialité, puis le dépôt chez Google le 13 novembre. La recommandation est « Acquis » ; « Témoin » est à tester d'abord auprès de 5 dirigeants (`brand.md`). Un avocat en propriété intellectuelle doit confirmer avant tout dépôt.

---

*Le panel est fait d'acheteurs simulés, et les chiffres sont des projections construites sur des estimations signalées. Seuls de vrais clients et de vrais devis les confirment. Ce n'est pas un conseil financier, juridique ou fiscal.*

## What the board said

19/10/2026 · Idée : `idea.md` (mémoire d'entreprise pour sociétés de 10 à 200 personnes) · Mémos : `board/`

### Le vote

**2 FUND IF, 1 PASS · note moyenne 3,7/10**

| Grille | Note | Vote |
|---|---|---|
| Offres | 4 | FUND IF |
| Monopole | 3 | PASS |
| Produit | 4 | FUND IF |

### Les risques soulevés par plus d'un membre

1. **La cible est trop large** (les trois). Toutes les équipes de toutes les sociétés de 10 à 200 personnes, sur sept ou huit familles d'outils. Pour la grille Offres, une offre pour tout le monde n'est une offre pour personne. Pour la grille Monopole, il n'y a pas de petit marché à dominer. Pour la grille Produit, rien n'est coupé.
2. **L'écart avec ce que le client paie déjà ne se voit pas** (Offres, Monopole). Claude Team, ChatGPT Business, Copilot, Gemini et Notion font de la recherche multi-sources autour de 20 $, Dash à 15 $, Dust est à Paris. « Plus exhaustif » est une amélioration, pas une rupture, et c'est copiable en un trimestre.
3. **Slack interdit le stockage** (les trois). Ça entame la promesse « on garde tout en brut » sur l'un des outils les plus utilisés, et d'autres plateformes peuvent suivre (Monopole).
4. **Aucune preuve que ça marche** (Offres, Produit). Le précédent panel refusait pour une question de confiance. Une mauvaise première réponse, ou un index encore vide, casse la promesse dès le premier contact.
5. **Une distribution chère** (Offres, Monopole). Deux fondateurs en vente directe, pour un panier de 20 à 35 € par siège. Le coût d'acquisition est inconnu.

### Les conditions, à cocher par la suite du pack

- [ ] **Une seule cible d'abord :** une équipe, dans un type de société, avec un résultat chiffré (Offres, Produit, Monopole). → à trancher avec le **panel d'acheteurs**.
- [ ] **Un petit marché nommé et dénombré**, où Leon peut devenir le choix évident (Monopole). → **concurrents**, puis panel.
- [ ] **La preuve, chiffrée, que Leon l'emporte nettement sur Claude Team ou ChatGPT Business** avec de vraies questions de clients (Monopole, Offres). → test produit, hors pack ; garantie dans l'**offre**.
- [ ] **Des pilotes avant la vente :** au moins 3 clients qui confirment le résultat par écrit (Offres). → **lancement**.
- [ ] **Une garantie qui retire le risque :** sur le résultat (heures gagnées à 30 jours) et sur les droits (Offres). → **offre**.
- [ ] **Une offre empilée et nommée**, pas un prix par siège nu (Offres). → **offre**, puis **prix**.
- [ ] **Les cinq premières minutes écrites et mesurées :** temps d'ingestion, première bonne réponse, ce qui s'affiche tant que l'index n'est pas prêt (Produit). → **ops**, et test sur le premier jet.
- [ ] **Choisir où vit l'expérience principale**, l'application Leon ou le LLM du client par MCP, et vérifier que la citation et le « je ne sais pas » y survivent (Produit). → **ops**, **lancement**.
- [ ] **Régler le cas Slack dans le produit** : montrer ce que Leon garde et ce qu'il va chercher à la volée (Produit). → **ops**.
- [ ] **Un coût d'acquisition estimé et un canal reproductible** pour les 100 premiers clients (Offres, Monopole). → **CFO**, **marketing**.
- [ ] **Un actif qui se renforce avec le temps** et qu'on ne copie pas en six mois (Monopole). → **plan**.

### Les désaccords

- **Le marché.** La grille Offres le juge bon (douleur réelle et chiffrée, en croissance) et fait échouer l'offre, pas le marché. La grille Monopole juge le marché lui-même mauvais : encombré par des outils déjà payés, sans niche défendable.
- **Le produit.** La grille Produit voit de vrais atouts : la phrase existe, la citation et le « je ne sais pas » sont des détails de qualité visibles, la confiance est traitée comme une partie du produit. Pour la grille Monopole, ces mêmes atouts sont copiables par les grands en un trimestre.
- **La capture des conversations IA.** La grille Offres y voit une source que personne ne garde. La grille Produit demande pourquoi elle est dans la première version.

### La version la plus forte que le conseil voit

Ce n'est pas tout à fait ce qui a été présenté. Le conseil voit **une seule équipe**, celle dont la douleur est la plus forte et qui a le budget, dans un type de société précis, avec **une recette phare**. Par exemple la fiche client avant un rendez-vous pour les sales, ou « ce bug est-il connu ? » entre le support et le dev. La promesse est chiffrée (« préparer un rendez-vous en 2 minutes au lieu de 30 »), prouvée par un essai sur les données du client, et garantie : remboursé si le gain n'est pas là à 30 jours, et rien n'est vu par quelqu'un qui n'y avait pas accès. Elle est vendue en SaaS UE seulement, avec un scénario d'installation où la première bonne réponse arrive le jour même. La mémoire complète, les autres équipes et les autres modes d'hébergement viennent ensuite, une fois cette porte d'entrée gagnée. Le panel d'acheteurs doit dire quelle équipe ouvre cette porte.

## The competition

19 octobre 2026 · étape `founder-competitors` du pack founder-skill · données brutes dans [`competitors.csv`](competitors.csv)

### Comment ce relevé a été fait

- **Méthode :** quatre agents ont lu les pages publiques le 19/10/2026 : pages de prix officielles, docs d'aide, presse, Hacker News, Trustpilot, PeerSpot, SourceForge et forums éditeurs.
- **Notes G2 :** G2, Capterra, GetApp, TrustRadius et Gartner Peer Insights ont toutes répondu 403. Les notes G2 viennent donc d'extraits de moteur de recherche, sans date ; elles sont signalées comme telles.
- **Reddit :** inaccessible à nos outils. Il reste à lire à la main.
- **Prix :** dans la devise affichée par l'éditeur ($ ou €), hors taxes, paiement annuel sauf mention contraire.

**Corrections au brief :**

1. **Gemini.** Le brief dit « Gemini ne va pas chercher dans leurs autres outils ». C'est vrai pour Gemini inclus dans Google Workspace, mais faux pour Gemini Enterprise (édition Business, 21 $). Celui-ci se connecte à Slack, Jira, GitHub, HubSpot, Notion et Confluence ([source](https://cloud.google.com/gemini-enterprise/business)).
2. **Dashworks.** Le brief le dit « fermé en 2025 ». Il a bien été racheté par HubSpot, mais sa page de prix est toujours en ligne, à 10 $ par siège ([source](https://www.dashworks.ai/pricing)).
3. **Unleash.** Racheté par Zendesk en décembre 2025 ; son site redirige vers zendesk.com.
4. **Moveworks.** Racheté par ServiceNow en décembre 2025.
5. **Guru.** N'affiche plus de prix : il est passé en vente directe uniquement.

### 1. Le tableau, du plus direct au plus lointain

| # | Nom | Type | Prix de l'offre comparable (par utilisateur et par mois) | Ce qu'il vend en une ligne | Note publique |
|---|---|---|---|---|---|
| 1 | Dropbox Dash | direct | 15 $ (Teams, jusqu'à 100 utilisateurs) ; 35 $ au-delà | Réponses IA sur Slack, Drive, Jira, GitHub, Notion… | 4,2/5, 86 avis (G2, extrait) |
| 2 | Glean | direct | Pas de prix public ; contrat médian 98 890 $/an, « typiquement 100-250 utilisateurs » (Vendr, fév. 2026) | Recherche d'entreprise + assistant, référence du marché | 4,7/5, 336 avis (G2, extrait) |
| 3 | Dust (Paris) | direct | 24 € (Pro), **mais 3 connecteurs maximum** ; illimité seulement en Enterprise, sur devis | Agents IA sur le savoir de l'entreprise | 4,6/5, 86 avis (G2, extrait, incertain) |
| 4 | Sentra | direct | 16 $ (Team, 2 à 20 utilisateurs) ; Enterprise sur devis | Mémoire d'organisation, lue par API et MCP | aucun avis public |
| 5 | GoSearch | direct | 20 $ (Pro, tous connecteurs) | Recherche d'entreprise + agents, MCP | 4,7/5, 23 avis (G2, extrait) |
| 6 | Onyx (ex-Danswer) | direct | 20 $ (cloud) ; open source gratuit | Recherche d'entreprise auto-hébergeable, MCP | aucun avis public |
| 7 | Slite (Paris) | direct | 20 $ (Pro, recherche multi-outils) | Base de connaissances IA synchronisée aux outils | 4,6/5, 289 avis (G2, extrait) |
| 8 | Notion Business | direct | 20 $ (19,50 € sur la page UE) | Espace de travail + « Enterprise Search (Beta) » | 4,6/5, 13 876 avis pour Notion entier (G2, extrait) |
| 9 | Gemini Enterprise Business | direct | à partir de 21 $ | Agent Google connecté à Slack, Jira, GitHub, HubSpot… | 4,6/5, 27 avis (G2, extrait) |
| 10 | Claude Team | direct | 20 $ (25 $ mensuel), 2 à 150 personnes | Connecteurs + recherche d'entreprise citée, **rien d'indexé** | 4,6/5, 393 à 478 avis (G2, extrait) |
| 11 | ChatGPT Business | direct | 20 $ (25 $ mensuel), 2 sièges minimum | « Company Knowledge » sur les applis connectées | 4,6/5, 3 110 avis pour ChatGPT entier (G2, extrait) |
| 12 | Microsoft 365 Copilot Business | direct | 18 $ en promotion jusqu'au 31/12/2026 (21 $ catalogue), plus une licence M365 | Copilot + connecteurs Jira, Drive, GitHub, Notion, HubSpot | 4,6/5, 14 avis (G2, extrait) |
| 13 | Qontext (Berlin) | direct | 500 €/mois par espace, pas par utilisateur | Dépôt de contexte pour agents IA, MCP | aucun avis public |
| 14 | Guru | direct | Plus de prix public (ancien prix : 25 $, 10 sièges minimum, source tierce) | Savoir gouverné, réponses citées | 4,7/5, 2 317 avis (G2, extrait) |
| 15 | Dashworks (HubSpot) | direct | 10 $ (Team) | Réponses IA sur les outils de l'équipe | non vérifié |
| 16 | Mio (Paris) | direct | Gratuit au départ, avec 50 $ de crédits | « Employé IA » dans Slack | aucun avis public |
| 17 | Atlassian Rovo | indirect | Inclus dans Jira/Confluence Standard et au-delà | IA Atlassian + 60 connecteurs | non vérifié |
| 18 | Slack | indirect | IA dans Slack à 15 $ (Business+) ; recherche sur les autres applis à 45 $ (Enterprise+) | IA limitée à Slack, sauf en Enterprise+ | non vérifié |
| 19 | Fireflies.ai | indirect | 19 $ (Business, source tierce), plus des crédits IA | Réunions + « Global AskFred » sur Gmail, Slack, Drive, Jira ; MCP | 4,5/5, 862 avis (Trustpilot, lu) |
| 20 | Granola | indirect | 14 $ (Business) | Notes de réunion, espaces d'équipe, MCP | 4,8/5, 56 avis (Product Hunt, lu) |
| 21 | Unleash | indirect | Plus vendu seul (racheté par Zendesk) | – | – |
| 22 | Moveworks | indirect | Pas de prix (racheté par ServiceNow, grands comptes) | – | 4,6/5, 51 avis (G2, extrait) |
| 23 | Gemini dans Google Workspace | substitut | Inclus dans Business Standard à 13,60 € | IA limitée aux données Google | – |
| 24 | Recherche native de Slack, Drive et Notion | substitut | 0 € de plus | Chercher outil par outil | – |
| 25 | Demander à un collègue | substitut | 0 € direct, payé en temps | La mémoire des anciens | – |
| 26 | Wiki tenu à la main | substitut | 0 € de plus, payé en temps d'entretien | Des pages que quelqu'un doit mettre à jour | – |

### 2. Fourchette de prix de l'offre comparable

Base : les 15 offres qui affichent un prix par utilisateur et par mois pour des réponses IA sur plusieurs outils, en paiement annuel. Les devises sont mélangées ($ et €), sans conversion.

- **Bas : 10 $** (Dashworks Team). Hors Dashworks, dont l'avenir est incertain, le plus bas est 15 $ (Dropbox Dash Teams).
- **Médiane : 20 $.** C'est le prix de Claude Team, ChatGPT Business, Notion Business, Slite Pro, GoSearch Pro et Onyx. Gemini Enterprise est à 21 $, Copilot Business à 18-21 $.
- **Haut affiché : 45 $** (Slack Enterprise+, pour la recherche dans les autres applis). Glean ne publie pas de prix ; les estimations tierces le placent autour de 45-50 $ ou plus, avec un plancher d'environ 100 sièges.
- **Hors grille :** Qontext facture par espace, 500 à 2 000 € par mois. Rovo est inclus dans Jira et Confluence.

**Ce que ça dit pour Leon :** sa fourchette de 20 à 35 € commence à la médiane du marché et monte au-dessus. Le prix plancher du marché (15-20 $) est tenu par Google, Microsoft, OpenAI, Anthropic, Notion et Dropbox. Leon ne peut pas être « le Glean pas cher » : ce rôle est déjà pris, à 20 $.

### 3. La carte de positionnement

Deux axes qui comptent pour un dirigeant de 10 à 200 personnes :

- **Axe horizontal : est-ce que je peux l'acheter et l'installer seul ?** À gauche, vente directe, plancher de sièges ou équipe IT. À droite, prix publié et carte bancaire.
- **Axe vertical : est-ce que ça garde la mémoire de mes outils ?** En bas, interrogation des outils au moment de la question, sans rien garder. En haut, tout indexé et conservé, avec l'historique des décisions.

```
                    GARDE LA MÉMOIRE (indexe, conserve, historique)
                                     ^
   Glean (plancher ~100 sièges)      |   Dropbox Dash (15 $, ≤100)
   Guru (sur devis)                  |   Sentra (16 $, 2-20 seulement)
   Qontext (500 €/mois)              |   GoSearch, Onyx (20 $)
   Dust Enterprise (connecteurs      |   Slite Pro (20 $)
     illimités sur devis)            |   Copilot Business, Gemini Ent. (index + temps réel)
                                     |        [LEON visé ici : 20-35 €]
 VENTE / IT  <-----------------------+-----------------------> SELF-SERVE, PRIX AFFICHÉ
                                     |
   Moveworks, Unleash (rachetés)     |   Claude Team (20 $, rien d'indexé)
   Slack Enterprise+ (45 $)          |   ChatGPT Business (20 $, flou)
                                     |   Notion Business (Enterprise Search en bêta)
                                     |   Dust Pro (24 €, 3 connecteurs)
                                     |   Fireflies, Granola (réunions seulement)
                                     |   Rovo (inclus), Gemini Workspace (Google seul)
                                     v
                     INTERROGE À LA VOLÉE (rien gardé, ou périmètre étroit)
```

**Lecture :** le quadrant visé par Leon (en haut à droite) n'est **pas vide**. Dropbox Dash, Sentra, GoSearch, Onyx et Slite y sont déjà, entre 15 et 20 $. Copilot et Gemini Enterprise y sont aussi pour leurs connecteurs indexés. Le quadrant de Claude et ChatGPT (en bas à droite) est celui que le brief critique, et il ne reste qu'à 20 $ du nôtre.

### 4. Ce que les clients reprochent, classé

Le nombre de sources est celui que les agents ont réellement lues. Il est bas parce que G2, Capterra et Reddit étaient bloqués : c'est un minimum.

1. **Prix, crédits et opacité** (environ 9 sources : Notion AI, M365 Copilot, Glean, Guru)
   - Notion AI, 1★ : « You pay 200 euros per month to have access to everything and then you find out that you need to buy extra credits after one smarter AI prompt. » [Trustpilot](https://www.trustpilot.com/review/notion.so)
   - Copilot : « 30$ per month is a lot. For around 300 users you're already talking 100k per year! » [HN](https://news.ycombinator.com/item?id=45483092)
   - Glean : « Unifying search tools like Glean help a lot here but they're also expensive. » [HN](https://news.ycombinator.com/item?id=49467979)
2. **Connecteurs qui ne trouvent rien, ou trop peu** (environ 7 sources : ChatGPT, Claude, Copilot, Glean, Notion)
   - ChatGPT : « Every search in ChatGPT returns, 'no relevant document found.' » [forum OpenAI](https://community.openai.com/t/google-workspace-admin-managed-drive-connector-sync-completes-but-no-documents-are-searchable/1305231)
   - Claude, connecteur Google Drive : « only searches and returns Google-native format files (Google Docs, Sheets, Slides). It does not surface uploaded or synced Office files » [GitHub](https://github.com/anthropics/claude-code/issues/38467)
   - Copilot : « There was a file on a private channel that I'm an owner of. Copilot couldn't find it. » [Microsoft Tech Community](https://techcommunity.microsoft.com/discussions/microsoft365copilot/m365-copilot-finding-files-shared-with-anyone-in-the-organization-link/4025496)
3. **Réponses fausses ou inutiles** (environ 6 sources : Copilot, Notion AI, Glean)
   - Copilot : « Most of the time, it's pretty useless. » [HN](https://news.ycombinator.com/item?id=47758662)
   - Notion AI, 4★ : « I don't use Notion AI much because there is often misunderstandings or hallucinations » [Trustpilot](https://www.trustpilot.com/review/notion.so?page=2)
   - Glean : « I tried pulling in an architecture diagram of a workflow, and it pulled in some other image instead. » [PeerSpot](https://www.peerspot.com/products/glean-reviews)
4. **Droits et sur-partage** (3 sources, surtout Copilot ; ce sont des enquêtes, pas des avis clients)
   - Gartner, 132 responsables IT : « concerns about data 'oversharing' causing 40% to delay rollouts by three months or more » [Computerworld](https://www.computerworld.com/article/3542000/microsoft-365-copilot-rollouts-slowed-by-data-security-roi-concerns.html)
   - Notion, 1★ : « Turns out notion was sending all of our proprietary business data to OpenAI. » [Trustpilot](https://www.trustpilot.com/review/notion.so)
5. **Peu d'usage après l'achat** (3 sources, Copilot seulement) : *maigre*
   - « in our org only 5-10% actively use it. » [HN](https://news.ycombinator.com/item?id=45483092)
6. **Installation laborieuse** (2 sources : Glean, Guru) : *maigre*
   - Glean : « I have to do a lot of back and forth in order to have these connectors enabled. » [PeerSpot](https://www.peerspot.com/products/glean-reviews)
7. **Lenteur** (1 source, Glean) : *maigre*
   - « Currently, it sometimes takes fifteen to twenty seconds. » [PeerSpot](https://www.peerspot.com/products/glean-reviews)

**Ce qu'on n'a pas trouvé :**
- Aucun acheteur de PME demandant publiquement « un Glean moins cher ». Les seuls signaux sont des fondateurs qui construisent des alternatives, par exemple : « some orgs find Glean to be expensive and not very extensible » ([HN](https://news.ycombinator.com/item?id=47215427)).
- Aucune plainte « l'outil ne se souvient pas de ce qu'on a dit à ChatGPT ».
- Aucune voix client exploitable sur Dust, Slite Ask ou Dropbox Dash.

### 5. Le trou

**Il n'y a pas de trou net sur le cœur de l'offre.** Les promesses principales de Leon sont déjà vendues entre 15 et 21 $ par utilisateur, en self-serve, par au moins huit acteurs :

- des réponses citées sur Google Workspace, Slack, Notion, Jira, GitHub et le CRM ;
- les droits de l'outil d'origine ;
- un index conservé ;
- un accès par MCP.

Dropbox Dash, GoSearch, Onyx, Slite, Gemini Enterprise, Copilot, Claude et ChatGPT. Slite est français, et Dust (Paris) et Qontext (Berlin) sont européens aussi, hors de cette liste : l'hébergement en UE n'est donc pas un trou non plus.

Ce qui reste, par ordre de solidité :

1. **La fiabilité des réponses sur un stack hétérogène.** Les plaintes 2 et 3 sont les plus nombreuses après le prix : connecteurs qui ne trouvent rien, recherche qui rate des fichiers, réponses inutiles.
   - Une mémoire qui indexe tout et dit « je ne sais pas » répond exactement à ces plaintes. C'est un **trou de qualité**, pas de catégorie.
   - Il ne se défend qu'avec une démonstration mesurable : une même question, posée à Leon et à Claude ou ChatGPT, sur les vraies données d'un client.
   - Limite : Slack interdit aux applis tierces de « create persistent copies, archives, indexes, or long-term data stores » de ses données ([conditions de l'API Slack, effectives au 10/10/2025](https://slack.com/terms-of-service/api)). Pour Slack, Leon est donc lui aussi réduit à interroger à la volée, comme Claude.
2. **Une offre « tout compris » entre 20 et 200 personnes.** Plusieurs offres self-serve s'arrêtent avant 200 personnes :
   - Sentra s'arrête à 20 utilisateurs ;
   - Dust Pro à 3 connecteurs ;
   - Dash double son prix au-delà de 100 utilisateurs (15 $ puis 35 $) ;
   - Glean commence vers 100 sièges.

   Une grille unique de 10 à 200 personnes, sans plafond de connecteurs ni crédits, colle à la plainte n°1. Mais GoSearch, Onyx et Slite le font déjà à 20 $. C'est **un trou étroit**, qui se joue sur le prix et non sur le produit.
3. **La capture des conversations ChatGPT et Claude des salariés.**
   - Personne ne la vend dans ce relevé, ce que confirme l'étude du 12/10 (`docs/etudes/concurrents-2026-10/`).
   - Mais **aucune plainte publique ne la réclame**, et le panel du 17/10 bloquait sur la confiance.
   - C'est une différence, pas encore un trou prouvé.

En clair : Leon n'entre pas dans un espace vide. Il entre dans un marché à 20 $ déjà occupé par les fournisseurs du stack du client, avec un argument de qualité à prouver.

### 6. La menace : qui copie le plus vite

1. **Anthropic et OpenAI (Claude Team, ChatGPT Business), la menace n°1.**
   - Ils ont déjà les connecteurs, la mémoire, la recherche d'entreprise citée et les droits, à 20 $, chez les mêmes utilisateurs.
   - Ils sont aussi le canal de lecture de Leon par MCP.
   - Pour combler l'écart, il leur suffit d'indexer au lieu d'interroger à la volée. OpenAI l'a déjà fait : d'anciennes pages d'aide sur des « synced connectors » pour Google Drive et SharePoint redirigent aujourd'hui vers les pages actuelles ([aide OpenAI](https://help.openai.com/en/articles/12628342-company-knowledge-in-chatgpt)).
   - La capture de leurs propres conversations, ils l'ont par construction.
   - Délai pour copier : une version produit.
2. **Google (Gemini Enterprise Business, 21 $).**
   - La cible part de Google Workspace, Google est déjà le fournisseur.
   - Il a des connecteurs indexés vers Slack, Jira, GitHub, HubSpot et Notion, et une installation « no IT setup needed ».
   - Il peut l'ajouter à l'abonnement Workspace par une remise de lot, comme Microsoft le fait avec Copilot à 18 $.
3. **Dropbox Dash (15 $, jusqu'à 100 utilisateurs).** C'est déjà le produit le plus proche, sur le même segment et en self-serve, pour moins cher.
4. **Sentra.** C'est la même thèse de « mémoire d'organisation », avec un MCP. Il lui suffit de relever son plafond de 20 utilisateurs.

### Sources

Pages lues le 19/10/2026 sauf mention contraire.

**Prix et positionnement :**
- https://dash.dropbox.com/plans
- https://www.glean.com/pricing (pas de prix) ; https://www.vendr.com/marketplace/glean (mise à jour fév. 2026)
- https://dust.tt/home/pricing
- https://sentra.app/pricing
- https://www.gosearch.ai/pricing
- https://www.onyx.app/pricing ; https://github.com/onyx-dot-app/onyx
- https://slite.com/pricing
- https://www.notion.com/pricing ; https://www.notion.com/startups
- https://cloud.google.com/gemini-enterprise/business ; https://docs.cloud.google.com/gemini/enterprise/docs/editions ; https://docs.cloud.google.com/gemini/enterprise/docs/connectors/introduction-to-connectors-and-data-stores
- https://claude.com/pricing ; https://support.claude.com/en/articles/12489464-enterprise-search ; https://claude.com/connectors
- https://help.openai.com/en/articles/8792828-chatgpt-business-overview ; https://help.openai.com/en/articles/12628342-company-knowledge-in-chatgpt (la page de prix chatgpt.com a répondu 403)
- https://www.microsoft.com/en-us/copilot/solutions/business ; https://www.microsoft.com/en-us/copilot/pricing/business ; https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview ; https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/connectors-gallery-microsoft
- https://qontext.ai/pricing
- https://www.getguru.com/pricing ; ancien prix : https://www.supered.io/blog/guru-pricing/ (source tierce)
- https://www.dashworks.ai/pricing ; https://www.dashworks.ai/blog/dashworks-is-joining-forces-with-hubspot
- https://www.mio.xyz
- https://www.atlassian.com/software/rovo/pricing ; https://www.atlassian.com/licensing/rovo
- https://slack.com/pricing ; https://slack.com/terms-of-service/api ; https://docs.slack.dev/apis/web-api/real-time-search-api
- https://fireflies.ai/pricing (prix non lisibles) ; https://www.claap.io/blog/fireflies-pricing (source tierce, 2026) ; https://guide.fireflies.ai/articles/1512776728-global-askfred-get-answers-from-past-meetings-connected-apps-and-web-search
- https://www.granola.ai/pricing ; https://docs.granola.ai/help-center/sharing/folders/spaces-and-folders
- https://www.zendesk.co.uk/newsroom/articles/zendesk-acquires-unleash/
- https://www.moveworks.com ; https://www.cxtoday.com/crm/servicenow-moveworks-acquisition/
- https://workspace.google.com/pricing

**Notes publiques :**
- G2 : extraits de recherche seulement (403) : https://www.g2.com/products/glean-technologies-glean/reviews, https://www.g2.com/products/dust-dust/reviews, https://www.g2.com/products/dropbox-dash/reviews, https://www.g2.com/products/notion/reviews, https://www.g2.com/products/slite/reviews, https://www.g2.com/products/guru/reviews, https://www.g2.com/products/gosearch-ai-enterprise-search/reviews, https://www.g2.com/products/chatgpt/reviews, https://www.g2.com/products/anthropic-claude/reviews, https://www.g2.com/products/microsoft-microsoft-365-copilot/reviews, https://www.g2.com/products/google-gemini-enterprise/reviews, https://www.g2.com/products/moveworks/reviews
- Pages lues : https://www.trustpilot.com/review/fireflies.ai ; https://www.producthunt.com/products/granola

**Plaintes :** liens donnés dans la section 4, plus https://sourceforge.net/software/product/Guru/reviews/.

**Inaccessibles :** G2, Capterra, GetApp, TrustRadius, Gartner Peer Insights, Reddit, les pages chatgpt.com, unleash.so (redirigé).

## The buyer panel

**18 buy · 82 pass** (18% buy) out of 100 simulated buyers. Seed 468984, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Dirigeant fondateur d'une société de services (agence, cabinet de conseil, ESN) de 10 à 40 personnes | 30 | 20% |
| Responsable des opérations ou de l'informatique d'une société de 50 à 200 personnes, qui instruit le dossier pour le DG | 20 | 20% |
| CEO ou COO d'un éditeur SaaS ou d'un e-commerce de 20 à 80 personnes | 25 | 20% |
| DG d'une PME de 80 à 200 personnes (industrie, distribution, bureau d'études) avec un responsable informatique | 25 | 12% |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Noyé dans les outils | 20 | 65% |
| Compte les euros | 16 | 19% |
| Pas encore équipé en IA | 34 | 6% |
| A déjà ChatGPT Business, Claude Team ou Copilot | 5 | 0%  (thin) |
| Prudent sécurité et RGPD | 16 | 0% |
| Sceptique des démos IA | 9 | 0% |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| under $79,000 | 31 | 19% |
| $79,000 to $109,000 | 34 | 18% |
| $109,000 and up | 35 | 17% |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 67 | "Le besoin, je l'ai, c'est exactement ce que mes commerciaux font à la main avant chaque rendez-vous. Mais ouvrir d'un coup tous les mails, les Drive et les réunions de la boîte, y compris ce qu'on dit sur nos clients, à une société de deux personnes que personne autour de moi ne connaît, je ne le fais pas ce mois-ci." (P003) · "Le prix est raisonnable comparé aux 60 000 $ de Glean, mais je ne vais pas ouvrir les mails, le Drive et les enregistrements de réunion de 150 personnes à une société dont je ne sais rien, en un clic et sans que mon DPO ait lu le DPA. Et « garder tout ce qui se dit en réunion », mes salariés et le CSE vont le prendre comme de la surveillance." (P004) |
| price | 8 | "Je paie déjà Claude Team pour toute la boîte, branché sur Drive et Slack. Ajouter 25 € par tête, c'est 500 à 1 000 € de plus par mois pour une mémoire que mon outil actuel finira sans doute par avoir. Je ne paie pas deux fois pour le même usage." (P001) · "On paie déjà un abonnement IA d'équipe branché sur Drive et Slack ; à 25 € par tête sur 120 personnes, ça fait 36 000 € par an en plus pour un deuxième outil qui promet de faire mieux le même travail. Je ne signe pas ça sur une promesse, et pas pour toute la boîte." (P002) |
| habit | 7 | "La fiche client avant rendez-vous, c'est exactement le temps que perdent mes commerciaux, donc je comprends l'intérêt. Mais on paie déjà Gemini sans que personne s'en serve, et je ne vais pas mettre 25 € par tête sur 30 personnes pour un outil de plus qu'on oubliera dans deux mois." (P023) · "On paie déjà ChatGPT Business avec Drive et Slack branchés ; rajouter 25 € par tête pour une deuxième couche IA, c'est payer deux fois pour un outil que l'équipe aura oublié dans deux mois." (P025) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| need | 17 | "Je viens de perdre mon chef de projet senior et ses clients me posent des questions auxquelles personne ne sait répondre : si Leon retrouve ce qu'il a promis dans ses mails et ses réunions, ça vaut l'essai. Sans engagement, je lance un pilote sur une dizaine de personnes de son équipe, pas sur les 150." (P011) · "Ça fait des mois que je cherche exactement ça : retrouver qui a promis quoi au client en réunion il y a deux mois. Sans engagement, je le teste sur moi et deux chefs de projet, pas sur les 30 personnes d'un coup." (P012) |
| price | 1 | "Après le devis Glean à 60 000 $, 25 € par siège sans engagement me permet de tester sur une dizaine de sièges (support et commerciaux) pour 250 € par mois, sans demander l'avis du DG. Mais je n'équipe pas toute la boîte : je pilote deux mois et je mesure qui s'en sert vraiment." (P098) |

### What would flip a no

- Un essai gratuit d'un mois sur une seule équipe, facturé seulement sur les utilisateurs actifs, qui montre noir sur blanc qu'il répond juste là où Claude Team se plante.
- Un pilote gratuit d'un mois sur une seule équipe (le support ou les commerciaux), avec un rapport préalable des documents sensibles mal partagés, et un tarif qui ne se paie que pour les utilisateurs actifs plutôt que pour tout l'effectif.
- Deux ou trois dirigeants d'agences ou d'ESN françaises comme la mienne qui l'utilisent depuis des mois et que je peux appeler, plus un pilote gratuit d'un mois limité à mon équipe commerciale, avec suppression des données garantie par écrit à la fin.
- Une installation sur notre propre cloud avec un DPA et une liste de sous-traitants validés par notre avocat, plus une référence d'une PME industrielle comparable qui l'utilise depuis six mois ; dans ce cas je ferais un pilote payant sur un service, pas toute la boîte.
- Un pilote gratuit sur une seule équipe et sans les boîtes mail, avec un DPA signé, un audit de sécurité ou une certification, et deux ou trois agences comparables qui l'utilisent déjà et que je peux appeler.
- Un pilote gratuit limité à une équipe (les commerciaux et le suivi client), sans mails personnels, avec un modèle de note d'information CSE et un DPA prêts, et une référence d'une PME comparable qui l'utilise depuis six mois.
- Un essai gratuit à 3 ou 4 personnes sur un périmètre limité, avec un audit avant branchement qui me montre noir sur blanc quels documents sensibles (paie, marges) seraient accessibles à qui, et des références de boîtes comme la mienne.
- Un dossier sécurité et RGPD complet (DPA, sous-traitants, hébergement nommé, audit tiers) validé par mon DPO, plus un pilote sur une seule équipe sans les réunions, avec des références de sociétés de services comme la mienne.
- Un pilote gratuit limité à une équipe et à quelques dossiers que je choisis, avec un audit qui me montre avant l'activation qui pourrait voir quoi, et une référence d'un dirigeant d'une boîte comme la mienne.
- Un essai gratuit limité à deux ou trois commerciaux, branché devant moi en moins d'une heure, qui me sort une vraie fiche client juste avant un rendez-vous, avec les sources, et une référence d'une agence comparable qui l'utilise.
- Un essai gratuit sur un ou deux projets où l'équipe voit concrètement qu'elle ne perd rien en confidentialité, et la preuve qu'il récupère l'historique d'un compte qui part avant qu'on le ferme.
- Un pilote gratuit de deux ou trois semaines sur un service, sur nos vraies données, validé par mon responsable informatique sur les droits d'accès, où Leon retrouve correctement des décisions anciennes et dit « je ne sais pas » au lieu d'inventer.

Buyers say they would buy **1.0 times** in the first month on average.

100 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

19/10/2026 · Sources : `pricing-curve.md` (100 acheteurs simulés), `competitors.md`, `numbers.json` (outil du CFO, montants en € HT ; l'outil affiche le signe $).

### 1. Le prix : 25 € HT par utilisateur actif et par mois

**Ce qu'ont dit les acheteurs** (simulés, pour choisir quoi tester, pas comme preuve) :

| point | prix | sens |
|---|---:|---|
| PMC | 5 € | en dessous, trop bon marché pour être sérieux |
| IPP | 15 € | autant de « bonne affaire » que de « cher » |
| PME | 30 € | au-dessus, trop de gens n'achètent plus |

La fourchette acceptable va de 5 à 30 €. Les réponses médianes donnent « cher » à 25 € et « trop cher » à 40 €. **25 € est dans la fourchette, mais au seuil où ça devient cher.** 35 € en sort : le haut de la fourchette envisagée par les fondateurs (20 à 35 €) est trop haut pour cette cible.

**Face aux concurrents** (`competitors.md`) : la médiane du marché est de 20 $ (Claude Team, ChatGPT Business, Notion Business, Slite, GoSearch). Dropbox Dash est à 15 $, Gemini Enterprise à 21 $, Copilot à 18-21 $. À 25 €, Leon est un peu au-dessus de la médiane. C'est tenable seulement si la différence se voit : réponses citées sur tout l'historique, droits, audit.

**La marge** (outil du CFO, plan à 250 sièges-mois) :

| prix | contribution par siège | marge au plan | seuil de rentabilité | résultat d'exploitation année 1 |
|---:|---:|---:|---:|---:|
| 19 € | 13,55 € (71 %) | 57 % | 51 sièges | 8 928 € |
| **25 €** | **19,55 € (78 %)** | **67 %** | **36 sièges** | **16 548 €** |
| 29 € | 23,55 € (81 %) | 72 % | 30 sièges | 21 628 € |

Les fondateurs ne se paient pas avant que l'activité soit bien rentable : avec des coûts fixes d'environ 690 € par mois, le seuil reste très bas à n'importe lequel de ces prix. Le prix n'est donc pas ce qui décide de la survie. **Ce qui décide, c'est le nombre de sièges**, et le panel dit que les sièges viennent par pilotes d'une équipe.

**Le changement qui compte : facturer les utilisateurs actifs, pas l'effectif.** C'est la demande de prix la plus répétée du panel (P002, P017, P033, P049, P088, P089, P098). Elle répond à « je paie pour toute la boîte et la moitié ne s'en servira pas ». Elle rend aussi le pilote d'une équipe naturel.

### 2. L'échelle

| offre | prix | pour qui | pourquoi monter d'un cran |
|---|---|---|---|
| **Pilote** | gratuit 30 jours, 1 équipe, jusqu'à 10 personnes | toute société qui veut voir avant de payer | c'est la condition n°1 du panel |
| **Équipe** | 25 € HT par utilisateur actif et par mois, sans engagement | les sociétés après le pilote | plus d'équipes et toutes les recettes, facture qui suit l'usage réel |
| **Dédiée** | sur devis, à partir de 35 € par utilisateur actif (à tester) | 80-200 personnes, DPO, secteurs sensibles | instance dédiée en UE ou installation sur leur cloud, journal d'accès, DPA sur mesure |

Le prix « Dédiée » est une hypothèse à tester avec de vrais prospects : le panel n'a pas répondu sur cette offre.

### 3. L'offre d'ouverture

**Les 20 premières sociétés : 19 € HT par utilisateur actif, garanti 12 mois**, pour les contrats signés avant le **31 mars 2027**. Ensuite, le prix normal de 25 € s'applique. Pas de faux prix barré : 25 € est le vrai prix public dès le lancement.

### 4. À tester avec de vrais acheteurs

- **Deux prix : 19 € et 29 € par utilisateur actif**, sur deux pages d'atterrissage identiques, avec une réservation de pilote qui demande une carte (rien n'est débité pendant 30 jours).
- **Siège actif contre forfait par société**, à demander pendant les 12 entretiens. Plusieurs acheteurs ont demandé un forfait (P017, P059).

### 5. Les objections de prix, mot pour mot (panel simulé, pas des clients)

1. « Je paie déjà Claude Team pour toute la boîte, branché sur Drive et Slack. Ajouter 25 € par tête, c'est 500 à 1 000 € de plus par mois pour une mémoire que mon outil actuel finira sans doute par avoir. Je ne paie pas deux fois pour le même usage. » (P001)
2. « 25 € par personne sur 120 salariés, ça fait plus de 3 000 € par mois pour un outil dont la moitié des gens ne se serviront jamais. » (P088)
3. « Pour que ça m'enlève mon heure de Slack, il faut que toute l'équipe l'utilise, donc 25 sièges à 25 €, soit plus de 7 000 € par an, pour un outil dont je n'ai aucun chiffre de retour. » (P017)

## The offer

19/10/2026 · Méthode : la grille Offres du pack (résumé du cadre publié de *$100M Offers*). Sources : `panel/results.md` (100 acheteurs simulés), `competitors.md`, `numbers.json`, `board.md`. Ancien pitch : `pitch-v1.md` ; nouveau : `pitch.md`.

### 1. Les obstacles, dans les mots des acheteurs

**Avant d'acheter**
1. « Je ne confie pas tous nos mails, Drive et réunions à une société de deux personnes que je ne connais pas. » (la majorité des 67 refus pour confiance)
2. « Notre Drive est mal rangé : un stagiaire tomberait sur la paie ou les marges d'un client, avec la source citée. » (P007, P009, P031, P038, P071, P076, P089…)
3. « Je ne signe rien sans mon DPO, mon avocat, et sans informer le CSE. » (P004, P019, P037, P047, P054…)
4. « Garder tout ce qui se dit en réunion, mes salariés vont le vivre comme de la surveillance. » (P006, P013, P048, P078)
5. « Ces outils inventent des réponses avec assurance, j'en ai déjà vu. » (P024, P028, P041, P045, P072, P091)
6. « Tout le monde promet de citer la source ou de dire je ne sais pas. » (P024, P051, P091)
7. « Je ne crois pas aux 15 minutes sans équipe informatique. » (P010, P017, P022, P043, P046)
8. « 25 € par tête sur toute la boîte, sans chiffre de retour. » (P002, P017, P033, P088)
9. « Je paie déjà Claude Team ou ChatGPT Business, je ne paie pas deux fois. » (P001, P025, P034, P075)
10. « Pas de référence d'une société comme la mienne. » (P003, P005, P057, P063, P068)
11. « Et si vous fermez, ou si vous êtes piratés ou rachetés ? » (P005, P056, P062, P063, P094)
12. « Personne autour de moi ne l'utilise. » (P003, P057, P090)

**Pendant**
13. « Il faut ingérer tout l'historique avant la première bonne réponse. » (grille Produit)
14. « Brancher Jira, Drive et GitHub avec les bons droits prendra des jours. » (P069)
15. « Personne ne sait quelles questions poser. » (déduit des refus « habitude »)
16. « Peut-on récupérer l'historique d'un salarié déjà parti ? » (P013, P026, P071, P099)

**Après**
17. « Dans deux mois, plus personne ne s'en servira. » (P015, P023, P033, P049, P058, P060, P066)
18. « On paiera des sièges vides. » (P049, P088, P089, P098)
19. « Une seule mauvaise réponse devant un client, et c'est fini. » (P016, P032, P041)
20. « Je veux pouvoir tout récupérer et tout supprimer. » (P003, P082)

### 2. Les solutions, notées

Valeur pour l'acheteur et coût de livraison sur 5 (5 = très précieux / très cher). Coûts tirés de `numbers.json` ou estimés et signalés.

| # | solution | répond à | valeur | coût | gardée |
|---|---|---|---:|---:|---|
| A | **Pilote gratuit 30 jours, une équipe, 10 personnes max** | 1, 5, 8, 9, 12 | 5 | 2 (≈ 50 € de service IA par pilote : 10 sièges × 5 €, plus le temps des fondateurs) | oui |
| B | **Audit des partages avant branchement** : liste des documents sensibles visibles par trop de monde, exclusion par défaut de la paie et de la finance | 2, 3 | 5 | 2 (l'API Drive donne les partages ; à construire) | oui |
| C | **Test des 10 questions** : l'équipe écrit 10 questions dont elle connaît la réponse ; score visible réponse par réponse | 5, 6, 19 | 5 | 1 | oui |
| D | **Dossier confiance** : DPA signable, sous-traitants et modèle d'IA nommés, hébergement UE, note d'information CSE, journal des questions, export et suppression sous 30 jours | 1, 3, 4, 11, 20 | 5 | 2 (2 500 € une fois, contrats relus) | oui |
| E | **Installation avec vous en une heure, en visio**, recettes de l'équipe réglées | 7, 14, 15 | 4 | 3 (une heure de fondateur par client) | oui, tant qu'il y a moins de 50 clients |
| F | **Facturation à l'utilisateur actif** | 8, 17, 18 | 5 | 1 (perte de revenu sur les inactifs) | oui |
| G | Capture des conversations IA désactivée par défaut | 4 | 3 | 1 | oui |
| H | Instance dédiée ou cloud du client | 1, 11 | 4 pour les 80-200 | 4 | oui, dans l'offre « Dédiée » seulement |
| I | Garantie « remboursé si » sur un mois payé | 17 | 3 | 1 | non : le pilote gratuit et le test des 10 questions couvrent déjà le risque |
| J | Certification ISO 27001 | 11 | 4 | 5 (des dizaines de milliers d'euros) | non pour l'instant ; audit léger par un tiers à la place (4 000 €, dans `numbers.json`) |
| K | Récupération de l'historique d'un compte parti | 16 | 5 pour le déclencheur « départ » | 3 (délégation admin Google Workspace ; faisable tant que le compte n'est pas supprimé) | à vérifier techniquement avant de le promettre ; absent du pitch sauf comme exemple de question |

### 3. L'offre empilée : « Le pilote 30 jours »

- **Le cœur** : retrouvez en une question ce qui a été dit et décidé chez vous, avec la source exacte, sans voir ce que vous n'avez pas le droit de voir.
- **Bonus 1, l'audit des partages** (B) : répond à « le stagiaire verrait la paie ».
- **Bonus 2, le dossier confiance** (D, G) : répond au DPO, au CSE et à la peur d'une jeune société.
- **Bonus 3, l'installation avec vous en une heure** (E) : répond à « je n'ai pas d'équipe informatique ».
- **La garantie** : le pilote est gratuit, et le test des 10 questions montre le score avant de payer quoi que ce soit (A, C). Ce qu'elle coûte, selon `numbers.json` : environ 50 € de service IA par pilote de 10 sièges, plus une heure d'installation. Même si aucun pilote ne convertissait, 20 pilotes coûteraient environ 1 000 €.
- **L'urgence, réelle** : les 20 premières sociétés paient 19 € par utilisateur actif, garantis 12 mois, pour un contrat signé avant le 31 mars 2027. C'est limité parce que les fondateurs ne peuvent pas installer plus de 20 clients à la main au premier trimestre.
- **Le nom** : « Le pilote 30 jours ».

### 4. L'équation de valeur, avant et après (note de 1 à 10)

| élément | avant (pitch v1) | après | ce qui la fait bouger |
|---|---:|---:|---|
| Résultat rêvé | 7 | 7 | inchangé : « retrouver ce qui a été dit et décidé » |
| Probabilité perçue d'y arriver | 3 | 6 | test des 10 questions, audit, dossier confiance |
| Délai avant le résultat | 5 | 7 | installation en une heure avec les fondateurs, une seule équipe |
| Effort et sacrifice | 3 | 6 | pas de paiement avant le résultat, paie exclue, une équipe d'abord, utilisateurs actifs seulement |

Ces notes sont mon estimation en appliquant la grille, pas une mesure. Le nouveau test du panel ci-dessous les vérifie.

### 5. Le nouveau test

Les mêmes 20 acheteurs (P001 à P020 du premier panel, mêmes fiches) ont vu le nouveau pitch (`panel-v2/`).

| | pitch v1 | « Le pilote 30 jours » |
|---|---:|---:|
| achètent | 5 sur 20 (25 %) | **9 sur 20 (45 %)** |
| refus pour confiance | 12 | 9 |
| refus pour prix | 3 | 2 |

- **4 acheteurs passent de non à oui, aucun de oui à non** : P005 et P013 (noyés dans les outils), P009 (pas encore équipé en IA), P014 (sceptique des démos IA). Le test des 10 questions et l'audit des partages sont les raisons qu'ils citent.
- **Les prudents sur la sécurité et le RGPD ne bougent pas** (P004, P008, P019, P020 : 0 sur 4). Ils veulent une certification ISO 27001 ou SOC 2, une installation sur leur cloud et des références : un dossier ne suffit pas.
- **Ceux qui ont déjà ChatGPT Business ou Claude Team ne bougent pas** (P001, P002 : 0 sur 2). Ils veulent que Leon remplace leur abonnement ou s'y branche, pas qu'il s'ajoute.
- **Attention, « oui » veut dire ici « je lance le pilote gratuit »**, pas « je paie ». Plusieurs ne paieront qu'avec au moins 8 bonnes réponses sur 10 (P007, P015, P017, P018). Le taux de passage du pilote au paiement est inconnu, et c'est le chiffre à mesurer avec de vrais clients.
- Le doute « on va payer et plus personne ne s'en servira » reste présent chez les acheteurs (P011, P017, P018), même quand ils disent oui.

## The numbers

19/10/2026 · Mis à jour après l'étape opérations (prix publics de l'expert-comptable, de la signature électronique et de l'immatriculation). Tous les chiffres viennent de `numbers.json` et de l'outil du pack (le tableau détaillé suit cette note). Montants en euros HT ; l'outil affiche le signe $. Sources et estimations : `cfo-sources.md`. Ce n'est pas un conseil financier, fiscal ou juridique : un expert-comptable doit vérifier la structure, les charges et la TVA avant que de l'argent ne bouge.

**Hypothèse de l'année 1** : tous les sièges payent le prix de lancement de 19 € (les 20 premières sociétés, garanti 12 mois), les pilotes gratuits coûtent environ 150 € par mois, et les fondateurs ne se paient pas (leur décision : pas de rémunération avant que l'activité soit bien rentable). La montée en charge (0 siège le mois 1, 250 le mois 12) est **une estimation** : environ 20 à 25 sociétés de 10 sièges en un an, en vente directe. Le panel la rend plausible sans la prouver : 45 % des acheteurs du nouveau test lancent le pilote gratuit, mais personne ne sait combien paieront ensuite.

- **La marge** : chaque siège-mois laisse **13,55 €** (71 %) après son coût de service. Au plan de 250 sièges, la marge est de **54 %**. Le seuil de rentabilité est de **60 sièges** payants, soit environ 6 sociétés de 10 personnes.
- **L'année 1** : résultat d'exploitation de **7 464 €** sur 24 130 € de chiffre d'affaires. Après les 8 052 € de dépenses de départ : **−588 €**. Les dépenses de départ ne sont pas remboursées dans l'année.
- **La trésorerie** : il faut **10 284 €** avant que ça s'autofinance (le point bas est au mois 5).
- **La ligne à surveiller : le coût de service par siège.** Avec le chat Leon au coût haut (11 € par siège au lieu de 5 €), la contribution tombe à 7,55 € et l'année 1 devient négative (**−156 €**). Le volume compte aussi : à moitié des sièges prévus, l'année 1 est à **−1 140 €**.

**Trois façons d'améliorer la marge** (calculées avec l'outil) :
1. **Faire lire la mémoire par le LLM du client (MCP) plutôt que par le chat Leon** : coût de service à 2,5 € au lieu de 5 €. Contribution 16,05 € (84 %), année 1 à **10 640 €** (+3 176 €), et +2 588 € après les dépenses de départ.
2. **Repasser au prix normal de 25 € dès que possible** : année 1 à **15 084 €** (+7 620 €), dépenses de départ remboursées au mois 11. La garantie de 19 € pendant 12 mois pour les 20 premières sociétés coûte donc environ 7 600 € la première année.
3. **Reporter l'audit de sécurité tiers (4 000 €) après les premiers pilotes payants** : trésorerie nécessaire à **6 284 €** au lieu de 10 284 €, dépenses de départ remboursées au mois 11. Le résultat d'exploitation ne change pas. Mais les prudents sur la sécurité refusent sans audit : à reporter seulement si la première cible n'est pas eux.

**Les conditions d'argent du conseil** (`board.md`) :
- [ ] *Un coût d'acquisition estimé et un canal reproductible* : **non rempli.** En vente directe par les fondateurs, le coût en argent est presque nul, mais le coût en temps n'est pas chiffré. Le maximum qu'on peut payer pour un client se calcule avec la contribution, voir l'étape marketing.
- [x] *L'unité gagne de l'argent avant les coûts fixes* : oui, 13,55 € par siège-mois.
- [ ] *L'année 1 rembourse le départ* : non, à −588 € au plan de base ; oui avec l'une des trois améliorations ci-dessus.

---

## Unit economics: Leon : mémoire d'entreprise pour sociétés de 10 à 200 personnes (montants en euros HT ; l'outil affiche le signe $). Année 1 au prix de lancement de 19 € (20 premières sociétés, garanti 12 mois).

Every number below comes from the input file. Nothing is looked up or guessed.

### One siège-mois

| line | per siège-mois |
| --- | ---: |
| Price | $19.00 |
| Coût de service IA et hébergement par siège (estimation : 2,5 $ si lecture par le LLM du client, 4 à 11 $ avec le chat Leon ; milieu retenu) | -$5.00 |
| Frais de paiement Stripe (vérifié par ops le 19/10 sur stripe.com/fr/pricing : carte UE standard 1,5 % + 0,25 € par facture, plus Stripe Billing 0,7 % pour l'abonnement ; à 19 € et 10 sièges par facture ≈ 0,44 €, montant inchangé) | -$0.45 |
| **Contribution** (what each siège-mois leaves to pay the fixed costs) | **$13.55** (71%) |

### The margin that matters

Fixed costs: $812 a month (Outils et hébergement de base actuels (environ 500 $) $460, Expert-comptable en ligne (mis à jour par ops le 19/10 : 150 → 99 €, prix public Dougs « Sérénité » pour une SAS, bilan, liasse, TVA et dépôt des comptes inclus) $99, Assurance RC pro et cyber (estimation, à faire chiffrer : les prix publics « à partir de » ne couvrent pas le cyber pour un SaaS qui stocke des données clients) $80, Signature électronique des DPA et contrats (ajout ops le 19/10 : Yousign Plus, 23 € HT par mois en engagement annuel, prix relevé sur une source secondaire, à confirmer) $23, Rémunération des fondateurs (aucune tant que l'activité n'est pas bien rentable, décision des fondateurs) $0, Pilotes gratuits : environ 3 par mois × 10 sièges × 5 € de service IA (estimation) $150).

- **Break-even: 60 siège-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (250 a day): **54%** of every sale, after every cost.

### Year 1, month by month

| month | siège-moiss a day | revenue | profit | cumulative (after $8,052 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$812 | -$8,864 |
| 2 | 10 | $190 | -$676 | -$9,540 |
| 3 | 25 | $475 | -$473 | -$10,014 |
| 4 | 40 | $760 | -$270 | -$10,284 |
| 5 | 60 | $1,140 | $1 | -$10,283 |
| 6 | 80 | $1,520 | $272 | -$10,011 |
| 7 | 105 | $1,995 | $611 | -$9,400 |
| 8 | 130 | $2,470 | $950 | -$8,450 |
| 9 | 160 | $3,040 | $1,356 | -$7,094 |
| 10 | 190 | $3,610 | $1,762 | -$5,332 |
| 11 | 220 | $4,180 | $2,169 | -$3,163 |
| 12 | 250 | $4,750 | $2,576 | -$588 |

- **Year 1 operating profit: $7,464** on $24,130 of revenue.
- After the $8,052 startup spend: -$588.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$10,284**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 54% | 60 | $7,464 |
| Price -10% | 49% | 70 | $5,052 |
| Volume -20% | 50% | 60 | $4,023 |
| Unit costs +15% | 50% | 64 | $6,426 |

### Red flags

- The startup spend is not earned back within year 1.

## Marketing

19/10/2026 · Étape `founder-marketing` du pack. Sources : `panel/results.md` (100 acheteurs simulés, 18 % achètent), `panel-v2/results.md` (« Le pilote 30 jours » refait sur 20 des mêmes acheteurs, 45 % lancent le pilote), `competitors.md`, `offer.md`, `pricing.md`, `numbers.json`, `cfo.md`, `board.md`.

**À lire avant tout :**
- Les acheteurs du panel sont **simulés**. Leurs phrases servent à choisir les messages. Ce ne sont pas des clients : **on ne les cite jamais dans une pub, un post ou une page**.
- Dans le second test, « oui » veut dire « je lance le pilote gratuit », pas « je paie ». Le passage du pilote au paiement est inconnu.
- Ce n'est pas un conseil juridique. Les règles de publicité citées plus bas sont à faire vérifier par l'avocat qui relit déjà les CGV et le DPA.

### Les hypothèses de ce plan

| hypothèse | valeur retenue | d'où elle vient |
|---|---|---|
| Date de lancement | **mardi 12 janvier 2027** | Le plan précédent visait le 12/01/2027. **C'est une hypothèse**, à confirmer par David et Amos. Elle suppose que le dossier confiance, l'audit des partages et le test des 10 questions sont prêts avant. |
| Budget marketing | **environ 1 000 € sur les 30 jours** | Aucun budget n'est fixé (« les fondateurs mettront ce qu'il faut »). C'est **une proposition**, volontairement petite. |
| Capacité de pilotes | **6 pilotes installés en janvier** | Estimation : une heure d'installation chacun plus le suivi, à deux fondateurs. Le CFO compte environ 3 pilotes par mois ensuite. |
| Offre de lancement | 19 € HT par utilisateur actif, garantis 12 mois, pour les 20 premières sociétés, contrat signé **avant le 31 mars 2027** | `pricing.md`. Prix public normal : 25 €. Pas de faux prix barré. |

### 1. La cible : qui on vise, qui on ne vise pas

#### Qui on vise

**Le comportement qui achète, c'est « Noyé dans les outils » : 65 % d'achat (13 sur 20) au premier panel, 88 % (7 sur 8) au second.** La moyenne est à 18 %. Leur description : « dix à trente logiciels, personne ne sait où est quoi, cherche une solution unique depuis des mois ».

Dans quel type de société on les trouve (premier panel, parmi les 20 « noyés ») :

| type de société | noyés | achètent |
|---|---:|---:|
| Dirigeant fondateur de société de services (agence, conseil, ESN), 10-40 personnes | 8 | 5 |
| CEO ou COO d'un éditeur SaaS ou d'un e-commerce, 20-80 personnes | 6 | 4 |
| DG de PME industrielle ou de distribution, 80-200 personnes | 3 | 2 |
| Responsable des opérations, 50-200 personnes | 3 | 2 |

**Première audience : dirigeants de sociétés de services et d'éditeurs SaaS de 10 à 80 personnes, qui empilent Google Workspace, un CRM, Notion ou Jira et un outil de visio.**

#### Les moments qui déclenchent l'achat

Le panel donne à chaque acheteur une situation vécue. Taux d'achat par situation, sur les 100 :

| situation | acheteurs | achètent | taux |
|---|---:|---:|---:|
| **Un chef de projet senior vient de partir**, ses clients posent des questions | 14 | 5 | **36 %** |
| A vu une démo de Glean, devis à 60 000 $ par an | 16 | 4 | 25 % |
| Chacun utilise ChatGPT dans son coin, rien n'est partagé | 8 | 2 | 25 % |
| Trois arrivées le mois prochain, onboarding de mémoire | 13 | 2 | 15 % |
| Les commerciaux fouillent Gmail, HubSpot et Slack avant chaque rendez-vous | 20 | 3 | 15 % |
| **Un client conteste un périmètre validé en réunion** | 15 | 1 | 7 % |
| Une heure par jour à répondre dans Slack | 9 | 0 | 0 % |

**Lecture honnête :**
- **Le départ d'un chef de projet senior est le déclencheur le plus fort**, et de loin (36 %, le double de la moyenne).
- **Le client qui conteste ce qui a été convenu** donne la phrase d'achat la plus nette (P012 : « retrouver qui a promis quoi au client en réunion il y a deux mois »), mais un seul acheteur sur 15 achète quand on le prend seul. Il marche chez les « noyés », pas ailleurs. On le garde comme **deuxième message**, pas comme message principal.
- Les deux situations racontent la même chose : **ce qui a été promis à un client s'est perdu**. C'est le cœur du positionnement.

#### Ce que le marketing ne vise pas

| groupe | taux d'achat | pourquoi on ne le vise pas maintenant |
|---|---:|---|
| **Prudents sécurité et RGPD** | 0 sur 16 (panel 1), 0 sur 4 (panel 2) | Ils demandent une certification ISO 27001 ou SOC 2, une installation sur leur cloud et des références. Un dossier ne suffit pas. On y reviendra avec l'offre « Dédiée » et des références. |
| **Déjà sur ChatGPT Business, Claude Team ou Copilot** | 0 sur 5 (panel 1), 0 sur 2 (panel 2) | Ils ne paieront pas deux fois. Il faudrait que Leon se branche sur leur outil (par MCP) et le prouve chiffres en main. Pas avant d'avoir cette preuve. |
| Sceptiques des démos IA | 0 sur 9 (panel 1) | Ils veulent voir sur leurs données, pas sur un post. Ils viennent après les premières références. |
| Pas encore équipés en IA | 6 % (panel 1) | Il faudrait d'abord leur vendre l'IA. Trop long pour deux fondateurs. |
| Équipes qui vivent dans Slack | 0 sur 9 | Slack interdit le stockage : Leon interroge Slack à la volée, comme Claude. Notre avantage y est faible. |
| DG de PME industrielle de 80-200 personnes, en général | 12 % | Cycle long (responsable informatique, DPO, CSE). Seulement s'ils sont « noyés » et viennent par le réseau. |

Concrètement : pas de message sur la sécurité comme argument principal, pas de comparaison « mieux que votre ChatGPT », pas de ciblage des secteurs réglementés (santé, banque, juridique) au lancement.

### 2. Le positionnement

#### Trois versions

**A. Le départ**
> Pour les dirigeants de sociétés de 10 à 200 personnes **qui viennent de perdre quelqu'un qui avait tout en tête**, Leon est **la mémoire d'entreprise** qui retrouve ce qu'il a dit, promis et décidé, avec la source exacte, **contrairement à l'appel à l'ancien collègue en espérant qu'il se souvienne**.

**B. Ce qui a été promis au client** *(recommandée)*
> Pour les dirigeants de sociétés de 10 à 80 personnes **noyés dans leurs outils, qui ne retrouvent plus ce qui a été promis à un client quand quelqu'un part ou qu'un client conteste**, Leon est **la mémoire d'entreprise** qui retrouve ce qui a été dit et décidé, cite le mail ou la réunion d'où vient la réponse, et dit « je ne sais pas » quand il ne sait pas, **contrairement aux assistants IA qui cherchent au moment de la question et ne gardent rien**.

**C. Un seul endroit**
> Pour les dirigeants **dont l'équipe jongle avec dix à trente logiciels et ne sait plus où est quoi**, Leon est **la mémoire d'entreprise** qui rassemble ce qui se dit et se décide dans tous ces outils, **contrairement à la recherche outil par outil**.

#### La recommandation : B

- **Elle parle à ceux qui achètent.** Les « noyés » achètent à 65 % puis 88 %. Leur raison d'acheter, mot pour mot dans le panel, est presque toujours « retrouver ce qui a été dit et décidé » ou « qui a promis quoi » (P011, P012, P015, P058, P067, P097, P100).
- **Elle porte les deux déclencheurs à la fois.** Le départ (36 % d'achat) et le client qui conteste (la phrase la plus claire) racontent la même perte : une promesse faite à un client qu'on ne retrouve plus.
- **Elle ne ressemble pas aux concurrents.** Dropbox Dash, GoSearch, Onyx, Slite, Gemini et Copilot se vendent comme « recherche d'entreprise » ou « réponses IA sur vos applis » (`competitors.md`). « Ce qui a été promis au client » est un résultat, pas une catégorie technique.
- **Elle répond aux plaintes réelles du marché.** Les plaintes n°2 et n°3 sur les concurrents sont « le connecteur ne trouve rien » et « les réponses sont fausses ». La source citée et le « je ne sais pas » y répondent.
- **Pourquoi pas A seul** : le départ est un moment rare dans une société donnée. Il ouvre la porte, il ne suffit pas pour toute une année de messages.
- **Pourquoi pas C** : c'est la promesse que huit concurrents font déjà autour de 20 $ (`competitors.md`, « le trou »). Elle nous rend interchangeables.

**Attention, dans les messages publics, on ne nomme pas ChatGPT, Claude ou Copilot.** La publicité comparative est permise en France seulement si elle compare des choses objectives et vérifiables, sans dénigrer (Code de la consommation, articles L122-1 et suivants). La comparaison chiffrée reste pour l'entretien, sur les données du client.

### 3. Les canaux

| canal | pourquoi il colle à cet acheteur | coût | comment on sait que ça marche | choisi |
|---|---|---|---|---|
| **Réseau direct des fondateurs** (messages personnels, mails, appels, recommandations) | Un dirigeant de 20 personnes ne confie pas ses mails à un inconnu. Le refus n°1 du panel est la confiance (67 sur 82). Le réseau donne la confiance que la pub ne donne pas. | Du temps : environ 10 h par semaine et par fondateur (estimation). Argent : quasi nul. | Taux de réponse ≥ 25 %, puis rendez-vous, puis pilotes lancés | **oui** |
| **LinkedIn, profils personnels des deux fondateurs** (posts et messages) | C'est là que des dirigeants de PME de services et SaaS lisent et parlent de leurs outils. On y repère aussi des signaux : un changement de poste dans une société cible, une offre d'emploi « chef de projet senior » (un remplacement). | Sales Navigator : environ 100 € par mois et par licence (prix public à vérifier). 2 licences = environ 200 €. | Messages entrants de dirigeants de la cible, commentaires de dirigeants, demandes de pilote venues d'un post | **oui** |
| **Prescripteurs** : intégrateurs HubSpot ou Google Workspace, experts-comptables de PME, clubs de dirigeants (CJD, réseaux locaux) | Ils connaissent les sociétés « noyées » et ont leur confiance. Une présentation par eux remplace la référence qui nous manque (P003, P057, P063 : « personne autour de moi ne l'utilise »). | Petits-déjeuners : environ 150 € chacun. Pas de commission au lancement. | Nombre de présentations reçues, et pilotes qui en viennent | **oui, en test** (2 rencontres) |
| Publicité LinkedIn | Le bon ciblage (fonction, taille), mais un clic coûte cher sur une cible de dirigeants, et une pub ne lève pas l'objection « société de deux personnes ». | Plusieurs euros par clic (ordre de grandeur, non vérifié) | Coût par pilote réservé | non, sauf test de 300 € décidé à J+7 (voir budget) |
| Google Ads | Personne ne cherche « mémoire d'entreprise ». Les mots « recherche d'entreprise IA » amènent vers Glean ou Copilot. | Variable | — | non |
| Salons (VivaTech, salons IT) | Trop chers, trop tard (VivaTech est en juin), et le public est l'IT des grands comptes. | Plusieurs milliers d'euros | — | non |
| Prospection en masse par mail | La prospection B2B par mail est permise si elle vise la fonction de la personne et propose de se désinscrire (règle CNIL). Mais un mail de masse d'une société inconnue aggrave le problème de confiance. | Faible | — | non |
| Contenu pour Google (articles, SEO) | Utile dans un an, inutile pour janvier. | Du temps | — | plus tard |
| Product Hunt, créateurs, influence | Pas le bon public : peu de dirigeants de PME françaises de services. | — | — | non |

### 4. La campagne de 30 jours (29 décembre 2026 au 28 janvier 2027)

#### Ce qui doit être prêt avant J-14

- La page du pilote : le pitch de `pitch.md`, un formulaire de réservation, le dossier confiance à télécharger.
- Le dossier confiance relu par l'avocat (déjà budgété : 2 500 € dans `numbers.json`).
- L'audit des partages et le test des 10 questions qui marchent sur un vrai Google Workspace.
- **Le test de Leon sur nos propres outils** : 10 questions dont on connaît la réponse, score réel noté. C'est le seul « chiffre » qu'on publie au lancement.
- La liste de cibles : 80 dirigeants du réseau des deux fondateurs, triés « noyés » ou non, avec le déclencheur connu s'il y en a un.

#### Le calendrier

« J » = jour du lancement, le mardi 12 janvier 2027. D = David, A = Amos (répartition à ajuster par les fondateurs).

| date | J | canal | ce qui sort | le message |
|---|---|---|---|---|
| mar. 29/12 | J-14 | réseau | D et A finissent la liste des 80 dirigeants ; 10 messages « vœux et question » aux plus proches | « Je lance quelque chose en janvier. Une question : chez toi, quand quelqu'un part, comment retrouvez-vous ce qu'il avait promis aux clients ? » |
| mer. 30/12 | J-13 | réseau | 10 messages de plus ; on note les réponses | Même question. On écoute, on ne vend pas. |
| jeu. 31/12 | J-12 | — | rien | Fin d'année : personne ne lit. |
| ven. 01/01 | J-11 | — | rien (férié) | — |
| sam. 02/01 | J-10 | — | rien | — |
| dim. 03/01 | J-9 | — | rien | — |
| lun. 04/01 | J-8 | LinkedIn | Post 1 (D), coulisses | « On a posé 10 questions à notre propre mémoire, sur nos propres outils. Voici le score, les bonnes et les mauvaises réponses. » (score réel seulement) |
| mar. 05/01 | J-7 | réseau | 20 messages personnels aux dirigeants « noyés » (D 10, A 10) | Accroche 3 ou 1 selon la personne (voir les 10 accroches) |
| mer. 06/01 | J-6 | LinkedIn | Post 2 (A) | Accroche 2 : le client qui conteste. Une histoire vraie de notre expérience, ou une question ouverte, jamais une histoire inventée. |
| jeu. 07/01 | J-5 | prescripteurs | Invitations au petit-déjeuner n°1 (20/01) envoyées à 15 dirigeants via 2 intégrateurs ou experts-comptables | « Comment retrouver ce qui a été promis à un client : 45 minutes entre dirigeants, sans démo commerciale. » |
| ven. 08/01 | J-4 | réseau | Relance des messages du 05/01 restés sans réponse ; premiers rendez-vous calés pour la semaine du 12 | — |
| sam. 09/01 | J-3 | — | rien | — |
| dim. 10/01 | J-2 | — | relecture de la page et du dossier confiance | — |
| lun. 11/01 | J-1 | LinkedIn | Post 3 (D), coulisses | « Demain on ouvre 6 pilotes. Voici ce qu'on a refusé de construire, et pourquoi la paie est exclue par défaut. » |
| **mar. 12/01** | **J** | LinkedIn + réseau | **Lancement.** Post 4 (D et A, chacun le sien). 30 messages personnels. | Accroche 1 (le départ). L'offre : pilote gratuit 30 jours ; 19 € garantis 12 mois pour les 20 premières sociétés, contrat signé avant le 31 mars 2027 ; 6 pilotes possibles en janvier. |
| mer. 13/01 | J+1 | réseau | Rendez-vous (visio 30 min) ; réponses aux messages du lancement | Accroche 6 en rendez-vous : le test des 10 questions |
| jeu. 14/01 | J+2 | LinkedIn | Post 5 (A) | Accroche 5 : l'audit des partages |
| ven. 15/01 | J+3 | réseau | Première installation de pilote si signé ; bilan de la semaine (les 3 chiffres) | — |
| sam. 16/01 | J+4 | — | rien | — |
| dim. 17/01 | J+5 | — | rien | — |
| lun. 18/01 | J+6 | réseau | 20 messages : cibles avec un signal LinkedIn (départ, offre d'emploi de chef de projet) | Accroche 1, personnalisée |
| mar. 19/01 | J+7 | LinkedIn | Post 6 (D) ; **décision sur le test de pub LinkedIn de 300 €** (seulement si un post a fait venir au moins 2 demandes de pilote) | Accroche 7 : vous ne payez que ceux qui s'en servent |
| mer. 20/01 | J+8 | prescripteurs | **Petit-déjeuner n°1** | Pas de démo. On parle du départ et du client qui conteste. Proposition de pilote à la fin seulement. |
| jeu. 21/01 | J+9 | LinkedIn | Post 7 (A), coulisses | « Une réponse que Leon n'a pas su donner cette semaine, et pourquoi c'est bien qu'il l'ait dit. » (exemple tiré de nos propres données) |
| ven. 22/01 | J+10 | réseau | Relances ; bilan de semaine 2 | — |
| sam. 23/01 | J+11 | — | rien | — |
| dim. 24/01 | J+12 | — | rien | — |
| lun. 25/01 | J+13 | réseau | Point à mi-pilote avec les premiers pilotes : qui pose des questions, lesquelles | Accroche 9 : au bout de 30 jours, vous savez qui s'en sert |
| mar. 26/01 | J+14 | LinkedIn | Post 8 (D) | Accroche 4 : nous sommes deux, voici qui voit vos données |
| mer. 27/01 | J+15 | prescripteurs | Invitations au petit-déjeuner n°2 (début février) | Même format que le n°1 |
| jeu. 28/01 | J+16 | tous | Bilan des 30 jours : on garde, on change ou on arrête chaque canal (voir les seuils) | Post 9 (A) : ce qu'on a appris en un mois, chiffres réels |

**Quand il n'y a rien de neuf à dire**, on montre l'atelier, avec de vrais faits :
- une question posée à Leon sur nos propres outils, la réponse et sa source ;
- une réponse ratée et ce qu'on a corrigé ;
- comment on a écrit la note pour le CSE ou le DPA, et pourquoi ;
- pourquoi Slack est interrogé en direct et pas stocké ;
- ce qu'on a choisi de ne pas construire.

**Après les pilotes**, un client peut parler de son expérience, seulement s'il l'a vraiment vécue, avec son accord écrit, et ses mots exacts. Jamais avant.

#### Les 10 accroches

Chaque accroche répond à une objection ou reprend une raison d'achat du panel. Les numéros d'objection sont ceux de `offer.md`.

| # | format | l'accroche | répond à |
|---|---|---|---|
| 1 | Première ligne d'un post LinkedIn | « Votre chef de projet senior part vendredi. Que reste-t-il de ce qu'il a promis à ses clients ? » | Raison d'achat : le départ (36 % d'achat ; P011, P015) |
| 2 | Première ligne d'un post LinkedIn | « "Ce n'était pas dans le périmètre." Qui l'a dit, dans quelle réunion, il y a deux mois ? » | Raison d'achat : le client qui conteste (P012) |
| 3 | Première phrase d'un message personnel | « Combien d'outils faut-il ouvrir chez toi pour savoir ce qui a été décidé avec un client ? » | Raison d'achat : noyé dans les outils (65 % d'achat) |
| 4 | Titre de la section confiance de la page | « Nous sommes deux. Voici qui peut voir vos données, où elles sont hébergées, et comment tout supprimer. » | Objections 1 et 11 : « une société de deux personnes », « et si vous fermez » |
| 5 | Titre de post ou de pub | « Avant de brancher quoi que ce soit, on vous montre qui peut déjà ouvrir votre paie. » | Objection 2 : « un stagiaire tomberait sur la paie » (à publier seulement quand l'audit marche) |
| 6 | Titre de la page du pilote | « Écrivez 10 questions dont vous connaissez la réponse. Vous verrez le score avant de payer. » | Objections 5 et 6 : « ces outils inventent », « tout le monde promet » |
| 7 | Titre de pub ou ligne de mail | « Vous ne payez que les personnes qui s'en servent. » | Objections 8 et 18 : « 25 € par tête sur toute la boîte », « des sièges vides » |
| 8 | Ligne de mail après rendez-vous | « On installe avec vous, en visio, en une heure. Vous n'avez pas besoin d'informaticien. » | Objections 7 et 14 : « je ne crois pas aux 15 minutes » |
| 9 | Première ligne d'un post | « Au bout de 30 jours, vous savez qui s'en sert vraiment. Aucun contrat avant. » | Objection 17 : « dans deux mois, plus personne ne s'en servira » |
| 10 | Objet du mail d'invitation au petit-déjeuner | « Six dirigeants, un pilote d'un mois, et on publie ce qu'on apprend (avec votre accord). » | Objections 10 et 12 : « pas de référence », « personne autour de moi » |

**Ce qu'on n'écrit jamais** (risque de pratique commerciale trompeuse, Code de la consommation L121-2) :
- « installé en 15 minutes » : le panel n'y croit pas et rien ne le prouve encore ; on dit « une heure, avec vous » ;
- « conforme RGPD » comme label : on décrit ce qui est fourni (DPA, hébergement en UE, export et suppression) ;
- « ne se trompe jamais », « X heures gagnées » : pas de chiffre sans mesure réelle ;
- « places limitées » si ce n'est pas vrai : la limite des 20 sociétés et des 6 pilotes de janvier doit être réelle ;
- un nom de concurrent dans une pub, sauf comparaison vérifiable et datée ;
- un avis, un témoignage, un logo client ou un « vu dans » qui n'existe pas.

### 5. Le budget (proposition)

Aucun budget n'est fixé par les fondateurs. Voici une proposition basse, pour les 30 jours.

| poste | montant | remarque |
|---|---:|---|
| Sales Navigator, 2 licences, 1 mois | ≈ 200 € | Prix public à vérifier avant achat |
| 2 petits-déjeuners de dirigeants | ≈ 300 € | 150 € chacun, lieu et café |
| Test de pub LinkedIn (sur le meilleur post) | 0 ou 300 € | Seulement si la règle du 19/01 est remplie |
| Réserve (déplacements, imprévus) | ≈ 200 € | — |
| **Total argent** | **≈ 700 à 1 000 €** | |
| *Pour mémoire :* coût IA des pilotes | ≈ 50 € par pilote | Déjà compté par le CFO (150 € par mois) : pas compté deux fois |
| *Pour mémoire :* temps des fondateurs | ≈ 80 h sur le mois (estimation) | Non payé, mais c'est le vrai coût. À noter chaque semaine pour chiffrer le coût d'acquisition en temps. |

La page, le domaine et les contrats sont déjà dans les dépenses de départ de `numbers.json` (500 € et 2 500 €).

### 6. Le maximum à payer pour gagner un client

**Ce que vaut un client**, d'après la contribution du CFO (ce que chaque siège-mois laisse après son coût de service) :

Hypothèses à confirmer :
- **10 sièges payants par client** : la taille du pilote (une équipe, 10 personnes maximum). Le panel parle de 5 à 15 personnes pour commencer.
- **12 mois gardés** : aucune donnée de fidélité n'existe. C'est prudent pour un outil sans engagement, mais pas prouvé.
- **1 client = 1 achat** : le panel dit 1,0 achat par acheteur le premier mois.

| prix | contribution par siège-mois | × sièges | × mois | = valeur d'un client | maximum conseillé (un tiers) |
|---|---:|---:|---:|---:|---:|
| **19 €** (20 premières sociétés) | 13,55 € | 10 | 12 | **1 626 €** | **542 €** |
| 25 € (prix normal) | 19,55 € | 10 | 12 | 2 346 € | 782 € |

- **Le calcul** : 13,55 € × 10 sièges × 12 mois = 1 626 €. Au-delà de 1 626 € dépensés pour gagner ce client, on perd de l'argent sur lui.
- **Le maximum conseillé : 542 € par client payant** (1 626 € ÷ 3). On garde un tiers pour l'acquisition, et le reste paie les coûts fixes et absorbe les clients qui partent plus tôt. C'est une règle de prudence courante, pas une loi.
- **Ce montant inclut le coût des pilotes qui ne convertissent pas.** Si un pilote sur deux devient payant, chaque client coûte environ 100 € de service IA en pilotes (2 × 50 €). Il reste donc environ 440 € pour le reste (outils, événements, pub).
- **Si le client est plus petit et part plus tôt**, tout baisse vite : 13,55 € × 6 sièges × 6 mois = 487,80 €, soit un maximum conseillé d'environ 163 €. C'est pour ça qu'on mesure le nombre de sièges et la durée réelle dès les premiers clients.
- **Avec le budget proposé** : 1 000 € dépensés et 2 clients payants à la fin des pilotes, c'est 500 € par client, sous le maximum de 542 €. Avec 1 seul client, c'est 1 000 €, au-dessus : on change quelque chose.

Les pilotes lancés en janvier se terminent vers mi-février. Le coût réel par client payant se connaîtra donc **fin février**, pas à J+16.

### 7. Les trois chiffres à regarder chaque semaine

À noter chaque vendredi, dans un simple tableau partagé.

| chiffre | objectif | seuil qui veut dire « on change quelque chose » | quoi changer |
|---|---|---|---|
| **1. Taux de réponse aux messages personnels** (réponses ÷ messages envoyés) | ≥ 25 % | **< 10 %** après 40 messages | L'accroche, ou la liste : on écrit peut-être à des gens qui ne sont pas « noyés » |
| **2. Pilotes lancés** (et la part des rendez-vous qui deviennent des pilotes) | 1 à 2 pilotes par semaine ; ≥ 30 % des rendez-vous | **0 pilote deux semaines de suite**, ou **< 20 %** après 8 rendez-vous | L'offre ou la confiance : revoir ce que les dirigeants ont refusé, mot pour mot. Le panel annonce 45 % ; s'il y a un gros écart, le panel s'est trompé. |
| **3. Usage dans les pilotes** (part des utilisateurs du pilote qui posent au moins 2 questions dans la semaine) | ≥ 60 % | **< 40 %** en semaine 2 d'un pilote | L'installation et les recettes. C'est le signal avancé de « dans deux mois, plus personne ne s'en servira » et du passage au paiement. |

Ensuite, dès la fin des premiers pilotes (mi-février) : **le score au test des 10 questions** (plusieurs acheteurs ne paieront qu'à 8 sur 10 : P007, P015, P017, P018) et **le taux de pilotes qui deviennent payants**. Ce dernier est le chiffre qui manque le plus à tout le plan.

### Suite

`/founder-brand` (le nom « Leon » est à revoir, voir l'étude du 18/10), puis `/founder-launch`.

## Brand

19/10/2026 · Étape `founder-brand` du pack. Sources : `idea.md`, `marketing.md` (positionnement B retenu), `competitors.md`, `panel/results.md`, `offer.md`, `pitch.md`, et l'étude de marque du 18/10 (branche `david/etude-founder`, commit 9863a48, fichier `docs/etudes/founder-2026-10/brand.md`), écrite pour l'ancienne cible « équipes dev ».

**À lire avant tout :**
- **« Leon » n'est qu'un nom de travail.** L'étude du 18/10 l'a jugé non tenable : Leon AI, assistant open source français positionné « mémoire, agents », 17 000 étoiles GitHub, getleon.ai ; leon.com, .fr, .dev pris ; npm `leon` pris. « Marcel » est la plateforme IA interne de Publicis. On n'y revient pas.
- **Ce document n'est pas un avis juridique.** Toutes les vérifications sont des recherches publiques faites le 19/10/2026 : DNS et WHOIS, registre des entreprises françaises (API recherche-entreprises.api.gouv.fr), GitHub, npm, LinkedIn, YouTube, recherche web. **Je n'ai pas pu interroger les bases de marques** : data.inpi.fr renvoie 403 à un robot, et l'API de TMview n'a pas répondu. **Aucune marque n'a donc été vérifiée.**
- « Pas de serveur de noms » ou « WHOIS : introuvable » veut dire « probablement libre », **pas** « libre ». Seul un registrar (OVH, Gandi, Namecheap) le confirme, au moment de l'achat.
- Un nom n'est à vous que quand il est déposé à l'INPI ou à l'EUIPO, après avis d'un conseil en propriété industrielle.

### 1. Ce que le nom doit porter

Le brief, tiré de `marketing.md` et du panel :

1. **La promesse faite au client qu'on ne retrouve plus.** Les deux déclencheurs (le départ d'un chef de projet senior : 36 % d'achat ; le client qui conteste un périmètre) racontent la même perte. Les « noyés dans les outils » achètent pour « retrouver ce qui a été dit et décidé », « qui a promis quoi » (P011, P012, P015).
2. **La source, ou « je ne sais pas ».** C'est ce qui nous distingue des concurrents dont les plaintes n°2 et n°3 sont « ne trouve rien » et « réponses fausses ».
3. **Pas un mouchard.** Le refus n°1 est la confiance : 67 refus sur 82. P004 : « garder tout ce qui se dit en réunion, mes salariés et le CSE vont le prendre comme de la surveillance ». Le nom ne doit évoquer ni l'œil, ni l'oreille, ni l'espion, ni le « cerveau » de l'IA.
4. **Un dirigeant français doit le dire sans gêne à un client**, et un Européen doit pouvoir le lire. Court, sans accent dans le domaine, sans « AI » collé.

**À éviter** (`competitors.md`) : tout ce qui sonne comme Dropbox Dash, Glean, Dust, Sentra, GoSearch, Onyx, Slite, Qontext, Guru, Dashworks, Mio, Rovo, Granola, Fireflies ; les mots « memory / mémo / mem », « search », « knowledge », « context » ; les noms en « -ai », « -ly », « -gram ».

### 2. Dix candidats

Légende des vérifications du 19/10 : « pris » = le domaine a des serveurs de noms ou un site ; « introuvable » = le WHOIS dit « not found » (signal de disponibilité, à confirmer chez un registrar).

#### 2.1 Acquis (mot français, sérieux)

- **Dit :** « c'est acquis » = ce qui a été convenu avec le client et sur quoi on ne revient pas. Ce qu'un nouveau chef de projet hérite de l'ancien.
- **À l'oral :** « a-ki » en français, sans hésitation. En anglais, « a-KEE » pour qui connaît l'« acquis communautaire », « ACK-wiss » pour les autres.
- **Sur une enseigne, une icône :** six lettres, aucun jambage gênant ; un « a » minuscule tient en 32 px.
- **Risque : moyen.** Acquis Consulting Group (États-Unis) a lancé en septembre 2026 « AcquisLink », une plateforme d'intégration « AI-native » ([PR Newswire](https://www.prnewswire.com/news-releases/acquis-launches-acquislink-the-first-ai-native-system-integration-platform-302873199.html)) : même classe 42 probable. acquis.io redirige chez eux. Prononciation anglaise à expliquer une fois.

#### 2.2 Témoin, écrit « temoin » dans les adresses (mot français, évocateur)

- **Dit :** deux sens qui collent aux deux déclencheurs. Le **passage de témoin** quand quelqu'un part ; le **témoin** qui dit ce qui a été dit, preuve à l'appui.
- **À l'oral :** « té-mouin », naturel en français. En anglais, aucun sens, « tay-mwan » à apprendre.
- **Sur une icône :** le bâton de relais est un symbole clair en 32 px.
- **Risque : moyen à élevé.** (1) L'accent : la marque s'écrit « Témoin », l'adresse « temoin », deux graphies. (2) **Le sens « témoin » peut se lire « quelqu'un qui regarde »**, exactement la peur du CSE. (3) Une SAS « LE TEMOIN » (code 62.01Z, programmation informatique, Paris 18e, créée en 2020) existe au registre ; activité réelle inconnue. temoin.com et temoin.app pris ; temoin.fr est un site parqué « en vente ».

#### 2.3 Pourquoi (descriptif)

- **Dit :** la question à laquelle l'outil répond. Retenu le 18/10 pour la cible dev (« pourquoi a-t-on choisi Postgres ? »).
- **À l'oral :** évident en français, connu en anglais.
- **Sur une icône :** un « ? », générique.
- **Risque : moyen.** Mot courant, protection étroite. Surtout, **la question du dirigeant n'est plus « pourquoi » mais « qu'a-t-on promis ? »**. Le nom dit moins bien la nouvelle cible. Plus de 1 200 entités « Pourquoi… » au registre (surtout « Pourquoi pas »), une page LinkedIn « POURQUOI ? » de coaching.

#### 2.4 Parce (inventé à partir d'un mot)

- **Dit :** « parce que », le début de toute justification ; « parse » en anglais.
- **À l'oral :** « parss », même son dans les deux langues.
- **Risque : élevé.** PARCE Mobile, appli de gestion de tâches et de collaboration d'équipe ([App Store](https://apps.apple.com/us/app/parce-mobile/id6747766143), [parce.co](https://parce.co/parce-mobile-app/)) : même univers, risque de confusion en classes 9 et 42. parce.com, .fr, .ai, .io, .eu tous pris ; npm et GitHub pris. **Je le retire de la liste courte.**

#### 2.5 Promis (descriptif)

- **Dit :** le cœur du positionnement, en un mot.
- **À l'oral :** « pro-mi » ; en anglais, ressemble à « promise » mal écrit.
- **Risque : élevé.** Trop descriptif pour être protégé fortement ; promis.com, .fr, .ai, .io, .eu tous pris ; page LinkedIn « PROMIS » existante ; PrOMIS, logiciel de gestion de production. Bon mot pour les textes (« ce qui a été promis »), pas pour la marque.

#### 2.6 Minute (descriptif, double sens)

- **Dit :** la minute d'un acte notarié (l'original conservé) et les « minutes » d'une réunion.
- **Risque : rédhibitoire.** *Minute* est aussi le nom d'un hebdomadaire d'extrême droite historique en France. Le champ « Minutes AI » est saturé d'applis de compte rendu de réunion (Minutes AI, Minutes.AI…). minute.com, .fr, .io pris.

#### 2.7 Parole (évocateur)

- **Dit :** « parole donnée », la promesse tenue.
- **Risque : rédhibitoire hors de France.** En anglais, *parole* = la liberté conditionnelle d'un détenu. Proche de Parloa (agents vocaux, Berlin, valorisé 3 Md$). Tous les domaines pris.

#### 2.8 Kiadi (inventé, de « qui a dit »)

- **Dit :** « qui a dit ? », la question du client qui conteste.
- **À l'oral :** « ki-a-di », facile partout.
- **Risque : rédhibitoire.** **« Kiadi » veut dire « tristesse, chagrin » en kikongo**, langue parlée en RDC et au Congo, dans la francophonie. kiadi.ai et kiadi.io introuvables au WHOIS, mais le sens suffit à l'écarter. Bon exemple de pourquoi un nom inventé se vérifie dans d'autres langues.

#### 2.9 Sperling (nom de fondateur)

- **Dit :** rien du produit ; le sérieux d'une maison qui signe de son nom.
- **Risque : élevé.** Un seul des deux fondateurs ; nom très porté (domaines .com, .fr, .ai, .io pris) ; un dirigeant ne le retiendra pas. Écarté.

#### 2.10 Lascaux (lieu)

- **Dit :** des murs qui gardent ce qui a été vécu, 17 000 ans plus tard.
- **Risque : rédhibitoire.** Une marque « Lascaux » est déposée à l'INPI (n° 4348635, mentionnée sur [lascaux.fr](https://lascaux.fr/fr/mentions-legales/)) ; le nom appartient de fait à un site public. Tous les domaines pris. Écarté.

**Écartés avant la liste**, pour mémoire : *Leon*, *Marcel* (voir plus haut), *Greffe* (Infogreffe), *Motif* (marque de The Open Group), *Cairn* (Cairn.info, Cairn Software), *Verbatim* (marque de supports de stockage), *Relais* (Relais Colis, Relais & Châteaux).

### 3. La liste courte : Acquis, Témoin, Pourquoi

#### Les vérifications faites le 19/10

| | **Acquis** | **Témoin** (temoin) | **Pourquoi** |
|---|---|---|---|
| Ce qu'il dit au dirigeant | ce qui a été convenu avec le client | le passage de témoin ; la preuve | la question qu'on pose |
| .com | pris (hébergé chez siteprotect) | pris (Porkbun, pas de site) | pris |
| .fr | pris (OVH, aucun site) | pris, site parqué « en vente » | pris (OVH) |
| .ai | pris, parqué à la vente chez Afternic | **introuvable au WHOIS** | parqué « domain for sale » |
| .io | pris : redirige vers Acquis Consulting | pris (Cloudflare) | **introuvable au WHOIS** |
| .eu | pris | pas de serveur de noms (WHOIS .eu non concluant) | pris, parqué chez Sedo |
| Alternatives sans serveur de noms | getacquis.com et acquishq.com (WHOIS : « no match ») ; acquis.so, .team | temoin.co (WHOIS : « not found »), gettemoin.com, temoinhq.com (« no match ») ; temoin.so, .team | getpourquoi.com ; pourquoi.team |
| Registre des entreprises (FR) | « ACQUIS » à Valence, formation continue (85.59A) ; rien d'actif en informatique | **SAS « LE TEMOIN », 62.01Z (programmation), Paris, 2020** ; « CELEC (victime ou témoin) », 62.01Z | > 1 200 résultats, surtout « Pourquoi pas » (restauration, commerce) |
| Homonyme en logiciel / IA | **Acquis Consulting, AcquisLink** (intégration « AI-native », US, sept. 2026) | aucun trouvé en recherche web | aucun trouvé en recherche web |
| LinkedIn `/company/` | libre (404) | pris : page « Temoin », 2 abonnés, contenu culturel | pris : « POURQUOI ? », coaching, 67 abonnés |
| GitHub / npm | libre / libre | GitHub pris (utilisateur, 1 dépôt) / npm libre | GitHub pris / npm libre |
| YouTube `@` | pris (chaîne personnelle, 3 abonnés) | pris (chaîne personnelle) | libre (404) |
| Instagram, TikTok, X | **non vérifiables** : ces sites renvoient une page de connexion à un robot | idem | idem |
| Proche d'un concurrent de `competitors.md` | non | non | non |

#### Ce qu'il reste à faire (par les fondateurs, dans cet ordre)

1. **Marques, France** : [data.inpi.fr](https://data.inpi.fr/) → onglet Marques → le mot exact, puis les variantes (« aquis », « akis » ; « temoins », « témoins » ; « pour quoi »). Lien direct : [data.inpi.fr/search?q=acquis&type=brands](https://data.inpi.fr/search?q=acquis&type=brands) (remplacer le mot).
2. **Marques, UE et pays membres d'un coup** : [TMview](https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=acquis) et [EUIPO eSearch](https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/acquis). Pour l'international : [WIPO Global Brand Database](https://branddb.wipo.int/). Pour plus tard en anglais : [USPTO](https://tmsearch.uspto.gov/), [UKIPO](https://trademarks.ipo.gov.uk/ipo-tmtext).
3. **Les classes à regarder** (classification de Nice) :
   - **9** : logiciels téléchargeables, applications ;
   - **35** : gestion et compilation de données, services aux entreprises ;
   - **38** : messagerie, transmission de données ;
   - **42** : SaaS, hébergement, conception de logiciels, IA.
4. **Pour Acquis** : montrer AcquisLink au conseil. Question précise : un dépôt « Acquis » en classes 9 et 42 dans l'UE est-il exposé à une opposition d'Acquis Consulting s'ils ont une marque dans l'UE ?
5. **Pour Témoin** : demander au conseil si la SAS « LE TEMOIN » (SIREN 889562690) a une marque ou une activité réelle. Et **tester le mot sur cinq dirigeants « noyés »** : y entendent-ils « passage de témoin » ou « quelqu'un qui écoute » ? Si deux sur cinq entendent la surveillance, on l'écarte.
6. **Domaines** : acheter chez un registrar le jour du choix, **avant d'en parler publiquement**. Ne pas acheter les domaines « à vendre » sans connaître le prix (Afternic, Sedo peuvent demander plusieurs milliers d'euros).
7. **Comptes** : créer à la main la page LinkedIn (le canal principal), puis X, YouTube, Instagram, avec le même identifiant.
8. **Dépôt** : INPI (France) puis EUIPO (Union européenne), par le conseil. Rien n'est à vous avant.

#### Recommandation

**Acquis en premier**, à condition que le conseil lève le risque AcquisLink. C'est le seul des trois qui dit la promesse au client (« c'est acquis ») sans aucune connotation de surveillance, qui sonne sérieux pour un dirigeant, et dont les comptes clés (LinkedIn, GitHub, npm) étaient libres le 19/10. Domaine probable : un .com composé (getacquis.com ou acquishq.com) plus acquis.so ou .team, ou le rachat d'acquis.ai si le prix est raisonnable.

**Témoin en second.** Le plus beau pour l'histoire du départ (« passage de témoin »), temoin.ai probablement libre. Mais l'accent, l'anglais et le risque « surveillance » sont réels : il doit passer le test des cinq dirigeants.

**Pourquoi en troisième**, en secours : rien de bloquant trouvé, mais faible comme marque et moins juste pour la nouvelle cible.

Usage du nom : **« Acquis, la mémoire de votre entreprise »**. Jamais « Acquis AI », jamais « Acquis IA ».

### 4. La promesse, les taglines, la voix

#### La promesse (ce que le client peut attendre à chaque fois)

> **Ce qui a été dit et promis à vos clients, retrouvé avec sa source. Et quand on ne sait pas, on vous le dit.**

#### Trois taglines

1. **« La source, ou rien. »** (la plus courte ; porte la différence)
2. **« Quand quelqu'un part, ce qu'il a promis reste. »** (le déclencheur le plus fort ; marche avec tous les noms, et très bien avec Témoin)
3. **« Ce qui a été dit reste dit. »** (le client qui conteste ; marche très bien avec Acquis)

Ce qu'on n'écrit pas dans une tagline : « en 15 minutes », « conforme RGPD », « ne se trompe jamais », un nom de concurrent (règles de `marketing.md`).

#### La voix en trois adjectifs

| adjectif | on fait | on ne fait pas |
|---|---|---|
| **Précis** | Un exemple réel, une date, un chiffre mesuré. « Le mail de Julie du 3 mars, 14 h 12. » | « Retrouvez toutes vos infos en un clin d'œil. » Pas de « révolutionnaire », pas de « grâce à l'IA ». |
| **Franc** | On dit ce qu'on ne fait pas. « Nous sommes deux. » « Slack est interrogé en direct, pas stocké. » « Ici, on ne savait pas. » | Promettre ce qu'on n'a pas mesuré. Cacher une limite dans une note de bas de page. |
| **Posé** | Le ton d'un associé qui a de l'expérience : phrases courtes, vouvoiement, calme. | L'urgence (« Ne ratez pas… »), les points d'exclamation, les émojis, la peur (« Vos données fuient ! »). |

#### Avant / après (une ligne de `pitch.md`)

**Avant :**
> Leon, la mémoire de votre entreprise. Il garde ce qui se dit et se décide dans vos outils (Gmail, Drive, Meet, Notion, Jira ou Linear, Zoom, GitHub, HubSpot ou Pipedrive ; Slack est interrogé en direct, car Slack interdit qu'on stocke ses messages) et répond à vos questions en citant la source exacte (le mail, la minute de réunion, le ticket), ou dit « je ne sais pas ».

**Après :**
> Un client vous dit : « Ce n'était pas dans le périmètre. » Posez la question à Acquis. Vous avez la réponse, et le mail ou la réunion d'où elle vient. S'il n'y a rien, il vous le dit.

Pourquoi : on part de la situation du dirigeant, pas de la liste des connecteurs (elle va plus bas sur la page) ; une phrase, une idée ; « je ne sais pas » devient une promesse et pas une excuse.

### 5. Le look (brief)

#### Les couleurs

Idée : **le papier, l'encre, et le surligneur**. Un document qu'on cite, pas un écran de science-fiction. Pas de dégradé violet ni de bleu « tech » (le code couleur de la plupart des outils d'IA). **Avant de figer, comparer côte à côte avec les pages d'accueil de Dust, Slite, Sentra, Glean, Dropbox Dash et Granola** pour vérifier qu'on ne ressemble à aucun.

| nom | hex | son rôle |
|---|---|---|
| Encre | `#1C2430` | Texte, logo, fond du mode sombre |
| Papier | `#F7F4EE` | Fond des pages, des rapports, des mails |
| Vert registre | `#1F6F5C` | Boutons, liens, l'accent de la marque |
| Surligneur | `#F2D06B` | **Uniquement** pour marquer le passage cité dans une source. Jamais pour du texte. |
| Gris note | `#5B6472` | Texte secondaire (dates, auteurs des sources) |

**Contraste (WCAG 2.1, calculé le 19/10 avec la formule de luminance relative)** : AA demande 4,5:1 pour le texte normal, 3:1 pour le grand texte (24 px, ou 19 px en gras).

| texte sur fond | rapport | AA texte normal |
|---|---:|---|
| Encre sur Papier | 14,23:1 | oui (AAA aussi) |
| Encre sur blanc | 15,62:1 | oui |
| Vert registre sur Papier (liens) | 5,49:1 | oui |
| Blanc sur Vert registre (boutons) | 6,02:1 | oui |
| Gris note sur Papier | 5,45:1 | oui |
| Encre sur Surligneur (passage cité) | 10,42:1 | oui |
| Papier sur Encre (mode sombre) | 14,23:1 | oui |
| Vert clair `#5FC2A6` sur Encre (liens en mode sombre) | 7,26:1 | oui |
| **Vert registre sur Surligneur** | **4,02:1** | **non** : ne jamais mettre un lien dans un passage surligné |

#### Les polices (gratuites, licence SIL Open Font License)

- **Titres : Fraunces**, un serif chaleureux qui évoque le document imprimé. [fonts.google.com/specimen/Fraunces](https://fonts.google.com/specimen/Fraunces)
- **Texte et interface : IBM Plex Sans**, très lisible en petit, accents français complets. [fonts.google.com/specimen/IBM+Plex+Sans](https://fonts.google.com/specimen/IBM+Plex+Sans)

Les deux s'utilisent librement, y compris dans le logo, l'application et les PDF. Garder une copie du fichier de licence (OFL.txt) dans le dépôt de la marque.

#### Le logo

- **Ce qu'il doit dire :** « on cite ». Piste principale : le **mot en minuscules en Fraunces**, précédé d'un **guillemet français «** dans le Vert registre. Le guillemet, c'est la citation : exactement la promesse. Pour Témoin, piste alternative : un bâton de relais réduit à un trait.
- **Où il doit marcher :**
  - **icône d'application et favicon, 32 × 32 px** (et 16 px) : seul le symbole (« ou « a » + «), sans le mot, sur fond Encre ou Papier ; vérifier qu'il se lit à 16 px ;
  - **signature de mail** : le logo en PNG à 2× (affiché à environ 24 px de haut), avec le nom écrit en texte à côté, car beaucoup de messageries bloquent les images ; il doit rester lisible en noir et blanc ;
  - en-tête du rapport d'audit (PDF A4), page LinkedIn (300 × 300 px), une diapo de petit-déjeuner.
- **Ce qu'on évite :** le cerveau, l'œil, l'oreille, la loupe, le cadenas, la bulle de discussion, l'éléphant (cliché de la mémoire), les étincelles ✦ des outils d'IA, tout ce qui rappelle un concurrent.
- **Une version monochrome** (Encre seule) doit exister dès le départ.
- Je peux générer des pistes avec un outil d'image si vous le souhaitez ; ce seront des **pistes**, pas un logo fini : un graphiste le dessine et vous cède les droits par écrit.

### 6. Les cinq premiers contacts

Les textes sont écrits avec « Acquis » ; remplacer par le nom retenu. Les chiffres entre crochets sont à remplir avec des **mesures réelles** uniquement.

#### 1. La page d'accueil (le haut de page)

> **Titre :** Ce qui a été promis à vos clients, retrouvé avec sa source.
>
> **Sous-titre :** Acquis garde ce qui se dit et se décide dans vos mails, vos réunions et vos outils. Vous posez une question, il répond en citant le mail ou la réunion. S'il ne sait pas, il le dit.
>
> **Bouton principal :** Réserver un pilote de 30 jours
> **Lien secondaire :** Lire le dossier confiance
>
> **Ligne sous le bouton :** Gratuit, une équipe de 10 personnes maximum. Hébergé en Europe. Paie et finance exclues par défaut.

Sous le pli : la question de démonstration avec sa source surlignée, puis « Nous sommes deux. Voici qui peut voir vos données » (accroche 4).

#### 2. Le mail de confirmation du pilote

> **Objet :** Votre pilote Acquis : ce qui se passe maintenant
>
> Bonjour [Prénom],
>
> Votre pilote est réservé. Voici les trois étapes, rien de plus :
>
> 1. **Avant de brancher quoi que ce soit**, nous vous envoyons l'audit de vos partages : les documents sensibles (paie, marges, contrats) visibles par trop de monde. Vous corrigez ou vous excluez.
> 2. **[Date, heure] : l'installation, en visio, une heure, avec vous.** Pas besoin d'informaticien.
> 3. **Votre équipe écrit 10 questions dont elle connaît la réponse.** À la fin des 30 jours, vous voyez le score, réponse par réponse, avec les sources.
>
> Vous ne payez que si vous décidez de continuer. Le dossier confiance (DPA, sous-traitants, note pour les salariés) est en pièce jointe, pour votre DPO ou votre CSE.
>
> Une question ? Répondez à ce mail, c'est moi qui lis.
>
> [Prénom], cofondateur

#### 3. La couverture du rapport d'audit des partages

> Fond Papier, logo en haut à gauche, rien d'autre que :
>
> **Audit des partages**
> [Nom de la société] · Google Workspace · [date]
>
> **[N] documents sensibles visibles par plus de monde que prévu.**
> Rien n'a encore été branché. Ce rapport ne quitte pas votre société sans votre accord.
>
> *Préparé par Acquis pour [Prénom Nom], [fonction]. Confidentiel.*

Le chiffre en gros est le seul élément coloré (Encre sur Surligneur). Pas de graphique en couverture.

#### 4. Le premier post LinkedIn (Post 1 du calendrier, J-8, profil personnel de David)

> On a posé 10 questions à notre propre mémoire d'entreprise, sur nos propres outils.
>
> Des questions dont on connaissait la réponse. « Qu'a-t-on promis à [client] en réunion le [date] ? » « Qui a validé le tarif de [projet] ? »
>
> Résultat : [X] bonnes réponses sur 10, avec la source.
> [Y] fois, il a répondu « je ne sais pas ». Il avait raison [Z] fois.
> [W] réponse(s) fausse(s). Voici laquelle, et ce qu'on a corrigé : [une phrase].
>
> On publie le score parce que c'est le test qu'on proposera à nos premiers pilotes en janvier. Vous écrivez vos 10 questions, vous voyez le score avant de payer.
>
> Si vous dirigez une société de 10 à 80 personnes et que vous avez déjà cherché « qui a promis quoi » dans trois outils, je suis curieux de votre méthode.

Règles : score réel seulement, aucun client nommé sans accord écrit, aucun concurrent nommé, pas d'émoji.

#### 5. La réponse à la première plainte sur une mauvaise réponse

> **Objet :** Re : réponse fausse sur le dossier [X]
>
> Bonjour [Prénom],
>
> Vous avez raison : la réponse était fausse. Merci de nous l'avoir dit.
>
> **Ce qui s'est passé :** Acquis a cité [la source], qui datait du [date]. La décision a changé le [date] dans [la réunion / le mail] : [il ne l'avait pas / il ne l'a pas trouvée / il l'a mal lue].
>
> **Ce que nous avons fait :** [la correction précise]. Nous avons reposé votre question : la réponse est maintenant [réponse], avec [la bonne source].
>
> **Ce que nous changeons pour tout le monde :** [la règle ajoutée, par exemple : quand deux sources se contredisent, Acquis montre les deux avec leur date au lieu de choisir].
>
> Cette question compte dans votre test des 10 questions, comme ratée. Nous ne la retirons pas du score.
>
> Je vous appelle demain à [heure] si cela vous convient, pour regarder ensemble s'il y en a d'autres.
>
> [Prénom], cofondateur

Pourquoi ce ton : le refus n°1 est la confiance. On reconnaît, on montre la source, on dit ce qui change, et on ne maquille pas le score.

### Suite

1. Le conseil en propriété industrielle sur Acquis (AcquisLink) et Témoin (SAS « LE TEMOIN ») ; le test du mot « Témoin » sur cinq dirigeants.
2. Achat des domaines et création de la page LinkedIn le jour du choix.
3. `/founder-ops` puis `/founder-launch`.

## Operations

19/10/2026 · Sources internes : `idea.md`, `board.md`, `offer.md`, `pricing.md`, `numbers.json`, `cfo.md`, l'étude de coûts (`docs/etudes/couts-2026-10/`). Prix publics relevés le 19/10/2026, liens dans chaque tableau. Ce document n'est pas un conseil juridique : chaque règle citée doit être confirmée avec un avocat, l'expert-comptable ou l'autorité concernée.

> **Pour le CFO : `numbers.json` a changé. Il faut relancer l'outil.**
> - Expert-comptable : 150 → **99 € par mois** (prix public Dougs, formule « Sérénité » pour une SAS).
> - Ajout : signature électronique **23 € par mois** (Yousign Plus en annuel, source secondaire, à confirmer).
> - Immatriculation : 500 → **252 €** (minimum légal 2026 ; les statuts rédigés par un avocat ne sont pas inclus).
> - Stripe : montant inchangé (0,45 €), mais le libellé ajoute Stripe Billing (0,7 %) que l'estimation n'expliquait pas.
>
> Effet : coûts fixes 840 → **812 € par mois**, dépenses de départ 8 300 → **8 052 €**. Le seuil passe d'environ 62 à environ **60 sièges** (812 / 13,55). C'est à confirmer en relançant l'outil.

### 1. Le cycle de chaque jour

Leon n'a pas de boutique qui ouvre à 8 h. Le cycle tourne autour des pilotes et des clients. La dernière colonne dit si le client le voit.

| # | étape | quand | qui | le client voit ? |
|---|---|---|---|---|
| 1 | **Contrôle du matin** : tableau de bord (erreurs, files d'ingestion, coût LLM de la veille, alertes Supabase et Vercel) | 9 h, 15 min | fondateur d'astreinte | non |
| 2 | **Demandes entrantes** : nouvelles réservations de pilote, réponses aux prospects, prise de rendez-vous d'installation | 9 h 15, 30 min | fondateur « clients » | oui |
| 3 | **Installation d'un pilote** (SOP 1) : visio d'une heure, branchement des sources, exclusions, recettes réglées | sur rendez-vous | les deux fondateurs au début, un seul ensuite | oui |
| 4 | **Audit des partages** (SOP 2) : rapport sur les documents trop partagés, avant de brancher Drive | le jour de l'installation, avant l'ingestion | fondateur d'astreinte | oui (rapport remis) |
| 5 | **Ingestion** : suivi de l'import de l'historique, relance des erreurs, vérification que les exclusions sont respectées | en continu, contrôle à 12 h et 17 h | automatique, contrôlé par l'astreinte | oui (barre d'avancement) |
| 6 | **Test des 10 questions** (SOP 3) : relecture des réponses, score remis au client | J+2 à J+5 du pilote | fondateur « clients » | oui |
| 7 | **Support** : messages des utilisateurs, mauvaises réponses signalées (SOP 4) | réponse en moins de 4 h ouvrées | astreinte | oui |
| 8 | **Facturation** : fin de pilote, passage au payant, comptage des utilisateurs actifs, factures Stripe | le 1er du mois, et à chaque fin de pilote | fondateur « clients » | oui |
| 9 | **Surveillance** : erreurs, coût LLM par siège, disponibilité, alertes de sécurité | alertes en continu, revue à 17 h | astreinte | non |
| 10 | **Incidents** : panne, fuite de permission, réponse fausse grave (SOP 4) | dès l'alerte | astreinte, puis les deux | oui, si l'incident touche le client |
| 11 | **Demandes RGPD** : accès, suppression, export, fin de pilote (SOP 5) | sous 5 jours ouvrés (le délai légal du client est d'un mois) | astreinte | oui |
| 12 | **Clôture** : note du jour dans le journal d'exploitation (incidents, pilotes, chiffres) | 18 h, 10 min | astreinte | non |

#### Les cinq premières minutes du client (condition du conseil)

Le conseil demande qu'elles soient écrites et mesurées. Ce qu'on vise, à mesurer sur les premiers pilotes :

1. **Minute 0 à 15** : connexion Google Workspace et sources choisies, exclusions cochées (paie, finance, RH exclues par défaut).
2. **Pendant l'import** : Leon n'affiche pas un champ vide. Il montre ce qui est déjà indexé (« 1 240 mails sur 18 000, les 30 derniers jours sont prêts ») et propose 3 questions qui marchent sur les 30 derniers jours. On importe donc **du plus récent au plus ancien**.
3. **Première bonne réponse le jour même**, pendant la visio, sur une question posée par le client, avec la source citée.
4. **À mesurer à chaque pilote** : durée d'import des 30 derniers jours, durée d'import complet, délai jusqu'à la première bonne réponse. On les note dans le journal (SOP 6).

#### Où vit l'expérience principale (condition du conseil)

Pour le pilote : **l'application Leon d'abord.** C'est là qu'on contrôle la citation, le « je ne sais pas » et le score des 10 questions. L'accès par MCP (ChatGPT, Claude, Cursor) est proposé ensuite, comme option. C'est aussi la voie la moins chère (2,5 € par siège au lieu de 5 €, voir `cfo.md`). Mais rien ne garantit que le LLM du client affiche la citation : on le vérifie sur chaque pilote avec les mêmes 10 questions, posées dans les deux interfaces.

#### Le cas Slack (condition du conseil)

Depuis le 29 mai 2025 (le 30 juin 2025 pour les applications existantes), les conditions de l'API Slack interdisent à une application tierce de constituer des copies, des archives ou des index durables des données Slack. La distribution commerciale doit passer par la Slack Marketplace. Slack propose à la place une recherche en temps réel, sans stockage ([conditions de l'API](https://slack.com/terms-of-service/api), [changelog du 29/05/2025](https://docs.slack.dev/changelog/2025/05/29/tos-updates/), [Real-time Search API](https://docs.slack.dev/apis/web-api/real-time-search-api/)). Dans le produit et dans l'installation :

- l'écran des sources affiche deux colonnes : **« Leon garde »** (Gmail, Drive, réunions, tickets, CRM) et **« Leon va chercher à la volée »** (Slack) ;
- les réponses qui viennent de Slack portent la mention « trouvé en direct dans Slack, non conservé » ;
- l'application Slack doit être publiée sur la Marketplace avant toute vente. Le délai de revue est à prévoir dans le plan de lancement.

### 2. Les fournisseurs

Montants HT, relevés le 19/10/2026. Les prix en $ sont facturés en dollars.

| poste | fournisseur | prix public | conditions | source | alternatives |
|---|---|---|---|---|---|
| Base de données | **Supabase Pro** (Francfort, déjà en place) | 25 $ par mois, avec 10 $ de crédit de calcul ; instance Small 15 $, Medium 60 $, Large 110 $ ; sauvegardes quotidiennes gardées 7 jours ; restauration à la minute (PITR) 100 $ par mois pour 7 jours | sans engagement, carte | [supabase.com/pricing](https://supabase.com/pricing) | Scaleway, OVHcloud, AWS Paris (relevés dans `couts-2026-10/annexes/04-stockage-infra.md`) |
| Hébergement web | **Vercel Pro** | 20 $ par membre et par mois, 20 $ d'usage inclus. Le plan gratuit Hobby est réservé à un usage personnel non commercial : il faut le Pro pour vendre | sans engagement | [vercel.com/pricing](https://vercel.com/pricing) | Scaleway, Clever Cloud (prix à relever) |
| LLM | **Anthropic, API Claude** | Haiku 5.5 : 0,10 $ / 0,50 $ par million de jetons (entrée / sortie, jusqu'à 100 000 jetons de contexte) ; Sonnet 5.5 : 2 $ / 10 $ ; Opus 5.5 : 4 $ / 20 $ ; batch −50 % ; lecture en cache à 0,1 fois le prix d'entrée (0,05 fois sur Sonnet et Opus 5.5) | prépayé ou facture mensuelle | [pricing Claude](https://platform.claude.com/docs/en/about-claude/pricing) | **AWS Bedrock** en point de terminaison régional UE : **+10 %** sur le prix global, selon la même page ([tarifs Bedrock](https://aws.amazon.com/bedrock/pricing/)). C'est la voie si un client exige un traitement en UE, car l'API Anthropic directe ne propose qu'un routage global ou US. **Mistral** : la page publique cite Mistral Large à 0,5 $ / 1,5 $ ([mistral.ai/pricing](https://mistral.ai/pricing)) ; les autres modèles sont à relever |
| E-mails du produit | **Resend** | gratuit jusqu'à 3 000 mails par mois (100 par jour) ; Pro 20 $ pour 50 000 | sans engagement | [resend.com/pricing](https://resend.com/pricing) | Brevo, Postmark (prix à relever) |
| Paiement | **Stripe** | carte UE standard 1,5 % + 0,25 € ; carte UE premium 2,8 % + 0,25 € ; prélèvement SEPA 0,35 € ; **Stripe Billing 0,7 %** du volume ; Invoicing 0,4 % (2 $ max par facture) | sans abonnement ; virement sur le compte selon le calendrier Stripe | [stripe.com/fr/pricing](https://stripe.com/fr/pricing) | GoCardless pour le prélèvement SEPA (prix à relever). Pour les factures de 200 à 2 000 € par mois, le **prélèvement SEPA à 0,35 €** coûte bien moins que la carte : à proposer par défaut |
| Signature électronique | **Yousign** (renommé Youtrust en 2026) | Plus : 23 € par utilisateur et par mois en annuel, 30 € sans engagement ; Pro : 38 € / 48 € ; signature qualifiée en plus | annuel ou mensuel | source secondaire : [lelabotpe.fr](https://lelabotpe.fr/bureau-mobile/yousign-tarifs/) ; site officiel [yousign.com](https://www.yousign.com/fr-fr), page tarifs inaccessible le 19/10 | Docusign, signature intégrée à Pennylane (prix à relever) |
| Expert-comptable | **Dougs** | SAS : Liberté 79 € par mois, **Sérénité 99 €** (télédéclaration, AG annuelle, dépôt des comptes inclus), Exclusivité 129 € | abonnement mensuel | [dougs.fr/tarifs](https://www.dougs.fr/tarifs) | **Pennylane** logiciel : Basique 29 €, Essentiel 49 €, Premium avec module comptable 149 € par mois ([pennylane.com/fr/tarifs/medium](https://www.pennylane.com/fr/tarifs/medium)) ; un cabinet local, sur devis |
| Assurance RC pro et cyber | **Hiscox** | « à partir de » 21,60 € par mois pour le pack métiers de l'informatique, selon un comparateur ; le cyber est une option | **devis nécessaire** : un SaaS qui stocke des mails clients n'a pas le profil d'un freelance | source secondaire : [sidecare.com](https://www.sidecare.com/responsabilite-civile-professionnelle/hiscox-pack-100k-2022-2023-copie-4c518b4b-3b95-4ebc-a624-8b42631076bf) ; [hiscox.fr](https://www.hiscox.fr/) | Stello, AXA, un courtier spécialisé tech (devis) |
| Audit Google (CASA) | **TAC Security** (laboratoire mis en avant par Google) | niveau 2 : environ 540 $ par an, 720 $ avec rescans illimités, 1 800 $ « Enterprise » ; niveau 3 environ 4 500 $ | **renouvellement tous les 12 mois** | source secondaire : [switchlabs.dev](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option) ; cadre officiel : [App Defense Alliance](https://appdefensealliance.dev/casa) ; déjà compté dans les ~500 $ de coûts fixes de l'étude de coûts | autres laboratoires agréés de la liste ADA (plus chers, devis) |
| Audit de sécurité (pentest) | **Vaadata** | selon l'éditeur, 3 500 à 10 000 € pour une startup, « mini-pentest » d'un jour sous 1 500 € | devis | [blog Vaadata](https://www.vaadata.com/en/blog/pentest-for-less-than-1500/) ; [besoins d'une startup](https://www.vaadata.com/en/blog/what-security-needs-and-type-of-pentest-for-startup/) | Yogosha, cabinets locaux (devis). Les 4 000 € de `numbers.json` sont dans la fourchette |
| Avocat (CGV, DPA, confidentialité, note CSE) | avocat en droit du numérique ou des données | **devis nécessaire** ; 2 500 € + 800 € dans `numbers.json`, non vérifiés | forfait à négocier | la CNIL publie des [clauses types responsable / sous-traitant](https://www.cnil.fr/fr/clauses-contractuelles-types-entre-responsable-de-traitement-et-sous-traitant) qui réduisent le travail | legaltech (LegalPlace, Captain Contrat) pour les CGV seulement |

**Ce qui reste à faire chiffrer** (questions ouvertes) : l'assurance RC pro et cyber, l'avocat (contrats, statuts, pacte d'associés), le pentest, et le prix exact de Yousign sur le site officiel.

**À noter** : la mémoire du projet dit que la base Supabase n'a « pas de sauvegarde ». Le plan Pro annonce 7 jours de sauvegardes quotidiennes : il faut vérifier qu'elles sont actives et **tester une restauration** avant le premier pilote. La restauration à la minute coûte 100 $ par mois, à décider dès qu'il y a des clients payants (ce coût n'est pas dans `numbers.json`).

### 3. Les personnes

Deux fondateurs, aucun salarié, **aucune rémunération** (décision des fondateurs, pas de calcul de salaire). Les charges sociales des dirigeants non rémunérés d'une SAS, et le choix d'un éventuel statut ou d'aides (ACRE), sont à voir avec l'expert-comptable.

Deux rôles, qui tournent :
- **Astreinte** (une semaine sur deux) : surveillance, ingestion, support, incidents, demandes RGPD, audit des partages. Celui qui est d'astreinte a son téléphone allumé de 8 h à 20 h en semaine.
- **Clients** : prospection, installations, test des 10 questions, facturation, revue de la semaine.

La rotation est volontaire : les deux doivent savoir tout faire (voir le risque 7). Qui commence où reste à décider entre David et Amos.

#### Le premier mois, lent : environ 3 pilotes

Hypothèse de `numbers.json` : 3 pilotes par mois. Un pilote demande environ 6 heures de fondateur sur 30 jours : 1 h d'installation (à deux au début, donc 2 h), 1 h d'audit des partages, 1 h de revue des 10 questions, 4 points de 15 minutes, 45 min d'appel de conversion. Ces durées sont des estimations, à mesurer.

| | lundi | mardi | mercredi | jeudi | vendredi |
|---|---|---|---|---|---|
| **Astreinte** | contrôle 30 min ; produit le reste du jour | contrôle ; produit | contrôle ; audit des partages du pilote de la semaine (1 h) | contrôle ; produit | contrôle ; journal |
| **Clients** | prospection 3 h | installation pilote (1 h, à deux) ; prospection | relances, rendez-vous | revue des 10 questions (1 h) | **revue de la semaine à deux, 1 h** (SOP 6) |

Le temps opérationnel reste faible : **environ 5 h par semaine à deux**. Le reste va au produit (le test qui prouve que Leon bat Claude Team ou ChatGPT Business, demandé par le conseil) et à la vente.

#### Avec environ 25 clients (≈ 250 sièges, mois 12 du plan)

| tâche | hypothèse | heures par semaine |
|---|---|---|
| Support et mauvaises réponses | 20 min par client et par semaine (estimation) | 8 h |
| Surveillance, ingestion, incidents | | 4 h |
| Installations | 2 nouveaux clients par mois (le plan passe de 220 à 250 sièges) | 1 h |
| Pilotes en cours | 3 pilotes × 1,5 h | 4,5 h |
| Demandes RGPD, sécurité, CASA, sous-traitants | | 1,5 h |
| Facturation, comptabilité | | 1 h |
| Revue de la semaine | à deux | 2 h |
| **Total opérations** | | **environ 22 h par semaine**, soit un peu plus d'un demi-temps |

| | lundi | mardi | mercredi | jeudi | vendredi |
|---|---|---|---|---|---|
| **Astreinte** | contrôle, support (2 h) | support, ingestion (2 h) | audits, RGPD (2 h) | support (2 h) | support, journal (2 h) |
| **Clients** | prospection, relances (3 h) | installation ou pilote (2 h) | revues des 10 questions (2 h) | appels de conversion (2 h) | revue de la semaine à deux (1 h) ; facturation le 1er du mois |

Au-delà d'environ 50 clients, l'installation à la main n'est plus tenable (`offer.md` le note déjà). Il faudra une installation sans fondateur, ou une première embauche (support). Ce sera à chiffrer par le CFO, avec un salaire tiré d'une source publique.

### 4. Les routines (SOP)

Chaque SOP tient sur une page. Elle doit pouvoir être suivie par l'autre fondateur sans explication.

#### SOP 1 : installer un pilote (visio d'une heure)

**Avant la visio (J−2)**
1. Envoyer le dossier confiance : DPA à signer (Yousign), liste des sous-traitants (Supabase, Vercel, Anthropic ou Bedrock, Resend, Stripe), note d'information pour le CSE, politique de suppression.
2. Vérifier que le DPA est signé. **Pas de DPA signé, pas de branchement.**
3. Demander qui sera présent : le dirigeant, et l'administrateur Google Workspace (indispensable pour l'installation à l'échelle du domaine).
4. Demander à l'équipe pilote (10 personnes maximum) d'écrire ses 10 questions, avec les réponses attendues.

**Pendant la visio**
5. (5 min) Rappeler le déroulé et ce que Leon garde ou ne garde pas (Slack : recherche à la volée, rien n'est stocké).
6. (10 min) L'administrateur connecte Google Workspace. Leon lance d'abord l'**audit des partages** (SOP 2), sans rien ingérer.
7. (10 min) Parcourir le rapport d'audit ensemble. Valider les exclusions : paie, finance et RH exclues par défaut ; dossiers, boîtes et canaux en plus si le client le veut.
8. (5 min) Lancer l'ingestion, du plus récent au plus ancien. Montrer la barre d'avancement.
9. (15 min) Régler la recette de l'équipe (fiche client, « ce bug est-il connu ? »…).
10. (10 min) **Première question en direct** sur les 30 derniers jours. Noter le délai jusqu'à la première bonne réponse.
11. (5 min) Fixer la date de la revue des 10 questions (J+3 à J+5) et la date de l'appel de conversion (J+25).

**Après**
12. Noter dans le journal : durée d'import des 30 jours, durée totale, première bonne réponse, exclusions choisies.
13. Envoyer un récapitulatif écrit au dirigeant le jour même.

#### SOP 2 : l'audit des partages (avant tout branchement de Drive)

1. Lire seulement les **métadonnées de partage** de Drive (qui voit quoi), pas le contenu.
2. Lister les documents partagés avec « toute l'organisation », « toute personne disposant du lien » ou un groupe de plus de 20 personnes.
3. Les classer : **rouge** (paie, salaires, contrats de travail, arrêts maladie, marges, banque, mots de passe : détection par titre, dossier et type) ; **orange** (finance, RH, juridique) ; **gris** (le reste).
4. Exclure par défaut tout le rouge et l'orange de l'ingestion.
5. Remettre au dirigeant un rapport d'une page : nombre de documents par couleur, les 20 plus exposés, et la règle « Leon applique les droits de Drive : si un document est trop partagé dans Drive, il l'est déjà aujourd'hui ».
6. Le dirigeant choisit : corriger les partages dans Drive, ou garder l'exclusion dans Leon. Sa réponse est notée.
7. Ne rien ingérer de Drive avant cette réponse.

#### SOP 3 : la revue du test des 10 questions

1. Vérifier que les 10 questions viennent de l'équipe et que les réponses attendues sont écrites **avant** le test.
2. Poser chaque question dans l'application Leon, puis dans le LLM du client par MCP si l'option est prise.
3. Pour chaque réponse, noter : **juste** (bonne réponse, bonne source citée), **partielle**, **« je ne sais pas »** (acceptable si l'info n'est pas dans les sources branchées), ou **fausse**.
4. Une réponse fausse affirmée avec assurance compte double dans le compte rendu : c'est l'objection n°5 des acheteurs.
5. Chercher la cause de chaque échec : source pas encore importée, document exclu, mauvaise recherche, mauvaise citation. Corriger ce qui peut l'être sans tricher (pas de réglage spécial pour une question).
6. Remettre le score au client, réponse par réponse, avec les causes. Repère du panel : plusieurs acheteurs ne paient qu'à **8 sur 10 ou plus**.
7. Noter le score dans le journal, avec le score par MCP s'il a été mesuré.

#### SOP 4 : une mauvaise réponse ou un incident de permission

**Mauvaise réponse (pas de fuite)**
1. Accuser réception dans les 4 heures ouvrées.
2. Retrouver la question dans le journal des questions : sources consultées, citation, modèle utilisé.
3. Classer la cause (source manquante, recherche, raisonnement du modèle, citation fausse) et corriger.
4. Répondre au client avec la cause et la correction. L'ajouter aux tests de non-régression.

**Incident de permission** (quelqu'un a vu, dans une réponse ou une citation, un contenu qu'il ne pouvait pas voir à la source)
1. **Couper tout de suite** : suspendre les réponses pour ce client (ou la source en cause). Ne rien supprimer : garder les journaux.
2. Prévenir l'autre fondateur. Les deux traitent l'incident jusqu'à sa fin.
3. Établir les faits : quelle question, quel utilisateur, quel document, quel droit à la source, depuis quand.
4. **Prévenir le client par écrit sans délai** et au plus tard dans les 24 heures. En tant que sous-traitant, Leon doit notifier le responsable de traitement « dans les meilleurs délais » après en avoir pris connaissance (RGPD, article 33.2). C'est au client de juger s'il doit notifier la CNIL dans les 72 heures ([CNIL : notifier une violation](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)). Lui fournir les faits de l'étape 3.
5. Corriger la cause, et tester sur tous les clients, pas seulement celui-ci.
6. Rétablir le service avec l'accord écrit du client.
7. Tenir le registre des violations (obligatoire même si rien n'est notifié), et prévenir l'assureur si le contrat le demande.

#### SOP 5 : une demande de suppression RGPD

Leon est **sous-traitant** : le client (l'employeur) est responsable du traitement. Les demandes des salariés s'adressent au client. Leon l'aide à y répondre (RGPD, article 28.3) ([CNIL : droits des personnes](https://www.cnil.fr/fr/respecter-les-droits-des-personnes)).

1. Si la demande arrive directement d'un salarié : ne pas y répondre sur le fond, la transmettre au client dans les 2 jours ouvrés et le dire au demandeur.
2. Obtenir l'instruction écrite du client : qui, quelles sources, quelle période.
3. Supprimer les données brutes, les morceaux indexés, les vecteurs et tout ce qui en est dérivé (étiquettes, fiches, journal des questions de cette personne si le client le demande).
4. Exclure la personne ou la source de l'ingestion future, pour qu'elle ne revienne pas à la prochaine synchronisation.
5. Vérifier par une recherche que plus rien ne sort.
6. Confirmer au client par écrit, avec la date. Préciser que les sauvegardes s'effacent à leur expiration (7 jours sur Supabase Pro), comme l'annonce le DPA.
7. Délai interne : **5 jours ouvrés**. Le client a un mois pour répondre à la personne (RGPD, article 12).

**Fin de pilote sans conversion, ou fin de contrat** : même routine, pour tout le compte, sous 30 jours comme promis dans l'offre. Export proposé avant.

#### SOP 6 : la revue de la semaine (vendredi, 1 h, à deux)

1. **Pilotes** : en cours, scores des 10 questions, dates de conversion, ce qui bloque (DPO, CSE, avocat du client).
2. **Clients** : utilisateurs actifs par client (ils font la facture), questions posées par utilisateur, clients qui baissent.
3. **Qualité** : mauvaises réponses signalées et leurs causes, « je ne sais pas », incidents.
4. **Les cinq premières minutes** : durées d'import et délai jusqu'à la première bonne réponse des pilotes de la semaine.
5. **Coût de service par siège** (la ligne à surveiller selon le CFO) : facture LLM et hébergement de la semaine, divisée par les sièges actifs. Alerte au-dessus de 5 € par siège-mois.
6. **Sécurité et conformité** : demandes RGPD ouvertes, échéance CASA, changements chez les sous-traitants, changements des conditions Slack ou Google.
7. **Registre des risques** : relire les 10 risques, mettre à jour.
8. **Décisions** : écrire 3 décisions maximum et qui les porte. Changer de fondateur d'astreinte.

### 5. Les outils

La plus petite pile qui fait tourner l'affaire. La pile produit (Supabase, Vercel, LLM) est dans la partie 2.

| besoin | outil | prix public | pourquoi |
|---|---|---|---|
| Abonnements et paiements | Stripe Billing, prélèvement SEPA par défaut | 0,7 % + 0,35 € par prélèvement | gère la facture à l'utilisateur actif (usage mesuré) ; le SEPA coûte moins que la carte pour des factures B2B |
| Factures et comptabilité | Dougs (Sérénité) | 99 € par mois | bilan, TVA, dépôt des comptes ; la facture électronique entre entreprises devient obligatoire ([impots.gouv](https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique)) : vérifier avec le comptable que Stripe et Dougs suffisent |
| Contrats | Yousign Plus | 23 € par mois (à confirmer) | DPA et bons de commande signés en ligne |
| E-mails produit | Resend (gratuit au départ) | 0 €, puis 20 $ par mois | invitations, alertes, rapport de la semaine |
| Prise de rendez-vous | à choisir (Google Agenda, inclus dans Workspace, suffit au départ) | 0 € | installations et revues |
| Journal d'exploitation et registre | un document partagé dans le repo (`docs/`) | 0 € | journal des incidents, registre des traitements, registre des violations |
| Surveillance | les alertes de Supabase et Vercel, plus une alerte de budget sur la console Anthropic | inclus | erreurs, coût LLM |

### 6. Licences, obligations et conformité (France et UE)

**Ce n'est pas un conseil juridique.** Les règles changent et dépendent de chaque situation. Chaque point doit être confirmé avec un avocat, l'expert-comptable ou l'autorité concernée.

#### La société

- [ ] **Immatriculer la SAS** au guichet unique de l'INPI ([procedures.inpi.fr](https://procedures.inpi.fr/)). Coût minimum 2026 : environ 252 € (33,83 € d'immatriculation, 199 € HT d'annonce légale, 19,33 € pour les bénéficiaires effectifs, selon [LegalPlace](https://www.legalplace.fr/guides/cout-creation-sas/)). À faire **avant de signer le premier DPA** : un contrat de sous-traitance se signe entre deux sociétés.
- [ ] Statuts et pacte d'associés entre David et Amos (avocat, sur devis).
- [ ] Compte bancaire professionnel, numéro de TVA intracommunautaire (délivré à l'immatriculation).
- [ ] Facture électronique : se mettre en conformité avec le calendrier de la réforme ([impots.gouv](https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique)).
- [ ] Mentions légales, CGV, politique de confidentialité, gestion des cookies sur le site ([Service Public Entreprendre](https://entreprendre.service-public.fr/vosdroits/F31228)).
- [ ] Assurance RC pro et cyber (devis).

#### RGPD : Leon comme sous-traitant de ses clients

- [ ] **DPA conforme à l'article 28** du RGPD avec chaque client ([texte, chapitre IV](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4) ; [clauses types de la CNIL](https://www.cnil.fr/fr/clauses-contractuelles-types-entre-responsable-de-traitement-et-sous-traitant) ; [guide du sous-traitant](https://www.cnil.fr/sites/cnil/files/atoms/files/rgpd-guide_sous-traitant-cnil.pdf)).
- [ ] **Registre des activités de traitement** : celui de Leon comme sous-traitant (catégories de traitements faits pour les clients), et celui de Leon comme responsable (ses propres prospects et clients) ([CNIL : le registre](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)).
- [ ] **Liste des sous-traitants ultérieurs** (Supabase, Vercel, Anthropic ou AWS, Resend, Stripe) avec leurs propres DPA ([Supabase DPA](https://supabase.com/legal/dpa), [conditions commerciales Anthropic](https://www.anthropic.com/legal/commercial-terms)), et un préavis au client avant tout changement.
- [ ] **Transferts hors UE** : Vercel, Anthropic (routage global) et Stripe sont des sociétés américaines. Documenter le mécanisme de transfert et, si besoin, une analyse d'impact des transferts ([CNIL : transférer hors de l'UE](https://www.cnil.fr/fr/transferer-des-donnees-hors-de-lue)). Bedrock en région UE est la réponse pour les clients qui l'exigent.
- [ ] **Registre des violations** et procédure de notification au client (SOP 4).

#### RGPD et droit du travail : ce que le client doit faire, et que Leon l'aide à faire

- [ ] **AIPD** : la liste de la CNIL rend l'analyse d'impact obligatoire pour les traitements qui ont pour finalité de « surveiller de manière constante l'activité des employés » ([liste CNIL](https://www.cnil.fr/sites/default/files/atoms/files/liste-traitements-aipd-requise.pdf) ; [CNIL : l'AIPD](https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd)). Leon n'a pas cette finalité, mais il conserve les mails et les réunions de tous les salariés. Le dossier confiance fournit donc une **AIPD type** que le client adapte. À faire valider par un avocat.
- [ ] **Informer et consulter le CSE** avant la mise en place d'outils qui permettent de contrôler l'activité des salariés ([Code du travail, article L2312-38](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035610275/)). Le dossier confiance fournit la note d'information. Les sociétés de moins de 50 personnes ont des obligations différentes : à préciser avec l'avocat.
- [ ] **Informer chaque salarié** au préalable (Code du travail, article L1222-4, et la page de la CNIL sur le [contrôle de l'activité des personnes employées](https://www.cnil.fr/fr/controle-de-lactivite-des-personnes-employees)).
- [ ] **La capture des conversations ChatGPT et Claude** reste désactivée par défaut. Son activation demande sans doute une analyse à part : à faire valider avant de la proposer.

#### IA

- [ ] **AI Act, article 50** : depuis le 2 août 2026, un système d'IA qui dialogue avec des personnes doit leur dire qu'elles parlent à une IA, sauf si c'est évident ([texte de l'article 50](https://artificialintelligenceact.eu/article/50/) ; [règlement (UE) 2024/1689 sur EUR-Lex](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32024R1689)). Pour Leon : une mention claire dans l'application. Leon ne semble pas relever des usages « à haut risque » de l'annexe III, mais une utilisation pour évaluer des salariés pourrait changer ça : l'interdire dans les CGV et le faire confirmer par l'avocat.

#### Plateformes

- [ ] **Google : vérification OAuth et CASA.** Gmail et Drive en lecture sont des scopes « restreints ». Selon Google, toute application qui y accède et peut faire passer les données par un serveur tiers doit passer une évaluation de sécurité selon le cadre CASA, **à renouveler au moins tous les 12 mois** ([vérification des scopes restreints](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [exigences de vérification](https://support.google.com/cloud/answer/13464321), [évaluation de sécurité](https://support.google.com/cloud/answer/13465431)). L'installation à l'échelle du domaine dispense de la vérification de marque, mais **pas** de la vérification des scopes restreints. Google prévient que la vérification « peut prendre plusieurs semaines ». Une application non vérifiée est limitée en nombre d'utilisateurs et affiche un écran d'avertissement : ce n'est pas acceptable pour un pilote qui vend la confiance. **À lancer maintenant**, avant le premier pilote. Vérifier aussi quel scope demande l'audit des partages (métadonnées de Drive).
- [ ] **Slack** : publication sur la Slack Marketplace, recherche à la volée sans stockage (partie 1).

### 7. Le registre des risques

Probabilité et gravité : faible, moyenne, haute. Estimations des fondateurs à revoir chaque vendredi (SOP 6).

| # | risque | probabilité | gravité | ce qu'on fait avant | ce qu'on fait si ça arrive |
|---|---|---|---|---|---|
| 1 | **Fuite de permission** : un utilisateur voit, dans une réponse ou une citation, un document qu'il ne pouvait pas voir | moyenne | **très haute** (fin de la confiance, violation RGPD) | contrôle des droits à chaque réponse, pas seulement à l'ingestion ; droits les plus restrictifs sur le dérivé ; audit des partages ; tests de non-régression des droits sur chaque version | SOP 4 : couper, prévenir le client sous 24 h, corriger pour tous |
| 2 | **Le pilote ne convertit pas** : « oui » au pilote gratuit ne veut pas dire « je paie » | haute | haute (le plan de 250 sièges repose dessus) | score des 10 questions dès J+5 ; appel de conversion fixé dès l'installation ; offre de lancement à 19 € ; mesurer le taux sur les 5 premiers pilotes | après 5 pilotes sous 40 % de conversion, revoir la cible ou la recette phare avant d'en lancer d'autres |
| 3 | **Google ou Slack change ses règles** : CASA refusé ou retardé, scope retiré, Slack qui durcit encore | haute (Slack l'a déjà fait en 2025) | haute (Gmail et Drive sont le cœur) | lancer la vérification Google maintenant ; ne pas dépendre de Slack pour la valeur ; suivre les changelogs | basculer sur les sources restantes, prévenir les clients, adapter la promesse |
| 4 | **Panne ou hausse de prix du fournisseur LLM** | moyenne (les prix bougent : Anthropic a annulé au dernier moment une hausse prévue de Sonnet 5 au 1er septembre 2026) | moyenne | code capable de changer de modèle (Anthropic, Bedrock UE, Mistral) ; alerte de budget ; suivi du coût par siège chaque semaine | basculer sur l'autre fournisseur ; si le coût dépasse 5 € par siège, pousser l'accès par MCP (2,5 €) |
| 5 | **Une réponse fausse affirmée avec assurance** devant un client | haute | moyenne à haute | « je ne sais pas » préféré à une réponse non sourcée ; citation obligatoire ; test des 10 questions | SOP 4, partie mauvaise réponse ; ajout au jeu de tests |
| 6 | **Un fondateur indisponible** (maladie, vie perso, départ) | moyenne | haute (deux personnes, astreinte) | astreinte qui tourne ; SOP écrites ; accès partagés dans un gestionnaire de mots de passe ; pacte d'associés | l'autre prend l'astreinte ; geler les nouveaux pilotes plutôt que dégrader le support |
| 7 | **Perte de données** : base corrompue, erreur de migration, sauvegarde absente | moyenne (la base partagée a déjà posé des problèmes en développement) | très haute | vérifier les sauvegardes Supabase et tester une restauration avant le premier pilote ; PITR dès les premiers clients payants ; environnements séparés | restaurer, ré-ingérer depuis les sources, prévenir les clients |
| 8 | **Piratage ou fuite de secrets** (clés d'API, jetons OAuth des clients) | faible à moyenne | très haute | jetons chiffrés, secrets hors du repo, accès minimum, double authentification partout, pentest | révoquer tous les jetons, SOP 4, prévenir les clients et l'assureur |
| 9 | **Index vide ou lent au premier contact** | haute | moyenne | import du plus récent au plus ancien ; questions proposées sur les 30 derniers jours ; mesure à chaque pilote | prolonger le pilote, refaire la revue des 10 questions une fois l'import fini |
| 10 | **Le CSE ou le DPO du client bloque** (« surveillance ») | moyenne | moyenne (un pilote perdu ou retardé) | dossier confiance envoyé avant la visio ; capture des conversations IA désactivée ; paie et RH exclues ; journal des questions visible | proposer un périmètre réduit (une équipe, sans réunions), rencontrer le CSE avec le dirigeant |

**Les trois risques à traiter d'abord** : la fuite de permission (1), le pilote qui ne convertit pas (2), et la dépendance aux règles de Google et Slack (3). Le premier tue la confiance, le deuxième tue le plan, le troisième peut couper l'accès aux données.

### Les questions ouvertes

1. Devis : assurance RC pro et cyber, avocat (DPA, CGV, note CSE, statuts, pacte), pentest.
2. Prix exact de Yousign sur le site officiel (page tarifs inaccessible le 19/10).
3. Les sauvegardes Supabase sont-elles actives ? Une restauration a-t-elle été testée ? PITR (100 $ par mois) à ajouter au plan ?
4. Calendrier de la vérification Google (scopes restreints et CASA) : à lancer maintenant ; quel scope l'audit des partages demande-t-il ?
5. Le traitement en UE est-il exigé par les premiers clients ? Si oui, Bedrock UE (+10 %) devient le fournisseur par défaut.
6. Obligations vis-à-vis du CSE pour les clients de moins de 50 personnes, et AIPD type : à faire valider par l'avocat.
7. Les durées des SOP (6 h par pilote, 20 min de support par client et par semaine) sont des estimations : les mesurer sur les 3 premiers pilotes.

Prochaine étape du pack : `/founder-launch`.

## Launch plan

19/10/2026 · Étape `founder-launch` du pack. Sources : `idea.md`, `board.md`, `panel/results.md`, `panel-v2/results.md`, `offer.md`, `pricing.md`, `numbers.json`, `cfo.md`, `marketing.md`, `ops.md`. Le fichier `brand.md` n'existe pas encore : le nom n'est pas choisi (« Leon » est un nom de travail, pas tenable). Ce document dit **« le nom retenu »** et fait du choix du nom une tâche datée.

**À lire avant tout :**
- Les acheteurs du panel sont **simulés**. Les chiffres réels du test ci-dessous priment sur eux.
- La répartition des tâches entre David (D) et Amos (A) est **une proposition**, à inverser ou ajuster. Elle suit une logique simple : D porte le produit et Google, A porte la société, le juridique et la vente ; les deux vendent.
- Ce n'est pas un conseil juridique. Les règles de Google, de Slack et du droit français citées ici sont à reconfirmer au moment de les appliquer.

### En bref

| | |
|---|---|
| **Le test** | Du 9 novembre au 4 décembre 2026, sur au moins 20 rendez-vous de dirigeants « noyés dans les outils » : une **réservation de pilote avec moyen de paiement enregistré** (carte ou mandat SEPA, rien n'est débité) et une **lettre d'engagement signée**. |
| **La ligne de succès** | **≥ 5 réservations avec moyen de paiement ET ≥ 3 lettres d'engagement signées, sur 20 rendez-vous.** Écrite avant de commencer. |
| **Le 12 janvier 2027** | **Tenable, mais pas garanti.** La vérification Google des accès Gmail et Drive (avec l'évaluation de sécurité CASA) est sur le chemin critique, et Google ne promet aucun délai (« plusieurs semaines »). Décision ferme le **vendredi 18 décembre**. Date de repli : **mardi 2 février 2027**. |
| **Le chemin critique** | Choisir le nom (30/10) → domaine, site et politique de confidentialité en ligne, application déployée en production (6/11) → dépôt de la vérification Google (13/11 au plus tard) → évaluation CASA et corrections → accord Google (18/12) → pilotes Gmail et Drive à partir du 12/01. En parallèle, sans marge : la SAS immatriculée avant le premier DPA (soft launch du 8/12). |

---

### 1. Le test, avant de dépenser

#### Pourquoi ce test

Leon est un abonnement B2B. Le test le moins cher et le plus vrai, c'est une offre de fondateur payée ou engagée d'avance. Mais le panel lui-même a demandé un **pilote gratuit** (c'est la condition n°1 de `offer.md`), et l'offre « Le pilote 30 jours » est gratuite. Demander de payer d'avance contredirait l'offre qu'on veut tester.

Le test garde donc le pilote gratuit, mais remplace le « oui » du panel par **deux engagements réels, qui coûtent quelque chose à l'acheteur** :

1. **La réservation de pilote avec moyen de paiement.** Le dirigeant réserve une date d'installation et enregistre une carte ou un mandat SEPA (Stripe, en mode enregistrement, sans débit). Rien n'est prélevé pendant les 30 jours du pilote. S'il continue après le pilote, la facturation démarre à 19 € HT par utilisateur actif. Le SEPA est proposé parce que `ops.md` le recommande pour des factures B2B (0,35 € par prélèvement) et parce que beaucoup de PME ne paient pas leurs logiciels par carte.
2. **La lettre d'engagement.** Une page, signée en ligne : « Si notre équipe obtient au moins 8 bonnes réponses sur 10 au test des 10 questions, nous passons au payant à 19 € HT par utilisateur actif, pour au moins 5 utilisateurs et 3 mois. » Elle nomme l'équipe pilote, la date d'installation et la présence de l'administrateur Google Workspace. C'est une lettre d'intention conditionnelle, pas un contrat ferme : l'avocat dira comment la rédiger.

Le seuil de 8 sur 10 vient du panel : plusieurs acheteurs ne paieraient qu'à ce score (P007, P015, P017, P018).

#### Le déroulé

| | |
|---|---|
| **Quand** | du lundi 9 novembre au vendredi 4 décembre 2026 (4 semaines) |
| **Qui on voit** | des dirigeants de sociétés de services et d'éditeurs SaaS de 10 à 80 personnes, « noyés dans les outils », tirés de la liste des 80 de `marketing.md` (on la commence maintenant au lieu de fin décembre). Pas de prudents sécurité, pas de clients déjà équipés de ChatGPT Business ou Claude Team : le marketing ne les vise pas. |
| **Ce qu'on montre** | une visio de 30 minutes : le pitch de `pitch.md`, puis une démo **sur nos propres outils** (notre Workspace : Google permet sans vérification une application interne à l'organisation), le dossier confiance, l'audit des partages sur nos propres données |
| **Ce qu'on demande** | à la fin, la réservation, puis la lettre. Rien d'autre. |
| **Ce que ça coûte** | du temps (environ 20 h à deux), Stripe sans abonnement, la signature électronique (23 € par mois, déjà dans `numbers.json`) |

**Prérequis** : la SAS immatriculée pour ouvrir Stripe à son nom. Si le Kbis n'est pas là le 9 novembre, on prend d'abord les lettres signées et on enregistre les moyens de paiement dès que Stripe est ouvert.

#### La ligne de succès, écrite avant

**Sur au moins 20 rendez-vous tenus entre le 9 novembre et le 4 décembre 2026 : au moins 5 réservations avec moyen de paiement enregistré, et au moins 3 lettres d'engagement signées.**

| résultat | ce qu'on fait |
|---|---|
| **≥ 5 réservations et ≥ 3 lettres** | On continue : avocat, assurance, lancement. Les réservations deviennent les pilotes de janvier. |
| **3 ou 4 réservations, ou 1 ou 2 lettres** | Zone grise : une semaine de plus (jusqu'au 11/12) avec le pitch corrigé d'après les refus notés mot pour mot. Aucune grosse dépense pendant ce temps. |
| **≤ 2 réservations** | On s'arrête. Retour à `/founder-offer` (ou `/founder-pricing` si les refus parlent de prix). Le 12 janvier est abandonné. |

**Pourquoi cette ligne, et ce qu'elle change par rapport à l'étude du 18/10.** L'étude précédente proposait « 5 pilotes réservés avec carte + 3 engagements écrits ». On la garde, et on la précise :
- **Elle a un dénominateur et une date** (20 rendez-vous, 4 semaines). Sans eux, 5 réservations peuvent venir de 15 rendez-vous ou de 100, et ce n'est pas le même marché.
- **5 réservations, c'est la capacité de janvier** : `marketing.md` prévoit 6 pilotes installés en janvier. Le lancement démarre alors avec des pilotes déjà réservés au lieu de partir de zéro le 12.
- **3 lettres, c'est la condition du conseil** (« au moins 3 clients qui confirment le résultat par écrit », `board.md`), et c'est le plan du CFO : 25 sièges payants au mois 3, soit environ 3 sociétés de 8 à 10 personnes.
- **La lettre est liée au score**, ce qui mesure la vraie question que personne n'a encore : le passage du pilote gratuit au paiement (`offer.md`, `cfo.md`).
- **Le SEPA est accepté** à côté de la carte, pour ne pas compter comme un refus ce qui n'est qu'une habitude de paiement.

**La comparaison avec le panel.**

| | panel (simulé) | ligne de succès (réel) |
|---|---:|---:|
| « je lance le pilote gratuit » (panel v2, mêmes 20 acheteurs) | 45 % (9 sur 20) | — |
| réservation avec moyen de paiement | — | 25 % (5 sur 20) |
| achat (panel v1, 100 acheteurs) | 18 % | — |
| lettre d'engagement à payer si 8/10 | — | 15 % (3 sur 20) |

Une réservation avec moyen de paiement engage plus qu'un « oui » de panel au pilote gratuit : on s'attend à environ la moitié du taux du panel, d'où 25 %. La lettre, elle, ressemble à un achat sous condition : 15 % est proche des 18 % du premier panel. **Si le réel tombe sous 10 % de réservations (2 sur 20 ou moins), le panel s'est trompé de beaucoup : on fait confiance aux vrais acheteurs**, pas au panel.

**À noter chaque soir du test** : rendez-vous tenus, réservations, lettres, et les refus mot pour mot (confiance, prix, habitude, autre).

#### Ce qu'on dépense avant le résultat, et ce qu'on attend

| dépense (`numbers.json`, `ops.md`) | montant | quand | pourquoi |
|---|---:|---|---|
| Nom de domaine, site, première page | ≈ 500 € (dans les dépenses de départ) | dès le choix du nom | Google l'exige pour la vérification, et le test a besoin d'une page |
| Immatriculation de la SAS | ≈ 252 € | maintenant | DPA, Stripe, Google : tout se signe au nom de la société |
| Évaluation CASA (TAC Security, niveau 2) | ≈ 540 à 720 $ par an | dès l'accord de Google pour lancer l'évaluation | **le délai l'impose** : attendre le résultat du test ferait glisser le lancement d'au moins un mois |
| Contrats relus par l'avocat (CGV, DPA, note CSE) | 2 500 € + 800 € | engagement le 20/11 si la mi-parcours compte ≥ 3 réservations, sinon le 4/12 | le DPA doit être prêt pour le soft launch ; en attendant, on part des clauses types de la CNIL |
| Assurance RC pro et cyber | ≈ 80 € par mois (estimation) | devis maintenant, signature après le test | obligatoire avant le premier pilote réel |
| Audit de sécurité par un tiers | 4 000 € | **après les premiers pilotes payants** | proposition n°3 du CFO : la trésorerie nécessaire passe de 10 284 € à 6 284 €. La cible du lancement n'est pas les prudents sécurité. |

---

### 2. Le 12 janvier tient-il ?

#### Ce qui prend du temps (d'après `ops.md`, revérifié le 19/10)

| délai | durée | sur le chemin critique ? |
|---|---|---|
| **Vérification Google des scopes restreints + évaluation CASA** | Google : la vérification de marque prend « généralement 2 à 3 jours ouvrés » ; celle des scopes restreints « peut prendre plusieurs semaines » ; l'évaluation est à renouveler tous les 12 mois ([Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)). Aucun délai garanti. | **oui** |
| Choix du nom | dépend des fondateurs ; la vérification Google affiche le nom de l'application et demande un site sur un domaine vérifié. Changer de nom après la vérification oblige à refaire la vérification de marque. | **oui**, parce qu'il précède Google |
| Immatriculation de la SAS | 1 à 3 semaines (dépôt du capital, statuts, guichet unique, Kbis) ; estimation | **oui** pour le soft launch du 8/12 (« pas de DPA signé, pas de branchement », SOP 1) |
| Avocat (DPA, CGV, note CSE) | devis à demander ; 2 à 4 semaines estimées, avec les fêtes au milieu | non, si on part des clauses types de la CNIL pour le soft launch |
| Devis d'assurance | 1 à 2 semaines estimées | non, si on demande cette semaine |
| Sauvegardes Supabase | la mémoire du projet dit « pas de sauvegarde » ; Supabase Pro en annonce 7 jours. Une journée pour vérifier et tester une restauration. | non en durée, mais **c'est une barrière** : aucun pilote sans restauration testée |
| Slack Marketplace | revue de Slack, délai non publié dans nos sources | **non** : on sort Slack des pilotes de janvier (voir plus bas) |

#### Ce qui est restreint, exactement

D'après la liste de Google ([aide Google Cloud](https://support.google.com/cloud/answer/13464325)) :

| source | scope | statut | ce que ça demande |
|---|---|---|---|
| Gmail (contenu ou seulement les en-têtes) | `gmail.readonly`, `gmail.metadata` | **restreint** | vérification + CASA |
| Drive (contenu) | `drive.readonly` | **restreint** | vérification + CASA |
| **Drive (métadonnées seulement)** | `drive.metadata.readonly` | **restreint aussi** | vérification + CASA. **L'audit des partages (SOP 2), qui ne lit que les métadonnées, est donc lui aussi bloqué** par la vérification. |
| Drive (fichiers choisis un par un) | `drive.file` | non restreint | ne donne accès qu'aux fichiers que l'utilisateur ouvre ou choisit : inutilisable pour une mémoire |
| Comptes rendus Google Meet | stockés comme documents dans Drive | **restreint** (passe par Drive) | vérification + CASA |
| Google Agenda | `calendar.readonly` | sensible, pas restreint (à confirmer dans la console Google) | vérification simple, sans CASA |
| Notion, Jira, Linear, HubSpot, Pipedrive, GitHub | leurs propres autorisations, hors Google | pas concernés par CASA | chaque plateforme a ses règles pour une application installée chez des tiers, **à vérifier cette semaine** (Zoom, par exemple, demande une publication sur sa Marketplace pour les comptes tiers) |
| Slack | recherche à la volée seulement | règles Slack de 2025 | publication sur la Slack Marketplace avant toute vente |

**Deux exceptions de Google utiles, à manier avec soin** ([aide Google Cloud](https://support.google.com/cloud/answer/13464323)) :
- **Application interne** : utilisée seulement dans notre propre organisation Google Workspace. Elle suffit pour les démos du test, sur nos propres données.
- **Application approuvée par l'administrateur du client** : l'administrateur Google Workspace du client peut ajouter une application tierce à sa liste d'applications de confiance, et une installation par l'administrateur reste possible pour une application non vérifiée, avec un avertissement affiché. C'est permis, mais demander à un dirigeant qui doute de nous d'approuver une application « non vérifiée » contredit tout le dossier confiance. **On ne l'utilise que pour le soft launch, avec des sociétés amies, et avec leur accord écrit.**

#### Le verdict

**Le 12 janvier tient si, et seulement si, la vérification Google est déposée au plus tard le vendredi 13 novembre et acceptée au plus tard le vendredi 18 décembre.** Cela laisse environ 5 semaines à Google et au laboratoire CASA, avec Noël juste après. C'est possible, mais rien ne le garantit, et ça dépend d'abord d'un nom choisi avant le 30 octobre.

**Le point de décision : vendredi 18 décembre, à deux.**

| état de Google le 18/12 | décision |
|---|---|
| **Vert** : vérification acceptée | Lancement le **mardi 12 janvier 2027**, comme prévu, avec Gmail, Drive, Meet et l'audit des partages. |
| **Orange** : dossier déposé, CASA en cours, pas de refus | Lancement maintenu le 12 janvier, mais les pilotes de janvier démarrent sur les **sources non restreintes** (HubSpot ou Pipedrive, Notion, Jira ou Linear, GitHub, et Google Agenda si sa vérification est faite). Gmail, Drive et l'audit des partages s'ajoutent dès l'accord de Google, sans refaire l'installation. On le dit clairement au client dans la lettre d'engagement. **Limite honnête** : la promesse « ce qui a été promis au client » vit surtout dans les mails et les réunions. Un pilote sans Gmail est plus faible ; il tient chez les sociétés qui enregistrent leurs mails clients dans HubSpot ou Pipedrive et vivent dans Notion ou Jira. Le test des 10 questions se fait alors sur ces sources seulement. |
| **Rouge** : dossier non déposé au 13/11, refus de Google, ou corrections CASA lourdes | **Lancement repoussé au mardi 2 février 2027.** Tout le calendrier de `marketing.md` glisse de 3 semaines (J-14 = mardi 19 janvier). L'offre des 20 premières sociétés reste valable jusqu'au 31 mars 2027. |

La recommandation : **garder le 12 janvier comme objectif**, tout faire pour être vert, et ne pas faire semblant le 18 décembre. Un lancement public avec un écran « application non vérifiée » ferait plus de mal que trois semaines de retard.

---

### 3. Le compte à rebours

Semaines du lundi au vendredi. ★ = chemin critique (si la tâche glisse, le lancement glisse). D = David, A = Amos (proposition).

#### S1, du 19 au 23 octobre : lancer ce qui est long

| tâche | qui | pour le |
|---|---|---|
| Relire ce plan à deux, accepter ou changer la date et la répartition | D + A | ven. 23/10 |
| ★ Ouvrir le choix du nom : liste courte (l'étude du 18/10 proposait Acquis, Pourquoi, Parce), vérifier marque à l'INPI, domaine, comptes LinkedIn | D + A | ven. 23/10 |
| ★ Lancer l'immatriculation de la SAS : statuts, dépôt du capital, devis de l'avocat pour statuts et pacte d'associés | A | ven. 23/10 |
| ★ Lire les exigences Google (vérification des scopes restreints, CASA niveau 2), réduire la liste des scopes au strict nécessaire, préparer le projet Google Cloud de production | D | ven. 23/10 |
| Demander les devis : avocat (DPA, CGV, note CSE), assurance RC pro et cyber (Hiscox, Stello, un courtier tech) | A | ven. 23/10 |
| Vérifier les règles d'installation chez des tiers pour HubSpot, Pipedrive, Notion, Jira, Linear, GitHub, Zoom (application publique, Marketplace, limites) | D | ven. 23/10 |

#### S2, du 26 au 30 octobre : le nom

| tâche | qui | pour le |
|---|---|---|
| ★ **Choisir le nom retenu** et acheter le domaine | D + A | **ven. 30/10** |
| ★ Déployer l'application en production (Vercel Pro, base Supabase de production séparée de la base de développement partagée) | D | ven. 30/10 |
| Vérifier que les sauvegardes Supabase sont actives ; **tester une restauration** | D | ven. 30/10 |
| Préparer le test : script du rendez-vous, page de réservation, lettre d'engagement (première version d'après les clauses types de la CNIL, à faire relire), Stripe en mode enregistrement de carte et mandat SEPA | A | ven. 30/10 |
| Commencer la liste des 80 dirigeants (triés « noyés » ou non, déclencheur connu) et caler les 20 premiers rendez-vous | A + D | ven. 30/10 |

#### S3, du 2 au 6 novembre : le site et le dossier Google

| tâche | qui | pour le |
|---|---|---|
| ★ Site en ligne sous le nom retenu : page d'accueil, politique de confidentialité, conditions, sur un domaine vérifié dans Google Search Console | A (texte) + D (mise en ligne) | ven. 6/11 |
| ★ Dossier de vérification Google : écran de consentement au nom retenu, justification de chaque scope, vidéo de démonstration | D | ven. 6/11 |
| Démo du test sur nos propres outils (application interne) : 10 questions sur nos données, score réel noté | D | ven. 6/11 |
| Kbis attendu ; ouvrir le compte bancaire et Stripe au nom de la SAS | A | ven. 6/11 |

#### S4, du 9 au 13 novembre : le test commence, Google est déposé

| tâche | qui | pour le |
|---|---|---|
| ★ **Déposer la vérification Google** (marque, puis scopes restreints) | D | **ven. 13/11 au plus tard** (viser lun. 9/11) |
| **Test, semaine 1** : 5 à 6 rendez-vous | A + D | ven. 13/11 |
| Audit des partages et test des 10 questions qui marchent sur notre propre Workspace | D | ven. 13/11 |
| Recevoir et comparer les devis (avocat, assurance) | A | ven. 13/11 |

#### S5, du 16 au 20 novembre : CASA, mi-parcours du test

| tâche | qui | pour le |
|---|---|---|
| ★ Évaluation CASA dès que Google la demande : choisir le laboratoire (TAC Security niveau 2), lancer le scan, corriger | D | en continu |
| **Test, semaine 2** ; **mi-parcours le vendredi** : si ≥ 3 réservations, engager l'avocat | A + D | **ven. 20/11** |
| Choisir les 2 ou 3 sociétés amies du soft launch (dirigeant qu'on connaît, administrateur Google présent, accord pour une application en cours de vérification) | A | ven. 20/11 |

#### S6, du 23 au 27 novembre : test, semaine 3

| tâche | qui | pour le |
|---|---|---|
| **Test, semaine 3** | A + D | ven. 27/11 |
| ★ Corrections CASA, renvoi au laboratoire | D | ven. 27/11 |
| DPA, CGV du pilote, note CSE, AIPD type : première version (clauses types de la CNIL), relue par l'avocat si engagé | A | ven. 27/11 |
| Signer l'assurance RC pro et cyber | A | ven. 27/11 |

#### S7, du 30 novembre au 4 décembre : verdict du test

| tâche | qui | pour le |
|---|---|---|
| **Test, semaine 4, et verdict le vendredi** contre la ligne de succès | A + D | **ven. 4/12** |
| Si succès : engager l'avocat s'il ne l'est pas ; fixer les dates d'installation des pilotes réservés (à partir du 12/01) | A | ven. 4/12 |
| Si échec : arrêter le lancement, retour à `/founder-offer` | D + A | ven. 4/12 |
| Préparer le soft launch : comptes, exclusions par défaut (paie, finance, RH), recettes de l'équipe | D | ven. 4/12 |

#### S8, du 7 au 11 décembre : le soft launch

| tâche | qui | pour le |
|---|---|---|
| ★ **Soft launch** : installation chez les 2 ou 3 sociétés amies (SOP 1), DPA signé avant, Google en application approuvée par leur administrateur si la vérification n'est pas finie | D + A | **mar. 8/12 au jeu. 10/12** |
| Noter pour chaque installation : durée d'import des 30 derniers jours, durée totale, délai jusqu'à la première bonne réponse | D | à chaque installation |
| Fixer les appels de conversion du soft launch (J+25, soit vers le 4-5 janvier) | A | ven. 11/12 |

#### S9, du 14 au 18 décembre : la décision de date

| tâche | qui | pour le |
|---|---|---|
| Revue des 10 questions chez les sociétés amies (J+3 à J+5), causes des échecs, corrections | D | mer. 16/12 |
| Page du pilote finale : pitch, réservation, dossier confiance téléchargeable, sous le nom retenu | A | ven. 18/12 |
| ★ **Point de décision vert / orange / rouge** (partie 2) | D + A | **ven. 18/12** |

#### S10, du 21 au 23 décembre : corriger, puis souffler

| tâche | qui | pour le |
|---|---|---|
| Corriger ce que le soft launch a montré ; tests de non-régression des droits | D | mer. 23/12 |
| Fin de la liste des 80 dirigeants ; textes des posts LinkedIn 1 à 9 écrits d'avance | A | mer. 23/12 |
| Pas de prospection du 24 au 28 décembre | — | — |

#### S11, du 28 décembre au 1er janvier : J-14

| tâche | qui | pour le |
|---|---|---|
| Calendrier de `marketing.md` : 10 messages « vœux et question » le 29/12, 10 de plus le 30/12 | D 10 + A 10 | mer. 30/12 |
| Astreinte du soft launch (une personne, les sociétés amies utilisent l'outil) | D | ven. 1/01 |

#### S12, du 4 au 8 janvier : J-8 à J-4

| tâche | qui | pour le |
|---|---|---|
| Post 1 (lun. 4/01), 20 messages (mar. 5/01), post 2 (mer. 6/01), invitations au petit-déjeuner du 20/01 (jeu. 7/01), relances (ven. 8/01) | D, A | selon `marketing.md` |
| Appels de conversion du soft launch : **premiers chiffres réels de passage au payant** (à lire avec prudence : ce sont des amis) | A | mar. 5/01 |
| Créneaux de démo du 12 au 15 janvier ouverts dans Google Agenda ; installations des pilotes réservés calées | A | ven. 8/01 |
| Dernière vérification : sauvegarde restaurée, alertes Supabase, Vercel et budget Anthropic actives, comptes de démo prêts | D | ven. 8/01 |

#### S13, du 11 au 15 janvier : le lancement

| tâche | qui | pour le |
|---|---|---|
| Relecture de la page et du dossier confiance (dim. 10/01), post 3 (lun. 11/01) | D | lun. 11/01 |
| **Lancement** | D + A | **mar. 12/01** |

---

### 4. Le jour du lancement : mardi 12 janvier 2027

**L'offre d'ouverture** (`pricing.md`, `marketing.md`) : le pilote 30 jours, gratuit, une équipe de 10 personnes maximum ; ensuite 25 € HT par utilisateur actif ; **les 20 premières sociétés : 19 € garantis 12 mois, pour un contrat signé avant le 31 mars 2027** ; 6 pilotes possibles en janvier (limite réelle : deux fondateurs installent à la main).

**Les rôles du jour** (proposition) : **D d'astreinte** (produit, ingestion, installations techniques), **A aux clients** (messages, rendez-vous, réservations). Les deux postent.

| heure | qui | quoi |
|---|---|---|
| 8 h 00 | D | Contrôle : tableau de bord, files d'ingestion, erreurs, coût LLM, état de la vérification Google. Page du pilote, réservation et Stripe testés de bout en bout (une fausse réservation, puis supprimée). |
| 8 h 00 | A | Liste des 30 messages du jour prête (15 chacun), personnalisés avec l'accroche 1 (le départ). Agenda : 4 créneaux de démo de 30 min ouverts (11 h 30, 14 h, 16 h, 17 h). |
| 8 h 30 | D | **Post LinkedIn de D** (accroche 1 : « Votre chef de projet senior part vendredi… »), avec le lien de la page du pilote. |
| 9 h 00 à 10 h 00 | A + D | 30 messages personnels envoyés (15 chacun). Jamais de message de masse. |
| 10 h 00 à 11 h 00 | D + A | **Installation d'un pilote réservé pendant le test** (SOP 1), en visio, à deux. Première question en direct, délai noté. |
| 11 h 00 | D | Contrôle de l'ingestion du pilote (30 derniers jours prêts ?). |
| 11 h 30 | A | Démo n°1. |
| 12 h 30 | A | **Post LinkedIn de A** (son propre texte, même offre, accroche 2 ou 3). Réponse à chaque commentaire dans l'heure, toute la journée. |
| 14 h 00 | A | Démo n°2. |
| 15 h 00 à 16 h 00 | D | Installation n°2 si réservée (sinon : réponses aux messages, suivi du pilote du matin). |
| 16 h 00 et 17 h 00 | A | Démos n°3 et n°4. À chaque démo qui dit oui : réservation et lettre d'engagement envoyées dans l'heure. |
| 17 h 00 | D | Contrôle de l'ingestion des pilotes du jour, exclusions respectées, récapitulatif écrit envoyé à chaque dirigeant installé. |
| 18 h 00 | A + D | **Les chiffres du jour**, dans le tableau partagé : messages envoyés, réponses, rendez-vous pris, réservations, lettres, installations, durée d'import, délai jusqu'à la première bonne réponse. |
| 18 h 30 | A + D | Débrief de 15 minutes : ce qui a marché, ce qu'on change demain, journal d'exploitation. |

#### Si quelque chose casse (d'après le registre des risques de `ops.md`)

| ce qui casse | ce qu'on fait |
|---|---|
| **L'ingestion plante pendant une installation** (risque 9) | On ne bricole pas devant le client. D met l'import en pause et cherche la cause ; A continue la visio sur ce qui est déjà indexé, ou sur une autre source branchée (HubSpot, Notion), pour obtenir une première bonne réponse. Si rien n'est indexé : on le dit, on reprogramme sous 48 h, récapitulatif écrit le jour même. Le pilote est prolongé d'autant. |
| **L'ingestion plante chez tous les pilotes** | D suspend les nouvelles installations du jour ; A transforme les installations prévues en démos sur nos propres données et propose une nouvelle date. Les posts et les messages continuent : l'offre ne change pas. |
| **Une fuite de permission** (risque 1) | SOP 4 : couper tout de suite les réponses pour ce client, les deux fondateurs arrêtent tout le reste, prévenir le client par écrit sous 24 h, corriger pour tous les clients avant de reprendre. Aucune nouvelle installation tant que la cause n'est pas trouvée. |
| **Une réponse fausse affirmée avec assurance devant un dirigeant** (risque 5) | On le reconnaît sur le moment, on montre la source réelle, on l'ajoute aux tests (SOP 4). Pas de défense. |
| **Google bloque ou affiche un avertissement** (risque 3) | Arrêter les branchements Gmail et Drive ; continuer sur les sources non restreintes ; prévenir les pilotes concernés. |
| **Le fournisseur LLM est en panne** (risque 4) | Basculer sur l'autre fournisseur si le code le permet (Bedrock UE) ; sinon, prévenir les pilotes et décaler les démos. |
| **Le site tombe** | D revient au déploiement précédent sur Vercel ; A envoie le lien de réservation par message en attendant. |
| **Plus de demandes que de places** (plus de 6 pilotes) | Liste d'attente avec une vraie date d'installation en février. On ne monte pas la limite à la hâte : le support se dégraderait. |
| **Personne ne répond** | Pas de pub payée le jour même. On relance le 15/01 avec l'accroche 3, et on regarde la règle du 19/01. |

---

### 5. Les 30 premiers jours (12 janvier au 11 février 2027)

#### Les chiffres de chaque vendredi

Notés dans le tableau partagé à la revue de la semaine (SOP 6). Les objectifs et les seuils viennent de `marketing.md` et `cfo.md` ; ceux marqués « proposition » sont nouveaux et à valider.

| chiffre | objectif | seuil qui déclenche un changement | quoi changer | source |
|---|---|---|---|---|
| Taux de réponse aux messages personnels | ≥ 25 % | **< 10 %** après 40 messages | l'accroche, ou la liste (pas assez de « noyés ») | `marketing.md` |
| Pilotes lancés par semaine | 1 à 2 | **0 deux semaines de suite** | l'offre ou la confiance : relire les refus mot pour mot | `marketing.md` |
| Rendez-vous qui deviennent des pilotes | ≥ 30 % | **< 20 %** après 8 rendez-vous | idem ; comparer aux 45 % du panel v2 et au taux réel du test de novembre | `marketing.md` |
| Usage dans les pilotes (utilisateurs qui posent au moins 2 questions dans la semaine) | ≥ 60 % | **< 40 %** en semaine 2 d'un pilote | l'installation et les recettes | `marketing.md` |
| Score au test des 10 questions | ≥ 8 sur 10 | **< 7 sur 10 sur deux pilotes de suite** (proposition) | arrêter les nouvelles installations et corriger le produit | `offer.md`, `ops.md` |
| Délai jusqu'à la première bonne réponse | le jour même, pendant la visio | **plus de 24 h** (proposition) | l'ordre d'import, les questions proposées pendant l'import | `ops.md` |
| Coût de service par siège | ≤ 5 € par siège-mois | **> 5 €** | pousser l'accès par MCP (2,5 €) ; à 11 €, l'année 1 devient négative | `cfo.md`, `ops.md` |
| Sièges payants | 10 fin février (mois 2 du plan), 25 fin mars | **< 10 fin février** | le passage au payant : revoir l'appel de conversion, la recette phare | `numbers.json` |
| Passage du pilote au payant | ≥ 50 % (proposition) | **< 40 % après 5 pilotes terminés** | la cible ou la recette phare, avant de lancer d'autres pilotes | `ops.md`, risque 2 |
| Argent dépensé en marketing | ≤ 1 000 € sur 30 jours | **> 542 € par client payant** | arrêter le canal le plus cher | `marketing.md` |
| Heures de fondateur sur la vente et les pilotes | ≈ 80 h par mois (estimation) | à noter, sans seuil le premier mois | sert à chiffrer le coût d'acquisition en temps (condition du conseil) | `marketing.md` |

**Le seuil de rentabilité, pour situer** : 60 sièges payants (environ 6 sociétés de 10 personnes), selon `cfo.md`. On ne l'atteindra pas dans les 30 jours : les pilotes de janvier finissent mi-février. Les seuls sièges payants possibles avant sont ceux du soft launch (conversion vers le 5 janvier) et des pilotes réservés en novembre.

#### Les trois revues

**J+7, mardi 19 janvier (1 h, à deux)**
1. Combien de messages, de réponses, de rendez-vous, de réservations ? Quelle accroche a le mieux répondu ?
2. Les installations de la semaine : durée d'import, délai jusqu'à la première bonne réponse, incidents ?
3. Un post a-t-il fait venir au moins 2 demandes de pilote ? Si oui, test de pub LinkedIn de 300 € sur ce post ; sinon, non (`marketing.md`).
4. Les pilotes réservés en novembre sont-ils tous installés ? Sinon, pourquoi (DPO, CSE, administrateur absent) ?
5. Si on est en orange : où en est Google ? Les pilotes sans Gmail trouvent-ils quand même des réponses utiles ?

**J+14, mardi 26 janvier (1 h, à deux)**
1. L'usage en semaine 2 des premiers pilotes : au-dessus ou en dessous de 40 % ?
2. Les scores des 10 questions : combien de pilotes à 8 sur 10 ou plus ? Les causes des échecs ?
3. Le taux réel rendez-vous → pilote, comparé aux 45 % du panel et aux 25 % de réservations du test : le panel se trompe-t-il, et dans quel sens ?
4. Les sociétés du soft launch ont-elles payé ? Combien de sièges actifs ?
5. Qu'est-ce qui bloque chez les clients : CSE, DPO, avocat, administrateur Google ? Le dossier confiance suffit-il ?
6. Le bilan des canaux de `marketing.md` (jeudi 28/01) : on garde, on change ou on arrête chacun.

**J+30, jeudi 11 février (2 h, à deux)**
1. Combien de pilotes terminés, et combien sont passés au payant ? Au-dessus ou en dessous de 40 % ?
2. Combien de sièges payants, contre 10 prévus fin février et 60 pour le seuil ?
3. Le coût de service réel par siège : sous 5 € ?
4. Le coût par client payant (argent et heures) : sous 542 € ? Quel canal a amené les pilotes qui paient ?
5. Le passage de 19 € à 25 € : tient-on les 19 € pour les 20 premières sociétés jusqu'au 31 mars, comme promis ? (Oui : c'est un engagement public.)
6. Les dépenses repoussées : audit de sécurité tiers (4 000 €), restauration à la minute de Supabase (100 $ par mois), Slack Marketplace. On les déclenche maintenant ?
7. Capacité de février : combien de pilotes à deux sans dégrader le support ?
8. La décision : continuer tel quel, changer l'offre (retour à `/founder-offer`), changer le prix (`/founder-pricing`) ou changer de cible.

---

### Les questions ouvertes

1. **Le nom retenu**, avant le 30 octobre. Tout le chemin critique en dépend.
2. La répartition D / A est-elle la bonne ? Qui commence d'astreinte ?
3. Les règles d'installation chez des tiers pour HubSpot, Pipedrive, Notion, Jira, Linear, GitHub et Zoom (prévu en S1).
4. Le classement de `calendar.readonly` et des scopes de l'API Google Meet dans la console Google.
5. La forme juridique de la lettre d'engagement (avocat).
6. La SAS peut-elle être immatriculée avant le 6 novembre ? Sinon, le test démarre avec les lettres seules.

Prochaine étape du pack : `/founder-plan`, qui compile tout dans le plan d'affaires. Le pack conseille aussi `/founder-brand` pour le nom, qui est désormais sur le chemin critique.

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
