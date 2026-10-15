# Vérification manuelle des connecteurs

À cocher par Amos ou David, dans l'ordre, avec de vraies clés. Chaque case décrit ce qu'on fait puis ce qu'on doit voir. Une case qui échoue : noter l'écart (et le texte exact affiché) dans la PR concernée. Aucun test automatique n'appelle un vrai service : cette checklist est la seule vérification contre les vrais outils.

Les 35 connecteurs sont écrits d'après la documentation officielle et testés sur des réponses d'exemple. Cet essai vérifie les trois du lot A (GitHub, Notion, Linear) et l'outil de réunion d'Amos et David. Pour chaque outil qui passe, mettre `triedForReal: true` dans son `catalog.ts` et « oui » dans le tableau du README (le test `connectors-docs.test.ts` vérifie que les deux disent la même chose).

## Prérequis

- La branche des connecteurs est fusionnée dans `main` et le dépôt est à jour.
- `.env.local` contient `LEON_CONNECTORS_KEY` (`openssl rand -base64 32`) et, pour voir des faits, une `ANTHROPIC_API_KEY` de workspace. Sans cette dernière, les éléments entrent quand même mais leurs runs restent « En cours ».
- Les clés, une par outil, à créer avant de commencer (la page Connexions dit où, avec un lien vers la doc de l'éditeur) :
  - GitHub : jeton à grain fin, limité aux dépôts voulus, en lecture sur Issues, Pull requests et Metadata ;
  - Notion : secret d'intégration interne, et les pages à lire partagées avec l'intégration (menu … de chaque page › Ajouter des connexions) ;
  - Linear : clé d'API personnelle ;
  - l'outil de réunion d'Amos et David : sa clé d'API.
- Ne jamais coller une clé dans une PR, un message ou un fichier du dépôt.

## Le jour de l'essai

- [ ] **0. Migration.** Une fois la relecture de David faite (la migration `0008-connecteurs.sql` modifie les contraintes de `sources`, `turns` et `facts`), hors sandbox : `env DATABASE_URL_ADMIN=postgres://leon_owner:leon_owner@127.0.0.1:54329/leon pnpm db:migrate`. On doit lire « Appliquées : 0008-connecteurs.sql » ; un second lancement répond « Base à jour. ».
- [ ] **1. Démarrage.** `pnpm dev`. La console ne montre pas « LEON_CONNECTORS_KEY absente ». Dans la barre latérale, « Connexions » apparaît entre Sources et Journal. La page liste les 35 outils par famille (Dev, Réunions, Projet, CRM, Support), tous « Non branché », et chacun porte « Non essayé en réel ».
- [ ] **2. Sans la clé de chiffrement** (facultatif, 2 minutes). Relancer `pnpm dev` sans `LEON_CONNECTORS_KEY` : la console avertit, la page Connexions explique ce qui manque et comment le générer, et « Tester et brancher » répond « Les connecteurs ne sont pas configurés sur ce serveur (LEON_CONNECTORS_KEY). ». Remettre la clé et relancer.
- [ ] **3. Brancher GitHub.** Un clic sur GitHub ouvre le panneau : un champ de clé (masqué), la liste des dépôts (un par ligne, `propriétaire/nom`), l'aide « où trouver la clé » et son lien, le choix de la période. Essayer d'abord un dépôt qui n'existe pas : le message est « Dépôt inaccessible : » suivi du nom du dépôt et rien n'est enregistré. Puis les vrais dépôts, période de 30 jours, « Tester et brancher » : « Connecté : » suivi de votre identifiant GitHub. L'outil passe à « Actif · premier passage en attente ».
- [ ] **4. Brancher Notion et Linear**, de la même façon. Notion : une page non partagée avec l'intégration ne doit pas apparaître. Linear : la clé se colle seule, sans autre champ.
- [ ] **5. Brancher l'outil de réunion** d'Amos et David. Noter si la clé suffit ou si l'outil demande autre chose (plan payant, identifiant en plus).
- [ ] **6. Premier passage.** Attendre une à deux minutes (le tic tourne chaque minute) : la ligne d'état de chaque outil devient « Actif · dernier passage il y a N min · X éléments ». Plus de 200 éléments : le compteur monte par paliers de 200, une minute d'écart. Ensuite un passage toutes les 15 minutes ; « Synchroniser maintenant » en force un sans attendre.
- [ ] **7. Sources.** Dans Sources, les éléments des outils apparaissent avec l'outil, leur titre et « Ouvrir dans » suivi du nom de l'outil. Le lien ouvre l'original dans un nouvel onglet (ticket, page, réunion). La colonne Pipeline passe de « En cours » à « Traité » (avec la clé Anthropic). Le second compte (David ou Amos) voit ces sources, mais pas les conversations de l'autre.
- [ ] **8. Faits.** Dans les fiches, choisir un fait tiré d'un outil : il porte sa citation exacte (le texte du ticket, de la page ou de la parole), **l'auteur du texte cité** (pas celui qui a branché la connexion) et « Ouvrir dans » suivi du nom de l'outil. Pour une réunion : l'engagement ou la décision est attribué à la bonne personne et daté du jour de la réunion. Pour un ticket modifié depuis : le fait garde la date du tour cité. Un fait sensible (salaire, santé) reste « Privé » et apparaît dans « À vérifier ».
- [ ] **9. Élément modifié.** Modifier un ticket ou une page dans l'outil (une phrase), « Synchroniser maintenant » : la source existante est mise à jour (pas de doublon dans Sources), et sa colonne Tours monte de un. Ne rien modifier, resynchroniser : aucun nouveau traitement.
- [ ] **10. Pause et reprise.** « Mettre en pause » : l'état devient « En pause » et plus aucun passage ne part (« Synchroniser maintenant » ne réveille pas une connexion en pause). « Reprendre » : « Actif », nouveau passage dans la minute.
- [ ] **11. Clé refusée au remplacement.** « Remplacer la clé », coller une fausse clé : « Clé refusée par » suivi du nom de l'outil, et la connexion reste active avec l'ancienne clé (la nouvelle est testée avant d'être enregistrée).
- [ ] **12. Clé retirée chez l'éditeur.** Supprimer (ou révoquer) la clé dans l'outil lui-même, puis « Synchroniser maintenant ». L'état devient « En erreur : Clé refusée par GitHub : vérifiez-la ou remplacez-la. » (avec le nom de l'outil essayé) et la connexion n'est plus relancée toute seule (attendre quelques minutes pour s'en assurer). Créer une nouvelle clé, « Remplacer la clé » : « Connecté : … », état « Actif », passage relancé dans la minute.
- [ ] **13. Ce qui est stocké.** Hors sandbox : `docker compose exec postgres psql -U leon_owner -d leon -c "select provider, status, secret_hint, left(secret, 3) as format, next_sync_at, last_error, items_synced from connections"`. Le format vaut `v1:`, `secret_hint` n'a que quatre caractères, aucune colonne ne contient une clé entière ni un texte de réponse de l'outil.
- [ ] **14. Supprimer.** « Supprimer » demande confirmation (« Les sources déjà captées restent dans la mémoire. »). Après : l'outil repasse à « Non branché », la requête de la case 13 ne rend plus la ligne, et les sources déjà captées sont toujours dans Sources, avec leur lien.
- [ ] **15. Coût du premier passage.** Sur 30 jours : relever le nombre de runs (même commande que la case 13, avec `select status, count(*) from ingest_runs group by status`) et additionner les lignes `llm.usage` de la console de `pnpm dev` (champ `costUsd`). Le noter dans la PR : c'est le chiffre qui manque pour savoir si 30 jours est la bonne période par défaut.

