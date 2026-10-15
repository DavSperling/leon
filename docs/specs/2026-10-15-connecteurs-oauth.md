# Connecteurs v1 : le bouton « Se connecter avec… »

Complément du 15 octobre 2026 à la [spec des connecteurs](2026-10-15-connecteurs.md), demandé par Amos : **tout outil qui se branche par un bouton sans vérification de l'éditeur se branche par un bouton.** Coller une clé reste possible, en secours.

## Ce que voit l'utilisateur

Dans le panneau d'un outil, le bouton « Se connecter avec Linear » vient en premier. Un clic l'emmène chez Linear, qui demande « Autoriser Leon à lire votre espace ? ». Il accepte, revient dans Leon, et la connexion est branchée. Les réglages qui ne sont pas des secrets (les dépôts GitHub, la période à reprendre) se choisissent avant le clic.

Sous le bouton, le lien « ou coller une clé » ouvre le formulaire actuel, quand l'outil accepte aussi une clé. Si l'appli de l'outil n'est pas encore configurée sur le serveur, seul le formulaire de clé apparaît.

## Quels outils

| Avec bouton | Remarque |
|---|---|
| GitHub, Notion, Linear, GitLab | Notion : l'utilisateur choisit les pages à partager pendant l'autorisation |
| Jira et Confluence | une seule appli Atlassian pour les deux, partage de l'appli activé dans la console |
| Asana, ClickUp, monday.com, Airtable, HubSpot, Help Scout | HubSpot : appli publique non listée sur la place de marché |
| Attio | revue d'Attio au-delà de 25 espaces : assez pour nos pilotes |
| **Nouveaux** : Basecamp, Miro, Productboard | ne se branchent que par bouton |
| **Nouveau** : Outlook (Microsoft 365 : courrier et agenda) | l'administrateur Microsoft du client doit donner son accord une fois |

Restent à clé collée, faute de bouton sans vérification : les outils de réunion (Fathom, Fireflies, tl;dv, Granola, Circleback, Claap, Leexi, Gong), Trello (son autorisation rend la clé dans l'adresse côté navigateur, pas au serveur), Shortcut, Plane, Sentry, folk, Pipedrive, Close, Intercom, Zendesk, Freshdesk, Front, Plain, Crisp, Missive.

Toujours exclus : Google (audit CASA), Slack, Zoom, Figma (revue), Teams, et les espaces de fichiers (Dropbox, Box, OneDrive). Pour ces derniers, il faudrait lire des PDF et des documents Word, ce qui est un sujet à part.

## Une fois par outil, côté Leon

Amos ou David crée l'appli dans la console développeur de l'éditeur, en suivant `docs/guides/applis-oauth.md` (un paragraphe par outil : où cliquer, adresse de retour, droits à cocher). L'adresse de retour est `<BETTER_AUTH_URL>/api/v1/connexions/oauth/<appli>/retour`, soit `http://localhost:3000/…` en local, `<appli>` étant `atlassian` pour Jira et Confluence (une appli Atlassian n'a qu'une adresse de retour), l'identifiant de l'outil pour les autres. L'identifiant et le secret de l'appli vont dans `.env.local` : `LEON_OAUTH_<OUTIL>_ID` et `LEON_OAUTH_<OUTIL>_SECRET`, avec `ATLASSIAN` pour Jira et Confluence. Certains éditeurs demandent une page de confidentialité et des conditions : le guide le signale.

## Le déroulé

1. Le panneau envoie vers `/api/v1/connexions/oauth/<outil>/debut`, avec les réglages non secrets. Il faut être connecté à Leon.
2. Leon tire un `state` aléatoire, et un vérificateur PKCE quand l'éditeur le prend en charge. Il les garde 10 minutes dans un cookie signé (`httpOnly`, `SameSite=Lax`, `Secure` hors local), avec l'utilisateur, l'outil et les réglages. Puis il redirige vers la page d'autorisation de l'éditeur, avec les droits de lecture seulement.
3. L'éditeur renvoie vers `/retour` avec un `code`. Leon vérifie que le cookie existe, que le `state` est le même (comparaison en temps constant), et que l'utilisateur et l'outil sont les mêmes. Il échange le code contre les jetons de serveur à serveur, appelle `verify`, crée la connexion avec ses jetons chiffrés comme une clé, efface le cookie et revient sur `/connexions?branche=<outil>`.
4. Un refus chez l'éditeur, un cookie absent ou périmé, ou un `state` différent ramènent sur `/connexions` avec un message simple (« Connexion à Linear annulée. », « Le lien a expiré, recommencez. »). Rien n'est créé.

## Les jetons qui expirent

Les jetons d'Atlassian, HubSpot, Asana, Airtable, GitLab, Help Scout, Basecamp et Microsoft expirent, et parfois ceux de Linear. Le jeton de rafraîchissement est chiffré avec le reste.

Avant chaque passage, si l'accès expire dans moins de 5 minutes, la relève le renouvelle et enregistre aussitôt les nouveaux jetons, car certains éditeurs n'acceptent un jeton de rafraîchissement qu'une fois. Un renouvellement refusé met la connexion en erreur : « Reconnectez Linear », sans nouvelle échéance. Le panneau propose alors « Reconnecter », qui refait le déroulé et remplace les jetons de la même connexion.

## Sécurité

- Le secret d'appli ne quitte jamais le serveur. Il n'apparaît ni dans une page, ni dans un journal, ni dans un message d'erreur.
- L'adresse de retour est fixe. Le cookie est signé avec `BETTER_AUTH_SECRET`. Un `state` ne sert qu'une fois, puisque le cookie est effacé au retour.
- On demande les droits de lecture seulement, les plus étroits que l'éditeur propose.
- Les jetons obtenus suivent les mêmes règles que les clés : chiffrés, liés à leur ligne, jamais renvoyés.

## Tests

- Le déroulé avec un éditeur simulé : adresse d'autorisation (paramètres, PKCE, `state`) ; retour accepté ; retour refusé quand le cookie est absent, périmé, d'un autre utilisateur, ou que le `state` est différent ; échange de code ; `verify` ; connexion créée sans secret en clair.
- Le renouvellement : jeton proche de l'expiration renouvelé et enregistré avant la synchronisation ; renouvellement refusé, qui donne une erreur sans nouvelle échéance ; jeton encore valide qui n'est pas renouvelé.
- Pour chaque outil à bouton : sa description OAuth (adresses, droits, PKCE, façon d'envoyer le secret) et sa conversion des jetons en configuration.
