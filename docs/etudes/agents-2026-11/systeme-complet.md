# Leon, système d'agents pour toute la société : proposition

19 novembre 2026 · David (avec Claude) · à relire par Amos

Suite de la [synthèse du même jour](README.md). Elle recommandait quatre recettes prudentes, en brouillon. David a tranché dans l'autre sens : des agents qui agissent, pour tous les services, qui travaillent en continu. Ce document dit comment le construire. C'est une proposition de conception, raisonnée à partir des huit [annexes](annexes/) et du code. Rien n'y est validé par un client, et les coûts et efforts sont mes estimations.

## L'idée en une phrase

**Un seul moteur, branché sur la mémoire, qui fait tourner un catalogue d'agents livrés tout faits : chaque chose qui entre dans la société est lue, orientée vers l'agent qui sait la traiter, et traitée.**

Ce qui nous distingue d'un Claude ou d'un Dust : leurs agents partent de zéro à chaque exécution et cherchent en direct, pour une seule personne. Les nôtres ont déjà tout lu, pour toute l'équipe, avec l'historique et les droits de chacun.

## Les cinq étages du système

| Étage | Ce qu'il fait | Ce qui existe | Ce qui manque |
|---|---|---|---|
| 1. La mémoire | Tout ce qui se dit et s'écrit, avec les droits d'origine | 42 connecteurs, recherche, droits par personne | Essais réels (3 sur 42), fiches de CRM, Google Agenda, Teams |
| 2. Le standard | Lit chaque élément qui entre et décide quel agent s'en occupe | Signal après indexation d'un élément | Le tri lui-même, les webhooks |
| 3. Le moteur | Exécute un agent : contexte tiré de la mémoire, enchaînement court, action | Boucle d'outils, tâches planifiées, plafonds en base | Exécution sans discussion ouverte, budget par société |
| 4. Les mains | Écrit dans les outils | Mécanisme complet pour GitHub ; droits d'écriture accordés sur 11 outils | Une fonction d'écriture par outil, envoi de mail |
| 5. Le poste de contrôle | Montre ce qui tourne, ce qui a été fait, ce qui attend, et permet d'annuler | Carte d'action, journal des actions | L'écran, les messages sortants (mail, Slack) |

### Le standard, pièce centrale

C'est lui qui fait que les agents « travaillent sans arrêt ». Aujourd'hui, un élément relevé est indexé et attend qu'on le cherche. Demain, il passe par un tri rapide : « c'est un mail client qui attend une réponse », « c'est une fin de réunion », « c'est un ticket de bug ». Le tri réveille le bon agent.

Coût estimé du tri (mon calcul) : avec le petit modèle à 0,1 $ le million de jetons en entrée, un élément de 1 500 jetons coûte environ 0,02 centime. À 300 éléments par personne et par jour, cela fait environ 1,20 $ par personne et par mois. Les volumes sont une hypothèse.

Trois façons de réveiller un agent :

- **Un événement** : un élément entre (mail, ticket, réunion, fusion de code).
- **L'horloge** : chaque matin, chaque lundi, chaque fin de mois.
- **Une veille** : quelque chose n'est pas arrivé (pas de réponse depuis cinq jours, tâche en retard).

### Un agent est une fiche, pas du code

Chaque agent se décrit par cinq champs : ce qui le réveille, ce qu'il va chercher dans la mémoire, les étapes, les actions permises, son niveau d'autonomie. Ajouter un agent, c'est écrire une fiche. C'est ce qui rend « plein d'agents » tenable à deux.

L'éditeur pour que le client écrive ses propres fiches en découle, et vient en dernier.

### Le curseur d'autonomie

Trois crans par agent : **propose**, **agit et prévient**, **agit seul**. Tout agent démarre au premier. Leon mesure la part de propositions acceptées sans correction et propose de monter d'un cran quand elle est haute. Un agent peu accepté est signalé, puis coupé.

Une seule règle fixe : un agent réveillé par un contenu venu de l'extérieur (un mail d'inconnu, un ticket) ne peut pas, sans clic, écrire vers l'extérieur. Les écritures internes (CRM, tâches, tickets, documents) peuvent partir seules. Microsoft, OpenAI et Salesforce se sont fait prendre faute de cette séparation ([annexe 7](annexes/07-faisabilite-risques.md)).

## Le catalogue, service par service

« Prêt » veut dire que les connecteurs et les droits d'écriture existent dans le code, pas qu'ils ont été essayés.

