# Créer les applis OAuth de Leon

À suivre par Amos ou David, une fois par éditeur. Pour que le bouton « Se connecter avec… » marche, Leon doit exister chez l'éditeur sous la forme d'une **appli** (on dit aussi « intégration » ou « connexion »). Elle porte un identifiant et un secret, que Leon met dans `.env.local`. Ce guide dit, éditeur par éditeur, où la créer, quoi y écrire, quels droits cocher et ce qu'il faut activer pour que d'autres comptes que le vôtre l'utilisent.

Chaque section reprend les descriptions `oauth` du code (`src/server/connectors/<outil>/oauth.ts`, droits, adresses) et les pages de documentation que leurs en-têtes citent, relues le 15 octobre 2026. Une console change sans prévenir : en cas d'écart entre ce guide et ce que vous voyez, le code et la documentation de l'éditeur ont raison, et il faut corriger le guide. Ce qu'on n'a pas pu confirmer est marqué « à vérifier » et repris en bas de page.

## Les règles communes

- **Un seul nom : « Leon ».** C'est ce que l'utilisateur lit sur l'écran d'autorisation. Quand une console demande un logo, une description, un site ou un contact, mettre ceux de l'entreprise.
- **L'adresse de retour** (on dit aussi « redirect URI », « callback URL » ou « redirection ») est `<BETTER_AUTH_URL>/api/v1/connexions/oauth/<appli>/retour`, soit `http://localhost:3000/api/v1/connexions/oauth/<appli>/retour` en local. `<appli>` est l'identifiant de l'outil en minuscules, sauf `atlassian` pour Jira et Confluence. Il n'y en a qu'une par appli. Elle doit être recopiée au caractère près : pas de barre finale, pas de `127.0.0.1` à la place de `localhost`, `http` ou `https` comme dans `BETTER_AUTH_URL`.
- **Les droits : la lecture seule, les plus étroits que l'éditeur propose.** Aucune section ne demande un droit d'écriture. Quand l'éditeur n'a pas de droit de lecture seule (ClickUp, Basecamp), la section le dit : Leon ne fait que lire, mais l'autorisation est plus large.
- **Les deux variables** vont dans `.env.local`, jamais dans le dépôt, une PR ou un message : `LEON_OAUTH_<APPLI>_ID` et `LEON_OAUTH_<APPLI>_SECRET` (`ATLASSIAN` pour Jira et Confluence, l'identifiant de l'outil en majuscules pour les autres, `HELPSCOUT` pour Help Scout). Le secret ne s'affiche souvent qu'une fois : le copier tout de suite. Puis relancer `pnpm dev`.
- **Une paire vide ou incomplète désactive le bouton** de l'outil, sans autre effet : son panneau garde alors le formulaire de clé (ou, pour un outil sans clé, dit « L'appli … n'est pas encore configurée sur ce serveur. »). Une paire à moitié remplie est signalée au démarrage : `[leon] LEON_OAUTH_… absente : le bouton … est désactivé.`
- **Un secret qui a fuité** se renouvelle dans la console de l'éditeur (« Regenerate », « Rotate », « Renew », « Reset » selon l'éditeur), puis dans `.env.local`. Les connexions déjà branchées gardent leurs jetons.
- **Une appli par environnement** dès que l'éditeur n'accepte qu'une adresse de retour (Atlassian), et c'est plus prudent partout : une appli pour le poste local (`http://localhost:3000`), une pour la production (`https://` suivi de l'adresse publique de Leon, la même valeur que `BETTER_AUTH_URL`). Les variables de la production se règlent chez l'hébergeur, pas dans le dépôt.
- **`https` en local** : Asana refuse une adresse `http`, et ClickUp prévient qu'elle ne sera plus acceptée. Pour ces deux-là, faire passer Leon par un tunnel `https` (ou un proxy TLS local) et mettre son adresse dans `BETTER_AUTH_URL` et dans la console.

## Les seize applis

Chaque section se lit de la même façon : où créer l'appli, l'adresse de retour à y mettre, les droits, les pages que l'éditeur exige, les variables, et ce qui permet à d'autres comptes de s'en servir.

### GitHub

Une **GitHub App**, pas une « OAuth App » : le droit `repo` d'une OAuth App donnerait l'écriture sur tous les dépôts privés. Ici, les permissions sont celles de l'appli, et le jeton n'ouvre que les dépôts où elle est installée.

- **Où créer** : https://github.com/settings/apps/new (compte personnel), ou pour une organisation : Your organizations › Settings › Developer settings › GitHub Apps › New GitHub App.
- **Nom** : « Leon » (34 caractères au plus, unique sur tout GitHub : s'il est pris, « Leon » suivi du nom de l'entreprise). « Homepage URL » : l'adresse publique de Leon (en local, celle du dépôt).
- **Adresse de retour**, dans « Callback URL » : `http://localhost:3000/api/v1/connexions/oauth/github/retour`
- **Après l'installation**, dans « Post installation » : « Setup URL » = `http://localhost:3000/connexions?branche=github` (l'adresse de Leon suivie de `/connexions?branche=github`), et « Redirect on update » **cochée**. GitHub y renvoie l'utilisateur une fois ses dépôts choisis.
- **Cases** : « Expire user authorization tokens » **cochée** (laisser ainsi : le jeton dure 8 h et Leon le renouvelle) ; « Request user authorization (OAuth) during installation » **décochée** (sinon GitHub renvoie vers Leon sans `state`) ; « Webhook › Active » décochée.
- **Droits** (Repository permissions) : « Issues » et « Pull requests » en « Read-only » ; « Metadata » en « Read-only » (déjà imposé). Aucune autre permission. Leon ne demande aucun paramètre `scope` : les droits sont ceux de l'appli.
- **Pages demandées** : aucune. Un logo est facultatif.
- **Variables** : `LEON_OAUTH_GITHUB_ID` = le « Client ID » de l'appli (pas son « App ID »), `LEON_OAUTH_GITHUB_SECRET` = un secret créé sur la même page (« Client secrets › Generate a new client secret »), `LEON_OAUTH_GITHUB_APP` = le nom court de l'appli (celui de son adresse publique, github.com/apps/<nom>).
- **Pour que d'autres comptes l'utilisent** : « Where can this GitHub App be installed? » sur « Any account » (appli publique). Chaque compte ou organisation installe ensuite l'appli sur les dépôts voulus (page publique de l'appli › Install, en limitant l'accès aux dépôts à brancher) ; dans une organisation, un propriétaire doit approuver l'installation. Sans installation, l'appli ne voit aucun dépôt. Leon ne demande rien avant le clic : après l'autorisation, si l'appli n'est installée sur aucun dépôt, il enchaîne sur son écran d'installation, où l'on choisit les dépôts, puis GitHub revient à Leon (« Setup URL »). Leon lit les dépôts où l'appli est installée (20 au plus), relus à chaque passage.

