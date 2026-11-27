# Créer les applis OAuth de Leon

À suivre par Amos ou David, une fois par éditeur. Pour que le bouton « Se connecter avec… » marche, Leon doit exister chez l'éditeur sous la forme d'une **appli** (on dit aussi « intégration » ou « connexion »). Elle porte un identifiant et un secret, que Leon met dans `.env.local`. Ce guide dit, éditeur par éditeur, où la créer, quoi y écrire, quels droits cocher et ce qu'il faut activer pour que d'autres comptes que le vôtre l'utilisent.

Chaque section reprend les descriptions `oauth` du code (`src/server/connectors/<outil>/oauth.ts`, droits, adresses) et les pages de documentation que leurs en-têtes citent, relues le 15 octobre 2026. Une console change sans prévenir : en cas d'écart entre ce guide et ce que vous voyez, le code et la documentation de l'éditeur ont raison, et il faut corriger le guide. Ce qu'on n'a pas pu confirmer est marqué « à vérifier » et repris en bas de page.

## Les règles communes

- **Un seul nom : « Leon ».** C'est ce que l'utilisateur lit sur l'écran d'autorisation. Quand une console demande un logo, une description, un site ou un contact, mettre ceux de l'entreprise.
- **L'adresse de retour** (on dit aussi « redirect URI », « callback URL » ou « redirection ») est `<BETTER_AUTH_URL>/api/v1/connexions/oauth/<appli>/retour`, soit `http://localhost:3000/api/v1/connexions/oauth/<appli>/retour` en local. `<appli>` est l'identifiant de l'outil en minuscules, sauf `atlassian` pour Jira et Confluence, `google` pour Gmail et Google Drive, et `microsoft` pour Outlook, OneDrive / SharePoint, Teams et Teams Chat. Il n'y en a qu'une par appli. Elle doit être recopiée au caractère près : pas de barre finale, pas de `127.0.0.1` à la place de `localhost`, `http` ou `https` comme dans `BETTER_AUTH_URL`.
- **Les droits : la lecture, et l'écriture demandée d'avance** (décision du 23/10/2026) pour ne pas devoir refaire autoriser les clients le jour où Leon agira dans leurs outils. Aujourd'hui, Leon ne fait que lire. Toutes les applis demandent l'écriture (droits relus le 23/10/2026) ; ClickUp, Help Scout et Basecamp n'ont pas de droits à choisir, leur accès couvre déjà tout le compte. Jamais de droit d'administration ni de suppression définitive, sauf chez Google et Microsoft : Gmail, Drive, Outlook, OneDrive / SharePoint, Teams et Teams Chat demandent l'accès complet, suppression comprise, et l'envoi pour les mails (choix de David des 26 et 27/11/2026, voir leurs sections). Chez GitLab, monday.com, HubSpot, Miro et Attio (notes), le droit d'écriture le plus étroit permet aussi de supprimer : c'est à Leon de ne jamais s'en servir.
- **Les deux variables** vont dans `.env.local`, jamais dans le dépôt, une PR ou un message : `LEON_OAUTH_<APPLI>_ID` et `LEON_OAUTH_<APPLI>_SECRET` (`ATLASSIAN` pour Jira et Confluence, `GOOGLE` pour Gmail et Google Drive, `MICROSOFT` pour Outlook, OneDrive et Teams, l'identifiant de l'outil en majuscules pour les autres, `HELPSCOUT` pour Help Scout). Le secret ne s'affiche souvent qu'une fois : le copier tout de suite. Puis relancer `pnpm dev`.
- **Une paire vide ou incomplète désactive le bouton** de l'outil, sans autre effet : son panneau garde alors le formulaire de clé (ou, pour un outil sans clé, dit « L'appli … n'est pas encore configurée sur ce serveur. »). Une paire à moitié remplie est signalée au démarrage : `[leon] LEON_OAUTH_… absente : le bouton … est désactivé.`
- **Un secret qui a fuité** se renouvelle dans la console de l'éditeur (« Regenerate », « Rotate », « Renew », « Reset » selon l'éditeur), puis dans `.env.local`. Les connexions déjà branchées gardent leurs jetons.
- **Une appli par environnement** dès que l'éditeur n'accepte qu'une adresse de retour (Atlassian), et c'est plus prudent partout : une appli pour le poste local (`http://localhost:3000`), une pour la production (`https://` suivi de l'adresse publique de Leon, la même valeur que `BETTER_AUTH_URL`). Les variables de la production se règlent chez l'hébergeur, pas dans le dépôt.
- **`https` en local** : Asana refuse une adresse `http`, et ClickUp prévient qu'elle ne sera plus acceptée. Pour ces deux-là, faire passer Leon par un tunnel `https` (ou un proxy TLS local) et mettre son adresse dans `BETTER_AUTH_URL` et dans la console.

## Les dix-sept applis

Chaque section se lit de la même façon : où créer l'appli, l'adresse de retour à y mettre, les droits, les pages que l'éditeur exige, les variables, et ce qui permet à d'autres comptes de s'en servir.

### GitHub

Une **GitHub App**, pas une « OAuth App » : le droit `repo` d'une OAuth App donnerait l'écriture sur tous les dépôts privés. Ici, les permissions sont celles de l'appli, et le jeton n'ouvre que les dépôts où elle est installée.

- **Où créer** : https://github.com/settings/apps/new (compte personnel), ou pour une organisation : Your organizations › Settings › Developer settings › GitHub Apps › New GitHub App.
- **Nom** : « Leon » (34 caractères au plus, unique sur tout GitHub : s'il est pris, « Leon » suivi du nom de l'entreprise). « Homepage URL » : l'adresse publique de Leon (en local, celle du dépôt).
- **Adresse de retour**, dans « Callback URL » : `http://localhost:3000/api/v1/connexions/oauth/github/retour`
- **Après l'installation**, dans « Post installation » : « Setup URL » = `http://localhost:3000/connections?branche=github` (l'adresse de Leon suivie de `/connections?branche=github`), et « Redirect on update » **cochée**. GitHub y renvoie l'utilisateur une fois ses dépôts choisis. Lancée depuis l'étape « Vos outils » de l'onboarding, l'installation porte `state=/welcome/tools`, que GitHub rend à cette adresse : Connexions renvoie alors sur l'étape. Rien à régler pour cela.
- **Cases** : « Expire user authorization tokens » **cochée** (laisser ainsi : le jeton dure 8 h et Leon le renouvelle) ; « Request user authorization (OAuth) during installation » **décochée** (sinon GitHub renvoie vers Leon sans `state`) ; « Webhook › Active » décochée.
- **Droits** (Repository permissions), tous demandés d'avance (décision du 27/10/2026) : « Contents », « Issues », « Pull requests », « Actions » et « Workflows » en « Read and write » ; « Checks » et « Commit statuses » en « Read-only » ; « Metadata » en « Read-only » (déjà imposé). Rien en « Administration ». Ce que ces droits permettent et ce que Leon s'interdit : `docs/specs/2026-10-26-github-acces-complet.md`. Après chaque changement, « Save changes » en bas de la page : chaque installation doit accepter les nouveaux droits (Settings › Applications › Installed GitHub Apps › Leon › « Review request »). Leon ne demande aucun paramètre `scope` : les droits sont ceux de l'appli.
- **Pages demandées** : aucune. Un logo est facultatif.
- **Variables** : `LEON_OAUTH_GITHUB_ID` = le « Client ID » de l'appli (pas son « App ID »), `LEON_OAUTH_GITHUB_SECRET` = un secret créé sur la même page (« Client secrets › Generate a new client secret »), `LEON_OAUTH_GITHUB_APP` = le nom court de l'appli (celui de son adresse publique, github.com/apps/<nom>).
- **Pour que d'autres comptes l'utilisent** : « Where can this GitHub App be installed? » sur « Any account » (appli publique). Chaque compte ou organisation installe ensuite l'appli sur les dépôts voulus (page publique de l'appli › Install, en limitant l'accès aux dépôts à brancher) ; dans une organisation, un propriétaire doit approuver l'installation. Sans installation, l'appli ne voit aucun dépôt. Leon ne demande rien avant le clic : après l'autorisation, si l'appli n'est installée sur aucun dépôt, il enchaîne sur son écran d'installation, où l'on choisit les dépôts, puis GitHub revient à Leon (« Setup URL »). Leon lit tous les dépôts où l'appli est installée, quel que soit leur nombre, relus à chaque passage (la limite de 20 ne vaut que pour les dépôts saisis à la main avec une clé).