### Pour chaque salarié

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Boîte mail | Mail reçu | Classe, répond aux mails simples avec l'historique, prépare les autres | Prêt pour Outlook en brouillon ; envoi à ajouter |
| Agenda | Demande de rendez-vous | Propose des créneaux, crée le rendez-vous | Prêt pour Outlook ; Google Agenda manque |
| Brief | 30 minutes avant un rendez-vous | Envoie qui, quoi, ce qui a été promis | Calendrier présent ; envoi manque |
| Point du matin | 7 h | Ce qui attend, ce qui a bougé, ce que les agents ont fait | Existe pour le code seulement |
| Mes suites | Fin de réunion | Liste ce que j'ai promis, crée mes tâches | 8 outils de réunion relevés |

### Commerce

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Suivi d'échange | Fin d'appel ou de réunion client | Met à jour la fiche, crée les tâches, envoie le mail de suivi | HubSpot et Attio en écriture |
| Relances | Veille quotidienne | Repère devis et mails sans réponse, relance | À construire |
| Hygiène du CRM | Chaque nuit | Complète les fiches depuis les mails et les appels | Fiches de CRM à relever |
| Appels d'offres | Questionnaire reçu | Remplit depuis les réponses passées et les documents | Drive en écriture |
| Client à risque | Veille | Croise tickets, ton des mails, silence, et alerte | À construire |

### Support et service client

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Tri | Nouveau ticket | Classe, assigne, joint l'historique du client | 8 outils de support en lecture ; écriture à vérifier |
| Réponse | Nouveau ticket | Répond aux questions déjà résolues, prépare les autres | Idem |
| Escalade | Ticket de bug | Crée le ticket technique avec le contexte et les cas voisins | Linear et Jira en écriture |
| Base d'aide | Ticket résolu | Écrit ou corrige l'article correspondant | Notion et Confluence en écriture |

### Projets et production

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Compte-rendu | Fin de réunion | Rédige, range, crée les tâches | Asana, Linear, monday en écriture |
| Point client | Chaque vendredi | Écrit l'état d'avancement à envoyer au client | Envoi manque |
| Retards | Veille | Repère les tâches bloquées et ce qui les bloque | À construire |
| Hors périmètre | Demande client | Compare la demande au devis et au contrat, signale l'écart | Drive lu ; à construire |

L'agent « hors périmètre » répond à l'un des deux déclencheurs d'achat du panel : « un client qui conteste ».

### Produit et développement

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Bug connu ? | Erreur Sentry ou ticket | Cherche les cas passés, crée ou complète le ticket | Sentry lu, GitHub en écriture |
| Retours clients | Ticket, appel, mail | Range les demandes dans Productboard, avec le client | Productboard en écriture |
| Notes de version | Fusion de code | Rédige ce qui change, pour l'équipe et pour les clients | GitHub prêt |
| Revue de code | Demande de revue | Rappelle les décisions passées et les tickets liés | GitHub prêt, le plus avancé |

### Direction

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Point de la semaine | Lundi | Ce qui s'est décidé, gagné, perdu, ce qui coince | À construire, sur les sources partagées |
| Préparation de comité | Avant la réunion | Rassemble les chiffres et les sujets ouverts | À construire |
| Décisions | Veille | Repère deux documents ou décisions qui se contredisent | À construire |

### Équipe et ressources humaines

| Agent | Réveil | Ce qu'il fait | État |
|---|---|---|---|
| Accueil | Arrivée d'un salarié | Prépare son parcours : qui fait quoi, les dossiers en cours, les règles | En partie par la discussion |
| Passation | Départ annoncé | Rédige le dossier de passation depuis tout ce que la personne a traité | À construire |
| Questions internes | Question dans Slack ou Teams | Répond à la place de l'expert, avec la source | Canal entièrement à écrire |
| Gardien de la doc | Chaque semaine | Signale les pages périmées et propose la correction | Notion et Confluence en écriture |

L'agent « passation » répond à l'autre déclencheur du panel : « un chef de projet qui part ». Lui et le « gardien de la doc » ne sont possibles qu'avec la mémoire : ce sont nos deux agents les plus difficiles à copier.

### Finance et administration

Relances d'impayés, pièces manquantes, rapprochement : rien n'est possible aujourd'hui, faute de connecteur de facturation, de banque ou de comptabilité. Pennylane et Qonto exposent chacun un serveur MCP depuis 2026 ([annexe 6](annexes/06-besoins-pme-francaises.md)) : c'est la voie la plus courte. À faire après le reste.

## Ce que voit le client

1. **Il branche ses outils.** Les agents correspondants s'allument tout seuls : pas de CRM branché, pas d'agents de commerce affichés.
2. **Leon lui montre le passé.** « Sur les deux dernières semaines, voici ce que vos agents auraient fait » : tant de fiches mises à jour, de tickets triés, de relances. C'est la démonstration, et elle ne demande aucun réglage.
3. **Il active.** Par service ou tout d'un coup, en mode « propose ».
4. **Il valide là où il travaille.** Un message par jour, dans sa boîte ou dans Slack, avec les boutons. Le poste de contrôle reste dans l'application pour le détail.
5. **Il voit le compteur.** Actions faites, temps estimé, part acceptée. C'est aussi notre mesure d'utilité, que personne n'a en PME.