## GitHub : un dépôt dont les tickets sont désactivés

À faire une fois, avec un dépôt de test (Settings › General › Features › Issues décoché), qui porte au moins une pull request avec un commentaire.

- [ ] **16. Réponse exacte de GitHub.** Mettre le jeton dans une variable de la session sans l'afficher (`read -s GITHUB_TOKEN; export GITHUB_TOKEN`), puis : `curl -sS -i -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com/repos/<propriétaire>/<nom>/issues?per_page=1"`. Noter le statut et le corps. On attend 410 et `{"message":"Issues are disabled for this repo", …}`, ce que la doc de cette route ne liste pas.
- [ ] **17. Le connecteur s'en accommode.** Brancher une liste de deux dépôts : celui-là d'abord, un dépôt normal ensuite. La connexion reste active, les pull requests du premier arrivent avec leurs commentaires, et le second dépôt est bien lu. Vérifier aussi qu'un commentaire de pull request (`/issues/{n}/comments`) se lit sur un dépôt sans tickets : sinon, l'erreur remonte pour tout le dépôt.
- [ ] **18. Corriger l'en-tête.** Dans `src/server/connectors/github/connector.ts`, remplacer le passage « Non vérifié » correspondant par ce qui a été constaté (statut, corps, comportement des commentaires). Fait dans la même PR que la bascule `triedForReal`.

## À regarder pendant l'essai (ce que la doc n'a pas permis de vérifier)

Extrait des en-têtes « Non vérifié » des connecteurs ; la liste complète est en tête de chaque `connector.ts`.

- **GitHub** : si le filtre « modifié depuis » inclut l'instant donné (le connecteur recule d'une seconde et écarte les éléments déjà vus : aucun doublon attendu) ; si `GET /user` répond à un jeton à grain fin avec la seule permission Metadata (sinon la case 3 échoue sur « Connecté »).
- **Notion** : un jeton d'accès personnel au lieu d'un secret d'intégration ; une page modifiée deux fois dans la même minute de part et d'autre d'un passage garde sa première version jusqu'à la modification suivante.
- **Linear** : le sens de l'ordre `updatedAt` (le parcours reste juste dans les deux sens) ; le code HTTP d'une clé refusée (401 ou 400 : les deux sont reconnus).
- **L'outil de réunion** : le format des horodatages des prises de parole (la date des faits en dépend) et le plan exigé.
- **Conditions d'utilisation** à faire confirmer par écrit avant tout client : Fathom, tl;dv, ClickUp, Front, monday.com, Sentry.

## Après l'essai

Pour chaque outil essayé : `triedForReal: true` dans son `catalog.ts`, « oui » dans le tableau du README, l'en-tête « Non vérifié » de son `connector.ts` mis à jour avec ce qui a été constaté, et un compte rendu dans la PR (ce qui a marché, ce qui a surpris, le coût de la case 15).
