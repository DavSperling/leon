# Le marketing

19/10/2026 · Étape `founder-marketing` du pack. Sources : `panel/results.md` (100 acheteurs simulés, 18 % achètent), `panel-v2/results.md` (« Le pilote 30 jours » refait sur 20 des mêmes acheteurs, 45 % lancent le pilote), `competitors.md`, `offer.md`, `pricing.md`, `numbers.json`, `cfo.md`, `board.md`.

**À lire avant tout :**
- Les acheteurs du panel sont **simulés**. Leurs phrases servent à choisir les messages. Ce ne sont pas des clients : **on ne les cite jamais dans une pub, un post ou une page**.
- Dans le second test, « oui » veut dire « je lance le pilote gratuit », pas « je paie ». Le passage du pilote au paiement est inconnu.
- Ce n'est pas un conseil juridique. Les règles de publicité citées plus bas sont à faire vérifier par l'avocat qui relit déjà les CGV et le DPA.

## Les hypothèses de ce plan

| hypothèse | valeur retenue | d'où elle vient |
|---|---|---|
| Date de lancement | **mardi 12 janvier 2027** | Le plan précédent visait le 12/01/2027. **C'est une hypothèse**, à confirmer par David et Amos. Elle suppose que le dossier confiance, l'audit des partages et le test des 10 questions sont prêts avant. |
| Budget marketing | **environ 1 000 € sur les 30 jours** | Aucun budget n'est fixé (« les fondateurs mettront ce qu'il faut »). C'est **une proposition**, volontairement petite. |
| Capacité de pilotes | **6 pilotes installés en janvier** | Estimation : une heure d'installation chacun plus le suivi, à deux fondateurs. Le CFO compte environ 3 pilotes par mois ensuite. |
| Offre de lancement | 19 € HT par utilisateur actif, garantis 12 mois, pour les 20 premières sociétés, contrat signé **avant le 31 mars 2027** | `pricing.md`. Prix public normal : 25 €. Pas de faux prix barré. |

## 1. La cible : qui on vise, qui on ne vise pas

### Qui on vise

**Le comportement qui achète, c'est « Noyé dans les outils » : 65 % d'achat (13 sur 20) au premier panel, 88 % (7 sur 8) au second.** La moyenne est à 18 %. Leur description : « dix à trente logiciels, personne ne sait où est quoi, cherche une solution unique depuis des mois ».

Dans quel type de société on les trouve (premier panel, parmi les 20 « noyés ») :

| type de société | noyés | achètent |
|---|---:|---:|
| Dirigeant fondateur de société de services (agence, conseil, ESN), 10-40 personnes | 8 | 5 |
| CEO ou COO d'un éditeur SaaS ou d'un e-commerce, 20-80 personnes | 6 | 4 |
| DG de PME industrielle ou de distribution, 80-200 personnes | 3 | 2 |
| Responsable des opérations, 50-200 personnes | 3 | 2 |

**Première audience : dirigeants de sociétés de services et d'éditeurs SaaS de 10 à 80 personnes, qui empilent Google Workspace, un CRM, Notion ou Jira et un outil de visio.**

### Les moments qui déclenchent l'achat

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

### Ce que le marketing ne vise pas

| groupe | taux d'achat | pourquoi on ne le vise pas maintenant |
|---|---:|---|
| **Prudents sécurité et RGPD** | 0 sur 16 (panel 1), 0 sur 4 (panel 2) | Ils demandent une certification ISO 27001 ou SOC 2, une installation sur leur cloud et des références. Un dossier ne suffit pas. On y reviendra avec l'offre « Dédiée » et des références. |
| **Déjà sur ChatGPT Business, Claude Team ou Copilot** | 0 sur 5 (panel 1), 0 sur 2 (panel 2) | Ils ne paieront pas deux fois. Il faudrait que Leon se branche sur leur outil (par MCP) et le prouve chiffres en main. Pas avant d'avoir cette preuve. |
| Sceptiques des démos IA | 0 sur 9 (panel 1) | Ils veulent voir sur leurs données, pas sur un post. Ils viennent après les premières références. |
| Pas encore équipés en IA | 6 % (panel 1) | Il faudrait d'abord leur vendre l'IA. Trop long pour deux fondateurs. |
| Équipes qui vivent dans Slack | 0 sur 9 | Slack interdit le stockage : Leon interroge Slack à la volée, comme Claude. Notre avantage y est faible. |
| DG de PME industrielle de 80-200 personnes, en général | 12 % | Cycle long (responsable informatique, DPO, CSE). Seulement s'ils sont « noyés » et viennent par le réseau. |

Concrètement : pas de message sur la sécurité comme argument principal, pas de comparaison « mieux que votre ChatGPT », pas de ciblage des secteurs réglementés (santé, banque, juridique) au lancement.

## 2. Le positionnement

### Trois versions

**A. Le départ**
> Pour les dirigeants de sociétés de 10 à 200 personnes **qui viennent de perdre quelqu'un qui avait tout en tête**, Leon est **la mémoire d'entreprise** qui retrouve ce qu'il a dit, promis et décidé, avec la source exacte, **contrairement à l'appel à l'ancien collègue en espérant qu'il se souvienne**.

