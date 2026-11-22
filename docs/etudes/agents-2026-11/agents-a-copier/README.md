# Les agents à copier : cinq agents de départ

22 novembre 2026 · David (avec Claude) · à relire par Amos

Trois relevés du même jour : [Dust](01-dust.md) (site et documentation lus directement, 58 cas clients), [Glean](02-glean.md) (bibliothèque de 33 agents, lue directement, 35 cas clients), [les autres produits pour petites équipes](03-autres.md) (Fyxer, Superhuman, Fathom, Fireflies, Lindy, Copilot… par recherche web seulement, aucune page d'éditeur ouverte).

## La réponse courte

1. **Les trois relevés tombent sur les mêmes agents.** Fin de réunion, brief avant rendez-vous, brouillon de réponse, relances : ce sont eux que les clients citent, chez Dust comme chez Glean et chez les vendeurs d'agents tout faits.
2. **Dust ne livre presque rien de tout fait.** Ses agents par défaut sont des assistants de question-réponse. Tout le reste, le client le construit. Dust n'a aucun agent « répondre aux mails » : la référence, c'est Fyxer.
3. **Glean livre 33 agents prêts**, chacun avec ses étapes publiées. C'est la meilleure source pour copier un déroulé.
4. **Partout, l'agent prépare et l'humain valide.** Fyxer n'envoie jamais. Dust demande confirmation avant toute écriture.
5. **Beaucoup d'agents meurent.** Chez Spendesk, sur 11 agents nés d'un hackathon, un seul servait encore six mois après [cas publié par Dust]. D'où : peu d'agents, choisis sur preuve.

## Les cinq agents de départ

Classés par ce que les trois relevés prouvent, et par ce que notre donnée permet.

| # | Agent | Ce qui le réveille | Ce que la personne reçoit | Qui le fait déjà | Preuve |
|---|---|---|---|---|---|
| 1 | Suite de réunion | La transcription d'une réunion arrive | Un résumé, un brouillon de mail de suivi, la fiche CRM mise à jour, les tâches créées | Glean (Meeting recap, exemple « appel transcrit »), Dust (ContractSafe, PayFit, Watershed), Fyxer, Fathom, Fireflies | PayFit : relance écrite en 2 minutes au lieu de 7. ContractSafe : 1 à 2 heures gagnées par affaire. Chiffres des clients |
| 2 | Brouillon de réponse | Un mail arrive et attend une réponse | Un brouillon dans sa boîte, écrit dans son style, jamais envoyé | Fyxer, Glean (exemple « nouvel email », Ghostwriter) | Fyxer : 41 millions de brouillons déclarés. Seul gain mesuré par un essai indépendant : 2 heures de mail en moins par semaine ([annexe 2](../annexes/02-preuves-utilite.md)) |
| 3 | Brief avant rendez-vous | L'agenda, un peu avant le rendez-vous | Qui est en face, où en est le dossier, ce qui a été promis | Glean (Account snapshot), Dust (accountSnapshot, Contentsquare, PayFit), Lindy, Copilot | Contentsquare : 15 minutes au lieu d'heures. Storable : 90 % de préparation en moins. Chiffres des clients |
| 4 | Relance | Un mail envoyé reste sans réponse | Le fil remonte, avec un brouillon de relance | Superhuman (Auto Reminders), Glean (Delegation tracker, Intelligent reminders) | Superhuman : 60 % des brouillons envoyés sans retouche, en bêta, déclaré |
| 5 | Point du jour | Le matin | Agenda, mails qui attendent, tâches, et ce que les agents ont préparé | Glean (Plan my day), Claude Cowork | L'agent quotidien de Storable est l'un des plus exécutés. Aucun chiffre ailleurs |

## Ce que chacun demande chez nous

| # | Agent | Donnée à lire | À écrire | Ce qui manque aujourd'hui |
|---|---|---|---|---|
| 1 | Suite de réunion | Un des huit enregistreurs, le CRM, les mails | Brouillon Outlook ou Gmail ; HubSpot ou Attio ; Linear, Asana, Jira ou Notion | Aucun enregistreur essayé sur un vrai compte. Les fiches de CRM (affaires, contacts) ne sont pas relevées. Aucune écriture hors GitHub |
| 2 | Brouillon de réponse | Les mails, la fiche de la personne (son style) | Brouillon Outlook ou Gmail | Les destinataires des mails (en cours d'ajout). La fiche. Gmail n'est relevé que quatre fois par jour |
| 3 | Brief avant rendez-vous | L'agenda Outlook, les mails, le CRM | Rien | Pas d'agenda Google. Aucun moyen de prévenir la personne hors de l'application |
| 4 | Relance | Les mails envoyés et leurs destinataires | Brouillon | Les destinataires. Les fils incomplets |
| 5 | Point du jour | Agenda, mails, tâches | Rien | Le point du matin actuel ne couvre que les équipes de code |

Trois briques reviennent dans presque tous : **la fiche de la personne** (pour écrire comme elle), **le brouillon dans sa boîte** (Outlook et Gmail), **un réveil** (horloge et arrivée d'un élément). C'est l'ordre de construction : la donnée, la fiche, puis ces trois briques, puis les agents.

## « À la fin d'un Zoom »

Leon ne relève ni Zoom, ni Google Meet, ni Teams. Glean les lit directement. Chez nous, la source d'une réunion est l'enregistreur du client (Fathom, Fireflies, Granola, tl;dv, Circleback, Claap, Gong, Leexi). Deux voies :

- **Tout de suite** : l'agent 1 marche pour les clients qui ont un enregistreur.
- **Plus tard** : un connecteur Zoom ou Teams. Dust a ajouté les transcriptions Teams en avril 2026, et ses cas clients français (Applium, DataValue Strategy) s'en servent.

## Les suivants, quand les cinq tournent

- **Brouillon de réponse aux tickets de support.** Les agents les plus utilisés chez Electra et Malt [cas publiés par Dust]. Nous lisons huit outils de support, mais nous n'avons le droit d'écrire dans aucun.
- **Questions internes dans Slack.** L'usage le plus massif relevé (McCarthy : 40 000 exécutions chez Glean ; Persona : 80 % des salariés chez Dust). Il demande d'écrire dans Slack, et les conditions de Slack sur la lecture restent à trancher.
- **Mail de prospection en brouillon.** Alma : 90 % de l'équipe de vente [cas publié par Dust]. Demande une recherche web que nous n'avons pas.
- **Bilan de la semaine.** Meilleure preuve d'usage chez Glean (Zillow : environ 10 000 exécutions), surtout utile à partir de 50 salariés.
- **Appels d'offres et questionnaires de sécurité.** Cités chez Dust (Persona, Kyriba).

## Ce qu'on ne copie pas

- **Les agents de recherche et d'analyse génériques** : inclus dans ChatGPT, Claude et Copilot.
- **Les agents qui répondent seuls au client** (Fin d'Intercom, Breeze de HubSpot) : ils se vendent à la résolution, par les éditeurs de support.
- **La galerie où chacun crée son agent** : c'est elle qui produit les agents morts.

## Limites

- Presque tous les chiffres viennent des clients ou des éditeurs. Aucun avis d'utilisateur indépendant n'a été lu.
- Le relevé des autres produits repose sur des résumés de recherche. Ses délais et ses pourcentages sont à revérifier.
- Glean ne publie aucun nombre d'exécutions par agent de sa bibliothèque, et Dust aucun classement.
- Les cas clients ne sont pas datés.