### Notion

Une **connexion publique** (OAuth). Une connexion interne n'a pas de bouton : son secret se colle dans le formulaire de clé.

- **Où créer** : https://app.notion.com/developers/connections (aussi https://www.notion.so/developers) › nouvelle connexion publique.
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URI(s) » de la configuration OAuth : `http://localhost:3000/api/v1/connexions/oauth/notion/retour`
- **Droits** (capacités à cocher dans la connexion) : lire le contenu (« Read content »), lire les commentaires (« Read comments »), lire les informations des utilisateurs, adresses e-mail comprises (« Read user information including email addresses ») ; en écriture, demandée d'avance : mettre à jour et insérer du contenu, insérer des commentaires. Leon ne demande aucun paramètre `scope` : l'utilisateur choisit les pages à partager pendant l'autorisation.
- **Installation** : « Installation scope » sur « Any workspace » (**ne se change plus après la création**).
- **Pages demandées** : pour une connexion publique, Notion demande le nom et le site de l'entreprise, une page de confidentialité, des conditions d'utilisation et un e-mail de support (à vérifier), et un logo.
- **Variables** : `LEON_OAUTH_NOTION_ID` = « OAuth client ID », `LEON_OAUTH_NOTION_SECRET` = « OAuth client secret », tous deux dans l'onglet « Configuration ».
- **Pour que d'autres comptes l'utilisent** : la connexion doit être **publique** (un espace extérieur ne peut pas autoriser une connexion interne). Si Notion exige une revue avant diffusion, la demander tôt (à vérifier).

### Linear

