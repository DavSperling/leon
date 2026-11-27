# 05 - Événements en temps réel : tâches, code, documents, réunions

État des lieux au 19 novembre 2026. Statut : version finale (25 requêtes web + vérification npm). Les résumés de WebSearch citent les pages ; les URL sont celles des résultats.
Légende : [officiel] doc éditeur, [tiers] blog/comparatif/forum, [déduit], [mémoire, à vérifier].

## Règle commune de réception (valable partout)
1. Lire le corps brut (`await req.text()` / Hono `c.req.raw`), vérifier la signature AVANT de parser le JSON. Re-sérialiser casse la signature.
2. Comparer en temps constant (`crypto.timingSafeEqual`).
3. Répondre 2xx vite, puis mettre en file (pg-boss) : une ligne `webhook_events(provider, delivery_id UNIQUE, raw, received_at)` sert de déduplication et de reprise.
4. Quand la notification est un simple ping (Airtable, Notion partiellement), relire l'objet par l'API.
5. Garder le polling toutes les 15 min comme filet de réconciliation (les webhooks perdent des événements chez tous les éditeurs).

## Fiches

### GitHub (webhooks d'application GitHub App) [mémoire, à vérifier]
- Webhook HTTP POST unique pour l'application, toutes installations. URL et secret réglés dans les paramètres de l'application. Événements limités par les permissions de l'application.
- Contenu : objet complet. En-têtes `X-Hub-Signature-256: sha256=<hex>` (HMAC-SHA256 du corps brut), `X-GitHub-Event`, `X-GitHub-Delivery` (clé d'idempotence).
- Pas de reprise automatique. Redelivery manuelle ou par API (`GET /app/hook/deliveries`, `POST /app/hook/deliveries/{id}/attempts`). Réponse attendue sous 10 s. Pas d'expiration.
- Piège : un seul secret pour toute l'application ; les événements d'une installation non listés dans les permissions n'arrivent pas.

### GitLab
- Webhook HTTP par projet ou groupe (API `POST /projects/:id/hooks`, `POST /groups/:id/hooks`, ou interface). Par compte/projet connecté, portée OAuth `api` [mémoire, à vérifier].
- Authenticité, deux modes [tiers, https://hookdeck.com/webhooks/gitlab/verify ; https://github.com/SlopMaster2/webhook-verify/pull/57] :
  - ancien : en-tête `X-Gitlab-Token` = secret en clair (pas une signature) ;
  - nouveau : jeton de signature, en-têtes `webhook-id`, `webhook-timestamp`, `webhook-signature` (HMAC-SHA256, norme Standard Webhooks). Introduit en GitLab 19.0, disponible à tous en 19.1 selon une source tierce (issue GitHub argo-cd #30905). Les deux peuvent coexister pendant la migration. Tolérance d'horloge usuelle : 5 min.
- Contradiction/lacune : un ticket GitLab de 2019 disait que `X-Gitlab-Token` manquait sur les webhooks de groupe (https://gitlab.com/gitlab-org/gitlab/-/issues/1853) ; statut actuel non trouvé.
- Désactivation automatique après échecs répétés, reprises : non trouvé (à vérifier dans docs.gitlab.com).
- Piège : instance auto-hébergée vs gitlab.com ; version minimale pour la signature.

### Linear
- Webhook configuré dans l'interface (Settings > API) ou par API/OAuth app (portée admin) ; une application OAuth peut avoir ses webhooks (à vérifier : portée `admin`). [officiel : https://linear.app/developers/webhooks]
- Objet complet dans le corps (action, type, data, createdAt, `webhookTimestamp` en ms).
- Authenticité : en-tête `Linear-Signature` = HMAC-SHA256 hex du corps brut, secret de signature du webhook, sans préfixe `sha256=` [officiel/tiers]. Rejeter si `webhookTimestamp` s'écarte de plus de 60 s de l'heure courante [officiel].
- Contradiction : une page Tessl du SDK décrit un message signé = timestamp + corps ; Linear décrit le corps seul. Suivre Linear.
- Reprises/expiration/limites : non trouvé dans les résultats (mémoire : 3 essais, 1 min / 1 h / 6 h, désactivation si échecs ; à vérifier).
- SDK : `@linear/sdk` expose un vérificateur (`LinearWebhooks`) [tiers : tessl.io]. Version npm au 19/11/2026 : `@linear/sdk` 103.0.0 [registre npm].

### Jira et Confluence (Atlassian Cloud)
- Jira : webhooks dynamiques enregistrés par API `POST /rest/api/2/webhook` (ou `/3/`) par une appli OAuth 2.0 (3LO) ou Connect. Seules ces applis peuvent les gérer [officiel : https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-webhooks/].
- Expiration : 30 jours ; `PUT /rest/api/2/webhook/refresh` (corps `{"webhookIds":[...]}`) repousse de 30 jours [officiel]. Un webhook expiré reste récupérable un temps (sources divergentes : « jusqu'à 3 mois » vs « 30 jours de plus ») [tiers : community.developer.atlassian.com]. Prévoir une tâche pg-boss quotidienne de refresh.
- Webhooks créés dans l'admin système : pas d'expiration [tiers, forum Atlassian], mais pas d'appli OAuth.
- Authenticité : secret de signature pour webhooks dynamiques ; nom exact de l'en-tête (probablement `X-Hub-Signature`, HMAC-SHA256) non confirmé. Doublons : en-tête `X-Atlassian-Webhook-Identifier` [tiers : webhookrelay.com]. Non trouvé : algorithme exact officiel.
- Contenu : objet de l'événement, souvent partiel ; relire par API.
- Confluence Cloud : pas de webhooks REST dynamiques équivalents confirmés dans mes sources ; mémoire : webhooks via Forge/Connect (événements) ou règles d'automatisation. À vérifier. Recommandation provisoire : Forge ou polling `GET /wiki/api/v2/pages?sort=-modified-date`.

### Asana
- `POST /webhooks` avec `resource`, `target` (URL), `filters` ; par ressource (projet, tâche, espace). Par compte connecté (jeton OAuth de l'utilisateur) [officiel : https://developers.asana.com/docs/webhooks-guide].
- Poignée de main : Asana envoie un POST avec `X-Hook-Secret` ; l'endpoint doit renvoyer le même en-tête `X-Hook-Secret` avec 200 (aucun `X-Hook-Signature` à ce stade). Le secret est à stocker [officiel].
- Ensuite chaque livraison porte `X-Hook-Signature` = HMAC-SHA256 hex du corps brut avec ce secret [officiel/tiers]. Heartbeats signés aussi [tiers : hookdeck.com].
- Contenu : événements légers (`action`, `resource.gid`, `parent`) ; relire la ressource. Compactage/retards : mémoire. Expiration : aucune annoncée ; Asana supprime le webhook après échecs prolongés (mémoire, à vérifier : 24 h).
- Piège : un webhook par ressource, donc un par projet : fan-out important. Suppression : `DELETE /webhooks/{gid}`.

### ClickUp
- `POST /api/v2/team/{team_id}/webhook` (`endpoint`, `events`, filtres space/folder/list/task) ; réponse avec `webhook.secret` [officiel : https://developer.clickup.com/reference/createwebhook]. Par espace de travail, jeton de l'utilisateur.
- Authenticité : en-tête `X-Signature` = HMAC-SHA256 hex du corps brut avec le secret du webhook [officiel : https://developer.clickup.com/docs/webhooksignature].
- Santé : champ `health` (active, failing...). Suspension après 100 échecs ; renvoyer 401 suspendrait tout de suite [tiers seulement : hookdeck.com, à vérifier]. Lister via `GET /team/{team_id}/webhook` ne renvoie que ceux créés par le jeton appelant [tiers].
- Piège : ClickUp ne prévient pas d'une suspension : surveiller `health` par tâche planifiée.

### monday
- Mutation GraphQL `create_webhook(board_id, url, event, config)` ou centre d'intégrations [officiel : https://developer.monday.com/api-reference/reference/webhooks]. Par tableau.
- Création : monday envoie un POST `{"challenge": "..."}` ; l'endpoint renvoie le même JSON.
- Authenticité : pas de HMAC du corps. Un JWT dans `Authorization`, vérifié avec le Signing Secret de l'appli, uniquement si le webhook est créé avec le jeton OAuth d'une appli à fonction « integration » ; les webhooks sans code peuvent ne pas avoir l'en-tête [officiel/tiers].
- Reprises : une fois par minute pendant 30 min [officiel]. Contenu : événement léger (pulseId, columnId, valeur) ; relire.
- Piège : pour un contrôle d'authenticité réel, il faut une appli monday (jeton OAuth), pas un jeton personnel.

### Trello
- `POST /1/webhooks` (`callbackURL`, `idModel`, jeton utilisateur) ; par modèle (tableau). Atlassian doc : https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/.
- Authenticité : en-tête `X-Trello-Webhook` = base64(HMAC-SHA1(secret d'appli, corps brut + callbackURL exact)) [officiel].
- Reprises, désactivation après échecs : non trouvé dans les résultats (mémoire : 3 essais puis désactivation après ~30 jours d'échecs). Contenu : action complète.

### Sentry
- Appli intégrée (Settings > Developer Settings), internal ou publique, avec abonnement aux ressources (issue, error, comment...) [officiel : https://docs.sentry.io/integrations/integration-platform/webhooks/].
- Authenticité : en-tête `Sentry-Hook-Signature` = HMAC-SHA256 hex du corps brut avec le Client Secret ; type d'événement dans `Sentry-Hook-Resource` ; `Sentry-Hook-Timestamp` non signé donc pas de protection contre le rejeu [officiel + tiers].
- Reprises/limites : non trouvé.

### Miro
- Résultats faibles. Un guide tiers (rollout.com) cite `POST /v2-experimental/boards/{id}/subscriptions`-type avec challenge ; en-tête de signature `x-miro-signature` non confirmé. Expiration non trouvée. À traiter comme incertain ; privilégier le polling.

### Notion
- Abonnement dans l'interface de l'intégration (onglet Webhooks) : URL, événements ; par intégration, pas d'API de création [tiers : hookdeck.com/webhooks/notion/verify].
- Poignée de main : Notion envoie un POST avec `verification_token` ; on le colle dans l'interface pour valider.
- Authenticité : `X-Notion-Signature: sha256=<hex>` = HMAC-SHA256 du corps brut, clé = verification_token (différent du jeton d'API). Le SDK JS expose `verifyWebhookSignature` [tiers].
- Contenu : léger (type, entité, ids) ; relire par API. Événements : `page.content_updated`, `page.properties_updated`, `comment.created`, `data_source.schema_updated`... Délais d'agrégation, reprises : non trouvé.
- Piège : un abonnement par intégration, donc par espace de travail connecté : l'automatiser n'est pas possible par API (à vérifier).

### Airtable
- `POST /v0/bases/{baseId}/webhooks` (`notificationUrl`, `specification`) [officiel : https://airtable.com/developers/web/api/create-a-webhook]. Par base, jeton OAuth/PAT.
- Réponse : `macSecretBase64` (une seule fois). Le ping ne contient pas les données ; lire `GET .../webhooks/{id}/payloads?cursor=`.
- Authenticité : `X-Airtable-Content-MAC: hmac-sha256=<hex>`, clé = secret décodé de base64 [officiel/tiers].
- Expiration : 7 jours pour OAuth/PAT, prolongée par `POST .../refresh` ou par lecture des payloads ; puis 7 jours de métadonnées [officiel]. Limite : 10 webhooks par base [officiel] (un blog tiers dit 50, probablement faux).
- Nango documente Airtable : https://nango.dev/docs/api-integrations/airtable/webhooks.

### Basecamp
- `POST /buckets/{id}/webhooks.json` avec `payload_url` (HTTPS) et `types` optionnel ; par projet (bucket), jeton OAuth de l'utilisateur [officiel : https://github.com/basecamp/bc-api/blob/master/sections/webhooks.md].
- Reprises : jusqu'à 10 essais, puis désactivation ; seuls les 2xx comptent [officiel].
- Authenticité : aucune signature documentée [déduit de l'absence dans la doc officielle]. Mettre un jeton secret dans l'URL du callback.
- Contenu : événement avec objet `recording` ; types : conflit entre la doc officielle (`Todo`, `Todolist`...) et un guide tiers (`todo_completed`...) : suivre la doc officielle.
- Piège : un webhook par projet à créer pour chaque projet.

### Shortcut
- Webhook sortant : `POST /api/v3/webhooks` [mémoire, à vérifier], avec `secret` optionnel ; en-tête `Payload-Signature` = HMAC-SHA256 hex du corps brut avec ce secret [officiel : https://developer.shortcut.com/api/webhook/v1]. Sans secret, aucune signature [tiers : hookdeck.com].
- Reprises/expiration : non trouvé. Contenu : actions avec changements (ids + diffs).

### Plane
- Webhook par espace de travail (réglages ou API), jusqu'à 43 événements v2 selon un guide tiers. En-têtes `X-Plane-Delivery`, `X-Plane-Event`, `X-Plane-Signature` = HMAC-SHA256 hex du corps brut [officiel : https://developers.plane.so/dev-tools/intro-webhooks ; tiers : hookdeck.com]. Contenu : objet complet. Reprises/expiration : non trouvé.

### Productboard
- API Webhooks v2 publique depuis le 2026-03-06 [officiel : https://developer.productboard.com/changelog/2026-03-06]. `POST https://api.productboard.com/v2/webhooks` ; URL HTTPS publique validée ; l'appli OAuth2 doit avoir les portées de chaque type d'événement [officiel : https://developer.productboard.com/reference/createwebhook]. Opérations : lister, créer, lire, supprimer.
- Signature `X-Productboard-Signature` : seule source tierce (rollout.com, exemple v1) ; non confirmée en v2. Expiration, reprises : non trouvé.

### Réunions : principe
Un seul besoin : savoir qu'une transcription est prête. Trois familles : webhook signé (Fathom, Fireflies, Circleback, Granola, Claap), automatisation côté éditeur (Gong, tl;dv, Leexi), notification de plateforme (Zoom, Teams, Meet). Toujours relire la transcription par API.

### Fathom
- Un seul événement : « new meeting content ready ». Webhook créé dans l'interface ou par API ; il faut au moins un parmi `include_transcript`, `include_summary`, `include_action_items`, `include_crm_matches` [tiers : hookdeck.com ; officiel indirect : https://developers.fathom.ai]. Le corps est la réunion elle-même.
- Signature : Standard Webhooks, en-têtes `webhook-id`, `webhook-timestamp`, `webhook-signature` ; HMAC-SHA256 sur `id.timestamp.corps`, base64, clé = secret après `whsec_`, tolérance 5 min [tiers : PR GitHub #340]. Le secret est rendu à la création.
- Pas d'événement de début, suppression ou échec. Pas de résumé pour les appels très courts [tiers]. Disponible sur tous les plans, Free compris, selon Fathom (https://www.fathom.ai/features/api) ; sources divergentes sur ce point.

### Fireflies
- Webhooks V2 : événements `meeting.transcribed`, `meeting.summarized`, `meeting.bot_joined`, champ `meeting_id` [officiel : https://docs.fireflies.ai/graphql-api/webhooks-v2]. Ancien V1 : `eventType: "Transcription completed"`, `meetingId`.
- Signature : en-tête `X-Hub-Signature: sha256=<hex>` (HMAC-SHA256 du corps), seulement si un secret est configuré [officiel]. Selon des sources tierces, V1 envoyait le hex sans préfixe : tester.
- Payload léger : relire par GraphQL `transcript(id:)`.

### tl;dv
- Deux déclencheurs : `MeetingReady`, `TranscriptReady` ; champs `event`, `executedAt`, `id` [officiel : https://doc.tldv.io/index.html]. Pas de schéma de signature publié, selon une PR tierce (corsairdev/corsair #2133) : utiliser un secret dans l'URL. Accès API/webhook réservé aux offres Business et plus selon un guide tiers, non vérifié.

### Circleback
- Webhook = étape d'automatisation ; en-tête `X-Signature` = HMAC-SHA256 du corps [tiers : https://support.circleback.ai/en/articles/11014015-export-meeting-data-with-webhooks]. Contenu : données de la réunion (id, nom, date, durée...). Reprises : non trouvé.

### Claap
- Événement `recording_added` (nouveaux et mis à jour) avec métadonnées et liens de transcription [officiel : https://help.claap.io/en/articles/10335261-claap-webhooks-documentation]. Liens temporaires, environ 24 h [tiers : PR GitHub mako-ai/mako #1095]. API : `GET /v1/recordings/{id}/transcript`, en-tête `X-Claap-Key` [officiel : https://docs.claap.io/api-reference/endpoint/get_recording_transcript]. Signature : non trouvé.

### Gong
- Règles d'automatisation (Admin Center) : sur « appel terminé », envoi d'un webhook vers une URL ; deux modes : en-tête JWT signé (clé publique dans l'interface) ou clé dans l'URL [officiel : https://help.gong.io/docs/prepare-your-receiving-application-to-receive-a-webhook-jwt-header ; tiers].
- Pas d'événement « transcription prête » : le webhook part après traitement de l'appel (parfois des heures), parfois avant la transcription : prévoir une reprise [tiers]. Pas de webhook de mise à jour d'appel. Une source tierce (AeroLeads) évoque `X-Gong-Signature` en HMAC : contredit la doc officielle, à ignorer.
- Rattrapage : API `POST /v2/calls/extensive`, `POST /v2/calls/transcript` [mémoire, à vérifier].

### Granola
- Webhooks sur offres Business et Enterprise, créés dans l'appli ou par API (`Create Webhook Endpoint`) ; événements `note.generated`, `note.edited`, `note.access_granted` [officiel : https://docs.granola.ai/webhooks ; https://docs.granola.ai/api-reference/create-webhook-endpoint].
- Signature Standard Webhooks : HMAC-SHA256 de `{webhook-id}.{webhook-timestamp}.{corps}`, clé = base64 après `whsec_`. Le secret n'est montré qu'une fois [officiel]. Payload léger : relire la note par API (5 requêtes/s soutenues). Nango documente aussi Granola : https://nango.dev/docs/api-integrations/granola/webhooks.

### Leexi
- API publique (Basic Auth : identifiant + secret de clé, clés créées par un admin), doc : https://docs.public-api.leexi.ai/reference/public-api ; OpenAPI à `public-api.leexi.ai/v1/openapi.json` (non vérifié). Leexi annonce des webhooks « quand une réunion est disponible » [officiel marketing : leexi.ai]. Noms d'événements, signature, reprises : non trouvé.
- Recommandation : demander la doc à Leexi, et en attendant interroger l'API toutes les 5 min.

### Zoom
- Appli Marketplace avec « Event Subscriptions » ; URL validée par `endpoint.url_validation` (réponse `plainToken` + `encryptedToken` = HMAC-SHA256 hex du plainToken avec le Secret Token). Revalidation périodique (tiers : toutes les 72 h) ; désactivation après échecs [tiers].
- Signature : `x-zm-signature: v0=<hex>`, message `v0:{x-zm-request-timestamp}:{corps brut}`, HMAC-SHA256 avec le Secret Token ; fenêtre 5 min conseillée [tiers : hookdeck.com]. Reprises : jusqu'à 3 fois sur 5xx [tiers]. Répondre en moins de 3 s [tiers].
- Événement : `recording.completed` ; nom exact d'un événement de transcription (`recording.transcript_completed`) non confirmé. Les droits viennent de l'autorisation OAuth de chaque compte.

### Google Meet
- Pas de webhook direct. API Google Workspace Events : abonnement à `google.workspace.meet.transcript.v2.fileGenerated`, livré dans Cloud Pub/Sub [officiel : https://developers.google.com/workspace/events/guides/events-meet]. L'invité non organisateur ne reçoit que début de conférence et transcription [officiel].
- Délai : transcription disponible plusieurs minutes après la fin ; entrées de transcription lisibles 30 jours [officiel : https://developers.google.com/workspace/meet/api/guides/overview]. Expiration d'abonnement : événements de cycle de vie à gérer ; durée de 7 jours citée seulement par des tiers (non confirmé). Nécessite un projet Google Cloud et Pub/Sub ; portées Meet sensibles ou restreintes (à vérifier).
- Contrainte : transcription seulement si l'organisateur l'a activée (offres Workspace éligibles).

### Microsoft Teams
- Microsoft Graph, abonnement `POST /subscriptions` sur `communications/onlineMeetings/getAllTranscripts` (changeType `created`) ou par réunion/utilisateur [officiel : https://learn.microsoft.com/en-us/graph/teams-changenotifications-callrecording-and-calltranscript]. Avec ou sans données de ressource (chiffrées si incluses).
- Durée max : 4320 min (3 jours) pour callTranscript [officiel]. Au-delà d'1 h, `lifecycleNotificationUrl` obligatoire ; événements `subscriptionRemoved`, `reauthorizationRequired`, `missed` [officiel]. Renouveler en `PATCH /subscriptions/{id}`. Validation initiale : renvoyer `validationToken`.
- Délai : notification en général sous 10 s après génération, la transcription pouvant arriver plusieurs minutes après la réunion [officiel]. Droits : application consentie par l'administrateur du locataire, politique d'accès d'application pour les transcriptions (à vérifier).

## Tableau récapitulatif

| Outil | Mécanisme | Vérification | Expiration | Effort |
|---|---|---|---|---|
| GitHub | webhook d'application | `X-Hub-Signature-256` HMAC-SHA256 [mémoire] | aucune | faible |
| GitLab | webhook projet/groupe | `X-Gitlab-Token` ou `webhook-signature` (19.x) | aucune connue | moyen |
| Linear | webhook (OAuth app/UI) | `Linear-Signature` HMAC-SHA256 + horodatage 60 s | non trouvé | faible |
| Jira | webhook dynamique OAuth | secret de signature (en-tête à confirmer) | 30 jours, refresh | moyen |
| Confluence | non confirmé (Forge/polling) | non trouvé | non trouvé | élevé |
| Asana | webhook par ressource | `X-Hook-Secret` puis `X-Hook-Signature` HMAC-SHA256 | non annoncée | moyen |
| ClickUp | webhook par espace | `X-Signature` HMAC-SHA256 | suspension à 100 échecs [tiers] | moyen |
| monday | webhook par tableau | JWT (si appli) | reprises 30 min | moyen |
| Trello | webhook par modèle | `X-Trello-Webhook` HMAC-SHA1 base64 | non trouvé | moyen |
| Basecamp | webhook par projet | aucune | 10 échecs | moyen |
| Notion | abonnement d'intégration (UI) | `X-Notion-Signature` HMAC-SHA256 | non trouvé | moyen |
| Airtable | webhook par base + payloads | `X-Airtable-Content-MAC` | 7 jours, refresh | élevé |
| Miro | incertain | non confirmé | non trouvé | élevé |
| Shortcut | webhook sortant | `Payload-Signature` HMAC-SHA256 | non trouvé | faible |
| Plane | webhook d'espace | `X-Plane-Signature` HMAC-SHA256 | non trouvé | faible |
| Productboard | webhooks v2 (2026-03) | non confirmé | non trouvé | moyen |
| Sentry | appli intégrée | `Sentry-Hook-Signature` HMAC-SHA256 | aucune | faible |
| Fathom | webhook | Standard Webhooks | aucune connue | faible |
| Fireflies | webhook V2 | `X-Hub-Signature` sha256 | aucune connue | faible |
| tl;dv | déclencheurs API | aucune publiée | non trouvé | faible |
| Circleback | webhook d'automatisation | `X-Signature` HMAC-SHA256 | non trouvé | faible |
| Claap | webhook `recording_added` | non trouvé | liens 24 h | faible |
| Gong | règle d'automatisation | JWT signé | non trouvé | moyen |
| Granola | webhook (Business+) | Standard Webhooks | aucune connue | faible |
| Leexi | webhook (non documenté) | non trouvé | non trouvé | inconnu |
| Zoom | appli Marketplace | `x-zm-signature` v0 | revalidation | moyen |
| Google Meet | Workspace Events + Pub/Sub | Pub/Sub | à renouveler | élevé |
| Teams | Graph subscriptions | `clientState` + validation | 3 jours, renouveler | élevé |

## Ce que je recommande
1. Un seul endpoint `/webhooks/:provider` dans l'API Hono, qui vérifie, écrit dans `webhook_events` (clé unique `provider + delivery_id`), répond 2xx, puis pousse une tâche pg-boss. Raison : ajouter un outil = un vérificateur de 20 lignes.
2. Bibliothèques : `standardwebhooks` 1.3.0 (Fathom, Granola, GitLab 19.x), `@octokit/webhooks` 14.2.0 (GitHub), le reste en HMAC maison avec `node:crypto` [registre npm, 19/11/2026]. Éviter `svix` (2.10.0) sauf besoin d'envoi.
3. Tâche pg-boss quotidienne de renouvellement : Jira (30 j), Airtable (7 j), Microsoft Graph (3 j), Google Workspace Events, Zoom. Et un contrôle de santé pour ClickUp.
4. Garder le polling toutes les 15 min comme réconciliation, et le passer à 5 min pour Leexi, Miro, Confluence tant que rien n'est confirmé.
5. Priorité d'implémentation : GitHub, Linear, Sentry, Fathom, Fireflies, Granola, Circleback, Plane, Shortcut (faible effort, signature claire) ; puis Jira, Asana, ClickUp, monday, Notion, Zoom ; en dernier Teams, Meet, Airtable.
6. Pour les outils sans signature (Basecamp, tl;dv), ajouter un jeton aléatoire dans l'URL et limiter l'action de l'agent à de la lecture tant qu'on n'a pas relu l'objet par API.
7. Ne jamais agir sur le contenu d'un webhook seul : relire l'objet par API avec le jeton de l'utilisateur (droits d'origine).
8. Nango, Pipedream, Composio ne m'ont pas donné de fiche exploitable dans mes recherches, sauf Nango pour Airtable et Granola : à comparer plus tard si on veut sous-traiter la gestion des abonnements.

## Ce que je n'ai pas trouvé
- GitHub : tout vient de mémoire (aucune requête dédiée).
- GitLab : reprises, désactivation auto, état actuel des webhooks de groupe.
- Linear : reprises, limites, portée OAuth exacte.
- Jira : nom officiel de l'en-tête de signature ; Confluence Cloud : mécanisme actuel.
- Asana : délais, compactage, durée avant suppression.
- Trello : reprises et désactivation. Miro : tout (mécanisme, signature, expiration).
- Notion : reprises, délai d'agrégation, liste complète d'événements ; création d'abonnement par API.
- Sentry, Shortcut, Plane : reprises, expiration.
- Productboard : signature v2. Leexi : événements, signature, reprises. Claap : signature. Circleback, tl;dv : reprises.
- Zoom : nom exact de l'événement de transcription ; Meet : durée officielle d'un abonnement ; Teams : politique d'accès d'application.
- Prix et plans : seulement des indications tierces (tl;dv Business+, Granola Business+).
