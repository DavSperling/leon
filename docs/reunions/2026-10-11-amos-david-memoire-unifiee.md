# Réunion Amos x David : mémoire unifiée

Oct 11, 2026 · Zoom, 13h01 · Amos Koskas, David Sperling · @koskas amos

## Prochaines étapes

Priorité n°1 : vérifier ce soir, chacun avec son Claude, si on peut bypasser le call MCP. Point d'étape par écrit dans la soirée.

- [ ] Amos et David : tester la faisabilité du bypass MCP, retour ce soir
- [ ] Amos : projections de coûts (fine tuning, GPU, stockage) et tableau de pricing par scénario, via des simulations Claude
- [ ] Amos : estimer le coût d'un pilote selon le niveau d'usage, pour fixer un plafond
- [ ] Amos : envoyer la transcription et son adresse mail à David
- [ ] David : ouvrir le GitHub privé partagé
- [ ] David : comparer les langages et la stack
- [ ] David : retrouver le nom du gestionnaire de terminaux multi agents
- [ ] Les deux : créer le task manager partagé (Notion plutôt que Linear)
- [ ] Ensuite : une ou deux personnes sur le fine tuning, et en parallèle démarrage du SaaS et d'un site vitrine minimaliste

## Proposition de valeur

Le produit : une mémoire unifiée, un contexte partagé entre les LLM et les SaaS d'une entreprise.

- Côté LLM : Claude, GPT, Gemini, Cursor, Copilot.
- Côté outils : Gmail, Slack, Monday, CRM. Le problème, c'est qu'il en existe des milliers.
- Pour Amos, le besoin de contexte entre LLM est concret aujourd'hui, et le croisement avec les SaaS élargit les usages.
- David veut être sûr qu'on règle un vrai problème et que ce soit facile à vendre, pas un produit dont personne n'a besoin.
- Réponse d'Amos : le use case se construit aussi avec le produit (ChatGPT en 2022, Docker à ses débuts). On est entre les deux : un besoin réel, et des usages qui se révéleront à l'adoption.

## Différenciation : bypasser le call MCP

L'axe le plus disruptif pour les deux : aller chercher le contexte nous-mêmes au lieu de dépendre d'un call MCP.

- Problème actuel : les solutions de mémoire existantes (type Supermemory) passent par un call MCP. Elles dépendent donc du LLM, qui est paresseux pour faire ce call. C'est le premier sujet qui remonte sur Reddit en cherchant « super memory ».
- Notre approche : remonter la donnée directement depuis les sources et la trier nous-mêmes, sans attendre que le LLM appelle l'outil.
- Le MCP reste utile en lecture, quand l'utilisateur interagit avec sa mémoire depuis son LLM. Ce coût-là est porté par l'abonnement Claude du client.
- Intérêt selon David : barrière à l'entrée face aux concurrents et maîtrise de la donnée.
- Hypothèse d'Amos : les autres font du MCP parce que c'est plus simple, mais le surcoût technique du bypass ne devrait pas être énorme.
- Plan B si c'est irréalisable : MCP classique.

## Tri de la mémoire et produit

Le tri se ferait avec un petit modèle fine tuné : il a besoin de peu de contexte, donc il coûte peu si on a du GPU.

- La tâche est simple pour le modèle : recevoir de la donnée, l'organiser, juger ce qui est pertinent.
- Difficulté : la pertinence dépend de l'industrie. Une boîte de BTP, de SaaS ou de formation ne cherche pas la même chose. C'est un travail humain d'entraînement, à affiner dans le temps.
- Alternative : des modèles préexistants, sans fine tuning.
- Interface : organisation en arborescence façon éditeur de code, lisible et dev friendly. Amos aime la présentation de l'outil « Contexte » montré par David.
- Vue par SaaS : on clique sur Slack et on voit tout ce qui en est remonté de pertinent.
- Design : pas une priorité. SaaS brut au départ. Site vitrine propre et minimaliste, nécessaire pour vendre, même si les ventes viendront surtout du démarchage.

## Coûts et pricing

Le pricing est le nerf de la guerre : il faut chiffrer chaque scénario avant de fixer un tarif.

| Scénario de coût | Postes de coût | Remarque |
| --- | --- | --- |
| 1. Modèle standard via API | Tokens | Risque de revenir cher, surtout sur les tâches lourdes |
| 2. Même chose avec un modèle moins cher | Tokens | Option pour réduire la facture |
| 3. Modèle fine tuné, en local ou loué | GPU, coût du modèle, stockage | Piste qui semble la moins chère à l'usage |

Deux modèles de pricing à comparer pour chaque scénario :

- À l'usage, comme les API Claude et GPT : de plus en plus répandu, et on est sûr de ne pas perdre d'argent.
- Abonnement mensuel.

Amos s'inquiète surtout des coûts d'usage. David lui laisse la main sur ce sujet.