- **Où créer** : https://linear.app/settings/api/applications/new (Réglages › API › Applications OAuth). Tous les administrateurs de l'espace où elle est créée y ont accès : mieux vaut la créer dans un espace dédié que dans l'espace de travail de l'équipe.
- **Nom** : « Leon ». Linear demande aussi un nom et une adresse de développeur (l'entreprise et son site) et une icône.
- **Adresse de retour**, dans « Callback URLs » : `http://localhost:3000/api/v1/connexions/oauth/linear/retour`
- **Droits** : aucune case. Leon demande `read` et `write` dans l'adresse d'autorisation, au nom de l'utilisateur (l'écriture est demandée d'avance).
- **Pages demandées** : aucune d'après la documentation lue.
- **Variables** : `LEON_OAUTH_LINEAR_ID` = le « Client ID » donné à la création, `LEON_OAUTH_LINEAR_SECRET` = le secret de la même page (« Rotate secret » pour en changer).
- **Alertes (webhooks)**, sur l'appli de la production : dans ses réglages chez Linear, activer les webhooks, adresse `https://leonmemory.com/api/linear/webhooks`, ressources « Issues », « Issue comments » et « Project updates » (libellés à vérifier). **Tout de suite après**, recopier leur secret de signature (« signing secret ») dans Railway sous `LEON_LINEAR_WEBHOOK_SECRET`, puis redéployer : tant que la variable manque, Leon répond 503 à chaque alerte, et des échecs répétés peuvent faire désactiver le webhook par Linear (à réactiver alors à la main dans la console). Le secret a son propre « Rotate secret », effectif tout de suite : changer la variable et redéployer en même temps. Linear crée alors un webhook pour chaque organisation qui autorise l'appli, et chaque alerte rend dues tout de suite les connexions Linear de cette organisation : la relève lit le nouveau sans attendre son quart d'heure (`src/server/api/linear-routes.ts`, migration 0099). L'adresse est publique, sans session : aucune règle (Cloudflare) ne doit la bloquer. Sans le secret, Leon écrit une fois `linear.webhook_secret_missing` dans le journal et relève Linear toutes les 15 minutes, comme une connexion par clé d'API personnelle, qui n'a pas d'alerte. L'appli du poste local garde ses webhooks coupés : Linear ne joint pas `localhost`.
- **Pour que d'autres comptes l'utilisent** : la distribution de l'appli doit être **publique** (réglage `private` ou `public`, privé par défaut ; case « Public » du formulaire, à vérifier). Privée, l'appli ne s'installe que dans l'espace où elle a été créée.

### GitLab

gitlab.com seulement ; une installation de GitLab hébergée par le client n'est pas prise en charge.

- **Où créer** : https://gitlab.com/-/user_settings/applications (avatar › Edit profile › Access › Applications › Add new application). Pour qu'elle ne dépende pas d'une personne, la créer dans un groupe (Settings › Applications du groupe).
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URI » : `http://localhost:3000/api/v1/connexions/oauth/gitlab/retour`
- **Droits** (« Scopes ») : `api` seulement (lecture et écriture de l'API ; GitLab n'a rien de plus étroit pour écrire sur les tickets et les notes, et `api` couvre aussi les registres de conteneurs et de paquets). Pas `read_api` en plus : `api` le contient. GitLab ne permet pas de le limiter à certains projets : avec le bouton, Leon lit les 20 projets les plus actifs dont l'utilisateur est membre (avec une clé collée, ceux de la liste).
- **Cases** : « Confidential » **cochée** (Leon envoie le secret) ; « Trusted » non cochée (elle n'existe que pour une appli de toute l'instance).
- **Pages demandées** : aucune.
- **Variables** : `LEON_OAUTH_GITLAB_ID` = « Application ID », `LEON_OAUTH_GITLAB_SECRET` = « Secret » (affiché après « Save application »).
- **Pour que d'autres comptes l'utilisent** : rien à activer. Les autres comptes passent par l'écran d'autorisation (à vérifier au premier essai : la documentation ne le dit pas noir sur blanc).

### Jira et Confluence

**Une seule appli Atlassian pour les deux.** C'est pourquoi l'adresse de retour s'appelle `atlassian`, et que les variables aussi.

- **Où créer** : https://developer.atlassian.com/console/myapps/ › Create › « OAuth 2.0 integration ».
- **Nom** : « Leon ».
- **Adresse de retour** : Authorization › OAuth 2.0 (3LO) › Configure › « Callback URL » : `http://localhost:3000/api/v1/connexions/oauth/atlassian/retour`. Atlassian n'en accepte qu'**une** par appli : une appli pour le poste local, une autre pour la production.
- **Droits** : Permissions › Add à côté de chaque API, puis Configure. Pour Jira (« Jira API ») : `read:jira-work`, `read:jira-user`, `write:jira-work`. Pour Confluence (« Confluence API ») : `read:page:confluence`, `read:comment:confluence`, `read:space:confluence`, `read:user:confluence`, `read:confluence-user`, `write:page:confluence`, `write:comment:confluence`. Selon la console, ils sont répartis entre les onglets « Classic scopes » et « Granular scopes ». `offline_access` ne se coche pas : Leon le demande dans l'adresse d'autorisation, pour obtenir un jeton de rafraîchissement (qui expire après 90 jours sans usage).
- **Pages demandées** : aucune pour créer l'appli. Pour la partager, Atlassian demande un nom d'éditeur et une page de confidentialité (mettre ceux de l'entreprise ; à vérifier).
- **Variables** : `LEON_OAUTH_ATLASSIAN_ID` = « Client ID », `LEON_OAUTH_ATLASSIAN_SECRET` = « Secret », tous deux dans « Settings ».
- **Pour que d'autres comptes l'utilisent** : Distribution › « Enable sharing » activé. Sans cela, seule la personne qui a créé l'appli peut l'autoriser. Les utilisateurs voient un avertissement « Atlassian n'a pas revu cette appli » : on peut continuer. Leon lit les sites auxquels le compte donne accès ; avec plusieurs sites, l'utilisateur peut saisir le sien avant le clic (champ « Site Atlassian »), sinon Leon prend le premier.

### Asana

- **Où créer** : https://app.asana.com/0/my-apps › « Create new app ».
- **Nom** : « Leon » (visible à l'autorisation).
- **Adresse de retour**, dans « Redirect URL » : `http://localhost:3000/api/v1/connexions/oauth/asana/retour`. Asana exige `https` hors appli native : en local, un tunnel `https` (voir les règles communes).
- **Droits** : onglet OAuth › « Permission scopes », avec « Full permissions » **désactivé** (sinon Asana interdit de demander les droits un à un et renvoie `forbidden_scopes`) : `tasks:read`, `projects:read`, `stories:read`, `users:read`, et en écriture `tasks:write`, `stories:write` (commenter). Pas `projects:write` (la structure des projets) ni aucun droit `:delete`.
- **Pages demandées** : aucune ; icône et description facultatives.
- **Variables** : `LEON_OAUTH_ASANA_ID` = « Client ID », `LEON_OAUTH_ASANA_SECRET` = « Client secret », tous deux dans l'onglet OAuth.
- **Pour que d'autres comptes l'utilisent** : « Manage distribution » doit rendre l'appli disponible dans l'espace de travail de l'utilisateur (la documentation lue ne détaille pas les options : à vérifier).

### ClickUp

- **Où créer** : https://app.clickup.com/settings/apps (avatar › Settings › Apps) › « Create new app ». Seuls le propriétaire et les administrateurs de l'espace de travail peuvent le faire.
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URL » : `http://localhost:3000/api/v1/connexions/oauth/clickup/retour`. ClickUp prévient que les adresses sans `https` pourraient ne plus être acceptées.
- **Droits** : aucun, ClickUp n'en propose pas. L'utilisateur choisit les espaces de travail à ouvrir pendant l'autorisation, et l'autorisation donne les mêmes droits que son compte sur ces espaces, écriture comprise : rien à demander de plus pour écrire un jour. Aujourd'hui, Leon ne fait que lire les tâches et leurs commentaires.
- **Pages demandées** : aucune.
- **Variables** : `LEON_OAUTH_CLICKUP_ID` = l'identifiant (`client_id`), `LEON_OAUTH_CLICKUP_SECRET` = le secret, donnés à la création de l'appli (les copier alors).
- **Pour que d'autres comptes l'utilisent** : la documentation lue ne décrit aucun réglage de diffusion. Les conditions d'utilisation de ClickUp sont à faire confirmer par écrit avant tout client.

### monday.com

- **Où créer** : le « Developer Center » de monday.com (avatar › Développeurs, https://developer.monday.com/apps/docs/the-developer-center) › créer une appli.
- **Nom** : « Leon ».
- **Adresse de retour** : onglet « OAuth & Permissions » › redirect URLs : `http://localhost:3000/api/v1/connexions/oauth/monday/retour`
- **Droits** : même onglet : `boards:read`, `updates:read`, `me:read`, et en écriture `boards:write`, `updates:write` (ils permettent aussi d'archiver et de supprimer ; monday.com n'a rien de plus étroit).
- **À activer** : « New OAuth Flow » sur la version de l'appli (le réglage se choisit par version : créer un brouillon, l'activer, l'essayer avec « Active for me », puis le passer en production). Sans lui, les adresses et le corps de l'échange ne sont pas ceux que Leon utilise.
- **Pages demandées** : aucune pour une appli non listée (à vérifier).
- **Variables** : `LEON_OAUTH_MONDAY_ID` = « Client ID », `LEON_OAUTH_MONDAY_SECRET` = « Client Secret », tous deux dans « Basic Information » du Developer Center.
- **Pour que d'autres comptes l'utilisent** : tant que la version n'est pas en production, seuls les collaborateurs de l'appli peuvent faire le déroulé. Un administrateur du compte client peut devoir installer l'appli d'abord (à vérifier). Conditions d'utilisation de monday.com : l'API est réservée à un usage interne, à faire confirmer par écrit avant tout client.

### Airtable

- **Où créer** : https://airtable.com/create/oauth › « Register new OAuth integration ».
- **Nom** : « Leon ».
- **Adresse de retour**, dans « OAuth redirect URI » : `http://localhost:3000/api/v1/connexions/oauth/airtable/retour`
- **Droits** (« Permission scopes ») : `data.records:read`, `schema.bases:read`, `data.recordComments:read`, `data.records:write`, `data.recordComments:write` (pas `schema.bases:write` : Leon ne change pas la structure des bases).
- **Secret** : « Generate client secret », à copier avant de fermer (il ne se récupère pas ; « Regenerate client secret » en crée un autre et invalide l'ancien). Leon l'envoie en `Authorization: Basic`.
- **Pages demandées** : l'adresse d'une **politique de confidentialité** et des **conditions d'utilisation** (« Privacy policy URL », « Terms of service URL ») sont obligatoires pour que d'autres comptes puissent autoriser l'appli ; l'e-mail d'assistance et le logo sont recommandés.
- **Variables** : `LEON_OAUTH_AIRTABLE_ID` = « Client ID », `LEON_OAUTH_AIRTABLE_SECRET` = le secret généré, tous deux sur la page de gestion de l'intégration.
- **Pour que d'autres comptes l'utilisent** : renseigner les deux adresses ci-dessus. Aucune revue n'est décrite par la documentation lue.

### HubSpot

**Appli publique non listée sur la place de marché.** Depuis le 26 mai 2026, HubSpot ne laisse plus créer d'appli publique « héritée » : une nouvelle appli se crée avec la plateforme à projets, en ligne de commande (`hs`).

- **Où créer** : un compte développeur HubSpot (https://developers.hubspot.com), puis dans un dossier à part `hs project create`, base « App ». Puis `hs project upload`.
- **Nom** : « Leon » (dans `app-hsmeta.json`).
- **Adresse de retour** : `config.auth.redirectUrls` : `http://localhost:3000/api/v1/connexions/oauth/hubspot/retour`. Une adresse de production doit être en `https`.
- **Droits** : `config.auth.type` sur `"oauth"` et `config.auth.requiredScopes` : `oauth`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.owners.read`, `sales-email-read`, et en écriture `crm.objects.contacts.write` (exigé pour créer notes, appels, réunions et e-mails), `crm.objects.companies.write`, `crm.objects.deals.write`. Les droits déclarés comme obligatoires doivent tous figurer dans l'adresse d'autorisation : l'appli déclare exactement cette liste, ni plus ni moins. Aucun droit facultatif.
- **Pages demandées** : aucune pour une appli non listée (à vérifier) ; une fiche sur la place de marché demande logo, description et page de confidentialité, mais Leon n'en a pas besoin.
- **Variables** : `LEON_OAUTH_HUBSPOT_ID` = « Client ID » et `LEON_OAUTH_HUBSPOT_SECRET` = « Client secret », visibles avec `hs project open` › le composant de l'appli › onglet « Auth » › « Client credentials ».
- **Pour que d'autres comptes l'utilisent** : `config.distribution` : la valeur `"marketplace"` du modèle vise la place de marché ; celle qui réserve l'installation aux comptes voulus, sans fiche publique (appli non listée), est à prendre dans la référence de distribution de HubSpot (à vérifier). Le client installe ensuite l'appli lui-même : onglet « Distribution » de l'appli › « Install now ». **Seul un super administrateur du compte HubSpot peut l'installer.**

### Help Scout

Le flux « code d'autorisation » de l'API Boîte de réception. C'est une appli différente de celle de la clé collée (identifiant et secret sans retour chez l'éditeur) : il faut y mettre l'adresse de retour.

- **Où créer** : Help Scout › Your Profile › My apps › « Create My App » (documentation : https://developer.helpscout.com/mailbox-api/overview/authentication/).
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirection URL » : `http://localhost:3000/api/v1/connexions/oauth/helpscout/retour`
- **Droits** : aucun, l'API de Help Scout n'en a pas. Le jeton suit les droits de l'utilisateur qui autorise (il faut un utilisateur actif du compte), écriture comprise : rien à demander de plus pour écrire un jour. Aujourd'hui, Leon ne fait que lire les conversations.
- **Pages demandées** : aucune d'après la documentation lue. Plan Standard ou supérieur requis pour avoir accès à l'API.
- **Variables** : `LEON_OAUTH_HELPSCOUT_ID` = « App ID », `LEON_OAUTH_HELPSCOUT_SECRET` = « App Secret », tous deux sur la fiche de l'appli.
- **Pour que d'autres comptes l'utilisent** : la documentation ne dit pas si un utilisateur d'un autre compte Help Scout peut autoriser une appli créée dans le vôtre (à vérifier au premier essai). Si Help Scout répond que non, une appli par compte client sera nécessaire.

### Attio

- **Où créer** : https://build.attio.com › « New app » (un nom et un identifiant court, à choisir une fois pour toutes) › « Create app ».
- **Nom** : « Leon ».
- **Adresse de retour** : onglet OAuth, interrupteur OAuth 2.0 activé en haut de la page, puis « Redirect URIs » : `http://localhost:3000/api/v1/connexions/oauth/attio/retour`
- **Droits** : onglet des droits (« Scopes ») de la console, pas dans l'adresse d'autorisation : `note:read-write`, `comment:read-write` (écriture demandée d'avance ; `note:read-write` permet aussi de supprimer une note), et en lecture seulement `user_management:read`, `object_configuration:read`, `record_permission:read` (leur écriture touche aux membres et à la configuration : de l'administration). Leon demande un jeton d'espace (`token_level=workspace`), que seul un administrateur de l'espace peut accorder.
- **Pages demandées** : aucune pour une appli non publiée (à vérifier).
- **Variables** : `LEON_OAUTH_ATTIO_ID` et `LEON_OAUTH_ATTIO_SECRET`, tous deux dans l'onglet OAuth de l'appli.
- **Pour que d'autres comptes l'utilisent** : une appli **non publiée** s'installe dans 25 espaces au plus, avec un avertissement « pas encore approuvée par Attio » (on peut continuer). Au-delà, il faut la revue d'Attio (cycle de publication). C'est assez pour nos pilotes.

### Basecamp

Basecamp ne propose pas de droit en lecture seule : l'autorisation couvre tout le compte de l'utilisateur, écriture comprise (rien à demander de plus pour écrire un jour), mais aujourd'hui Leon ne fait que lire les messages, les documents et les commentaires. Le bouton est la seule façon de brancher Basecamp.

- **Où créer** : https://launchpad.37signals.com/integrations (« Register one now »). Le formulaire n'est pas décrit par la documentation : y mettre le nom, l'entreprise, le site et l'adresse de retour.
- **Nom** : « Leon ».
- **Adresse de retour** : `http://localhost:3000/api/v1/connexions/oauth/basecamp/retour`
- **Droits** : aucun, Launchpad ne connaît pas de droits (le jeton rendu porte `scope: "full"`).
- **Pages demandées** : aucune d'après la documentation lue.
- **Variables** : `LEON_OAUTH_BASECAMP_ID` = l'identifiant (`client_id`), `LEON_OAUTH_BASECAMP_SECRET` = le secret (`client_secret`), attribués à l'enregistrement.
- **Pour que d'autres comptes l'utilisent** : la documentation ne décrit aucun réglage de diffusion. Leon prend le premier compte Basecamp (version 3 ou suivante) de la personne qui autorise.
- **À décider avant un client** : Basecamp impose un `User-Agent` qui contient une adresse de contact. Leon met aujourd'hui le lien du dépôt (`USER_AGENT` dans `src/server/connectors/basecamp/client.ts`), à remplacer par l'adresse que l'équipe choisit.

### Miro

Le bouton est la seule façon de brancher Miro.

- **Où créer** : https://miro.com/app/settings/user-profile/apps (Your apps) › « Create new app ». Le compte doit avoir une équipe de développement (« Developer team »).
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URI for OAuth2.0 » (réglages de l'appli) : `http://localhost:3000/api/v1/connexions/oauth/miro/retour`
- **Droits** : `boards:read` et `boards:write` (écriture demandée d'avance ; Miro n'a rien de plus étroit, et ce droit permet aussi de supprimer tableaux et éléments). Leon n'envoie pas de paramètre `scope` : les droits sont ceux déclarés dans l'appli.
- **À activer, à la création** : la case « Expire user authorization token ». Les jetons durent alors 1 h et se renouvellent (le jeton de rafraîchissement dure 60 jours et change à chaque usage). **On ne peut plus la changer après la création** ; sans elle, le jeton dure jusqu'à la désinstallation de l'appli.
- **Pages demandées** : aucune d'après la documentation lue.
- **Variables** : `LEON_OAUTH_MIRO_ID` = « Client ID » (section « App Credentials »), `LEON_OAUTH_MIRO_SECRET` = « Client secret ».
- **Pour que d'autres comptes l'utilisent** : l'utilisateur choisit chez Miro l'équipe où installer Leon. Si une appli de l'équipe de développement s'installe dans les équipes des clients sans publication, la documentation lue ne le dit pas (à vérifier).

### Productboard

Le bouton est la seule façon de brancher Productboard.

- **Où créer** : https://app.productboard.com/oauth2/applications (avec un compte Productboard).
- **Nom** : « Leon ». Type d'appli : **confidentielle** (Leon garde un secret côté serveur).
- **Adresse de retour**, à enregistrer avec l'appli : `http://localhost:3000/api/v1/connexions/oauth/productboard/retour`. Productboard compare l'adresse au caractère près.
- **Droits** : `notes:read` et `notes:write` (écriture demandée d'avance). Pas `notes:delete`.
- **Pages demandées** : le formulaire n'est pas décrit par la documentation lue (à vérifier). Pour toute question : oauth2@productboard.com.
- **Variables** : `LEON_OAUTH_PRODUCTBOARD_ID` = `client_id`, `LEON_OAUTH_PRODUCTBOARD_SECRET` = `client_secret`, donnés après l'enregistrement (le secret n'expire pas).
- **Pour que d'autres comptes l'utilisent** : **seul un Maker avec accès administrateur** peut autoriser l'appli pour un espace de travail, et l'accès à l'API demande un plan Pro ou supérieur. Les applis autorisées se retrouvent dans Settings › Integrations (« Installed OAuth 2.0 integrations »).

### Microsoft (Outlook, OneDrive / SharePoint, Teams, Teams Chat, 

Une seule appli pour Outlook, OneDrive et SharePoint, et Teams, décrite dans `src/server/connectors/microsoft.ts`, avec **tous les droits demandés d'avance** (choix de David du 27/11/2026, comme pour Google), transcriptions des réunions Teams comprises. Aujourd'hui, Leon ne fait que lire, et la politique de confidentialité du site le dit : la relire avant de faire écrire, envoyer ou supprimer Leon. Outlook, OneDrive / SharePoint, Teams et Teams Chat passent par elle. Ce n'est pas l'appli de la connexion à Leon (`MICROSOFT_CLIENT_*`, « Continuer avec Microsoft ») : l'accord d'un administrateur pour l'une ne vaut pas pour l'autre.

- **Avant tout : un annuaire Microsoft (Entra ID) à Leon.** Microsoft n'inscrit une appli que dans un annuaire ; un compte personnel seul ne peut pas (relu le 27/11/2026, quickstart-create-new-tenant). On en a un en s'abonnant à Microsoft 365 (essai d'un mois, carte bancaire demandée, payant ensuite sauf si l'on coupe le renouvellement) ou à Azure (compte gratuit, carte demandée). S'inscrire avec un **compte professionnel** de l'annuaire (`prenom@<annuaire>.onmicrosoft.com`, ou `@leonmemory.com` une fois le domaine ajouté) : une appli inscrite avec un compte Microsoft personnel ne pourra jamais être vérifiée (publisher-verification-overview). L'appli de connexion à Leon (ID `33bd25c7-4a31-4ea9-9a05-08ce1d805b81`) a été créée par Amos : voir d'abord si son annuaire convient.
- **Où créer** : https://entra.microsoft.com › Entra ID › App registrations › « New registration ».
- **Nom** : « Leon ». **Supported account types** : « Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox) » : comptes professionnels de tout annuaire et comptes personnels (outlook.com, hotmail.fr), que Leon accepte pour Outlook et OneDrive (choix de David du 27/11/2026). Un compte personnel n'a pas de SharePoint : Leon n'en lit que le OneDrive. Teams et Teams Chat restent réservés aux comptes professionnels (Teams n'existe pas pour un compte personnel).
- **Adresses de retour**, dans Authentication › « Add a platform » › « Web » : `https://leonmemory.com/api/v1/connexions/oauth/microsoft/retour` et `http://localhost:3000/api/v1/connexions/oauth/microsoft/retour`. **C'est aussi l'adresse où revient le lien d'accord de l'administrateur** : rien d'autre à déclarer.
- **Droits** : API permissions › « Add a permission » › Microsoft Graph › « Delegated permissions », tous ceux-ci et aucun autre (le lien d'accord de l'administrateur ne demande que ceux de l'outil, mais Microsoft veut qu'ils soient tous déclarés ici) :
  - pour tous : `offline_access`, `User.Read` ;
  - Outlook : `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `MailboxSettings.Read` ;
  - OneDrive et SharePoint : `Files.ReadWrite.All`, `Sites.ReadWrite.All` ;
  - Teams (les canaux) : `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMember.Read.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send` (`ChannelMember.Read.All` ajouté le 27/11/2026, au code et dans Entra : les membres de chaque canal, pour savoir quels collègues le voient ; un administrateur qui avait déjà donné son accord à Teams doit le redonner) ;
  - Teams Chat (les conversations et les réunions) : `Chat.ReadWrite`, `ChatMessage.Send`, `OnlineMeetings.ReadWrite`, `OnlineMeetingTranscript.Read.All`, `OnlineMeetingRecording.Read.All`, `OnlineMeetingArtifact.Read.All`, et `Calendars.ReadWrite`, déjà déclaré pour Outlook : Leon trouve les réunions Teams dans l'agenda, puis lit leurs transcriptions.

  Jamais `MailboxSettings.ReadWrite` : c'est aussi le droit des règles de la boîte, qui peuvent transférer le courrier vers une autre adresse (la réponse d'absence en dépend aussi). Jamais de droit « Application » : Leon agit toujours au nom de la personne branchée. Dans votre propre annuaire, « Grant admin consent » évite l'écran d'accord à vos comptes.
- **Secret** : Certificates & secrets › « New client secret », 24 mois au plus. Copier la colonne « Value », **pas** « Secret ID ». Noter la date d'expiration : un secret expiré casse les boutons.
- **Variables** (Railway, production) : `LEON_OAUTH_MICROSOFT_ID` = « Application (client) ID » (page Overview), `LEON_OAUTH_MICROSOFT_SECRET` = la « Value » du secret.
- **Domaine d'éditeur**, une fois les variables en ligne : Branding & properties › « Publisher domain » › « Verify a new domain » › `leonmemory.com`. Microsoft lit `https://leonmemory.com/.well-known/microsoft-identity-association.json`, que Leon sert avec l'identifiant des deux applis (connexion et outils). L'écran d'accord montre alors leonmemory.com au lieu de « non vérifié » (howto-configure-publisher-domain, relu le 27/11/2026). Faire de même sur l'appli de connexion.
- **Notifications** : rien à régler dans l'appli. Après chaque relève, Leon demande à Microsoft de le prévenir d'un mail reçu ou envoyé et d'un changement d'agenda (`src/server/connectors/microsoft-notifications.ts`), et, pour Teams, d'un message dans les conversations de la personne ou dans chaque canal de ses équipes, et d'une transcription prête d'une réunion qu'elle organise (migration 0098) ; Microsoft appelle alors `https://leonmemory.com/api/microsoft/notifications`, une adresse publique, sans session, qu'aucune règle (Cloudflare) ne doit bloquer. Bloquée, ou sur un autre domaine que `BETTER_AUTH_URL`, Leon retombe sur sa relève du quart d'heure (Teams : une lecture par jour) ; Sentry ne le signale qu'à la création d'un abonnement (`microsoft.subscription_failed`). Un abonnement que Microsoft refuse (transcriptions fermées aux applis, quota de Teams atteint) n'est redemandé que le lendemain.
- **Pour que d'autres comptes l'utilisent** : un compte personnel se branche seul. Pour un compte professionnel, **l'administrateur Microsoft de l'entreprise accepte une fois, pour toute l'entreprise**, par le « Lien d'accord pour l'administrateur » que Leon montre sous le bouton de chaque outil Microsoft ; au retour, Leon dit « Accord donné : cliquez de nouveau sur Se connecter avec Outlook. » (ou avec OneDrive / SharePoint). C'est obligatoire dans un annuaire réglé par défaut (« Let Microsoft manage your consent settings » interdit à l'employé seul le courrier, l'agenda, les fichiers et les conversations), et aussi parce que l'appli n'a pas d'éditeur vérifié (accord « à risque », renvoyé à l'administrateur). Sans cet accord, Microsoft refuse la connexion ou affiche sa propre page « Approbation de l'administrateur requise », sans revenir vers Leon. Les transcriptions Teams demandent en plus que l'administrateur ait ouvert l'accès de Microsoft Graph aux transcriptions (« Manage transcript API access for Teams meetings », cité par la doc de getAllTranscripts).
- **Plus tard, la vérification d'éditeur** (badge bleu) : un compte Microsoft AI Cloud Partner Program vérifié dans Partner Center, au nom d'une **société immatriculée**, gratuit ; l'appli doit avoir été inscrite avec un compte professionnel et porter le domaine d'éditeur. Elle rassure l'administrateur sans le dispenser d'accepter.
- **Ce que Leon lit de OneDrive / SharePoint** : le OneDrive de la personne, puis les bibliothèques de documents des sites SharePoint qu'elle peut ouvrir ; les PDF, Word, Excel, PowerPoint, textes et Markdown de 10 Mo au plus, modifiés pendant la période choisie, puis les changements à chaque passage (lecture en delta) ; un fichier supprimé chez Microsoft part de Leon. Les fichiers se téléchargent sur l'hôte SharePoint de l'entreprise (`<entreprise>.sharepoint.com` et `<entreprise>-my.sharepoint.com`, lu une fois au branchement), ou sur `my.microsoftpersonalcontent.com` pour un compte personnel.
- **À savoir avant un client** : par défaut, les courriers, événements et fichiers lus ne sont pas partagés avec l'équipe : ils peuvent être lus par qui branche Outlook ou OneDrive / SharePoint et, sur le site de Leon, par ses managers en remontant. Un site d'équipe est relu par chaque personne qui branche, pour elle seule. Teams et Teams Chat suivent les droits de Teams (migration 0097) : une conversation, un canal ou une transcription est visible des collègues qui en sont membres ou invités à la réunion, même s'ils n'ont pas branché l'outil, et, sur le site de Leon, de leurs managers en remontant ; un canal standard d'une équipe publique, de toute l'équipe Leon. Leon lit les canaux privés et partagés (même avec une autre entreprise) ; les personnes d'une autre entreprise ne voient rien dans Leon. Microsoft n'autorise qu'une lecture par jour des canaux et des conversations : un message met jusqu'à un jour à arriver.

### Google (Gmail et Google Drive)

Une seule appli pour Gmail et Google Drive, décrite dans `src/server/connectors/google.ts`, avec **tous les droits demandés d'avance** (choix de David du 26/11/2026, après une première version en lecture seule le même jour) : tout Gmail, suppression définitive comprise, et ses réglages de base ; tout Drive. Seuls les transferts et la délégation Gmail (`gmail.settings.sharing`) restent exclus. Aujourd'hui, Leon ne fait que lire, et la politique de confidentialité du site le dit : la relire avant de faire écrire, envoyer ou supprimer Leon. Sans cette appli, les deux boutons passent encore par Pipedream.

- **Où créer** : https://console.cloud.google.com, dans un projet à part. Celui de Leon : « Leon connecteurs » (ID `leon-connecteurs-515908`), créé le 26/11/2026 sur le compte d'Amos. APIs & Services › Library : activer « Gmail API », « Google Drive API » (et « Google Calendar API » pour un futur Google Agenda).
- **Google Auth Platform › Branding** : nom « Leon », e-mail d'assistance, page d'accueil `https://leonmemory.com`, liens `https://leonmemory.com/privacy` et `https://leonmemory.com/terms` (sans eux, « Publish app » reste grisé), domaine autorisé `leonmemory.com`. **Pas de logo** : un logo impose la vérification de Google.
- **Audience** : « External », puis « Publish app » : l'appli doit être « In production ». En « Testing », l'accès de chaque utilisateur expire au bout de 7 jours.
- **Droits** (Data Access) : `https://mail.google.com/` et `https://www.googleapis.com/auth/gmail.settings.basic` pour Gmail, `https://www.googleapis.com/auth/drive` pour Drive (droits « restreints »), `https://www.googleapis.com/auth/calendar.readonly` (« sensible », pour plus tard). Chaque outil ne demande que ses droits, avec un nouvel accord et le choix du compte à chaque branchement. Une connexion faite avant un changement de droits garde les anciens : « Reconnecter » pour les nouveaux.
- **Adresses de retour** : Clients › « Create client » › « Web application », puis « Authorized redirect URIs » : `https://leonmemory.com/api/v1/connexions/oauth/google/retour` et `http://localhost:3000/api/v1/connexions/oauth/google/retour` (une appli Google accepte plusieurs adresses).
- **Variables** : `LEON_OAUTH_GOOGLE_ID` = le « Client ID » (il finit par `.apps.googleusercontent.com`), `LEON_OAUTH_GOOGLE_SECRET` = le secret du client, affiché une seule fois (sinon « Add secret » sur la page du client).
- **Pour que d'autres comptes l'utilisent** : l'appli n'est pas vérifiée, donc **100 utilisateurs au plus sur toute la vie du projet**, sans remise à zéro (le compteur est sur la page Audience). Chacun voit d'abord « Google n'a pas validé cette application » : « Paramètres avancés », puis « Accéder à leonmemory.com (non sécurisé) » (relu le 26/11/2026 : tant que l'appli n'est pas vérifiée, Google la nomme par son domaine, pas « Leon »). Au-delà, il faut faire vérifier l'appli par Google (pour Gmail et Drive, droits restreints, avec une évaluation de sécurité). L'administrateur Google Workspace d'un client peut aussi bloquer les applis qu'il n'a pas approuvées.
- **Une connexion déjà branchée par Pipedream** continue de passer par Pipedream (relevée aux heures de bureau). Son « Reconnecter », avec le même compte Google, la passe sur l'appli de Leon (relevée toutes les 15 minutes, comme les autres outils), et Pipedream oublie alors l'ancien compte.

## Ce que les documentations lues ne disent pas

À regarder au premier essai de chaque appli ; les écarts se corrigent ici et dans l'en-tête de l'`oauth.ts` de l'outil.

- **Notion** : les champs exigés pour une connexion publique (entreprise, confidentialité, conditions, e-mail) ; une revue avant diffusion.
- **Linear** : le libellé exact du réglage « Public » et les champs du formulaire ; ceux des webhooks ; qu'une alerte porte toujours `organizationId` ; qu'un membre sans droit d'administrateur qui autorise l'appli crée bien le webhook de son organisation.
- **GitLab** : qu'une appli attachée à un compte (ou à un groupe) puisse être autorisée par d'autres comptes.
- **Atlassian** : les champs demandés pour activer le partage (éditeur, confidentialité, données personnelles) ; que la liste des sites rendue au jeton contienne les droits fins de Confluence tels qu'on les demande.
- **Asana** : les options de « Manage distribution ».
- **monday.com** : l'installation par un administrateur du compte client, et les pages exigées avant la production.
- **HubSpot** : la valeur de `config.distribution` qui donne une appli non listée, et les pages exigées pour la diffuser.
- **Help Scout** : l'autorisation par un compte autre que celui qui a créé l'appli ; qu'`http://localhost` soit admis comme adresse de retour.
- **Attio** : que les noms de droits ci-dessus soient ceux de la console (la page des droits répond 404 : ils viennent de la description de l'API) ; les pages exigées avant publication.
- **Basecamp** : les champs du formulaire de Launchpad.
- **Miro** : l'installation dans les équipes de clients sans publier l'appli ; qu'`http://localhost` soit admis.
- **Productboard** : les champs du formulaire d'enregistrement ; que `notes:write` soit bien le nom accepté (d'anciennes intégrations parlent de `notes:create` ou `notes:manage`).
- **Microsoft** : l'écran exact vu par un employé dont l'entreprise réclame l'accord de l'administrateur ; que le lien d'accord accepte `offline_access` avec les droits de Graph de l'outil ; qu'un compte personnel puisse accepter seul une appli sans éditeur vérifié. Pour OneDrive / SharePoint : que `/sites?search=*` rende bien tous les sites que la personne peut lire (la doc ne cite pas « * ») ; que l'hôte de `siteCollection.hostname` soit celui des adresses de téléchargement ; l'hôte de téléchargement d'un OneDrive personnel (`my.microsoftpersonalcontent.com` d'après des retours de 2024, un ancien `*.files.1drv.com` dans l'exemple de la doc). Pour Teams Chat, qu'un invité qui n'organise pas la réunion retrouve sa transcription par le lien de l'agenda, et le format des transcriptions sans nom (voir `teams/connector.ts`).
- **Google** : l'écran d'accord avec plusieurs droits (une case à cocher par droit ?) ; avec le seul droit de lecture, il disait « leonmemory.com pourra : Afficher vos e-mails et vos paramètres de messagerie », sans case (vu par David le 26/11/2026) ; l'échange du code avec PKCE.

Une fois les applis créées : brancher GitHub et Linear par bouton avec la checklist [`connecteurs-verification.md`](connecteurs-verification.md) (section « Brancher par bouton »).
