# 04 - Événements en temps réel : mail, agenda, messagerie, CRM, support

État des lieux au 19 novembre 2026. Statut : version finale (24 requêtes WebSearch, aucune page ouverte directement ; les faits viennent des résumés). Nature des faits : officiel / tiers / déduit. « à vérifier » = vient de ma mémoire, pas d'une source trouvée.

## Fiches par outil

> Source des résumés : WebSearch « extended » (les résumés citent les pages).

### Gmail (users.watch + Pub/Sub)
- Mécanisme : file Pub/Sub (push HTTPS ou pull). `users.watch` (officiel : https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch).
- Création : appel `POST gmail/v1/users/me/watch` avec `topicName` (projet GCP de l'application) et `labelIds` ; par compte connecté (jeton OAuth de l'utilisateur), mais un seul topic par application. Le compte de service Gmail `gmail-api-push@system.gserviceaccount.com` doit avoir le rôle Pub/Sub Publisher sur le topic (à vérifier, mémoire). Un 403 vient presque toujours de là (tiers : https://www.unipile.com/gmail-api-push-notifications/).
- Portée : une portée Gmail lecture (ex. `gmail.readonly`, `gmail.metadata` ou `gmail.modify`) ; restreinte donc audit Google (voir section sortie de Pipedream).
- Contenu : adresse e-mail + `historyId` seulement. Il faut appeler `users.history.list(startHistoryId)` puis `messages.get` (tiers, même source).
- Authenticité : push Pub/Sub avec jeton OIDC (JWT Google) à vérifier (audience, e-mail du compte de service) ; à vérifier, mémoire.
- Expiration : réponse de `watch` donne `expiration` (ms epoch). Environ 7 jours (tiers : unipile ; la doc officielle lue ne l'écrit pas en clair). Renouveler par un nouvel appel à `watch` ; bonne pratique citée par des tiers : une fois par jour.
- Reprises : Pub/Sub retente jusqu'à ack. Si `history.list` renvoie 404 (historyId trop ancien), faire une resynchronisation complète (à vérifier, mémoire).
- Pièges : notifications possiblement perdues ou en retard, donc garder un relevé de secours (tiers). Un seul `watch` actif par utilisateur et par application.

### Google Agenda (canaux)
- Mécanisme : webhook par canal (`events.watch`) (officiel : https://developers.google.com/workspace/calendar/api/guides/push et https://developers.google.com/workspace/calendar/api/v3/reference/events/watch).
- Création : `POST calendar/v3/calendars/{calendarId}/events/watch` avec `id` (UUID), `type: "web_hook"`, `address` (HTTPS, certificat valide), `token` (secret libre), `expiration` optionnel. Par calendrier et par compte connecté. Portée `calendar.readonly` ou `calendar.events` (à vérifier).
- Contenu : aucun corps. En-têtes `X-Goog-Channel-Token` (votre jeton, sert à vérifier la source), `X-Goog-Channel-ID`, `X-Goog-Resource-State` (`sync` à la création, puis `exists`) (en-têtes d'état : à vérifier, mémoire). Ensuite sync incrémentale avec `syncToken` ; 410 Gone = resync complète (tiers : gist, non confirmé).
- Expiration : la réponse donne `expiration` ; pas de renouvellement auto, il faut créer un nouveau canal avant la fin. TTL maximal par défaut : non trouvé.
- Limites/pièges : un canal par calendrier ; nombreux utilisateurs = nombreux canaux à renouveler. Nango décrit le montage temps réel (https://nango.dev/blog/how-to-build-a-real-time-google-calendar-api-integration/, tiers).

### Google Drive (changes.watch)
- Mécanisme : webhook par canal. `changes.watch` suit tout le Drive d'un utilisateur à partir d'un `pageToken` obtenu par `changes.getStartPageToken` ; `files.watch` suit un fichier (officiel : https://developers.google.com/workspace/drive/api/guides/push).
- Expiration maximale (officiel, via résumé) : 1 semaine (604800 s) pour `changes`, 1 jour (86400 s) pour `files`. Pas de renouvellement auto ; `channels.stop` pour arrêter.
- Contenu : sans corps ; en-têtes `X-Goog-*`. Puis `changes.list(pageToken)`. Vérification : `token` que vous fixez, renvoyé dans `X-Goog-Channel-Token`.
- Pièges : un fil de forum indique des canaux qui expirent sans bruit et des notifications `sync` seules reçues (https://discuss.google.dev/t/google-drive-webhooks-only-send-the-initial-sync-never-update-am-i-missing-something-obvious/288347, tiers). Les Drive partagés demandent `supportsAllDrives` et `driveId` (à vérifier, mémoire).

### Microsoft Graph (Outlook mail et agenda)
- Mécanisme : abonnement `POST https://graph.microsoft.com/v1.0/subscriptions` (officiel : https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0 ; https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks).
- Corps : `changeType`, `notificationUrl`, `lifecycleNotificationUrl`, `resource` (ex. `me/mailFolders('inbox')/messages`, `me/events`), `expirationDateTime`, `clientState`. Par compte connecté, en délégué (portée `Mail.Read`, `Calendars.Read`) ou en application.
- Validation : à la création Graph appelle votre URL avec `validationToken` en paramètre ; répondre 200, `text/plain`, avec le jeton décodé, en moins de 10 s (officiel via résumé).
- Contenu : par défaut identifiant de ressource seul ; avec `includeResourceData: true`, objet chiffré (certificat requis ; durée plus courte). Authenticité : écho de `clientState` dans chaque notification (à comparer).
- Durée maximale : Outlook message/event/contact 10 080 min (7 jours) selon la page anglaise officielle ; 1 440 min avec données de ressource ; Teams chatMessage 4 320 min. CONTRADICTION : une copie nl-nl de la page et des tiers donnent 4 230 min pour Outlook ; probablement ancien (https://learn.microsoft.com/nl-nl/graph/api/resources/subscription).
- Cycle de vie : `lifecycleNotificationUrl` est obligatoire si l'abonnement dépasse 1 heure pour certains cas (selon résumé) et ne peut pas être ajouté après création. Événements : `reauthorizationRequired`, `subscriptionRemoved`, `missed`. Renouveler par `PATCH /subscriptions/{id}`. Un abonnement expiré est supprimé.
- Pièges : réponse en moins de 10 s, sinon retries et blocage ; tiers : https://hookdeck.com/webhooks/microsoft-graph/guide-duplicates-ordering-retries-timeouts ; doublons et désordre possibles, donc relire par delta query.

### Slack
- Mécanisme : Events API (webhook HTTPS) ou Socket Mode (WebSocket sortant).
- Règles 2025 (officiel : https://docs.slack.dev/ja-jp/2025-05-terms-rate-limit-update-and-faq/ ; https://api.slack.com/methods/conversations.history) : depuis le 29 mai 2025, pour les applications commerciales non Marketplace nouvelles, `conversations.history` et `conversations.replies` passent à 1 requête par minute et 15 objets maximum. La page officielle dit que les installations existantes non Marketplace sont touchées à partir du 3 mars 2026 ; un tiers dit le contraire. Applications Marketplace et internes (créées par le client pour son espace) gardent Tier 3. Conséquence : le relevé périodique est quasi inutilisable hors Marketplace, donc les événements en temps réel deviennent le seul chemin.
- Events API : l'application déclare une Request URL et des abonnements (portées `*:history`, `channels:read`, etc. ; à vérifier, mémoire) ; un jeton d'espace de travail par installation OAuth. Au départ Slack envoie `url_verification` avec un `challenge` à renvoyer (tiers : https://hookdeck.com/webhooks/skills/slack-webhooks). Réponse 2xx attendue en environ 3 s ; reprises : presque immédiate, 1 min, 5 min, avec `X-Slack-Retry-Num` et `X-Slack-Retry-Reason` ; avec les « Delayed Events », reprises horaires jusqu'à 24 h (tiers : https://hookdeck.com/webhooks/slack/guide-duplicates-ordering-retries-timeouts). Dédoublonner sur `event_id`. Si l'URL échoue trop, Slack arrête l'envoi (tiers).
- Signature : `X-Slack-Signature` (`v0=` + HMAC-SHA256 hex de `v0:{timestamp}:{corps}`, clé = signing secret) et `X-Slack-Request-Timestamp` (à vérifier, mémoire ; pas lu dans une source cette fois). Contenu : événement complet (texte du message compris) pour les événements `message.*` auxquels l'application est abonnée.
- Socket Mode : WebSocket sortant (`apps.connections.open`, jeton d'application `xapp-`, portée `connections:write`) ; pas d'URL publique, pas de signature ; limite de connexions simultanées : non trouvé (10 : à vérifier, mémoire). Slack le déconseille pour la production publique (à vérifier). Les applications Marketplace ne peuvent pas l'utiliser (à vérifier).
- Pas d'expiration d'abonnement. Piège majeur : l'application ne reçoit que les canaux où le bot est membre (ou, avec jeton utilisateur, ceux de l'utilisateur) ; relevé de rattrapage lent hors Marketplace (voir ci-dessus).

### HubSpot
- Webhooks d'application (v3) ; en-tête `X-HubSpot-Signature-v3` + `X-HubSpot-Request-Timestamp` ; HMAC-SHA256 sur méthode + URI + corps + timestamp, clé = secret de l'application, base64 (officiel : https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests). Rejeter si timestamp de plus de 5 minutes (conseil tiers : https://hookdeck.com/webhooks/hubspot/verify). Retries : 10 fois sur 24 h selon des tiers seulement (https://hookdeck.com/webhooks/hubspot/guide-duplicates-ordering-retries-timeouts) ; non confirmé par l'officiel. Limites officielles : 1 000 abonnements par application, 100 événements par requête, 10 requêtes simultanées par compte installé (https://developers.hubspot.com/docs/api-reference/legacy/webhooks/guide). Les appels de lecture faits ensuite comptent dans les limites d'API. HubSpot a aussi une « Webhooks journal API » (version 2026-09 et 2026.03) : https://developers.hubspot.com/docs/api-reference/latest/webhooks-journal/guide ; je ne l'ai pas détaillée. Contenu : identifiant d'objet, type d'événement, propriété changée ; pas l'objet complet. Abonnement par application (pas par compte), configuré dans l'application développeur.

### Pipedrive (webhooks v2)
- `POST /v1/webhooks` avec URL d'abonnement publique, `event_action` (`create`, `change`, `delete`, `*`) et `event_object` (deal, person, organization, activity, lead, note, pipeline, product, stage, user) (officiel : https://pipedrive.readme.io/docs/guide-for-webhooks-v2 ; https://pipedrive.readme.io/docs/list-of-webhooks-v2). v2 par défaut depuis le 17 mars 2025 (tiers, à confirmer). Authentification : HTTP basic (`http_auth_user`, `http_auth_password`) selon un tiers ; pas de signature HMAC trouvée. Retries : non trouvé.

### Attio
- Webhooks par API (`/v2/webhooks`, à vérifier) ; en-tête `Attio-Signature` (doublé en `X-Attio-Signature`), HMAC-SHA256 hexadécimal du corps seul, clé = secret du webhook (officiel : https://docs.attio.com/rest-api/guides/webhooks). Événements : `record.created`, `record.updated`, etc. (liste complète non trouvée).

### Close
- `POST /api/v1/webhook/` ; `signature_key` renvoyé une seule fois à la création ; en-têtes `close-sig-hash` et `close-sig-timestamp` ; HMAC-SHA256 de timestamp + corps, clé hexadécimale à décoder (officiel : https://developer.close.com/api/resources/webhooks/create ; https://developer.close.com/api/resources/webhooks). Limite : 40 abonnements par organisation (officiel). Abonnement par organisation (clé API ou OAuth).

### folk
- Webhooks par API avec filtres, conformes à Standard Webhooks (en-têtes `webhook-id`, `webhook-timestamp`, `webhook-signature`) ; secret par webhook (officiel : https://developer.folk.app/webhooks/about ; https://developer.folk.app/webhooks/create-webhooks). Événements : person/company/object/note/reminder (créé, modifié, supprimé). API réservée aux offres payantes (tiers).

### Zendesk
- Webhooks via `POST /api/v2/webhooks` ; signature `X-Zendesk-Webhook-Signature` + `X-Zendesk-Webhook-Signature-Timestamp` ; HMAC-SHA256 base64 de timestamp + corps ; secret : `GET /api/v2/webhooks/{id}/signing_secret` (officiel : https://developer.zendesk.com/api-reference/webhooks/webhooks-api/webhooks/). Un secret de test statique existe avant création. Coupe-circuit (officiel : https://developer.zendesk.com/documentation/webhooks/creating-and-monitoring-webhooks/) : s'ouvre si 70 % d'erreurs en 5 min ou plus de 1 000 erreurs, seulement au-delà de 100 requêtes en 5 min ; le webhook est alors suspendu 5 s (les tiers disent « désactivé » : contradiction, l'officiel prime). Retries selon tiers : 409 jusqu'à 3 fois, délai dépassé jusqu'à 5 fois, 429/503 si `retry-after` < 60 s ; une 500 n'est pas rejouée. Délai d'attente : 10 s ou 12 s selon les sources. Un webhook s'abonne à des événements (ex. tickets) ou est appelé par un déclencheur.

### Intercom
- Webhooks dans le Developer Hub, par application ; `X-Hub-Signature: sha1=...` HMAC-SHA1 du corps avec le client secret (officiel : https://developers.intercom.com/docs/references/1.2/webhooks/webhook-models). Retries : sources contradictoires (une reprise après ~1 min contre 5 tentatives avec attente croissante) ; officiel non trouvé.

### Front
- Webhooks d'application ; `X-Front-Signature` : base64 HMAC-SHA256 de `X-Front-Request-Timestamp:corps` avec la clé de signature de l'application ; délai 5 s ; 3 reprises ; désactivation automatique si échecs ; pas de rattrapage, utiliser `GET /events` (officiel : https://dev.frontapp.com/docs/application-webhooks). Webhooks de règles (anciens) : HMAC-SHA1.

### Freshdesk
- Pas d'API d'abonnement ; webhook = action « Trigger Webhook » dans une règle d'automatisation (plans Growth et plus) ; aucune signature, seulement un en-tête d'authentification ou une clé dans l'URL ; retries toutes les 30 min, 48 appels au plus (tiers : https://www.getmacha.com/blog/freshdesk-webhooks-explained ; https://support.freshdesk.com/support/solutions/articles/132589-using-webhooks-in-automation-rules officiel).

### Help Scout
- Webhook créé par `POST /v2/webhooks` (API Mailbox) ou dans l'interface ; vous fournissez `url`, `events` (ex. `convo.created`) et un `secret` de 40 caractères au plus (officiel : https://developer.helpscout.com/mailbox-api/endpoints/webhooks/create/). Signature : `X-HelpScout-Signature`, base64 de HMAC-SHA1 du corps brut ; nom d'événement dans `X-HelpScout-Event` (tiers : https://hookdeck.com/webhooks/platforms/guide-to-help-scout-webhooks-features-and-best-practices). Contenu : objet conversation complet (tiers). Retries : 10 puis abandon (ancienne page officielle, à revérifier) ; 410 désactive le webhook (tiers 2026). Pas d'identifiant de livraison : dédoublonner sur nom d'événement + id conversation + hash.

### Crisp
- Webhooks de plugin du Marketplace Crisp : abonnement par plugin, réglé dans la console développeur, événements RTM comme `message:send` (officiel : https://docs.crisp.chat/guides/web-hooks/plugin-hooks/ ; https://docs.crisp.chat/references/web-hooks/v1/). En-têtes `X-Crisp-Request-Timestamp` et `X-Crisp-Signature` (plugins seulement), HMAC-SHA256 ; la chaîne exacte signée n'est pas confirmée : à vérifier. Retries et expiration : non trouvé.

### Missive
- Pas d'API d'abonnement trouvée : le webhook est une action de règle (Réglages > Règles > Webhook) ; Missive envoie une requête de validation à l'enregistrement. Si un secret de validation est défini, en-tête `X-Hook-Signature: sha256=` + HMAC hex du corps (officiel : https://missiveapp.com/docs/developers/webhooks). Les canaux personnalisés ont un autre secret. Retries, événements : non trouvé.

### Plain
- Cible de webhook créée dans l'application Plain (Réglages > Webhooks) avec choix des événements ; exemple d'événement : `thread.thread_created` (tiers : https://hookdeck.com/webhooks/platforms/guide-to-plain-webhooks-features-and-best-practices). Signature : `Plain-Request-Signature`, HMAC-SHA256 hex du corps, secret propre à l'espace de travail à générer dans Réglages > Request signing (officiel : https://www.plain.com/docs/request-signing). SDK officiel `@team-plain/webhooks` avec `verifyPlainWebhook` (https://www.plain.com/docs/webhooks/sdk) ; version npm non vérifiée. Création de cible par API GraphQL : non trouvé.

### Microsoft Teams
- Même mécanisme que Graph (`POST /subscriptions`), ressource `chatMessage` (officiel : https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage). Durée maximale 4 320 min. `/chats/{id}/messages` : délégué `Chat.Read` ou application `ChatMessage.Read.Chat` (RSC) / `Chat.Read.All`. `/teams/getAllMessages` et `/chats/getAllMessages` (tout le locataire) : application seule, `ChannelMessage.Read.All` / `Chat.Read.All`, consentement administrateur. `/users/{id}/chats/getAllMessages` : délégué `Chat.Read`. Facturation : les API Teams listées ne sont plus facturées depuis le 25 août 2025 (officiel selon résumé) ; une page localisée affiche encore « metered » : contradiction. Avant : 0,00075 USD par message (tiers). Chiffrement : les messages complets exigent `includeResourceData` + certificat. Piège : aucune notification « missed » pour chatMessage, donc rattrapage par relevé. Les canaux privés demandent le droit au niveau locataire (réponse communautaire).

## Intermédiaires (Nango, Pipedream)
- Nango Gmail : l'application appelle `watch` pour chaque connexion, une synchronisation quotidienne renouvelle, et la fréquence de sync est réduite comme filet (officiel Nango : https://nango.dev/docs/api-integrations/google-mail/webhooks). Nango Google Agenda : canal avec URL de webhook, renouvelé par Nango, arrêté à la déconnexion (https://nango.dev/docs/api-integrations/google-calendar/webhooks). Outlook : guide Nango existe (https://nango.dev/docs/api-integrations/outlook), détails non lus.
- Pipedream : aucune source trouvée sur son déclencheur Gmail instantané ni sur le renouvellement. Un comparatif signé Nango dit que Pipedream Connect couvre Gmail et Outlook par déclencheurs ou relevé (concurrent, prudence).


## Quitter Pipedream : Gmail et Outlook en direct

**Gmail (Google)**
- Il faut une application OAuth propre, publiée (pas en mode test, sinon plafond de 100 utilisateurs de test : tiers https://www.unipile.com/google-oauth-100-user-limit/) et vérifiée par Google.
- Les portées de lecture de Gmail sont « restreintes » : vérification OAuth + évaluation de sécurité CASA (Cloud Application Security Assessment), niveau 2 en général, par un laboratoire agréé, renouvelée chaque année (tiers : https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/ ; https://deepstrike.io/blog/google-casa-security-assessment-2025).
- Délais cités par des tiers : 4 à 12 semaines au total ; 2 à 3 semaines pour l'évaluation de niveau 2 ; un cas à environ 3 semaines puis nouveaux scans ; un outlier à 2-6 mois. Coût du laboratoire : environ 500 à 1 800 USD par an pour le niveau 2 (tiers, https://www.secusy.ai/blog/google-casa-assessment-cost) ; Google ne facture rien lui-même ; le chiffre de 50 000 USD est jugé faux par un tiers. Aucun chiffre officiel Google trouvé.
- Pour le temps réel : un projet GCP avec Pub/Sub, un topic, l'éditeur Gmail en Publisher, un endpoint push HTTPS, et un cron de renouvellement de `watch`.
- Autres pièces : politique de confidentialité, domaine vérifié, vidéo de démonstration, justification de chaque portée (à vérifier, mémoire).
- Piège : tant que l'on reste derrière l'application OAuth de Pipedream, c'est la leur qui est vérifiée ; en quittant il faut redemander le consentement de tous les utilisateurs (déduit).

**Outlook (Microsoft)**
- Application multi-locataire dans Entra ID. La vérification d'éditeur exige un compte du programme partenaire Microsoft (Partner One ID, compte « partner global ») et un domaine concordant ; sans elle, les utilisateurs ne peuvent pas consentir eux-mêmes, seul un administrateur le peut (officiel via résumé : https://github.com/MicrosoftDocs/entra-docs/blob/main/docs/identity-platform/publisher-verification-overview.md ; https://techcommunity.microsoft.com/blog/microsoft-entra-blog/publisher-verification-and-app-consent-policies-are-now-generally-available/1257374).
- Le programme Microsoft 365 App Compliance (attestation d'éditeur, certification M365) est distinct et facultatif en pratique (déduit). Délai de vérification d'éditeur : non trouvé. Pas d'audit externe obligatoire équivalent à CASA trouvé.
- Pour le temps réel : endpoint public HTTPS pour la validation, abonnements à renouveler au plus tous les 7 jours, gestion des notifications de cycle de vie.


## Tableau de synthèse

| Outil | Mécanisme | Vérification | Expiration | Effort |
|---|---|---|---|---|
| Gmail | Pub/Sub, `users.watch` | JWT OIDC Pub/Sub (à vérifier) | ~7 j, renouveler chaque jour | Élevé (GCP, CASA, historyId) |
| Google Agenda | Canal webhook par calendrier | `X-Goog-Channel-Token` | Canal à renouveler (TTL non trouvé) | Moyen |
| Google Drive | Canal `changes.watch` | `X-Goog-Channel-Token` | 1 semaine (changes), 1 jour (files) | Moyen |
| Outlook mail/agenda | Abonnement Graph | `clientState` + validationToken | 7 j (10 080 min) ; 1 j avec données | Moyen à élevé (cycle de vie) |
| Teams | Abonnement Graph chatMessage | `clientState` | 3 j (4 320 min) | Élevé (droits, pas de « missed ») |
| Slack | Events API ou Socket Mode | HMAC-SHA256 `X-Slack-Signature` (à vérifier) | Aucune | Faible à moyen |
| HubSpot | Webhooks d'application | HMAC-SHA256 v3 | Aucune | Moyen (par application) |
| Pipedrive | Webhooks v2 par API | Basic auth (pas de HMAC trouvé) | Aucune | Faible |
| Attio | Webhooks par API | HMAC-SHA256 hex | Aucune | Faible |
| Close | Webhooks par API | HMAC-SHA256 (timestamp+corps) | Aucune | Faible |
| folk | Webhooks par API | Standard Webhooks | Aucune | Faible |
| Zendesk | Webhooks par API | HMAC-SHA256 base64 | Aucune | Faible |
| Intercom | Webhooks de l'application | HMAC-SHA1 `X-Hub-Signature` | Aucune | Faible |
| Front | Webhooks d'application | HMAC-SHA256 base64 | Aucune (désactivation si échecs) | Faible |
| Freshdesk | Action d'automatisation | Aucune (en-tête maison) | Aucune | Moyen (manuel, par compte) |
| Help Scout | Webhooks par API | HMAC-SHA1 base64 | Aucune | Faible |
| Crisp | Webhooks de plugin | HMAC-SHA256 (à vérifier) | Non trouvé | Moyen |
| Missive | Action de règle | HMAC-SHA256 `X-Hook-Signature` | Aucune | Moyen (manuel) |
| Plain | Cible de webhook | HMAC-SHA256 + SDK | Aucune | Faible |

## Ce que je recommande
1. Un seul point d'entrée `/webhooks/:fournisseur` dans l'API Hono : lire le corps brut, vérifier la signature, écrire l'événement brut dans Postgres (table avec clé d'idempotence), répondre 2xx, puis traiter via pg-boss. Raison : les délais sont de 3 à 10 s chez Slack, Front, Graph.
2. Toujours « notification = signal, relevé = vérité » : pour Gmail, Agenda, Drive, Graph, Teams, la notification ne porte pas le contenu ou peut manquer ; garder un relevé de rattrapage (history, syncToken, delta) lent, par exemple toutes les heures, au lieu des 15 minutes.
3. Un job pg-boss de renouvellement par abonnement (Gmail quotidien, Agenda/Drive avant échéance, Graph avec `lifecycleNotificationUrl` dès la création). Raison : l'expiration silencieuse est le premier risque.
4. Commencer par Slack (Events API, car le relevé est bridé hors Marketplace) et les CRM/supports à webhook simple (Close, Attio, Zendesk, Front, Plain, Help Scout). Gmail et Graph ensuite.
5. Rester sur Pipedream/Nango pour Gmail tant que l'application OAuth n'est pas vérifiée par Google ; lancer la vérification CASA tôt (plusieurs semaines), car c'est le chemin critique.
6. Freshdesk, Missive : accepter un réglage manuel côté client ou garder le relevé.


## Ce que je n'ai pas trouvé
- Aucune page ouverte directement : tout vient de résumés de recherche. Les « à vérifier » sont à confirmer dans la doc de l'éditeur avant d'écrire du code.
- TTL maximal des canaux Google Agenda ; valeurs de `X-Goog-Resource-State` (hors sources) ; jeton OIDC Pub/Sub exact.
- Durée Gmail `watch` confirmée en clair par Google (7 jours = tiers).
- Retries officiels : HubSpot, Intercom (sources contradictoires), Help Scout (ancienne page), Crisp, Missive, Pipedrive, Attio, Close, folk.
- Pipedrive : signature HMAC éventuelle ; `http_auth_*` à confirmer.
- Crisp : chaîne exacte signée. Plain : mutation GraphQL de création. Missive : événements.
- Socket Mode : limites de connexions. Slack : statut exact des installations existantes en novembre 2026 (officiel vs tiers contradictoires).
- Pipedream : fonctionnement de ses déclencheurs Gmail/Outlook. Délais de vérification d'éditeur Microsoft. Chiffres CASA officiels de Google.
- Versions de paquets npm (@team-plain/webhooks, SDK Slack, etc.) non vérifiées par registre.