## Pilotes et MVP

Objectif : un MVP au plus vite, testé d'abord par nous, puis chez une ou deux PME proches en pilote.

Critère de choix : des dirigeants investis dans une boîte qui tourne, pas des profils volatils qui s'accrochent à tout.

| Piste | Contact | Ce qu'on sait |
| --- | --- | --- |
| Appli santé | Mentor d'Amos à l'EM | Une quinzaine de personnes, boîte qui marche, CA autour de 1 M€ (à confirmer) |
| Contact de David (nom peu clair dans la transcription, « Lucas » ?) | David | Validé comme pilote possible par les deux |
| Boîte d'un ami aux États-Unis | David | Équipes de développeurs, mais « un peu requins » |
| Cabinets d'experts comptables | Réseau d'Amos | À explorer |
| Rénovation énergétique (PAC, photovoltaïque) | Potes d'Amos, clients des robots d'appel de David | Gros budgets : des clients de David mettaient 20 000 € par mois dans sa solution un mois après la rencontre |

Use case pour la rénovation énergétique : une mémoire unifiée sur le CRM et Gmail, pour le dirigeant seulement. Il demande à son Claude l'historique d'un client (ce qu'on lui a posé, à quel prix, s'il paie encore). Ça joue le rôle d'une secrétaire ou d'une confirmatrice. Un dirigeant du secteur a dit à Amos qu'il voulait utiliser deux outils sans pouvoir les relier. Question ouverte : leur CRM le fait-il déjà ? A priori non.

Pilote gratuit ou payant :

- David : gratuit, parce que ça nous apporte énormément et qu'on trouvera plus facilement des pilotes. Si un pilote veut payer, tant mieux.
- Amos : le gratuit peut coûter très cher en usage, abîme la valeur perçue et rend la transition vers le payant difficile. Offrir, c'est « du négatif », à réserver à une ou deux personnes.
- Compromis évoqué : un plafond d'usage offert par pilote, calibré grâce aux projections.

## Nom

Idée d'Amos : un prénom un peu vieillot et attachant, plutôt qu'un énième nom de SaaS. Rien n'est tranché.

- Pour : catchy, humanise le produit, se retient, plaît aux États-Unis (un French name), moins de risque de nom déjà déposé.
- Références : Claude (hommage à Claude Shannon), Uber (Amos y voit le prénom Hubert, David note que ça vient de l'allemand « au-dessus »), Albert.
- Réserve de David : ne pas faire gadget, la mode des prénoms est très répandue.

| Nom | Origine | Remarques |
| --- | --- | --- |
| Léon | Grand-père d'Amos | Les deux aiment bien. leon.com pris (un assistant personnel), Léon AI existe aussi |
| Marcel | Grand-mère de David, deuxième prénom de Liel | Amos adore, David le trouve pas beau à l'écrit |
| Michel | Grand-mère d'Amos | Prénom très courant selon David, domaine affiché à 1 784 758 € |
| Maurice | Grand-père de David | Déjà associé au café de Moïse Sfez |
| Mamie | Idée d'Amos | Variante plus familière |
| Marc | Beau-père de David | Évoqué en passant |

Option si le domaine seul est pris : prénom + mot clé (ex. « Léon Memory »). Amos ne veut pas y passer trois heures, mais le nom du repo risque de devenir celui de la boîte.

## Stack et outils

Stack non tranchée : Rust séduit pour coder avec l'IA, React reste plus confortable.

- Rust (proposé par David) : typage strict, les erreurs sortent à la compilation, recommandé par beaucoup pour coder avec l'IA. Plus coûteux en tokens. Amos est partant pour explorer, sans connaître le langage.
- React : bons composants. Amos n'aime pas React Native, choix par défaut de Claude, aux arborescences très lourdes.
- Gestionnaires de terminaux : pour faire travailler plusieurs agents ensemble et choisir le bon modèle par tâche (Opus, Sonnet). David doit retrouver le nom de l'outil (« Mux » ?).
- Setup actuel d'Amos : Claude avec le plugin OpenAI. Claude garde la réflexion et la planification, l'exécution de code simple part chez OpenAI. Ça marche bien.
- Organisation : GitHub privé partagé, Notion plutôt que Linear pour les tâches et le contexte.

## Points ouverts

Cinq sujets restent à trancher, dont deux où vous n'êtes pas d'accord (deadline et pilote gratuit).

| Sujet | Amos | David |
| --- | --- | --- |
| Bypass MCP | Prioritaire, à valider techniquement | D'accord, vérification ce soir |
| Deadline du MVP | Pas de deadline, au plus vite | En voulait une |
| Pilote gratuit ou payant | Payant à l'usage, ou gratuit plafonné | Gratuit |
| Stack | Partant pour Rust, contre React Native | Penche pour Rust, à étudier |
| Nom | Marcel ou Léon | Léon plutôt que Marcel |
