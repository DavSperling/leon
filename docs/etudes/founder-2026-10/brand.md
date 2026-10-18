# La marque (18/10/2026)

Rôle : designer de marque du pack fondateurs. Matière première : `idea.md`, `pitch.md`, `offer.md` (l'offre v2 : « la mémoire des décisions de votre équipe dev », capture Claude Code/Cursor, test des 20 questions, pack confiance), `competitors.md`, `panel/results.md` et `panel-v2/results.md`, `board.md` (section « La version la plus forte »). `marketing.md` n'existait pas au moment d'écrire ; je suis parti de `board.md` et de `offer.md` section 4.

**Ce que ce document est, et n'est pas.** Toutes les vérifications ci-dessous sont des recherches publiques faites le 18 octobre 2026 (WHOIS, DNS, registre npm, API GitHub, Product Hunt, recherche web). Je n'ai pas pu interroger les bases de marques : `data.inpi.fr` renvoie 403 à un robot et `euipo.europa.eu/eSearch` exige JavaScript. Je n'ai donc **vérifié aucune marque déposée**. Ce n'est pas un avis juridique : un conseil en propriété industrielle confirme, et rien n'est protégé tant que rien n'est déposé. Un nom « libre » ici veut dire « je n'ai rien trouvé », pas « disponible ».

## 1. Ce que le nom doit porter

Trois choses, dans l'ordre, tirées des panels et du conseil :

1. **« Pourquoi on a fait ce choix »**, **« on a déjà eu ce bug »** : la raison derrière la décision, pas la recherche de documents (le bas droit de la carte de `competitors.md` est plein ; le nom ne doit pas sonner « recherche d'entreprise »).
2. **La source exacte, ou « je ne sais pas »** : la citation, jamais l'invention. C'est ce que Guru a pris pour accroche (« confidently wrong AI ») et ce que les acheteurs du panel demandent (P042, P051, P056, P069).
3. **Pas un mouchard** : 60 refus sur 100 pour « confiance » en v1 ; en v2, « un agent sur chaque poste, mes devs vont y voir un mouchard » (P001, P010, P011, P012, P015). Le nom ne doit évoquer ni l'œil, ni l'oreille, ni la surveillance, ni le « cerveau » de l'IA.

À éviter aussi : tout ce qui ressemble aux concurrents de `competitors.md` (Glean, Dust, Sentra, Granola, Unblocked, Onyx, Guru, Dash, memory.store, Qontext, Hymalaia, Context Link, Engram, Supermemory, Mem0), c'est-à-dire le champ « mémoire/memory/mem », les mots « context », « knowledge », « search », et les noms en « -ai » ou « -gram ».

## 2. Dix candidats

Pour chacun : ce qu'il dit ; à l'oral en français et en anglais ; sur une icône de 32 px ; dans un terminal (`<nom> login`) et comme nom de serveur MCP ; le risque. Les vérifications sont celles du 18/10 ; « NS » veut dire que le domaine a des serveurs de noms (il est pris) ; « aucun NS » veut dire qu'il n'en a pas (peut-être libre, à confirmer chez un registrar).

### 2.1 Leon (prénom, nom de travail)

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

### 2.2 Marcel (prénom, alternative)

- **Dit** : même registre que Leon, un cran plus « bistrot ».
- **Oral** : identique dans les deux langues, c'est son seul avantage.
- **Icône** : un « M ».
- **Terminal / MCP** : `marcel login` ; bien.
- **Risque, rédhibitoire** : **Marcel est le nom de la plateforme IA de connaissance interne de Publicis Groupe** (100 000 salariés, graphe de connaissance Microsoft, application iOS/Android « Publicis Marcel ») ([Publicis](https://www.publicisgroupe.com/en/news/press-releases/publicis-groupe-unveils-marcel), [App Store](https://apps.apple.com/us/app/publicis-marcel/id1399650746)). C'est exactement notre catégorie, avec marcel.ai chez Publicis (NS `publicisgroupe.com`). Marcel est aussi une application VTC du groupe Renault ([App Store](https://apps.apple.com/ag/app/marcel-chauffeur-privé-vtc/id803227884)). marcel.com, .fr, .dev pris ; npm `marcel` pris (générateur de sites).
- **Verdict** : non.

Note sur la famille « prénom » : Alan, Marcel, Hector, Gaston, Rosalie… la mode des prénoms français en startup est saturée depuis 2020, les bons sont pris, et un prénom ne dit rien du produit à un CTO qui lit une config MCP. Je n'en propose pas d'autre.

### 2.3 Pourquoi (descriptif)

- **Dit** : la question de la démo, mot pour mot (« pourquoi on a choisi Postgres pour le billing ? »). Le produit répond à « pourquoi », pas à « où est le document ».
- **Oral** : évident en français ; en anglais, « pourquoi » est dans les dictionnaires et se dit « poor-KWAH », tout le monde le reconnaît. Huit lettres, c'est long mais ça se tape.
- **Icône** : un « P » ou un point d'interrogation ; le « ? » est générique, il faudra autre chose (voir le brief du logo).
- **Terminal / MCP** : `pourquoi login`, serveur `pourquoi`. Un dev tape `pourquoi` et sourit. Dans un fichier de config MCP en anglais, c'est lisible et sans accent.
- **Risque, moyen** :
  - Mot courant : marque peu distinctive si l'INPI la juge descriptive d'un service d'information ; pour un logiciel elle reste déposable, mais la protection sera étroite. À demander au conseil.
  - pourquoi.fr est un site de vulgarisation (« Parce que tout s'explique ») ; pourquoi.com un site anglophone de développement personnel ; pourquoi.ai parqué à la vente ; pourquoi.app et .eu pris. **pourquoi.dev, .io, .so, .team, .tools : aucun NS.**
  - npm `pourquoi` : libre (404). GitHub org `pourquoi` : libre ; l'utilisateur `pourquoi` est pris. Product Hunt : libre. LinkedIn `/company/pourquoi` existe (200), à regarder.
  - Peut paraître enfantin (« l'âge du pourquoi ») à certains acheteurs ; à tester sur cinq CTO.

### 2.4 Filrouge (évocateur)

- **Dit** : « je perds le fil de ce que mes agents décident » est la phrase exacte de l'acheteur P055 ; le fil rouge, c'est la ligne qui tient un projet d'un bout à l'autre.
- **Oral** : « fil rouge » en français ; en anglais « feel-ROOZH », expression connue des designers et des gens de marque, inconnue des autres.
- **Icône** : un trait rouge continu ; mais notre accent n'est pas rouge (voir §5), donc l'icône mentirait ou imposerait le rouge.
- **Terminal / MCP** : `filrouge login`, serveur `filrouge` ; deux mots collés, on hésitera entre `filrouge`, `fil-rouge`, `fil_rouge`.
- **Risque, élevé** : « Fil Rouge » est un nom d'agence très répandu en France ; filrouge.com et .fr appartiennent à Altavia Fil Rouge (merchandising), filrouge.ai et .app pris ; seuls .dev, .io, .so, .team, .tools sont sans NS. npm libre, GitHub org libre, Product Hunt libre, LinkedIn `/company/filrouge` existe. La classe 35 sera encombrée.
- **Verdict** : beau, mais trop partagé.

### 2.5 Parce (inventé)

- **Dit** : « parce que » coupé net : la réponse commence par « parce que ». En anglais, ça se lit « parse », mot de développeur.
- **Oral** : « parss » en français, « parse » en anglais : même son, ce qui est rare.
- **Icône** : un « P » ; ou « parce » en minuscules en Plex Mono, ça tient en 32 px.
- **Terminal / MCP** : `parce login`, serveur `parce` ; cinq lettres, très bon.
- **Risque, moyen à élevé** : paquet npm `parce` pris (déprécié, mais le nom est bloqué) ; org GitHub `PARCE` prise depuis 2013 (parce.tv) ; parce.co est une agence web à New York ; « PARCE Mobile » est une application de productivité d'équipe sortie en 2025 ([App Store](https://apps.apple.com/us/app/parce-mobile/id6747766143)) ; Parce GmbH, domotique à Munich. parce.com, .fr, .ai, .dev tous pris. En Colombie, « parce » veut dire « pote », ce qui est plutôt sympathique.
- **Verdict** : bon son, identifiants bouchés.

### 2.6 Greffe (lieu, institution)

- **Dit** : le greffe est l'endroit où le tribunal conserve ses décisions et où l'on vient chercher l'acte original. Exactement notre fonction, en un mot que tout dirigeant français connaît (Kbis, Infogreffe).
- **Oral** : « grèf » en français ; en anglais, imprononçable et inconnu (« greff ? graph ? »), et le mot veut aussi dire transplantation d'organe.
- **Icône** : un « G ».
- **Terminal / MCP** : `greffe login` ; les accents absents, ça passe, mais un anglophone ne le retiendra pas.
- **Risque, élevé** : **Infogreffe** est une marque forte en France dans le registre et les données d'entreprise ; confusion probable. greffe.fr pris, org GitHub `greffe` prise (vide, 2018), npm libre.
- **Verdict** : parfait pour la France seule, mort à la première équipe à Berlin.

### 2.7 Acquis (mot français court)

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

### 2.8 Motif (mot court, bilingue)

- **Dit** : « le motif de la décision » ; se lit tel quel en anglais.
- **Oral** : identique dans les deux langues ; cinq lettres.
- **Icône** : un « M », ou un motif graphique, trop facile.
- **Terminal / MCP** : `motif login`, serveur `motif`.
- **Risque, rédhibitoire** : **Motif est une marque déposée de The Open Group** pour la boîte à outils graphique X11, connue de tout développeur Unix de plus de quarante ans ([opengroup.org](https://www.opengroup.org/openbrand/prodstds/x98uc.htm)) ; classe 9, même public. npm `motif` pris ; motif.ai parqué, motif.dev pris, motif.com et .fr pris.
- **Verdict** : non.

### 2.9 Provenance (mot technique)

- **Dit** : la provenance des données, la source exacte. Terme exact de notre promesse, identique en anglais.
- **Oral** : identique dans les deux langues ; dix lettres, c'est long.
- **Icône** : un « P ».
- **Terminal / MCP** : `provenance login` ; trop long à taper, tout le monde abrègera.
- **Risque, élevé** : générique (provenance blockchain, Provenance.org, des dizaines d'outils de traçabilité) ; npm, org GitHub, Product Hunt pris ; provenance.com et .dev pris. Marque faible, impossible à défendre.
- **Verdict** : non. Le mot reste bon dans nos textes (« chaque fait avec sa provenance »).

### 2.10 Cairn (évocateur)

- **Dit** : le tas de pierres que ceux qui sont passés avant laissent pour marquer le chemin. Même mot en anglais.
- **Oral** : « kèrn » ; cinq lettres.
- **Icône** : trois pierres empilées, lisible en 32 px, déjà vu cent fois.
- **Terminal / MCP** : `cairn login`.
- **Risque, rédhibitoire** : **Cairn Software**, studio d'agents et d'outils pour développeurs créé en octobre 2025, org GitHub `cairn` (8 dépôts), cairn.dev ([cairn.github.io](https://cairn.github.io/)) ; un autre `cairn-dev/cairn`, agent de fond sur dépôts GitHub ; et **Cairn.info**, le portail français des revues en sciences humaines. npm `cairn` pris.
- **Verdict** : non.

**Écartés en route**, pour mémoire : *Attendu* (les « attendus » d'un jugement, et « résultat attendu » dans un test : très joli, mais Attendu est un éditeur de logiciel événementiel, attendu.com et .dev, org GitHub depuis 2017) ; *Rationale* (outil de décision IA de Jina AI, [rationale.jina.ai](https://jina-ai-gmbh.ghost.io/podcast/introducing-rationale-decision-making-tool-powered-latest-gpt-context-learning/)) ; *Dixit* (le jeu de société, trop connu en France) ; *Codex* (OpenAI) ; *Verbatim* (le fabricant de supports de stockage, classe 9) ; *Dossier* (connotation de fichage en anglais, l'inverse de ce qu'on veut) ; *Retenu* (« la solution retenue », identifiants libres, mais « retenue » veut aussi dire punition et prélèvement).

## 3. Liste courte

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

### Ce que les fondateurs doivent vérifier eux-mêmes (pour les trois)

Je n'ai fait que des recherches publiques, sans accès aux bases de marques. À faire dans l'ordre, avant d'imprimer quoi que ce soit :

1. **Marques, France** : [data.inpi.fr](https://data.inpi.fr/) → Marques → recherche sur le mot exact puis sur les variantes phonétiques (« aki », « acqui », « akis »), classes **9** (logiciel), **42** (SaaS, services informatiques) et **35** (gestion de données, publicité). Regarder aussi les dénominations sociales (le registre du commerce est dans la même base).
2. **Marques, Union européenne** : [euipo.europa.eu/eSearch](https://euipo.europa.eu/eSearch/) (mêmes classes) et [TMview](https://www.tmdn.org/tmview/) pour couvrir d'un coup les offices nationaux. Chercher aussi « ACQUIS » en marque figurative.
3. **Conseil en propriété industrielle** : lui montrer les homonymes trouvés ici (AcquisLink pour Acquis, PARCE Mobile pour Parce) et demander une recherche d'antériorité avec similitudes. Compter 300 à 800 € pour la recherche, puis le dépôt INPI (190 € pour une classe, 40 € par classe supplémentaire, tarifs 2026 à revérifier sur inpi.fr) ; le dépôt EUIPO est plus cher et peut attendre les premiers clients hors de France.
4. **Domaines** : acheter avant d'annoncer. Pour Acquis : demander le prix de acquis.ai (Afternic), et réserver tout de suite ce qui est sans NS (.so, .team, .tools), plus une forme longue en .com et .fr (par exemple `getacquis` ou `acquis-app`, à vérifier). Le .fr n'a pas de site : voir chez l'AFNIC qui le tient et s'il est à vendre. Même méthode pour Pourquoi (.dev, .io en priorité).
5. **Identifiants** : créer l'org GitHub, le compte npm (le paquet de l'agent local, par exemple `acquis` ou `@acquis/agent`), le compte X, la page LinkedIn, le compte Product Hunt **le même jour**, avant tout post public. X et LinkedIn n'ont pas pu être vérifiés sans compte.
6. **Concurrents** : relire le tableau 1 de `competitors.md` avec le nom choisi à voix haute ; aucun des trois ne se rapproche d'un nom de la liste.
7. **À l'oral** : demander à cinq personnes (dont deux anglophones) de lire le nom écrit et de le dire. Si plus d'une prononciation sort, prévoir la ligne « prononcez… » sur la page d'accueil.

## 4. La voix et la promesse

### La promesse, en une ligne

**Chaque réponse cite sa source exacte, ou dit « je ne sais pas ».**

C'est ce que le client peut vérifier à chaque fois, lui-même, dès la première question. C'est aussi la base du test des 20 questions : la promesse et la garantie sont la même phrase. Tout ce que la marque affirme en découle : on ne garde que ce qui est cité, on ne remonte que ce que l'auteur a validé, on ne fait jamais semblant de savoir.

### Trois accroches

1. **« Pourquoi on a fait ça ? » La réponse, avec la source.**
2. **Ce que l'équipe a décidé, et pourquoi. Jamais inventé.**
3. **Vos décisions, retrouvées. Vos conversations, chez vous.**

La première est la question de démo ; la deuxième est la promesse ; la troisième répond au « mouchard ». Aucune ne reprend une accroche de `competitors.md` (« Your company may forget. But Sentra doesn't. », « More context. Better code. », « Stop running your business on confidently wrong AI. », « Give your AI your team's context. »…) : vérifié mot à mot.

### La voix, en trois adjectifs

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

### Réécriture avant / après

Ligne de `pitch.md` : *« Un petit agent sur chaque poste garde ce que vos développeurs et leurs agents IA décident dans Claude Code ou Cursor, et pourquoi. »*

Ce qui cloche : « petit » rassure sans informer, « sur chaque poste » sonne déploiement imposé (P001, P010), « garde ce que vos développeurs décident » se lit comme une surveillance des personnes.

Après : *« Chaque développeur installe l'agent lui-même. Il lit les fichiers de session de Claude Code et de Cursor sur son poste, rien d'autre, et lui propose les décisions qu'il y trouve, avec leur raison. Rien ne part vers l'équipe sans son clic. »*

Ce qui change : qui installe (le dev, pas le CTO), ce qui est lu (nommé), ce qui ne l'est pas (« rien d'autre »), qui décide de partager (l'auteur). Quatre faits à la place d'un adjectif.

## 5. Le look : brief

### Point de départ : ce que le repo fait déjà

Deux sources qui ne disent pas la même chose :

- La spec `docs/specs/2026-10-13-design.md` (Amos, 13/10) prescrit **IBM Plex Sans / Serif / Mono**, des neutres chauds (« papier » `#FAF9F7`), et un **accent unique bleu pétrole `#0B5D5B`**, en s'interdisant explicitement « indigo, violet ou bleu par défaut de Tailwind » et en notant que Qontext utilise Inter et un accent indigo/violet.
- Le code sur `main` (PR #11) utilise **Inter** pour l'interface (`src/app/layout.tsx`), Plex Serif et Plex Mono pour les citations et le brut, un fond gris neutre `#f5f5f4` et un **accent indigo `#4f46c8`** (`src/app/globals.css`, lignes 64-74, commentaire « accent indigo pour les liens et la sélection »).

**Décision proposée : revenir à la spec du 13/10 pour la marque, et réaligner le code dessus.** Raisons : l'indigo sur blanc est l'accent par défaut de la catégorie (Qontext, Linear, et la moitié des SaaS IA de 2024-2026 ; je n'ai pas relevé la palette de chaque concurrent de `competitors.md`, c'est une observation, pas une vérification) ; la spec l'interdisait déjà ; le pétrole sur papier est rare dans la catégorie et dit « registre, encre, document tenu » plutôt que « dashboard IA ». Inter est une bonne police, mais c'est aussi celle de Qontext et de la moitié du marché ; une seule famille (Plex) en trois graisses coûte zéro licence et donne une identité d'un coup. Le changement dans le code tient en une importation (`layout.tsx`) et quatre valeurs de variables (`globals.css`).

### Couleurs

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

### Typographie

Une famille, trois coupes, toutes sous **SIL Open Font License 1.1** (licence vérifiée sur [github.com/IBM/plex](https://github.com/IBM/plex/blob/master/LICENSE.txt)) et servies par Google Fonts (API vérifiée le 18/10 pour les trois) :

- **Titres : IBM Plex Serif**, 600 pour les titres, 400 italique pour les citations. [fonts.google.com/specimen/IBM+Plex+Serif](https://fonts.google.com/specimen/IBM+Plex+Serif). Le serif dit « document tenu », pas « app IA », et c'est déjà la police des citations dans l'app.
- **Texte : IBM Plex Sans**, 400 / 500 / 600. [fonts.google.com/specimen/IBM+Plex+Sans](https://fonts.google.com/specimen/IBM+Plex+Sans). À la place d'Inter dans `layout.tsx`.
- **Code, identifiants, commandes : IBM Plex Mono**, 400 / 500. [fonts.google.com/specimen/IBM+Plex+Mono](https://fonts.google.com/specimen/IBM+Plex+Mono). C'est aussi la police de `acquis login` dans toute la communication : le terminal fait partie de la marque.

Fichiers complets sur [github.com/IBM/plex/releases](https://github.com/IBM/plex/releases) pour l'auto-hébergement (préférable au chargement depuis Google pour la page sécurité : aucune requête tierce). Rien d'autre : pas de police d'affichage, pas de police payante, pas d'image de banque sans licence.

### Le logo : brief

**Ce qu'il doit dire** : « nous citons ». Le signe proposé est le **guillemet ouvrant français « »** (deux chevrons), en Pétrole, suivi du nom en Plex Serif 600. Le guillemet, c'est la citation de source, ce que le produit fait et ce que les concurrents ne montrent pas ; les deux chevrons se lisent aussi comme un retour en arrière (l'historique) et rappellent l'invite d'un terminal. Il ne dit ni mémoire (cerveau, éléphant), ni recherche (loupe), ni IA (étincelles), ni surveillance (œil, radar).

**Où il doit marcher** :
- **Favicon 16 et 32 px** : le « seul, Pétrole sur Papier ; version monochrome Encre.
- **Icône de barre de menus (agent local, macOS)** : le « seul en « template image » (noir, transparence), 18 px ; **deux états obligatoires** : capture active (chevrons pleins) et capture en pause (chevrons en contour). C'est le « signal visible de capture » de la condition C6 du conseil ; le logo porte l'état, pas une pastille de couleur.
- **Avatar GitHub / npm / X / LinkedIn** : le « blanc sur carré Pétrole, coins 4 px.
- **En-tête de page et email** : « + nom, Encre, 24 px de haut ; version Pétrole sur Papier pour la page d'accueil.
- **Terminal** : le nom seul en Plex Mono, pas de logo ASCII.

**À éviter** : cerveau, éléphant, ampoule, loupe, œil, cadenas, robot, étincelles, bulle de dialogue, dégradé, 3D, mascotte, « AI » dans la marque, animation du logo. Pas d'icône générée par IA sans retravail : le trait doit être propre en 16 px. Le logo final sera fait par un graphiste (budget 500 à 1 500 € pour un signe + un mot-symbole + une planche d'usages), à partir de ce brief.

### Les cinq premiers points de contact

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

## 6. Ce qui reste à faire

- Choisir entre Acquis, Pourquoi et Parce après les vérifications du §3 et un test oral sur cinq personnes.
- Dépôt INPI classes 9, 42, 35, puis domaines et identifiants le même jour.
- Réaligner le code sur la spec (Plex Sans à la place d'Inter, Pétrole à la place de l'indigo) et remplacer « Leon » dans `src/app/(auth)/layout.tsx`, le `README`, le nom du serveur MCP et le paquet de l'agent.
- Brief graphiste pour le signe « et la planche d'usages.
- Faire relire par l'avocat les textes de l'écran d'installation et de la page « Ce que l'agent capte » : ce sont des engagements.
