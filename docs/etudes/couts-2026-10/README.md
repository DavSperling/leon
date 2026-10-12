# Étude de coûts v1 : combien coûte Leon par collaborateur ?

12 octobre 2026 · Amos (avec Claude) · à relire par David

Tableur : [`leon-modele-couts.xlsx`](leon-modele-couts.xlsx) · Sources détaillées : [`annexes/`](annexes/)

## La question

Avant de choisir la stack, on voulait savoir si le robot d'entrée (celui qui reçoit toute la donnée, la trie et l'organise en fiches) est finançable. Trois options étaient sur la table : un agent Claude via l'API (type Opus), un modèle moins cher, ou un modèle fine-tuné par nous sur nos propres GPU. Il fallait aussi chiffrer le stockage, le contexte injecté au début des sessions, l'import de l'historique, et en déduire un prix par collaborateur.

## La réponse courte

1. **Le robot coûte peu, à condition de filtrer le bruit et de travailler en cascade.** Un petit modèle trie tout, un modèle plus fort n'écrit que les fiches. Ça revient à **1 à 3,50 $ par collaborateur et par mois** en coût variable. Opus sur tout coûte 5 à 9 fois plus selon le profil (5,5 fois pour un dev, 7,3 fois au bureau, 9,1 fois sur le terrain) : ça reste vendable, mais seulement au-dessus d'environ 25 € par siège. Le vrai danger est de faire passer le bruit dans le modèle : un dev dont on ingère les sessions de code brutes coûte **121 $/mois** avec Opus.
2. **Au démarrage, ce sont les coûts fixes qui comptent, pas l'IA.** La plateforme coûte environ 500 $/mois (serveurs, audit Google pour lire Gmail, outillage). Avec un seul client, ça fait 30 € par collaborateur ; dès 10 clients, moins de 5 €.
3. **Le fine-tuning n'est pas rentable au début.** Avec nos hypothèses, il ne bat l'API qu'à partir d'environ **130 clients** de 15 personnes en GPU à la seconde, et d'environ 200 en GPU dédiés. Ce n'est pas le prix des GPU qui coûte, c'est l'ingénieur nécessaire pour le faire tourner. Dans le cas pessimiste, le seuil tombe à 20 clients : il faut donc mesurer les vrais volumes pendant les pilotes.
4. **Les marges sont confortables.** À 25 € par siège, la cascade laisse 80 % de marge brute à 10 clients, et 2 clients de 15 personnes couvrent les coûts fixes de la plateforme (hors salaires).

**Recommandation : démarrer en API avec la cascade optimisée (R2b), mesurer pendant les pilotes, et préparer le fine-tuning pour plus tard.** Les pilotes produiront justement les données d'entraînement. Le fine-tuning garde un intérêt indépendant du coût : la souveraineté (un modèle hébergé en France) et un tri adapté à chaque secteur.

## Périmètre et hypothèses