### Notion

Une **connexion publique** (OAuth). Une connexion interne n'a pas de bouton : son secret se colle dans le formulaire de clé.

- **Où créer** : https://app.notion.com/developers/connections (aussi https://www.notion.so/developers) › nouvelle connexion publique.
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URI(s) » de la configuration OAuth : `http://localhost:3000/api/v1/connexions/oauth/notion/retour`
- **Droits** (capacités à cocher dans la connexion) : lire le contenu (« Read content »), lire les commentaires (« Read comments »), lire les informations des utilisateurs, adresses e-mail comprises (« Read user information including email addresses »). Rien en écriture. Leon ne demande aucun paramètre `scope` : l'utilisateur choisit les pages à partager pendant l'autorisation.
- **Installation** : « Installation scope » sur « Any workspace » (**ne se change plus après la création**).
- **Pages demandées** : pour une connexion publique, Notion demande le nom et le site de l'entreprise, une page de confidentialité, des conditions d'utilisation et un e-mail de support (à vérifier), et un logo.
- **Variables** : `LEON_OAUTH_NOTION_ID` = « OAuth client ID », `LEON_OAUTH_NOTION_SECRET` = « OAuth client secret », tous deux dans l'onglet « Configuration ».
- **Pour que d'autres comptes l'utilisent** : la connexion doit être **publique** (un espace extérieur ne peut pas autoriser une connexion interne). Si Notion exige une revue avant diffusion, la demander tôt (à vérifier).

### Linear

