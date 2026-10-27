# Connecteur GitHub : le même accès que Claude

**Statut :** cadrage validé par Amos le 27/10/2026, à relire par David. Remplace la proposition du 26/10 (#58).

**But :** sur les dépôts GitHub, Leon doit pouvoir faire tout ce que Claude y fait avec le compte de l'utilisateur. Il lit le code et l'activité, puis il agit : tickets, PR, code, revues, fusion, Actions. Chaque action attend un clic de confirmation dans Leon.

## Décisions du 27/10/2026

1. **Même niveau de droits que le connecteur GitHub de Claude.** Lecture et écriture, y compris l'approbation et la fusion de PR. L'administration du compte et de l'organisation reste hors périmètre (voir plus bas).
2. **Qui voit quoi.** Un administrateur de l'organisation Leon (rôle `owner` ou `admin`) choisit les dépôts partagés avec l'équipe, et les membres ne voient que ceux-là. Quand quelqu'un branche un compte personnel, seuls les dépôts choisis par l'administrateur sont partagés.
3. **Au nom de qui.** Une écriture part toujours du compte GitHub de la personne qui la demande, jamais du compte de celle qui a branché le dépôt, pour que GitHub montre le vrai auteur. Pour agir, chacun branche son propre GitHub. Une lecture à la demande passe par la connexion de la personne qui demande ; un dépôt partagé par l'administrateur se lit avec la connexion qui l'apporte, dans la limite des dépôts choisis.
4. **Confirmation.** Avant toute écriture, Leon montre le dépôt, la branche, le contenu ou le diff et l'effet attendu, puis attend un clic. Une demande du modèle ne vaut pas confirmation, un texte lu sur GitHub non plus (voir « Injection »).
5. **Lecture à la demande, sans copie des dépôts.** La synchronisation garde les tickets et les PR (pour la recherche et l'activité) ; le code, les commits et la CI se lisent en direct.

## État du code au 27/10/2026

- **Synchronisation :** tickets et PR, avec leurs commentaires, avis et commentaires de revue. Ni fichiers, ni branches, ni commits, ni CI.
- **Dépôts :** avec le bouton, Leon lit tous les dépôts où son appli est installée (#74 ; avant, il s'arrêtait aux 20 premiers sans le dire). Avec une clé collée, 20 dépôts au plus, saisis à la main.
- **Discussion :** l'agent a déjà une boucle d'outils (`src/server/discussion/agent.ts` et `tools.ts` : `chercher`, `lire`, `activite`), avec au plus 8 étapes et 40 000 caractères lus par réponse. Aucun de ces outils n'interroge GitHub en direct.
- **Client HTTP des connecteurs :** GET et POST seulement.
- **Appli GitHub :** Issues et Pull requests en lecture et écriture (l'écriture est demandée d'avance depuis #40), Metadata en lecture. Pas encore de Contents, d'Actions ni de Checks (demandés dès le 27/10, voir le tableau ci-dessous).

## Permissions de l'appli GitHub

| Permission | Niveau | Ce que Leon en fait | Ce qu'elle permet aussi |
| --- | --- | --- | --- |
| Metadata | lecture | imposée par GitHub | |
| Issues | lecture et écriture | tickets, commentaires, étiquettes, assignations | |
| Pull requests | lecture et écriture | PR, revues, demandes de revue, approbation | |
| Contents | lecture et écriture | fichiers, branches, commits, fusion d'une PR | supprimer une branche ou une release ; pousser sur la branche par défaut quand elle n'est pas protégée |
| Checks | lecture | résultats de CI | |
| Commit statuses | lecture | résultats de CI publiés en statuts (anciens services de CI) | |
| Actions | lecture et écriture | relancer, annuler une exécution | supprimer des exécutions, des journaux, des artefacts et des caches ; lancer un workflow à la main (ce qui peut déployer) ; activer ou désactiver un workflow ; approuver l'exécution d'un fork ; modifier le modèle des jetons OIDC |
| Workflows | écriture | modifier les fichiers `.github/workflows` (GitHub refuse sinon tout commit qui les touche) | |

GitHub ne découpe pas ces droits plus finement. Supprimer une branche fait partie du travail courant (décision d'Amos du 27/10/2026) : c'est permis, toujours après confirmation. Le reste, Leon se l'interdit dans son code : aucun outil ne supprime une release, une exécution, un artefact ou un cache, et aucun n'active, ne désactive ni ne lance un workflow à la main. Les jetons de runner et la politique Actions relèvent d'`Administration`, que Leon ne demande pas.

Chaque nouvelle permission doit être réacceptée par chaque installation (dans une organisation, par un propriétaire). À la demande d'Amos (27/10/2026), tout le tableau est demandé dès maintenant, avant les lots qui s'en servent : il n'y a qu'une seule réapprobation. L'écran d'autorisation de GitHub montre donc des droits que Leon n'utilise pas encore ; le texte du bouton GitHub dans Connexions le dit.

**Jeton à grain fin (clé collée) :** il faut accorder les mêmes permissions. GitHub n'offre aucune route pour lire les droits d'un tel jeton : on les découvre au premier refus, par l'en-tête `X-Accepted-GitHub-Permissions`. L'erreur affichée nomme la permission manquante, jamais le jeton.

## Risques et garde-fous

- **Injection.** Sur un dépôt public, n'importe qui peut écrire un ticket ou un commentaire, et ce texte entre dans la discussion. Il y reste une donnée, derrière la ligne de garde (`DATA_GUARD_LINE`). Une écriture ne part que d'une demande de l'utilisateur, et l'aperçu de confirmation dit ce qui l'a déclenchée. `map.ts` distingue déjà l'équipe des extérieurs.
- **Limites de GitHub.** GitHub accepte 5 000 requêtes par heure et par utilisateur. Le jeton de l'appli dure 8 h et doit aussi être renouvelé pour les lectures à la demande, une fois à la fois, car le jeton de rafraîchissement ne sert qu'une fois. L'API contents rend 1 Mo au plus par fichier, et un diff trop gros est coupé.
- **Listes partielles.** Toute liste coupée (pagination, droits, budget de lecture) le dit, et dit ce qui manque. Jamais une liste partielle présentée comme complète.
- **Journal.** Leon garde chaque écriture : qui l'a demandée, quoi, sur quel dépôt, quand, et la réponse de GitHub.

## Hors périmètre de cette version

- **Administration du compte et de l'organisation :** créer ou supprimer des dépôts, gérer les membres et les équipes, les règles de protection, les paramètres de sécurité, les secrets et variables d'Actions, les webhooks, les runners, la facturation.
- **Déploiements et approbations d'environnements :** aucun outil dédié.

## Lots (une PR chacun)

1. Inventaire complet : tous les dépôts installés, sans plafond silencieux (#74).
2. Cette spec, le guide `docs/guides/applis-oauth.md` et le commentaire de `oauth.ts`.
3. Outil de discussion « dépôts GitHub » : la liste en direct des dépôts que Leon lit avec la connexion GitHub de la personne qui demande. Aucune nouvelle permission.
4. Choix des dépôts partagés par l'administrateur, et leur affichage sur la carte GitHub, avec un lien « Modifier sur GitHub ».
5. Lecture du code : branches, commits, arborescence, fichiers.
6. PR en détail (fichiers modifiés, diff) et résultats de CI.
7. Socle des écritures : PATCH, PUT et DELETE dans le client HTTP ; une action proposée, son aperçu, le clic, l'exécution, le journal. Première écriture : commenter un ticket ou une PR.
8. Tickets et PR : créer, modifier, étiqueter, assigner, fermer, rouvrir ; ouvrir une PR, demander ou soumettre une revue (approbation comprise), fusionner.
9. Branches (créer, supprimer), fichiers et commits.
10. Actions : relancer ou annuler une exécution.
11. Essais réels : compte personnel et organisation, dépôts publics et privés, installation partielle, permission refusée.

## Références

- [Permissions des GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Routes REST par permission de GitHub App](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
- [Permissions requises par les routes REST pour les jetons à grain fin](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [Lister les dépôts accessibles à une installation d'application](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token)
- [Limites de requêtes de l'API REST](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