- **Sources V1** : emails, docs/CRM/tickets, conversations LLM. Slack est exclu (décision du 12/10 : conditions de l'API et limites de débit). Les réunions transcrites sont exclues par défaut ; on peut les activer dans le tableur.
- **Trois profils** :
  - **dev** : utilise Claude Code ou Cursor toute la journée ;
  - **bureau** : mails, docs, ChatGPT ;
  - **terrain** : commercial ou technicien, surtout le CRM.
- **Deux entreprises types de 15 personnes** :
  - **tech** (type appli santé) : 5 dev, 8 bureau, 2 terrain ;
  - **rénovation énergétique** : 4 bureau, 11 terrain.
- **Le pipeline du robot** :
  1. un filtre mécanique, sans IA, retire le bruit : newsletters, notifications, fichiers lus et sorties de commandes dans les sessions de code ;
  2. le **tri** classe chaque élément : catégorie, niveau d'accès, entités, pertinence ;
  3. 25 % de la donnée alimente des **fiches** ; pour la mettre à jour, le modèle relit 3 fois plus de contexte (fiche existante, faits liés) ;
  4. un **briefing** par personne est régénéré 2 fois par jour, puis injecté au début de chaque session LLM.
- **Volumes** (en milliers de tokens par jour, après filtrage) : dev ~49k, bureau ~22k, terrain ~13k. Ce sont des benchmarks publics, sauf pour les sessions de code, **mesurées** sur les sessions Claude Code d'Amos.
  - Le volume brut médian est de 400k tokens par jour ; le pic, 1,4 M.
  - Les messages tapés et les réponses de Claude, la seule partie utile, ne représentent qu'environ 35k tokens, soit 10 %.
  - Les fichiers lus et les sorties de commandes font 81 % des sorties d'outils.
- Prix publics relevés le 12/10/2026. Tous les modèles Claude cités sont la génération actuelle (Opus 5.5 à 4 $ / 20 $ par million de tokens, Sonnet 5.5 à 2 $ / 10 $, Haiku 5.5 à 0,10 $ / 0,50 $).

## Les six scénarios

| Code | Scénario | Tri | Fiches | Briefing | Coûts fixes en plus |
|---|---|---|---|---|---|
| R1 | Opus partout | Opus | Opus | Opus | – |
| R2 | Cascade Claude | Haiku | Sonnet | Sonnet | – |
| **R2b** | **Cascade optimisée** | **Haiku** | **Sonnet** | **Haiku** | – |
| R3a | Fine-tuné, GPU dédiés | notre 8B | notre 8B | notre 8B | 2 GPU L40S 24/7 en France + MLOps |
| R3b | Fine-tuné, GPU à la seconde | notre 8B | notre 8B | notre 8B | MLOps |
| R4 | Hybride | notre 8B | Sonnet | Haiku | MLOps |

## Résultats

### Coût variable par collaborateur ($/mois)

| Scénario | Dev | Bureau | Terrain | Dev sans filtre |
|---|---|---|---|---|
| R1 Opus partout | 19,03 | 11,67 | 9,38 | 121,19 |
| R2 Cascade Claude | 6,25 | 4,40 | 3,82 | 31,95 |
| **R2b Cascade optimisée** | **3,46** | **1,60** | **1,03** | **29,16** |
| R3a Fine-tuné, GPU dédiés | 0,03 | 0,01 | 0,01 | 0,24 |
| R3b Fine-tuné, GPU à la seconde | 0,25 | 0,15 | 0,12 | 1,62 |
| R4 Hybride | 3,36 | 1,56 | 1,00 | 28,31 |

Le poste qui pèse le plus n'est pas le tri : c'est **le briefing et les fiches**.
- **Le briefing** : le faire réécrire 2 fois par jour par Sonnet coûte 2,94 $ par personne et par mois ; avec Haiku, 0,15 $.
- **Le tri** : sur Haiku, il coûte moins de 0,20 $ par personne et par mois. C'est pour ça que l'hybride R4 n'apporte presque rien par rapport à R2b.

### Coût total par collaborateur, coûts fixes inclus (€/mois)

| Scénario | Tech · 1 client | Tech · 10 | Tech · 100 | Réno · 1 client | Réno · 10 | Réno · 100 |
|---|---|---|---|---|---|---|
| R1 Opus partout | 40,91 | 15,05 | 12,46 | 37,61 | 11,74 | 9,16 |
| R2 Cascade Claude | 33,25 | 7,39 | 4,80 | 32,42 | 6,56 | 3,97 |
| **R2b Cascade optimisée** | **30,84** | **4,98** | **2,39** | **30,01** | **4,15** | **1,56** |
| R3a Fine-tuné, GPU dédiés | 390,02 | 39,25 | 4,17 | 390,02 | 39,24 | 4,16 |
| R3b Fine-tuné, GPU à la seconde | 247,06 | 25,08 | 2,88 | 247,02 | 25,03 | 2,83 |
| R4 Hybride | 248,70 | 26,72 | 4,52 | 247,90 | 25,92 | 3,72 |

### Quand le fine-tuning devient rentable

Nombre de clients de 15 personnes à partir duquel le scénario fine-tuné devient moins cher que la cascade optimisée (R2b) :

| | Hypothèses de base | Cas pessimiste |
|---|---|---|
| R3b (GPU à la seconde), entreprises tech | 129 clients | 20 clients |
| R3b, entreprises rénovation | 240 clients | 31 clients |
| R3a (GPU dédiés), entreprises tech | 197 clients | 31 clients |

Le cas pessimiste combine plusieurs hausses :
- 2 fois plus de donnée pertinente ;
- 5 fois plus de contexte relu ;
- les réunions incluses ;
- 4 briefings par jour ;
- un facteur de conversion en tokens de 1,6.

Même dans ce cas, R2b ne monte qu'à 15 € par collaborateur avec 10 clients.

### L'import de l'historique

Le coût est ponctuel, pour une entreprise tech de 15 personnes, en cascade optimisée et en batch : environ **45 $ pour 3 mois** d'historique, **91 $ pour 6 mois** et **109 $ pour 2 ans**. Au-delà de 6 mois, l'historique est seulement indexé, pas mis en fiches. Avec Opus, 2 ans coûteraient environ 930 $. **Ce n'est pas l'IA qui doit décider de la profondeur d'historique : on peut viser 6 à 24 mois.**

Il y a une limite. Chez Anthropic, le batch (−50 %) n'est pas compatible avec la rétention zéro des données. Si un client exige la rétention zéro, l'import coûte deux fois plus, ce qui reste faible.

## Coûts fixes et conformité

- **Plateforme** : environ 500 $/mois au démarrage.
  - Infra : 300 $, pour une base Postgres managée, deux petits serveurs et les sauvegardes, en Europe.
  - Audit Google CASA, obligatoire pour lire Gmail : environ 150 $/mois (540 à 1 800 $/an).
  - Outillage des connecteurs : 50 $.
- **Stockage** : négligeable. 5 To de données brutes coûtent 34 à 120 $/mois. Le choix de la base vectorielle ne compte qu'au-delà de 10 millions de morceaux indexés.
- **Conformité** : non incluse, parce qu'elle n'est pas nécessaire pour vendre aux PME. SOC 2 Type II coûte 25 à 50 k$ la première année, ISO 27001 38 à 54 k$, un pentest 5 à 20 k$. À prévoir avant de viser des entreprises plus grandes.
- **Crédits startups** : seul **AWS Activate** couvre Claude (via Bedrock). Google et Microsoft excluent Anthropic de leurs crédits. Ça pèse pour AWS si on part sur Claude.

## Tarification

Repères chez les concurrents (détail dans l'onglet Concurrents et [`annexes/05-concurrents.md`](annexes/05-concurrents.md)) :

| Catégorie | Exemples | Prix |
|---|---|---|
| Mémoire d'équipe | Basic Memory, Conxt, Pieces, Unblocked | 15 à 39 $ par siège |
| Suites IA | ChatGPT Business, Claude Team, Dust, Notion | 20 à 30 € par siège |
| Contexte d'entreprise hébergé en UE | In Parallel | 29 à 69 € par siège |

**Personne ne fait ce que fait Leon pour une PME.** Presque tous attendent que le LLM appelle leur outil. Seul Conxt (extension Chrome en bêta, pour les devs) capte les conversations ChatGPT, Claude et Gemini et injecte le contexte d'office.

| Prix par siège | Marge brute R2b (10 clients tech) | Marge brute R1 (10 clients tech) | Clients pour couvrir les coûts fixes (R2b) |
|---|---|---|---|
| 15 € | 67 % | 0 % | 3 |
| 25 € | 80 % | 40 % | 2 |
| 35 € | 86 % | 57 % | 1 |

**Proposition à discuter** : environ 25 € par siège et par mois. Ça place Leon comme une couche au-dessus de l'abonnement LLM que le client paie déjà, pas comme un concurrent de ChatGPT ou de Claude.
- **Ingestion lourde.** L'abonnement inclut un volume d'ingestion. Les gros consommateurs, comme les sessions de code brutes ou les réunions, paient des crédits en plus. C'est le modèle « siège + crédits » qui s'impose chez les concurrents. Il concilie aussi les deux positions de la réunion : un abonnement simple, et l'assurance de ne jamais perdre d'argent sur un gros utilisateur.
- **Pilote gratuit.** Trois mois pour une entreprise tech de 15 personnes, avec 3 mois d'historique, coûtent environ **122 €** de calcul (66 € pour la rénovation). La gratuité ne nous coûte presque rien en IA. Le débat entre Amos et David porte donc sur la valeur perçue et la conversion, pas sur le coût. Un plafond d'environ 300 € de calcul par pilote suffit à se protéger d'un usage anormal.

## Risques et inconnues

1. **Les hypothèses du pipeline ne sont pas mesurées** : part de donnée pertinente, contexte relu par fiche, fréquence des briefings. Ce sont les leviers n°1 du coût. Ils sont à mesurer en premier pendant les pilotes.
2. **Capter les conversations LLM des employés.** Ces conversations se font sur les comptes ChatGPT, Claude, etc. **du client**. C'est donc son abonnement qui décide **comment** on les récupère ; ni lui ni nous n'avons à acheter quoi que ce soit en plus.
   - **Si le client a une offre Enterprise** (ChatGPT Enterprise, Claude Enterprise, Microsoft 365 Copilot), son admin donne un accès à Leon. On récupère tout côté serveur, sans rien installer sur les postes. C'est rare dans les PME.
   - **Sinon** (Plus, Pro, Team, comptes perso), il n'existe pas d'accès serveur. Il faut installer Leon sur chaque poste :
     - un petit programme qui lit l'historique laissé sur la machine par Claude Code, Codex ou Cursor ;
     - une extension navigateur qui lit les conversations sur chatgpt.com, claude.ai ou Gemini.

   C'est faisable mais fragile, car il faut suivre chaque changement d'interface ou de format. Ce n'est pas un surcoût : ce programme et cette extension servent aussi à **injecter** le briefing. Il faut les prévoir dès la V1.
3. **L'historique local disparaît.** Claude Code efface ses sessions après 30 jours par défaut. L'agent local doit capter au fil de l'eau.
4. **Où transite la donnée quand Claude la lit.** La donnée est **stockée chez nous**. Mais pour la trier et écrire les fiches, le robot envoie chaque texte à Claude, qui ne tourne pas sur nos serveurs mais chez Anthropic, AWS ou Google. Claude renvoie le résultat (catégorie, droits, faits), et nous rangeons le tout dans notre base. Le texte **transite** donc par ces serveurs, même s'il n'y reste pas : Anthropic n'entraîne pas ses modèles dessus, et la conservation est limitée.
   - **Anthropic en direct** ne propose que « global » ou « US » : rien ne garantit que le texte reste en Europe.
   - **Claude via AWS Bedrock ou Google Vertex en région européenne** : c'est le même modèle, et le texte reste en Europe, pour environ 10 % de plus. Ça représente quelques centimes par collaborateur.
   - **Seul un modèle fine-tuné sur nos propres GPU en France** garantit que le texte ne quitte jamais notre infrastructure. C'est l'argument « souveraineté » du fine-tuning, indépendant de son coût.

   Certains clients exigeront que tout reste en Europe : la santé, les experts-comptables, les avocats. Pour la santé, l'hébergement doit en plus être certifié HDS, un point à vérifier avec un juriste. **Bedrock en Europe est probablement le bon choix par défaut**, d'autant que les crédits AWS Activate couvrent Claude.
5. **Opus 5.5 ne permet pas de désactiver son raisonnement.** Les tokens de réflexion sont facturés, donc R1 est sous-estimé.
6. **Les prix bougent** : les prix de Gemini Flash doublent au 01/01/2027, et certains prix OpenAI sont promotionnels.
7. **Slack**, pour plus tard : les conditions de l'API (pas d'export massif, rétention minimale) et une limite d'environ 21 600 messages par jour hors Marketplace. Pour entrer sur la Marketplace, il faut déjà 10 installations.

## Ce qui n'est pas dans l'étude

Les salaires de l'équipe, sauf le MLOps des scénarios fine-tunés, le coût de développement, l'acquisition client, le juridique (consentement des salariés, droit du travail), et le choix de la stack.

## Prochaines étapes proposées

1. **Valider ces hypothèses à deux** : Amos et David, sur le tableur.
2. **Mesurer pendant les premiers pilotes** : volumes réels par profil, part pertinente, contexte relu. Le tableur est fait pour être mis à jour avec ces chiffres.
3. **Tester le contournement du MCP**, priorité n°1 de la réunion du 11/10. L'étude montre que le **même composant** (agent local + extension) capte et injecte. C'est un argument fort pour l'architecture.
4. **Demander les crédits AWS Activate**, le seul programme qui couvre Claude.
5. **Choisir la stack.** L'étude indique que le calcul n'est pas le goulot d'étranglement : le choix doit se faire sur l'agent local (léger, multiplateforme, lit des fichiers et parle à une extension) et sur la vitesse d'itération côté serveur.

## Utiliser le tableur

Seules les cellules **bleues** se modifient. Les cellules à fond **jaune** sont les leviers qui pèsent le plus. Ordre de lecture :
1. `Resultats` ;
2. `Echelle` ;
3. `Cout_profil` ;
4. `Hypotheses`.

Il s'ouvre dans Excel, Numbers ou Google Sheets ; les formules se recalculent à l'ouverture. Le fichier n'enregistre pas les valeurs calculées, donc l'aperçu GitHub l'affichera vide.

**Vérification.** Le classeur a été recalculé avec un moteur de formules indépendant : aucune erreur sur 1 372 cellules. 128 résultats (coûts par collaborateur, historique, marges, pilote, point mort) ont été comparés à un calcul refait à part, sans aucun écart.