**B. Ce qui a été promis au client** *(recommandée)*
> Pour les dirigeants de sociétés de 10 à 80 personnes **noyés dans leurs outils, qui ne retrouvent plus ce qui a été promis à un client quand quelqu'un part ou qu'un client conteste**, Leon est **la mémoire d'entreprise** qui retrouve ce qui a été dit et décidé, cite le mail ou la réunion d'où vient la réponse, et dit « je ne sais pas » quand il ne sait pas, **contrairement aux assistants IA qui cherchent au moment de la question et ne gardent rien**.

**C. Un seul endroit**
> Pour les dirigeants **dont l'équipe jongle avec dix à trente logiciels et ne sait plus où est quoi**, Leon est **la mémoire d'entreprise** qui rassemble ce qui se dit et se décide dans tous ces outils, **contrairement à la recherche outil par outil**.

### La recommandation : B

- **Elle parle à ceux qui achètent.** Les « noyés » achètent à 65 % puis 88 %. Leur raison d'acheter, mot pour mot dans le panel, est presque toujours « retrouver ce qui a été dit et décidé » ou « qui a promis quoi » (P011, P012, P015, P058, P067, P097, P100).
- **Elle porte les deux déclencheurs à la fois.** Le départ (36 % d'achat) et le client qui conteste (la phrase la plus claire) racontent la même perte : une promesse faite à un client qu'on ne retrouve plus.
- **Elle ne ressemble pas aux concurrents.** Dropbox Dash, GoSearch, Onyx, Slite, Gemini et Copilot se vendent comme « recherche d'entreprise » ou « réponses IA sur vos applis » (`competitors.md`). « Ce qui a été promis au client » est un résultat, pas une catégorie technique.
- **Elle répond aux plaintes réelles du marché.** Les plaintes n°2 et n°3 sur les concurrents sont « le connecteur ne trouve rien » et « les réponses sont fausses ». La source citée et le « je ne sais pas » y répondent.
- **Pourquoi pas A seul** : le départ est un moment rare dans une société donnée. Il ouvre la porte, il ne suffit pas pour toute une année de messages.
- **Pourquoi pas C** : c'est la promesse que huit concurrents font déjà autour de 20 $ (`competitors.md`, « le trou »). Elle nous rend interchangeables.

**Attention, dans les messages publics, on ne nomme pas ChatGPT, Claude ou Copilot.** La publicité comparative est permise en France seulement si elle compare des choses objectives et vérifiables, sans dénigrer (Code de la consommation, articles L122-1 et suivants). La comparaison chiffrée reste pour l'entretien, sur les données du client.

## 3. Les canaux

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

## 4. La campagne de 30 jours (29 décembre 2026 au 28 janvier 2027)

### Ce qui doit être prêt avant J-14

- La page du pilote : le pitch de `pitch.md`, un formulaire de réservation, le dossier confiance à télécharger.
- Le dossier confiance relu par l'avocat (déjà budgété : 2 500 € dans `numbers.json`).
- L'audit des partages et le test des 10 questions qui marchent sur un vrai Google Workspace.
- **Le test de Leon sur nos propres outils** : 10 questions dont on connaît la réponse, score réel noté. C'est le seul « chiffre » qu'on publie au lancement.
- La liste de cibles : 80 dirigeants du réseau des deux fondateurs, triés « noyés » ou non, avec le déclencheur connu s'il y en a un.

### Le calendrier

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

### Les 10 accroches

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

## 5. Le budget (proposition)

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

## 6. Le maximum à payer pour gagner un client

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

## 7. Les trois chiffres à regarder chaque semaine

À noter chaque vendredi, dans un simple tableau partagé.

| chiffre | objectif | seuil qui veut dire « on change quelque chose » | quoi changer |
|---|---|---|---|
| **1. Taux de réponse aux messages personnels** (réponses ÷ messages envoyés) | ≥ 25 % | **< 10 %** après 40 messages | L'accroche, ou la liste : on écrit peut-être à des gens qui ne sont pas « noyés » |
| **2. Pilotes lancés** (et la part des rendez-vous qui deviennent des pilotes) | 1 à 2 pilotes par semaine ; ≥ 30 % des rendez-vous | **0 pilote deux semaines de suite**, ou **< 20 %** après 8 rendez-vous | L'offre ou la confiance : revoir ce que les dirigeants ont refusé, mot pour mot. Le panel annonce 45 % ; s'il y a un gros écart, le panel s'est trompé. |
| **3. Usage dans les pilotes** (part des utilisateurs du pilote qui posent au moins 2 questions dans la semaine) | ≥ 60 % | **< 40 %** en semaine 2 d'un pilote | L'installation et les recettes. C'est le signal avancé de « dans deux mois, plus personne ne s'en servira » et du passage au paiement. |

Ensuite, dès la fin des premiers pilotes (mi-février) : **le score au test des 10 questions** (plusieurs acheteurs ne paieront qu'à 8 sur 10 : P007, P015, P017, P018) et **le taux de pilotes qui deviennent payants**. Ce dernier est le chiffre qui manque le plus à tout le plan.

## Suite

`/founder-brand` (le nom « Leon » est à revoir, voir l'étude du 18/10), puis `/founder-launch`.
