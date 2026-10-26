# Connecteur GitHub : accès complet au travail sur les dépôts

**Statut :** proposition à relire avant implémentation

**But :** donner à Léon un contexte fiable sur les dépôts GitHub choisis et lui permettre d'y agir, sans lui donner les commandes d'administration du compte.

## Constat dans le code actuel

- Le connecteur OAuth lit les dépôts de l'installation GitHub ; les dépôts choisis par l'utilisateur sont sélectionnés sur l'écran d'installation de GitHub. En revanche, `installedRepos(20)` tronque silencieusement la liste à 20.
- Avec un jeton personnel, il faut saisir les dépôts à la main, avec la même limite de 20.
- La synchronisation lit les tickets et pull requests, leurs commentaires, avis et commentaires de revue. Elle ne lit ni fichiers, ni branches, ni commits, ni résultats de CI.
- La discussion n'a pas d'outil d'inventaire GitHub ni d'outil d'action. Le client HTTP des connecteurs ne sait actuellement envoyer que des requêtes `GET` et `POST`.
- Le catalogue dit actuellement que l'accès OAuth permet aussi d'écrire, alors que Léon ne le fait pas. Le texte est corrigé dans cette PR.

## Périmètre proposé

### Lecture et inventaire

Pour chaque dépôt explicitement autorisé par l'utilisateur :

- inventaire paginé, sans limite arbitraire de 20, avec propriétaire, nom, visibilité, branche par défaut et droits effectifs disponibles ;
- branches et leurs commits récents ; commits, auteurs, dates, messages, différences et liens vers PR associées ;
- arborescence et contenu des fichiers, avec lecture à la demande plutôt que copie complète des dépôts dans Leon ;
- tickets et PR avec état, auteur, commentaires, revues, fichiers modifiés et historique pertinent ;
- workflows, exécutions, jobs et résultats de vérification (tests/CI), en distinguant les résultats réellement renvoyés par GitHub des suppositions du modèle.

Les résultats doivent venir de l'API GitHub au moment de la requête ou de données synchronisées avec une date de fraîcheur visible. Une liste partielle ne doit jamais être présentée comme l'inventaire complet. Les réponses indiquent les dépôts inaccessibles, les éléments omis et les limites de pagination ou de droits.

Les fichiers et commits sont consultés à la demande ; la synchronisation de tous les blobs n'est pas nécessaire pour obtenir un bon contexte et éviter de stocker une copie massive et vite périmée du code.

### Écriture sur les dépôts

Autoriser les opérations utiles au travail quotidien d'un développeur :

- tickets : créer, modifier, commenter, étiqueter, assigner, fermer et rouvrir ;
- branches et fichiers : créer une branche, créer/modifier/supprimer un fichier, proposer un commit ;
- pull requests : ouvrir, modifier, commenter, demander une revue, soumettre une revue, fermer et fusionner ;
- GitHub Actions : relancer ou annuler une exécution, et consulter les résultats.

L'écriture doit être guidée par un outil qui montre le dépôt, la branche, le contenu ou le diff et l'effet attendu, puis attend une confirmation explicite dans Leon avant d'envoyer la mutation à GitHub. Une demande du modèle seule ne vaut pas confirmation. Pour le code, afficher le diff exact et la branche cible avant confirmation. Les erreurs de droits doivent nommer la permission manquante sans exposer le jeton.

### Dépôts autorisés et droits

- Le choix des dépôts reste dans l'installation GitHub : l'utilisateur peut sélectionner certains dépôts ou tous les dépôts. Leon doit rendre cette sélection visible et permettre de retourner à GitHub pour la modifier.
- Au branchement, afficher les dépôts réellement accessibles. Ajouter une sélection explicite dans Leon si l'API et le flux d'installation le permettent ; ne jamais élargir silencieusement l'installation.
- Même si GitHub accorde un droit au niveau de l'application, Leon vérifie que le dépôt visé appartient à la liste autorisée de cette connexion.
- Configurer l'application GitHub avec les permissions de dépôt nécessaires au périmètre retenu : `Metadata: read`, `Contents: read/write`, `Issues: read/write`, `Pull requests: read/write`, `Actions: read/write`, et `Checks: read` pour les résultats CI. N'ajouter `Workflows: write` que si la modification des fichiers de workflow est explicitement retenue : GitHub distingue cette permission de l'écriture de code ordinaire.
- Les utilisateurs de jetons personnels à grain fin doivent accorder les permissions équivalentes et limiter le jeton aux dépôts voulus. Les droits réellement accordés doivent être lus ou vérifiés et affichés, pas supposés à partir du parcours de connexion.

## Hors périmètre de cette première version

Les opérations d'administration du compte et de l'organisation ne sont pas nécessaires pour aider à développer un dépôt : supprimer ou créer des dépôts, gérer les membres et équipes, modifier les règles de protection ou paramètres de sécurité, gérer les secrets/variables d'Actions, les webhooks, les runners ou les paramètres de facturation. Elles demandent des permissions supplémentaires et parfois des droits d'administrateur ; elles nécessiteraient un périmètre et des confirmations distincts.

Les déploiements et approbations d'environnements restent aussi exclus. Relancer une exécution Actions peut exécuter du code et consommer des ressources : cette action doit toujours être confirmée et signalée comme telle.

## Parcours de réalisation proposé

1. Corriger l'inventaire : pagination complète, retrait du plafond silencieux, sélection/affichage des dépôts et signalement des accès manquants.
2. Ajouter les lectures à la demande pour branches, commits, arborescence, fichiers, PR détaillées, checks et Actions.
3. Ajouter les outils d'écriture derrière une étape de confirmation obligatoire et un aperçu de l'action ; commencer par tickets, branches/fichiers/commits et PR.
4. Ajouter relance/annulation d'exécutions Actions après validation des droits et du parcours de confirmation.
5. Tester avec des comptes GitHub personnels et d'organisation, dépôts publics/privés, installations à sélection partielle et refus d'une permission.

## Décisions demandées à la revue

1. Confirmer le périmètre d'écriture ci-dessus, en particulier la soumission de revues et la fusion de PR.
2. Confirmer que la lecture des secrets et l'administration GitHub restent hors périmètre.
3. Valider la stratégie « contenu à la demande » plutôt qu'une indexation complète des fichiers.
4. Valider l'application GitHub et les permissions à demander ; une mise à jour de ses permissions peut demander une nouvelle approbation aux installations existantes.

## Références

- [Permissions des GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Permissions requises par les endpoints REST pour les jetons à grain fin](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [Lister les dépôts accessibles au compte authentifié](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)
- [Lister les dépôts accessibles à une installation d'application](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token)