- **Où créer** : https://linear.app/settings/api/applications/new (Réglages › API › Applications OAuth). Tous les administrateurs de l'espace où elle est créée y ont accès : mieux vaut la créer dans un espace dédié que dans l'espace de travail de l'équipe.
- **Nom** : « Leon ». Linear demande aussi un nom et une adresse de développeur (l'entreprise et son site) et une icône.
- **Adresse de retour**, dans « Callback URLs » : `http://localhost:3000/api/v1/connexions/oauth/linear/retour`
- **Droits** : aucune case. Leon demande `read` (lecture seule) dans l'adresse d'autorisation, au nom de l'utilisateur.
- **Pages demandées** : aucune d'après la documentation lue.
- **Variables** : `LEON_OAUTH_LINEAR_ID` = le « Client ID » donné à la création, `LEON_OAUTH_LINEAR_SECRET` = le secret de la même page (« Rotate secret » pour en changer).
- **Pour que d'autres comptes l'utilisent** : la distribution de l'appli doit être **publique** (réglage `private` ou `public`, privé par défaut ; case « Public » du formulaire, à vérifier). Privée, l'appli ne s'installe que dans l'espace où elle a été créée.

### GitLab

gitlab.com seulement ; une installation de GitLab hébergée par le client n'est pas prise en charge.

- **Où créer** : https://gitlab.com/-/user_settings/applications (avatar › Edit profile › Access › Applications › Add new application). Pour qu'elle ne dépende pas d'une personne, la créer dans un groupe (Settings › Applications du groupe).
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URI » : `http://localhost:3000/api/v1/connexions/oauth/gitlab/retour`
- **Droits** (« Scopes ») : `read_api` seulement. GitLab ne permet pas de le limiter à certains projets : avec le bouton, Leon lit les 20 projets les plus actifs dont l'utilisateur est membre (avec une clé collée, ceux de la liste).
- **Cases** : « Confidential » **cochée** (Leon envoie le secret) ; « Trusted » non cochée (elle n'existe que pour une appli de toute l'instance).
- **Pages demandées** : aucune.
- **Variables** : `LEON_OAUTH_GITLAB_ID` = « Application ID », `LEON_OAUTH_GITLAB_SECRET` = « Secret » (affiché après « Save application »).
- **Pour que d'autres comptes l'utilisent** : rien à activer. Les autres comptes passent par l'écran d'autorisation (à vérifier au premier essai : la documentation ne le dit pas noir sur blanc).

### Jira et Confluence

**Une seule appli Atlassian pour les deux.** C'est pourquoi l'adresse de retour s'appelle `atlassian`, et que les variables aussi.

- **Où créer** : https://developer.atlassian.com/console/myapps/ › Create › « OAuth 2.0 integration ».
- **Nom** : « Leon ».
- **Adresse de retour** : Authorization › OAuth 2.0 (3LO) › Configure › « Callback URL » : `http://localhost:3000/api/v1/connexions/oauth/atlassian/retour`. Atlassian n'en accepte qu'**une** par appli : une appli pour le poste local, une autre pour la production.
- **Droits** : Permissions › Add à côté de chaque API, puis Configure. Pour Jira (« Jira API ») : `read:jira-work`, `read:jira-user`. Pour Confluence (« Confluence API ») : `read:page:confluence`, `read:comment:confluence`, `read:space:confluence`, `read:user:confluence`, `read:confluence-user`. Selon la console, ils sont répartis entre les onglets « Classic scopes » et « Granular scopes ». `offline_access` ne se coche pas : Leon le demande dans l'adresse d'autorisation, pour obtenir un jeton de rafraîchissement (qui expire après 90 jours sans usage).
- **Pages demandées** : aucune pour créer l'appli. Pour la partager, Atlassian demande un nom d'éditeur et une page de confidentialité (mettre ceux de l'entreprise ; à vérifier).
- **Variables** : `LEON_OAUTH_ATLASSIAN_ID` = « Client ID », `LEON_OAUTH_ATLASSIAN_SECRET` = « Secret », tous deux dans « Settings ».
- **Pour que d'autres comptes l'utilisent** : Distribution › « Enable sharing » activé. Sans cela, seule la personne qui a créé l'appli peut l'autoriser. Les utilisateurs voient un avertissement « Atlassian n'a pas revu cette appli » : on peut continuer. Leon lit les sites auxquels le compte donne accès ; avec plusieurs sites, l'utilisateur peut saisir le sien avant le clic (champ « Site Atlassian »), sinon Leon prend le premier.

### Asana

- **Où créer** : https://app.asana.com/0/my-apps › « Create new app ».
- **Nom** : « Leon » (visible à l'autorisation).
- **Adresse de retour**, dans « Redirect URL » : `http://localhost:3000/api/v1/connexions/oauth/asana/retour`. Asana exige `https` hors appli native : en local, un tunnel `https` (voir les règles communes).
- **Droits** : onglet OAuth › « Permission scopes », avec « Full permissions » **désactivé** (sinon Asana interdit de demander les droits un à un et renvoie `forbidden_scopes`) : `tasks:read`, `projects:read`, `stories:read`, `users:read`.
- **Pages demandées** : aucune ; icône et description facultatives.
- **Variables** : `LEON_OAUTH_ASANA_ID` = « Client ID », `LEON_OAUTH_ASANA_SECRET` = « Client secret », tous deux dans l'onglet OAuth.
- **Pour que d'autres comptes l'utilisent** : « Manage distribution » doit rendre l'appli disponible dans l'espace de travail de l'utilisateur (la documentation lue ne détaille pas les options : à vérifier).

### ClickUp

- **Où créer** : https://app.clickup.com/settings/apps (avatar › Settings › Apps) › « Create new app ». Seuls le propriétaire et les administrateurs de l'espace de travail peuvent le faire.
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URL » : `http://localhost:3000/api/v1/connexions/oauth/clickup/retour`. ClickUp prévient que les adresses sans `https` pourraient ne plus être acceptées.
- **Droits** : aucun, ClickUp n'en propose pas. L'utilisateur choisit les espaces de travail à ouvrir pendant l'autorisation, et l'autorisation donne les mêmes droits que son compte sur ces espaces ; Leon ne fait que lire les tâches et leurs commentaires.
- **Pages demandées** : aucune.
- **Variables** : `LEON_OAUTH_CLICKUP_ID` = l'identifiant (`client_id`), `LEON_OAUTH_CLICKUP_SECRET` = le secret, donnés à la création de l'appli (les copier alors).
- **Pour que d'autres comptes l'utilisent** : la documentation lue ne décrit aucun réglage de diffusion. Les conditions d'utilisation de ClickUp sont à faire confirmer par écrit avant tout client.

### monday.com

- **Où créer** : le « Developer Center » de monday.com (avatar › Développeurs, https://developer.monday.com/apps/docs/the-developer-center) › créer une appli.
- **Nom** : « Leon ».
- **Adresse de retour** : onglet « OAuth & Permissions » › redirect URLs : `http://localhost:3000/api/v1/connexions/oauth/monday/retour`
- **Droits** : même onglet : `boards:read`, `updates:read`, `me:read`.
- **À activer** : « New OAuth Flow » sur la version de l'appli (le réglage se choisit par version : créer un brouillon, l'activer, l'essayer avec « Active for me », puis le passer en production). Sans lui, les adresses et le corps de l'échange ne sont pas ceux que Leon utilise.
- **Pages demandées** : aucune pour une appli non listée (à vérifier).
- **Variables** : `LEON_OAUTH_MONDAY_ID` = « Client ID », `LEON_OAUTH_MONDAY_SECRET` = « Client Secret », tous deux dans « Basic Information » du Developer Center.
- **Pour que d'autres comptes l'utilisent** : tant que la version n'est pas en production, seuls les collaborateurs de l'appli peuvent faire le déroulé. Un administrateur du compte client peut devoir installer l'appli d'abord (à vérifier). Conditions d'utilisation de monday.com : l'API est réservée à un usage interne, à faire confirmer par écrit avant tout client.

### Airtable

- **Où créer** : https://airtable.com/create/oauth › « Register new OAuth integration ».
- **Nom** : « Leon ».
- **Adresse de retour**, dans « OAuth redirect URI » : `http://localhost:3000/api/v1/connexions/oauth/airtable/retour`
- **Droits** (« Permission scopes ») : `data.records:read`, `schema.bases:read`, `data.recordComments:read`.
- **Secret** : « Generate client secret », à copier avant de fermer (il ne se récupère pas ; « Regenerate client secret » en crée un autre et invalide l'ancien). Leon l'envoie en `Authorization: Basic`.
- **Pages demandées** : l'adresse d'une **politique de confidentialité** et des **conditions d'utilisation** (« Privacy policy URL », « Terms of service URL ») sont obligatoires pour que d'autres comptes puissent autoriser l'appli ; l'e-mail d'assistance et le logo sont recommandés.
- **Variables** : `LEON_OAUTH_AIRTABLE_ID` = « Client ID », `LEON_OAUTH_AIRTABLE_SECRET` = le secret généré, tous deux sur la page de gestion de l'intégration.
- **Pour que d'autres comptes l'utilisent** : renseigner les deux adresses ci-dessus. Aucune revue n'est décrite par la documentation lue.

### HubSpot

**Appli publique non listée sur la place de marché.** Depuis le 26 mai 2026, HubSpot ne laisse plus créer d'appli publique « héritée » : une nouvelle appli se crée avec la plateforme à projets, en ligne de commande (`hs`).

- **Où créer** : un compte développeur HubSpot (https://developers.hubspot.com), puis dans un dossier à part `hs project create`, base « App ». Puis `hs project upload`.
- **Nom** : « Leon » (dans `app-hsmeta.json`).
- **Adresse de retour** : `config.auth.redirectUrls` : `http://localhost:3000/api/v1/connexions/oauth/hubspot/retour`. Une adresse de production doit être en `https`.
- **Droits** : `config.auth.type` sur `"oauth"` et `config.auth.requiredScopes` : `oauth`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.owners.read`, `sales-email-read`. Les droits déclarés comme obligatoires doivent tous figurer dans l'adresse d'autorisation : l'appli déclare exactement cette liste, ni plus ni moins. Aucun droit facultatif.
- **Pages demandées** : aucune pour une appli non listée (à vérifier) ; une fiche sur la place de marché demande logo, description et page de confidentialité, mais Leon n'en a pas besoin.
- **Variables** : `LEON_OAUTH_HUBSPOT_ID` = « Client ID » et `LEON_OAUTH_HUBSPOT_SECRET` = « Client secret », visibles avec `hs project open` › le composant de l'appli › onglet « Auth » › « Client credentials ».
- **Pour que d'autres comptes l'utilisent** : `config.distribution` : la valeur `"marketplace"` du modèle vise la place de marché ; celle qui réserve l'installation aux comptes voulus, sans fiche publique (appli non listée), est à prendre dans la référence de distribution de HubSpot (à vérifier). Le client installe ensuite l'appli lui-même : onglet « Distribution » de l'appli › « Install now ». **Seul un super administrateur du compte HubSpot peut l'installer.**

### Help Scout

Le flux « code d'autorisation » de l'API Boîte de réception. C'est une appli différente de celle de la clé collée (identifiant et secret sans retour chez l'éditeur) : il faut y mettre l'adresse de retour.

- **Où créer** : Help Scout › Your Profile › My apps › « Create My App » (documentation : https://developer.helpscout.com/mailbox-api/overview/authentication/).
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirection URL » : `http://localhost:3000/api/v1/connexions/oauth/helpscout/retour`
- **Droits** : aucun, l'API de Help Scout n'en a pas. Le jeton suit les droits de l'utilisateur qui autorise (il faut un utilisateur actif du compte) ; Leon ne fait que lire les conversations.
- **Pages demandées** : aucune d'après la documentation lue. Plan Standard ou supérieur requis pour avoir accès à l'API.
- **Variables** : `LEON_OAUTH_HELPSCOUT_ID` = « App ID », `LEON_OAUTH_HELPSCOUT_SECRET` = « App Secret », tous deux sur la fiche de l'appli.
- **Pour que d'autres comptes l'utilisent** : la documentation ne dit pas si un utilisateur d'un autre compte Help Scout peut autoriser une appli créée dans le vôtre (à vérifier au premier essai). Si Help Scout répond que non, une appli par compte client sera nécessaire.

### Attio

- **Où créer** : https://build.attio.com › « New app » (un nom et un identifiant court, à choisir une fois pour toutes) › « Create app ».
- **Nom** : « Leon ».
- **Adresse de retour** : onglet OAuth, interrupteur OAuth 2.0 activé en haut de la page, puis « Redirect URIs » : `http://localhost:3000/api/v1/connexions/oauth/attio/retour`
- **Droits** : onglet des droits (« Scopes ») de la console, pas dans l'adresse d'autorisation, tous en lecture : `note:read`, `comment:read`, `user_management:read`, `object_configuration:read`, `record_permission:read`. Leon demande un jeton d'espace (`token_level=workspace`), que seul un administrateur de l'espace peut accorder.
- **Pages demandées** : aucune pour une appli non publiée (à vérifier).
- **Variables** : `LEON_OAUTH_ATTIO_ID` et `LEON_OAUTH_ATTIO_SECRET`, tous deux dans l'onglet OAuth de l'appli.
- **Pour que d'autres comptes l'utilisent** : une appli **non publiée** s'installe dans 25 espaces au plus, avec un avertissement « pas encore approuvée par Attio » (on peut continuer). Au-delà, il faut la revue d'Attio (cycle de publication). C'est assez pour nos pilotes.

### Basecamp

Basecamp ne propose pas de droit en lecture seule : l'autorisation couvre tout le compte de l'utilisateur, mais Leon ne fait que lire les messages, les documents et les commentaires. Le bouton est la seule façon de brancher Basecamp.

- **Où créer** : https://launchpad.37signals.com/integrations (« Register one now »). Le formulaire n'est pas décrit par la documentation : y mettre le nom, l'entreprise, le site et l'adresse de retour.
- **Nom** : « Leon ».
- **Adresse de retour** : `http://localhost:3000/api/v1/connexions/oauth/basecamp/retour`
- **Droits** : aucun, Launchpad ne connaît pas de droits.
- **Pages demandées** : aucune d'après la documentation lue.
- **Variables** : `LEON_OAUTH_BASECAMP_ID` = l'identifiant (`client_id`), `LEON_OAUTH_BASECAMP_SECRET` = le secret (`client_secret`), attribués à l'enregistrement.
- **Pour que d'autres comptes l'utilisent** : la documentation ne décrit aucun réglage de diffusion. Leon prend le premier compte Basecamp (version 3 ou suivante) de la personne qui autorise.
- **À décider avant un client** : Basecamp impose un `User-Agent` qui contient une adresse de contact. Leon met aujourd'hui le lien du dépôt (`USER_AGENT` dans `src/server/connectors/basecamp/client.ts`), à remplacer par l'adresse que l'équipe choisit.

### Miro

Le bouton est la seule façon de brancher Miro.

- **Où créer** : https://miro.com/app/settings/user-profile/apps (Your apps) › « Create new app ». Le compte doit avoir une équipe de développement (« Developer team »).
- **Nom** : « Leon ».
- **Adresse de retour**, dans « Redirect URI for OAuth2.0 » (réglages de l'appli) : `http://localhost:3000/api/v1/connexions/oauth/miro/retour`
- **Droits** : `boards:read` seulement. Leon n'envoie pas de paramètre `scope` : les droits sont ceux déclarés dans l'appli.
- **À activer, à la création** : la case « Expire user authorization token ». Les jetons durent alors 1 h et se renouvellent (le jeton de rafraîchissement dure 60 jours et change à chaque usage). **On ne peut plus la changer après la création** ; sans elle, le jeton dure jusqu'à la désinstallation de l'appli.
- **Pages demandées** : aucune d'après la documentation lue.
- **Variables** : `LEON_OAUTH_MIRO_ID` = « Client ID » (section « App Credentials »), `LEON_OAUTH_MIRO_SECRET` = « Client secret ».
- **Pour que d'autres comptes l'utilisent** : l'utilisateur choisit chez Miro l'équipe où installer Leon. Si une appli de l'équipe de développement s'installe dans les équipes des clients sans publication, la documentation lue ne le dit pas (à vérifier).

### Productboard

Le bouton est la seule façon de brancher Productboard.

- **Où créer** : https://app.productboard.com/oauth2/applications (avec un compte Productboard).
- **Nom** : « Leon ». Type d'appli : **confidentielle** (Leon garde un secret côté serveur).
- **Adresse de retour**, à enregistrer avec l'appli : `http://localhost:3000/api/v1/connexions/oauth/productboard/retour`. Productboard compare l'adresse au caractère près.
- **Droits** : `notes:read` seulement.
- **Pages demandées** : le formulaire n'est pas décrit par la documentation lue (à vérifier). Pour toute question : oauth2@productboard.com.
- **Variables** : `LEON_OAUTH_PRODUCTBOARD_ID` = `client_id`, `LEON_OAUTH_PRODUCTBOARD_SECRET` = `client_secret`, donnés après l'enregistrement (le secret n'expire pas).
- **Pour que d'autres comptes l'utilisent** : **seul un Maker avec accès administrateur** peut autoriser l'appli pour un espace de travail, et l'accès à l'API demande un plan Pro ou supérieur. Les applis autorisées se retrouvent dans Settings › Integrations (« Installed OAuth 2.0 integrations »).

### Outlook

Microsoft 365 (courrier et agenda), via Microsoft Graph. Comptes professionnels ou scolaires seulement (l'adresse d'autorisation est celle du locataire `organizations`). Le bouton est la seule façon de brancher Outlook. **L'administrateur Microsoft de l'entreprise doit donner son accord une fois.**

- **Où créer** : https://entra.microsoft.com › Entra ID › App registrations › « New registration ».
- **Nom** : « Leon ». **Supported account types** : « Multiple Entra ID tenants » (comptes professionnels ou scolaires de n'importe quel annuaire), jamais « Personal accounts only ».
- **Adresse de retour**, dans Authentication › « Add Redirect URI » › plateforme « Web » : `http://localhost:3000/api/v1/connexions/oauth/outlook/retour`. **C'est aussi l'adresse où revient le lien d'accord de l'administrateur** : elle sert deux fois, une seule à déclarer.
- **Droits** : API permissions › « Add a permission » › Microsoft Graph › « Delegated permissions » : `offline_access`, `User.Read`, `Mail.Read`, `Calendars.Read`. Le lien d'accord administrateur accorde ce qui est déclaré ici (`.default`) : déclarer exactement ces quatre droits, rien d'autre. Leon ne lit que la boîte de réception, les éléments envoyés et l'agenda ; il n'écrit rien.
- **Secret** : Certificates & secrets › « New client secret ». Copier la colonne « Value », **pas** « Secret ID ». Un secret a une date d'expiration : la noter, car un secret expiré casse le bouton.
- **Pages demandées** : aucune pour créer l'appli. Sans éditeur vérifié (« publisher verification »), Microsoft traite l'appli comme non vérifiée dans les autres annuaires et réclame l'accord de l'administrateur (à vérifier).
- **Variables** : `LEON_OAUTH_OUTLOOK_ID` = « Application (client) ID » (page Overview), `LEON_OAUTH_OUTLOOK_SECRET` = la « Value » du secret.
- **Pour que d'autres comptes l'utilisent** : le choix « Multiple Entra ID tenants » ci-dessus. Puis l'administrateur Microsoft du client ouvre une fois le « Lien d'accord pour l'administrateur » que Leon affiche sous le bouton d'Outlook et accepte ; au retour, Leon dit « Accord donné : cliquez de nouveau sur Se connecter avec Outlook. ». Sans cet accord, Microsoft refuse la connexion, ou affiche sa propre page « Approbation de l'administrateur requise » sans revenir vers Leon. Dans votre propre annuaire, vous pouvez l'accorder depuis API permissions › « Grant admin consent ».
- **À décider avant un client** : par la règle d'équipe de Leon, les courriers et événements lus deviennent visibles de toute l'équipe (le panneau l'écrit).

## Ce que les documentations lues ne disent pas

À regarder au premier essai de chaque appli ; les écarts se corrigent ici et dans l'en-tête de l'`oauth.ts` de l'outil.

- **Notion** : les champs exigés pour une connexion publique (entreprise, confidentialité, conditions, e-mail) ; une revue avant diffusion.
- **Linear** : le libellé exact du réglage « Public » et les champs du formulaire.
- **GitLab** : qu'une appli attachée à un compte (ou à un groupe) puisse être autorisée par d'autres comptes.
- **Atlassian** : les champs demandés pour activer le partage (éditeur, confidentialité, données personnelles) ; que la liste des sites rendue au jeton contienne les droits fins de Confluence tels qu'on les demande.
- **Asana** : les options de « Manage distribution ».
- **monday.com** : l'installation par un administrateur du compte client, et les pages exigées avant la production.
- **HubSpot** : la valeur de `config.distribution` qui donne une appli non listée, et les pages exigées pour la diffuser.
- **Help Scout** : l'autorisation par un compte autre que celui qui a créé l'appli ; qu'`http://localhost` soit admis comme adresse de retour.
- **Attio** : que les noms de droits ci-dessus soient ceux de la console ; les pages exigées avant publication.
- **Basecamp** : les champs du formulaire de Launchpad.
- **Miro** : l'installation dans les équipes de clients sans publier l'appli ; qu'`http://localhost` soit admis.
- **Productboard** : les champs du formulaire d'enregistrement.
- **Outlook** : les pages exigées et l'écran exact vu par un utilisateur dont l'entreprise réclame l'accord de l'administrateur.

Une fois les applis créées : brancher GitHub et Linear par bouton avec la checklist [`connecteurs-verification.md`](connecteurs-verification.md) (section « Brancher par bouton »).