Plus tard : Leon propose lui-même de nouveaux agents, à partir de ce que chacun redemande sans cesse à ChatGPT ou à Claude (l'extension le capte déjà) et des gestes répétés dans les outils. La proposition va à la personne, jamais à son manager.

## Ordre de construction

Estimations de ma part, pour deux fondateurs aidés d'agents de code. Chacune peut doubler au premier essai réel.

| Étape | Contenu | Durée estimée |
|---|---|---|
| 0 | Brancher notre propre société en vrai : Google ou Microsoft, un CRM, un outil de réunion, un outil de tâches, un outil de support | 1 à 2 semaines |
| 1 | Les mains : actions généralisées hors GitHub, sur six outils (CRM, tâches, tickets, documents, mail, agenda) | 3 à 4 semaines |
| 2 | Le moteur et les fiches d'agent, le budget par société, le curseur d'autonomie | 3 semaines |
| 3 | Le poste de contrôle et les messages sortants (mail, puis Slack) | 2 à 3 semaines |
| 4 | Le standard : tri de tout ce qui entre, puis les webhooks des outils principaux | 3 semaines |
| 5 | Première vague de huit agents | 3 à 4 semaines |
| 6 | La démonstration par le passé | 1 à 2 semaines |
| 7 | Deuxième vague, connexion Google directe, plusieurs instances | Ensuite |

**Première vague proposée** (un agent par service, pour montrer « toute la société » dès la démonstration) : boîte mail, brief, suivi d'échange, tri des tickets, escalade de bug, compte-rendu de réunion, point de la semaine, passation.

Soit quatre à cinq mois avant un système présentable. C'est long sans client : je brancherais deux ou trois sociétés amies dès la fin de l'étape 3, avec deux agents seulement.

## Ce qui peut faire échouer

- **Des agents nombreux et médiocres.** Sur des tâches à plusieurs étapes, les agents autonomes réussissent 30 à 65 % du temps ([annexe 2](annexes/02-preuves-utilite.md)). Chaque agent doit rester un enchaînement court et fixe, et être coupé si sa part acceptée est basse. Un cas rapporté chez un client de Dust : 850 agents créés, une douzaine utilisés.
- **Le coût.** Un agent à dix appels d'outils coûte 0,15 à 0,60 $ par exécution sur le modèle moyen ([annexe 7](annexes/07-faisabilite-risques.md)). Dix exécutions par personne et par jour à 3 centimes font déjà environ 7 $ par mois. Il faut un budget par société dès l'étape 2, et un prix au-dessus de 25 €.
- **Une seule instance.** Tout tourne dans un processus. Des agents sur événement, nombreux, ne tiennent pas sans séparer les tâches de fond.
- **La fraîcheur.** Gmail, Drive et Slack sont relevés quatre fois par jour par Pipedream. Sans connexion directe, les agents de boîte mail arrivent trop tard.
- **Les conditions des éditeurs.** Slack interdit les copies durables de ses messages ; Google exige un audit de sécurité pour lire Gmail. Les deux touchent déjà le produit actuel.
- **La surveillance.** Un agent travaille pour une personne, sous ses droits. Un agent d'équipe ne lit que les sources partagées. Au-delà de 50 salariés, le CSE doit être consulté.
- **L'absence de client.** Tout ceci est une conception. Le premier essai réel peut déplacer l'ordre.

## Ce que cela change dans nos décisions

| Décision écrite | Ce que ce document en fait |
|---|---|
| « Leon lit ; il n'écrit pas » (25/10) | Renversée |
| « Un éditeur d'agents : à ne pas construire » (19/10) | Maintenue pour l'instant ; il arrive en dernier, comme conséquence des fiches |
| Abandon de l'extraction de faits (19/10) | Le standard lit de nouveau tout le flux, mais pour orienter, sans stocker de faits. Les veilles gardent un état court (« attend une réponse depuis le… ») : c'est une entorse à assumer |
| « Transformer un appel en tâches » écarté (25/10) | Renversée |
| Le mot « agent » absent du vocabulaire, « IA » pas un argument | À rediscuter : le produit devient un système d'agents |
| Cible : PME de tous secteurs | Je commencerais par les sociétés de services de 20 à 100 personnes, qui ont déjà CRM, tickets, tâches et réunions enregistrées |
| 25 € par siège | À revoir à la hausse, à tester |
