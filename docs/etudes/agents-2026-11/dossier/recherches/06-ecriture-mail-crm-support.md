# Recherche 06 : écrire dans le mail, l'agenda, la messagerie, le CRM et le support depuis un agent

19 novembre 2026 · note de recherche pour le dossier de conception · **version complète**

Sujet : ce qu'un agent peut écrire dans chaque outil avec la connexion OAuth (ou la clé) d'un utilisateur. Pour chaque action : méthode et point d'API, champs obligatoires, portée, idempotence, annulation, débit, pièges.

## Méthode et limites

- **Aucune page n'a été ouverte directement.** Le réseau de la session ne résout pas les sites des éditeurs (essai sur `developers.google.com` : refusé). Tout vient de résumés de recherche web qui citent les pages. Un résumé peut se tromper ou dater : relire la page citée avant de coder une action.
- Légende : **[OFF]** documentation ou page de l'éditeur, lue par résumé ; **[TIERS]** blog, comparatif, forum, dépôt d'un tiers ; **[DED]** déduction ; **[MEM]** de mémoire, donc **à vérifier** sur la page citée ; **[code]** et **[doc]** vu dans notre dépôt.
- Date de l'état des lieux : 19 novembre 2026.
- Vocabulaire : « portée » = scope OAuth ; « annulable » = on peut défaire par l'API ce qu'on vient de faire (supprimer ce qu'on a créé, remettre l'ancienne valeur).

## Trois règles qui valent pour tous les outils

1. **Un envoi vers l'extérieur ne s'annule jamais.** Un mail parti, une réponse publique à un client, une invitation d'agenda envoyée : aucune API ne les rappelle. Ce sont les seules actions à garder derrière « propose » par défaut [DED].
2. **Presque aucune de ces API n'a de clé d'idempotence.** Exceptions trouvées : Microsoft Graph pour les événements (`transactionId`), Google Agenda (identifiant d'événement fourni par le client), Intercom et Zendesk en partie (voir les fiches). Partout ailleurs, c'est à nous de l'assurer : une ligne « action » en base avec une clé unique, écrite avant l'appel, et un appel jamais rejoué à l'aveugle [DED ; le client HTTP a déjà l'option `once`, `src/server/connectors/http.ts:20-22`, code].
3. **L'annulation se prépare avant l'écriture.** Pour toute modification, lire et garder l'ancienne valeur (statut, assigné, étiquettes, libellés). Pour toute création, garder l'identifiant rendu. Sans cela, pas de bouton « annuler » dans le poste de contrôle [DED].

---

## 1. Gmail

Base : `https://gmail.googleapis.com/gmail/v1/users/{userId}` avec `userId = me`. Aujourd'hui, Gmail passe chez nous par l'appli OAuth de Pipedream, validée pour `gmail.modify` [code, annexe 8].

### Portées et classement

| Portée | Ce qu'elle permet | Classement Google |
|---|---|---|
| `https://www.googleapis.com/auth/gmail.send` | Envoyer, rien d'autre. Ne lit pas, ne crée pas de brouillon. | **Sensible** |
| `https://www.googleapis.com/auth/gmail.compose` | Créer, lire, modifier, supprimer des brouillons ; envoyer brouillons et messages. | **Restreinte** |
| `https://www.googleapis.com/auth/gmail.modify` | Tout lire et tout écrire (libellés, brouillons, envoi, corbeille), sauf la suppression définitive. | **Restreinte** |
| `https://www.googleapis.com/auth/gmail.labels` | Créer et modifier des libellés seulement (pas les poser sur un message). | Non sensible |
| `https://www.googleapis.com/auth/gmail.readonly` | Lire. | **Restreinte** |
| `https://mail.google.com/` | Tout, suppression définitive comprise. À ne jamais demander. | **Restreinte** |

- Classement : [TIERS, concordants] https://www.unipile.com/gmail-api-scopes-guide/ ; https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/ ; https://learn.emailengine.app/docs/accounts/gmail/gmail-api-scopes. Page officielle à relire : https://developers.google.com/workspace/gmail/api/auth/scopes. Un guide tiers isolé classe `gmail.modify` en « sensible » (https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/) : il contredit les autres, ne pas s'y fier.
- **Il n'existe pas de portée « brouillons seulement ».** `gmail.compose` donne les brouillons **et** l'envoi [TIERS] https://zenn.dev/alma65/articles/gmail-draft-only-scope?locale=en. Conséquence : avec Gmail, « l'agent ne peut pas envoyer » ne se garantit pas par la portée. C'est notre code qui doit l'interdire [DED].
- **`gmail.send` seul ne suffit pas pour un brouillon** : `users.drafts.create` n'accepte que `mail.google.com`, `gmail.modify` ou `gmail.compose` [OFF] https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create. Et `users.drafts.send` demande aussi `gmail.compose`, `gmail.modify` ou l'accès complet, pas `gmail.send` [TIERS] https://github.com/oomol-lab/open-connector/issues/666.
- **Combiner fait monter le classement** : `gmail.send` (sensible) avec `gmail.readonly` (restreinte) donne une appli restreinte [TIERS] https://bright-softwares.com/blog/en/google-workspace/gmail-oauth-scope-tiers-what-every-workspace-addon-developer-must-know. Comme nous lisons déjà le mail, nous sommes déjà en « restreinte » : ajouter `gmail.compose` ou `gmail.modify` ne change pas de catégorie [DED].

### Ce que Google exige (revue de l'application)

- Portée sensible : vérification OAuth de l'appli (écran de consentement, domaine, politique de confidentialité, vidéo de démonstration) [TIERS, concordants].
- Portée restreinte : la même vérification, **plus une évaluation de sécurité CASA** dès que les données passent ou sont stockées sur nos serveurs. À refaire **tous les 12 mois**. Délai annoncé : environ 6 semaines selon la FAQ de Google citée, 4 à 12 semaines et plus selon les retours [TIERS] https://www.agenticfabriq.com/blog/google-oauth-verification-casa ; https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/.
- Coût de CASA : 540 à 1 000 $ par an par un laboratoire en libre-service, 15 000 à 75 000 $ par l'ancienne voie [TIERS, non confirmé par Google] https://www.agenticfabriq.com/blog/google-oauth-verification-casa. Les sources ne s'accordent pas sur le nom des niveaux (Tier 1, Tier 2).
- Tant que l'appli n'est pas vérifiée : écran « appli non vérifiée » et plafond de 100 utilisateurs [MEM, à vérifier].
- Aujourd'hui nous évitons tout cela parce que l'appli OAuth est celle de Pipedream [code]. Le jour où nous avons notre propre appli Google, CASA devient notre affaire [doc, annexe 8, ligne 256].

### Les actions

| Action | Méthode et point d'API | Champs obligatoires | Portée minimale | Coût en quota | Annulable |
|---|---|---|---|---|---|
| Créer un brouillon en réponse dans un fil | `POST /drafts` | `message.raw` (message RFC 2822 complet, en base64url) ; `message.threadId` | `gmail.compose` | 10 | Oui : `DELETE /drafts/{id}` |
| Modifier le brouillon | `PUT /drafts/{id}` | `message.raw` (remplace tout) | `gmail.compose` | 15 [MEM] | Oui, en gardant l'ancien `raw` |
| Envoyer un brouillon | `POST /drafts/send` | `id` du brouillon | `gmail.compose` | 100 | **Non** |
| Envoyer directement | `POST /messages/send` | `raw` ; `threadId` pour rester dans le fil | `gmail.send` | 100 | **Non** |
| Poser ou retirer un libellé | `POST /messages/{id}/modify` ou `POST /threads/{id}/modify` | `addLabelIds` et/ou `removeLabelIds` (100 libellés au plus par appel) | `gmail.modify` | 5 (message), 10 (fil) [MEM pour le fil] | Oui : l'appel inverse |
| Archiver | `POST /threads/{id}/modify` | `removeLabelIds: ["INBOX"]` | `gmail.modify` | 10 [MEM] | Oui : `addLabelIds: ["INBOX"]` |
| Créer un libellé | `POST /labels` | `name` | `gmail.labels` | 5 [MEM] | Oui : `DELETE /labels/{id}` |
| Mettre à la corbeille | `POST /messages/{id}/trash` | aucun | `gmail.modify` | 5 [MEM] | Oui : `POST /messages/{id}/untrash` (30 jours) |

Sources : coûts 100, 10, 5 et plafonds [OFF] https://developers.google.com/workspace/gmail/api/reference/quota ; portées de `messages.modify` [OFF] https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify ; libellés [TIERS] https://developer.nylas.com/docs/cookbook/email/gmail-labels-api/ ; brouillons [OFF] https://developers.google.com/workspace/gmail/api/guides/drafts.

### Répondre dans le fil : les trois conditions

Google en exige trois, toutes obligatoires [OFF] https://developers.google.com/workspace/gmail/api/guides/threads :

1. `threadId` du fil dans la ressource `message` ;
2. en-têtes `In-Reply-To` et `References` conformes à la RFC 2822, avec le `Message-ID` du message auquel on répond ;
3. un `Subject` qui correspond à celui du fil (« Re: … »).

Piège connu : ces en-têtes doivent être **dans le MIME encodé** (`raw`), pas dans un objet `payload.headers` à côté, sinon le fil n'est pas respecté [TIERS, ancien] https://github.com/googleapis/google-api-nodejs-client/issues/1938.

```ts
// À vérifier sur un vrai compte. Les noms de champs viennent de la référence REST.
const original = await gmail.get(`/messages/${messageId}?format=metadata` +
  `&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Reply-To`);
const h = (n: string) => original.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
const sujet = /^re:/i.test(h("Subject")) ? h("Subject") : `Re: ${h("Subject")}`;
const mime = [
  `To: ${h("Reply-To") || h("From")}`,
  `Subject: ${encoderEnTete(sujet)}`,            // RFC 2047 si accents
  `In-Reply-To: ${h("Message-ID")}`,
  `References: ${[h("References"), h("Message-ID")].filter(Boolean).join(" ")}`,
  `MIME-Version: 1.0`,
  `Content-Type: text/html; charset="UTF-8"`,
  ``,
  corpsHtml,
].join("\r\n");
const brouillon = await gmail.post(`/drafts`, {
  message: { raw: Buffer.from(mime).toString("base64url"), threadId: original.threadId },
});
// brouillon.id sert à DELETE /drafts/{id} (annuler) ou POST /drafts/send { id } (envoyer)
```

### Débit

- 6 000 unités de quota par minute et par utilisateur ; 1 200 000 par minute et par projet [OFF] https://developers.google.com/workspace/gmail/api/reference/quota. Selon des tiers, ces valeurs valent pour les projets créés depuis le 1er mai 2026 ; les projets plus anciens gardaient 15 000 par utilisateur et par minute [TIERS] https://developer.nylas.com/docs/cookbook/email/gmail-api-quotas/. D'autres guides donnent encore 250 unités par seconde et par utilisateur : c'est l'ancien chiffre.
- Un envoi coûte 100 unités : 60 envois par minute au plus pour un utilisateur, moins si l'on lit en même temps [DED].
- L'API reste gratuite sous 80 millions d'unités par jour et par projet ; Google annonce une facturation au-delà « plus tard en 2026 », avec 90 jours de préavis [OFF, par résumé] même page.
- Plafonds d'envoi du compte (2 000 mails par jour en Workspace, 500 en compte gratuit) : [MEM, à vérifier]. Ils s'appliquent aussi aux envois par API.
- Par Pipedream : chaque appel passe par leur proxy et coûte un crédit [code, annexe 8].

### Idempotence et pièges

- Aucune clé d'idempotence dans l'API Gmail [DED, rien trouvé]. Un `drafts.create` rejoué crée deux brouillons. Garder la clé chez nous (par exemple `agent:fil:message-auquel-on-repond`) et chercher un brouillon existant du fil avant d'en créer un autre.
- L'utilisateur peut modifier ou supprimer le brouillon dans Gmail entre-temps : `drafts.send` renverra alors une erreur ou enverra un texte différent de celui validé. Relire le brouillon juste avant l'envoi et comparer [DED].
- Le brouillon créé par l'API apparaît dans le fil de l'utilisateur, dans Gmail, sans rien installer. C'est le meilleur « poste de validation » possible pour le mail [DED].
- `messages.send` avec `gmail.send` seul ne permet pas de lire le message d'origine : inutilisable seul pour une réponse dans un fil [DED].

---

## 2. Google Agenda

Base : `https://www.googleapis.com/calendar/v3`. Nous n'avons pas de connecteur Google Agenda aujourd'hui [code, annexe 8, ligne 29].

### Portées

| Portée | Usage | Remarque |
|---|---|---|
| `https://www.googleapis.com/auth/calendar.events` | Lire et écrire les événements de tous les agendas de l'utilisateur | Suffit pour créer et modifier. Classée sensible [MEM, à vérifier] |
| `https://www.googleapis.com/auth/calendar.events.owned` | Écrire seulement dans les agendas dont l'utilisateur est propriétaire | Plus étroite ; acceptée par `events.insert` |
| `https://www.googleapis.com/auth/calendar.freebusy` | Voir les disponibilités seulement | Suffit pour `freeBusy.query` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` | Idem, variante | Acceptée par `freeBusy.query`, mais absente du guide des portées |
| `https://www.googleapis.com/auth/calendar` | Tout, y compris supprimer des agendas | À éviter |

Sources : [OFF] https://developers.google.com/workspace/calendar/api/auth ; https://developers.google.com/workspace/calendar/api/v3/reference/events/insert ; https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query. Le classement sensible ou non de chaque portée d'agenda : non trouvé dans les résumés.

### Les actions

| Action | Méthode et point d'API | Champs obligatoires | Portée | Annulable |
|---|---|---|---|---|
| Créer un événement | `POST /calendars/{calendarId}/events` (`calendarId = primary`) | `start`, `end` (`dateTime` + `timeZone`, ou `date`) | `calendar.events` ou `calendar.events.owned` | Oui : `DELETE /calendars/{calendarId}/events/{eventId}`. Mais les invitations déjà parties ne se rappellent pas ; une annulation envoie un second mail. |
| Modifier un événement | `PATCH /calendars/{calendarId}/events/{eventId}` (ou `GET` puis `PUT`) | les champs changés | `calendar.events` | Oui, si l'on a gardé l'ancienne version (remettre les anciens champs) |
| Proposer des créneaux | `POST /freeBusy` | `timeMin`, `timeMax`, `items: [{ id }]` | `calendar.freebusy` | Sans objet (lecture) |

- Paramètres de requête utiles sur `insert` et `patch` [MEM, à vérifier sur la référence] : `sendUpdates=all|externalOnly|none` (qui reçoit le mail d'invitation ; `none` par défaut), `conferenceDataVersion=1` (obligatoire pour créer un lien Meet avec `conferenceData.createRequest.requestId` et `conferenceSolutionKey.type = "hangoutsMeet"`).
- `PATCH` coûte trois unités de quota ; Google conseille `GET` puis `PUT` [OFF] https://developers.google.com/workspace/calendar/api/v3/reference/events.
- **`freeBusy.query` ne propose pas de créneaux** : il rend les plages occupées de chaque agenda. Le calcul des créneaux libres communs est à écrire chez nous (intersection, heures ouvrées, fuseaux) [DED]. Il ne voit que les agendas que l'utilisateur a le droit de voir : pour un invité extérieur, rien.

### Idempotence

- **Oui, par l'identifiant.** On peut fournir soi-même `id` à la création : un second `insert` avec le même `id` rend `409` avec la raison `duplicate` [OFF] https://developers.google.com/workspace/calendar/api/guides/errors. Format : base32hex en minuscules (caractères `a` à `v` et `0` à `9`), 5 à 1 024 caractères [TIERS] https://cli.nylas.com/guides/google-calendar-api-error-codes. Traiter le `409` comme un succès quand l'identifiant est dérivé de notre clé d'action. Réserve : Google ne garantit pas la détection des collisions à la création [TIERS, citation de la documentation] https://github.com/Jongtae/agentos/issues/447.
- `conferenceData.createRequest.requestId` joue le même rôle pour le lien Meet [MEM, à vérifier].

```ts
// Identifiant déterministe : même clé d'action => même événement.
const id = base32hex(sha256(`${agentId}:${actionKey}`)).slice(0, 40);   // a-v, 0-9
await gcal.post(`/calendars/primary/events?sendUpdates=none&conferenceDataVersion=1`, {
  id, summary, description,
  start: { dateTime: "2026-11-24T10:00:00", timeZone: "Europe/Paris" },
  end:   { dateTime: "2026-11-24T10:30:00", timeZone: "Europe/Paris" },
  attendees: [{ email: "client@exemple.fr" }],
});   // 409 duplicate => déjà créé, relire avec GET
```

### Débit et pièges

- 600 requêtes par minute et par utilisateur, 10 000 par minute et par projet, fenêtre glissante [OFF] https://developers.google.com/workspace/calendar/api/guides/quota. Dépassement : `403 userRateLimitExceeded` ou `429`.
- **`sendUpdates` est le vrai bouton d'autonomie.** Créer avec `sendUpdates=none` pose l'événement sans prévenir personne : c'est un brouillon d'invitation. `sendUpdates=all` envoie des mails à des tiers et ne s'annule pas [DED].
- Restaurer un événement supprimé par l'API : non trouvé. La corbeille de Google Agenda garde 30 jours dans l'interface [MEM] ; par l'API, à vérifier (remettre `status: "confirmed"` sur un événement `cancelled`).
- Séries : modifier une occurrence ou toute la série ne se fait pas par le même identifiant. À borner au premier jet : événements simples seulement [DED].

---

## 3. Microsoft Graph : Outlook (mail)

Base : `https://graph.microsoft.com/v1.0`. Notre appli Entra demande déjà `offline_access`, `User.Read`, `Mail.ReadWrite`, `Calendars.ReadWrite`, et volontairement pas `Mail.Send` [doc, `docs/guides/applis-oauth.md`].

### `Mail.ReadWrite` contre `Mail.Send`

| Portée déléguée | Ce qu'elle permet |
|---|---|
| `Mail.ReadWrite` | Lire, créer, modifier, déplacer, supprimer les messages et brouillons de l'utilisateur. **N'envoie pas.** |
| `Mail.Send` | Envoyer au nom de l'utilisateur (`send`, `sendMail`, `reply`, `replyAll`, `forward`). Ne lit pas. Avec elle seule, l'appli peut envoyer et garder une copie dans « Éléments envoyés » sans `Mail.ReadWrite`. |

Sources : [OFF] https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0 ; https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0 ; https://learn.microsoft.com/en-us/graph/permissions-reference.

**C'est la grande différence avec Gmail : chez Microsoft, la séparation « brouillon » et « envoi » est tenue par les portées.** Sans `Mail.Send`, l'agent ne peut pas envoyer, quoi que fasse notre code. Le curseur « propose » est donc garanti par Microsoft ; « agit seul » demande d'ajouter `Mail.Send` et un nouvel accord [DED].

### Les actions

| Action | Méthode et point d'API | Corps | Portée | Annulable |
|---|---|---|---|---|
| Brouillon de réponse dans le fil | `POST /me/messages/{id}/createReply` | vide, ou `{ "message": {…}, "comment": "…" }` | `Mail.ReadWrite` | Oui : `DELETE /me/messages/{draftId}` |
| Brouillon « répondre à tous » | `POST /me/messages/{id}/createReplyAll` | idem | `Mail.ReadWrite` | Oui, idem |
| Écrire le corps du brouillon | `PATCH /me/messages/{draftId}` | `{ "body": { "contentType": "HTML", "content": "…" } }` | `Mail.ReadWrite` | Oui (garder l'ancien corps) |
| Envoyer le brouillon | `POST /me/messages/{draftId}/send` | aucun corps | `Mail.Send` | **Non** |
| Répondre et envoyer d'un coup | `POST /me/messages/{id}/reply` ou `/replyAll` | `{ "comment": "…" }` ou `message` | `Mail.Send` | **Non** |
| Envoyer un nouveau message | `POST /me/sendMail` | `{ "message": { subject, body, toRecipients }, "saveToSentItems": true }` | `Mail.Send` | **Non** |
| Poser des catégories | `PATCH /me/messages/{id}` | `{ "categories": ["À traiter"] }` (remplace la liste entière) | `Mail.ReadWrite` | Oui (remettre l'ancienne liste) |
| Déplacer (archiver, ranger) | `POST /me/messages/{id}/move` | `{ "destinationId": "archive" }` ou un identifiant de dossier | `Mail.ReadWrite` | Oui : `move` vers le dossier d'origine |

- `createReply` rend `201` avec le brouillon, déjà rattaché à la conversation (bons destinataires, bon sujet, bons en-têtes) : rien à calculer, contrairement à Gmail [OFF] page createReply. Il accepte du JSON ou du MIME.
- `send` s'applique à tout brouillon (nouveau, réponse, réponse à tous, transfert), sans corps de requête, et range le message dans « Éléments envoyés » [OFF] page send.
- Chemins `move`, `categories` : [MEM, à vérifier] sur https://learn.microsoft.com/en-us/graph/api/message-move et https://learn.microsoft.com/en-us/graph/api/message-update. Noms de dossiers connus (`inbox`, `archive`, `deleteditems`, `drafts`) : [MEM].
- Créer une catégorie avec sa couleur dans la liste de l'utilisateur : `POST /me/outlook/masterCategories`, portée `MailboxSettings.ReadWrite` [MEM, à vérifier]. Sans cela, une catégorie inconnue s'affiche sans couleur.

```ts
// Brouillon de réponse Outlook : deux appels, rien n'est envoyé.
const draft = await graph.post(`/me/messages/${messageId}/createReply`, {});          // 201
await graph.patch(`/me/messages/${draft.id}`, {
  body: { contentType: "HTML", content: corpsHtml + (draft.body?.content ?? "") },     // garder la citation
});
// Annuler : DELETE /me/messages/{draft.id}. Envoyer (Mail.Send) : POST /me/messages/{draft.id}/send
```

### Débit

- 10 000 requêtes par 10 minutes, par application et par boîte aux lettres ; les requêtes d'une boîte ne comptent pas pour une autre [OFF] https://devblogs.microsoft.com/microsoft365dev/throttling-coming-to-outlook-api-and-microsoft-graph/. Limite de 4 requêtes simultanées par boîte [TIERS] https://developer.nylas.com/docs/cookbook/email/microsoft-graph-rate-limits/. Sur `429`, attendre la durée de l'en-tête `Retry-After`.
- Plafonds d'envoi d'Exchange Online : 10 000 destinataires par jour et 30 messages par minute par boîte, API comprise [TIERS, Microsoft Q&A] https://learn.microsoft.com/en-us/answers/questions/2123005/it-is-not-clear-to-me-the-exact-number-of-mails-i.

### Idempotence et pièges

- Pas de clé d'idempotence pour les messages [DED, rien trouvé]. Un `createReply` rejoué crée un second brouillon.
- **L'identifiant d'un message change quand il est déplacé.** Demander des identifiants stables avec l'en-tête `Prefer: IdType="ImmutableId"` sur toutes les requêtes [MEM, à vérifier ; non confirmé par la recherche] https://learn.microsoft.com/en-us/graph/outlook-immutable-id. Sans cela, l'annulation d'un déplacement perd le message.
- `PATCH categories` remplace toute la liste : lire avant d'écrire.
- Boîtes partagées : il faut `Mail.ReadWrite.Shared` et `Mail.Send.Shared`, et le chemin `/users/{adresse}/…` [MEM, à vérifier].

### Ce que Microsoft exige

- Pas de revue de sécurité comparable à CASA pour ces portées déléguées [DED, rien trouvé de tel].
- **Vérification de l'éditeur (« publisher verification »).** Une appli multi-locataire enregistrée après le 8 novembre 2020, sans éditeur vérifié, ne peut pas recevoir le consentement d'un simple utilisateur d'un autre locataire, sauf pour la connexion et le profil de base [TIERS, citant Microsoft] https://nhimg.org/entra-id-applications-and-consent-guide ; https://github.com/TGoodhew/Claude-Hotmail-Connector/issues/62. La vérification demande un compte Microsoft AI Cloud Partner Program [OFF] https://learn.microsoft.com/en-us/entra/identity-platform/howto-configure-publisher-domain.
- Même avec un éditeur vérifié, beaucoup de locataires réservent les droits de courrier à l'accord d'un administrateur : cela dépend du réglage de chaque client, pas de nous [TIERS, Microsoft Q&A] https://learn.microsoft.com/en-us/answers/questions/5705172/my-app-is-asking-for-admin-approval-on-my-customer. C'est déjà notre parcours (lien d'accord administrateur) [doc].
- Ajouter `Mail.Send` plus tard = nouvel accord de l'administrateur de chaque client [DED].

---

## 4. Microsoft Graph : agenda Outlook

### Les actions

| Action | Méthode et point d'API | Champs obligatoires | Portée déléguée | Annulable |
|---|---|---|---|---|
| Créer un événement | `POST /me/events` (ou `/me/calendars/{id}/events`) | `subject`, `start`, `end` (`dateTime` + `timeZone`) [MEM pour la liste exacte] | `Calendars.ReadWrite` | Oui : `DELETE /me/events/{id}` ; si des invités existent, préférer `POST /me/events/{id}/cancel` (envoie l'annulation) [MEM] |
| Modifier un événement | `PATCH /me/events/{id}` | champs changés | `Calendars.ReadWrite` | Oui (garder l'ancienne version) |
| Proposer des créneaux | `POST /me/findMeetingTimes` | aucun strictement ; en pratique `attendees`, `timeConstraint`, `meetingDuration` | `Calendars.Read.Shared` (au minimum) ou `Calendars.ReadWrite.Shared` | Sans objet |
| Lire les disponibilités brutes | `POST /me/calendar/getSchedule` | `schedules` (adresses), `startTime`, `endTime`, `availabilityViewInterval` | `Calendars.Read` [MEM, à vérifier] | Sans objet |

- `findMeetingTimes` : **comptes professionnels ou scolaires uniquement, en délégué uniquement** ; pas de compte personnel, pas de droit d'application [OFF] https://learn.microsoft.com/en-us/graph/api/user-findmeetingtimes?view=graph-rest-1.0. **Notre appli ne demande pas `Calendars.Read.Shared` aujourd'hui** [doc] : il faudra l'ajouter (nouvel accord), ou calculer les créneaux nous-mêmes avec `getSchedule`.
- Contrairement à Google, `findMeetingTimes` propose vraiment des créneaux, avec un niveau de confiance, en tenant compte des heures de travail des participants du même locataire [MEM]. Pour un invité extérieur, il ne sait rien.
- Dès qu'un événement a des `attendees`, Graph envoie les invitations à la création : il n'y a pas d'équivalent à `sendUpdates=none` [MEM, à vérifier]. Créer sans invités est le seul « brouillon » d'événement.
- Lien Teams : `"isOnlineMeeting": true, "onlineMeetingProvider": "teamsForBusiness"` [MEM, à vérifier].

### Idempotence

- **Oui : `transactionId`.** Champ de l'événement, fourni par le client à la création, « pour que le serveur évite les POST redondants quand le client rejoue après un délai dépassé ». Non modifiable ensuite [OFF] https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0.
- Réserves : un rapport de deux événements distincts portant le même `transactionId` [TIERS] https://github.com/mguessan/davmail/issues/522 ; erreur 400 dans le nuage GCC High [TIERS] https://learn.microsoft.com/en-us/answers/questions/1062749/. À traiter comme une aide au rejeu, pas comme une contrainte d'unicité : garder aussi notre clé.

### Débit

Même plafond que le mail : 10 000 requêtes par 10 minutes par appli et par boîte (le calendrier fait partie des ressources Outlook comptées) [OFF] https://devblogs.microsoft.com/microsoft365dev/throttling-coming-to-outlook-api-and-microsoft-graph/.

---

## 5. Slack

Base : `https://slack.com/api/{méthode}`, en `POST`, jeton en `Authorization: Bearer xoxb-…`. Aujourd'hui, Slack passe chez nous par l'appli de Pipedream avec un jeton **utilisateur**, en lecture [code, annexe 8]. Pour qu'un agent écrive et reçoive des clics, il faut **notre propre appli Slack** avec un jeton de **bot** : les boutons renvoient vers l'adresse déclarée par l'appli, pas vers nous si l'appli est celle d'un tiers [DED].

### Portées

| Portée (jeton de bot) | Usage |
|---|---|
| `chat:write` | `chat.postMessage`, `chat.postEphemeral`, `chat.update`, `chat.delete`, `chat.scheduleMessage`. Le bot doit être membre du canal. |
| `chat:write.public` | Poster dans un canal public sans y être invité. |
| `im:write` | Ouvrir un message direct avec un utilisateur (`conversations.open`) [MEM, à vérifier]. |
| `users:read`, `users:read.email` | Relier un compte Slack à un membre de chez nous par l'adresse mail [MEM]. |
| `commands` | Commandes « / », si l'on en déclare. |

- `chat:write` remplace les anciennes `chat:write:user` et `chat:write:bot` [OFF] https://docs.slack.dev/reference/scopes/chat.write/. La page de `chat.postEphemeral` parle encore de `chat:write:user` pour poster « en tant qu'utilisateur » : les deux pages se contredisent [OFF] https://docs.slack.dev/reference/methods/chat.postEphemeral/.
- Avec un jeton **utilisateur** (`xoxp-`) portant `chat:write`, le message part au nom de la personne. Avec un jeton de **bot**, il part au nom de l'appli. Pour un agent, toujours le bot : on sait qui parle [DED].

### Les actions

| Action | Méthode | Arguments obligatoires | Portée | Débit | Annulable |
|---|---|---|---|---|---|
| Poster un message | `chat.postMessage` | `channel` ; plus `text`, `blocks` ou `attachments` | `chat:write` | environ 1 message par seconde et par canal, plus un plafond par espace | Oui : `chat.delete` (`channel`, `ts`) |
| Répondre dans un fil | `chat.postMessage` | `channel`, `thread_ts` | `chat:write` | idem | Oui |
| Message à boutons | `chat.postMessage` avec `blocks` (bloc `actions`, éléments `button`) | `channel`, `blocks`, et `text` en secours | `chat:write` | idem | Oui |
| Message éphémère (vu d'un seul) | `chat.postEphemeral` | `channel`, `user`, `text` ou `blocks` | `chat:write` | Tier 4 (100+ par minute) | **Non par l'API** : ni `chat.update` ni `chat.delete`. Seul le `response_url` d'un clic permet de le remplacer ou l'effacer. |
| Modifier son message | `chat.update` | `channel`, `ts`, nouveau contenu | `chat:write` | Tier 3 (50+ par minute) [MEM] | Oui (garder l'ancien contenu) |
| Supprimer son message | `chat.delete` | `channel`, `ts` | `chat:write` | Tier 3 [MEM] | Non |
| Programmer un message | `chat.scheduleMessage` | `channel`, `post_at`, `text` | `chat:write` | — | Oui : `chat.deleteScheduledMessage` [MEM] |

Sources : [OFF] https://docs.slack.dev/reference/methods/chat.postMessage/ ; https://docs.slack.dev/reference/methods/chat.postEphemeral/ ; https://docs.slack.dev/messaging/sending-and-scheduling-messages/ ; https://docs.slack.dev/apis/web-api/rate-limits. Un bot ne modifie et ne supprime que ses propres messages [MEM].

### Boutons et interactivité

Le circuit, d'après [OFF] https://docs.slack.dev/interactivity/handling-user-interaction/ et https://docs.slack.dev/reference/interaction-payloads/block_actions-payload/ :

1. On poste un message avec un bloc `actions`. Chaque bouton porte un `action_id` stable et une `value` (512 caractères au plus [MEM]).
2. Au clic, Slack envoie un `POST` à l'adresse « Interactivity Request URL » de l'appli : formulaire avec un champ `payload` en JSON, de type `block_actions` [MEM pour le format du formulaire].
3. **Il faut répondre `200` en moins de 3 secondes.** Le travail réel se fait après, dans une tâche (pg-boss).
4. Le `payload` contient `user.id`, `actions[0].action_id`, `actions[0].value`, `message.ts`, `channel.id`, un `trigger_id` (pour ouvrir une fenêtre) et un `response_url`.
5. Le `response_url` reste valable 30 minutes et sert 5 fois au plus [OFF pour les 30 minutes ; 5 envois : OFF de mémoire, constaté par un tiers https://slack.green/en/blog/slack-interactivity-payload]. Au-delà, utiliser `chat.update` avec `channel` et `ts`.
6. Vérifier chaque requête : en-têtes `X-Slack-Signature` et `X-Slack-Request-Timestamp`, HMAC-SHA256 du texte `v0:{timestamp}:{corps brut}` avec le « signing secret » [MEM, à vérifier].

```ts
// Carte de validation d'une action d'agent (Block Kit). value = identifiant de NOTRE ligne d'action.
await slack.post("chat.postMessage", {
  channel: slackUserId,                       // un identifiant U… ouvre la conversation avec l'appli [MEM]
  text: "Brouillon prêt : réponse à Mme Martin (devis 2026-114)",
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: "*Brouillon prêt* : réponse à Mme Martin\n>Bonjour Madame, voici le devis…" } },
    { type: "actions", block_id: `action:${actionId}`, elements: [
      { type: "button", action_id: "agent_approve", style: "primary", text: { type: "plain_text", text: "Envoyer" }, value: actionId },
      { type: "button", action_id: "agent_edit",    text: { type: "plain_text", text: "Ouvrir dans Gmail" }, url: lienBrouillon },
      { type: "button", action_id: "agent_reject",  style: "danger",  text: { type: "plain_text", text: "Refuser" }, value: actionId },
    ] },
  ],
});
// Route Hono : vérifier la signature, répondre 200 tout de suite, mettre le clic en file.
// Le clic est la seule preuve du consentement : vérifier que payload.user.id est bien le propriétaire de l'action.
```

Piège de sécurité : dans un canal, n'importe quel membre peut cliquer. Vérifier `payload.user.id` contre le propriétaire de l'action, et préférer le message direct pour toute validation [DED]. Un bouton avec `url` envoie quand même un `payload` qu'il faut acquitter [OFF].

### Manifeste d'application

Référence : [OFF] https://docs.slack.dev/reference/app-manifest/. Champs sûrs d'après la référence et des exemples publics : `oauth_config.scopes.bot` (255 au plus), `settings.interactivity.is_enabled` et `request_url`, `settings.event_subscriptions.request_url` et `bot_events`, `settings.socket_mode_enabled`, `settings.org_deploy_enabled`, `settings.token_rotation_enabled`.

```yaml
# À vérifier contre la référence avant import. Noms de champs repris d'exemples publics.
display_information:
  name: Leon
features:
  bot_user:
    display_name: Leon
    always_online: true
  app_home:
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
oauth_config:
  redirect_urls:
    - https://<domaine>/api/v1/connexions/oauth/slack/retour
  scopes:
    bot: [chat:write, chat:write.public, im:write, users:read, users:read.email, app_mentions:read]
settings:
  event_subscriptions:
    request_url: https://<domaine>/api/v1/slack/evenements
    bot_events: [app_mention, message.im]
  interactivity:
    is_enabled: true
    request_url: https://<domaine>/api/v1/slack/interactions
  org_deploy_enabled: false
  socket_mode_enabled: false      # true en local : pas d'adresse publique à exposer
  token_rotation_enabled: true
```

### Ce que Slack interdit ou soumet à revue

- **Lecture bridée hors Marketplace.** Pour une appli distribuée commercialement et non approuvée au Slack Marketplace, `conversations.history` et `conversations.replies` tombent à 1 requête par minute et 15 messages par appel. Applis créées après le 29 mai 2025 : tout de suite. Installations existantes : au 3 mars 2026 (date repoussée depuis le 2 septembre 2025). Les applis internes à un client ne sont pas touchées [OFF] https://api.slack.com/changelog/2025-05-terms-rate-limit-update-and-faq. **`chat.postMessage` n'est pas concerné** : écrire reste possible sans Marketplace [DED].
- **Revue du Marketplace.** Il faut déjà 10 installations dans des espaces actifs (le journal des changements a parlé de 5 à partir du 11 août 2026, puis d'un retour à 10 : les deux pages se contredisent) [OFF] https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement/ ; [TIERS] https://www.martechnotes.com/slack-cuts-marketplace-app-listing-requirement-to-5-workspaces-on-august-11-2026/. Revue préliminaire : jusqu'à 10 jours ouvrés ; revue fonctionnelle : jusqu'à 10 semaines [OFF] https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide/. Revue de sécurité possible, renforcée pour les portées `*:history`, `files:read`, `admin.*` [TIERS] https://workos.com/blog/oauth-app-approval-slack-microsoft-atlassian. Il faut nommer le modèle si l'appli expose les utilisateurs à un LLM [OFF] https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/.
- Une appli avec seulement `chat:write`, `im:write`, `users:read` et les événements de mention n'a aucune portée « à risque » : c'est le profil le plus simple à faire passer [DED].
- Conditions d'API sur le stockage et l'usage des messages par un modèle : non relu ici ; notre étude interne dit « Slack interdit le stockage » [doc, `founder-pme-2026-10/board.md:19`].

### Idempotence et pièges

- Pas de clé d'idempotence sur `chat.postMessage` [DED, rien trouvé]. Un rejeu poste deux fois. Garder `channel` + `ts` de la réponse dans notre ligne d'action et ne jamais rejouer sans vérifier.
- `chat.postMessage` rend `ok: false` avec un code HTTP 200 : toujours lire `ok` et `error` (`not_in_channel`, `channel_not_found`, `ratelimited`) [MEM].
- Texte : 4 000 caractères conseillés, coupé au-delà de 40 000 [TIERS] ; 50 blocs par message [MEM].
- Un message éphémère disparaît au rechargement et n'existe pas sur les autres appareils : ne jamais y mettre une validation importante [OFF].

---

## 6. Microsoft Teams

Nous n'avons pas de connecteur Teams [code]. Deux voies très différentes existent. Il faut choisir selon le besoin.

| Besoin | Voie | Pourquoi |
|---|---|---|
| Écrire un message **au nom de l'utilisateur** dans une conversation ou un canal | Microsoft Graph, droits délégués | Simple, même jeton que Outlook. Mais pas de boutons qui reviennent vers nous. |
| Envoyer une **carte avec boutons** (valider, refuser) et recevoir le clic | **Un bot Teams** (appli Teams + Azure Bot Service) | Seul un bot reçoit les `invoke` des cartes. |

### Voie 1 : Microsoft Graph (message au nom de l'utilisateur)

| Action | Méthode et point d'API | Corps | Portée déléguée | Annulable |
|---|---|---|---|---|
| Message dans une conversation | `POST /chats/{chat-id}/messages` | `{ "body": { "content": "…" } }` | `ChatMessage.Send` (plus larges : `Chat.ReadWrite`) | Suppression douce : `POST /users/{id}/chats/{chat-id}/messages/{id}/softDelete` [MEM, à vérifier] |
| Message dans un canal | `POST /teams/{team-id}/channels/{channel-id}/messages` | idem | `ChannelMessage.Send` [MEM] | idem, chemin du canal [MEM] |
| Carte adaptative | même point d'API, `body.contentType = "html"`, `body.content = "<attachment id=\"{guid}\"></attachment>"`, `attachments: [{ id: "{guid}", contentType: "application/vnd.microsoft.card.adaptive", content: "<JSON en chaîne>" }]` | — | idem | idem |

- Sources : [OFF] https://learn.microsoft.com/en-us/graph/api/chatmessage-post?view=graph-rest-1.0 ; https://learn.microsoft.com/en-us/graph/teams-messaging-overview. Comptes professionnels seulement.
- L'identifiant de la pièce jointe doit être unique et identique dans `body` et dans `attachments` [TIERS, Microsoft Q&A] https://learn.microsoft.com/en-us/answers/questions/1167333/how-to-send-adaptive-card-templates-with-graph-api.
- **Sur une carte envoyée par Graph, seule l'action `Action.OpenUrl` fonctionne.** `Action.Submit` et `Action.Execute` ne renvoient rien à personne [TIERS, Microsoft Q&A, non confirmé par la référence] https://learn.microsoft.com/en-us/answers/questions/1181611/how-can-i-send-adaptive-cards-with-action-submit-t. Une carte Graph peut donc porter un bouton « Ouvrir dans Leon », pas un bouton « Valider ».
- Pas de droit d'application pour envoyer un message : ils sont réservés à la migration [MEM, à vérifier]. Le message porte toujours le nom de l'utilisateur.
- Les webhooks entrants (connecteurs Office 365) ont été retirés entre le 18 et le 22 mai 2026 ; le remplaçant est une adresse de l'appli Workflows (Power Automate), créée par le client [OFF] https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/ ; https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/what-are-webhooks-and-connectors.

### Voie 2 : un bot Teams (cartes avec boutons)

- **Envoi proactif.** Un bot ne peut écrire à quelqu'un que s'il a déjà une « référence de conversation », obtenue quand l'appli est installée pour cette personne ou cette équipe. Il n'existe pas d'API pour écrire à froid [TIERS] https://devopsaitoolkit.com/blog/proactive-messaging-from-teams-bots-without-getting-rate-limited/. Il faut stocker ces références. Envoi : `POST {serviceUrl}/v3/conversations/{conversationId}/activities` avec un jeton du service de bots [MEM, à vérifier ; le chemin n'est pas ressorti de la recherche].
- **Boutons.** Utiliser `Action.Execute` (« Universal Actions »). Le clic arrive au bot comme une activité `invoke` nommée `adaptiveCard/action`. Le bot peut répondre par une nouvelle carte qui **remplace** la première pour tout le monde. Microsoft conseille de remplacer tous les `Action.Submit` par `Action.Execute` [OFF] https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/universal-actions-for-adaptive-cards/work-with-universal-actions-for-adaptive-cards ; https://learn.microsoft.com/en-us/adaptive-cards/authoring-cards/universal-action-model.
- **Débit par bot et par conversation** : 7 envois par seconde, 60 par 30 secondes, 1 800 par heure ; plafond global cité de 50 requêtes par seconde par appli et par locataire (source de 2022). Pas de procédure pour demander plus. Sur `429`, reculer [OFF] https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/rate-limit ; [TIERS] Microsoft Q&A.
- **Outillage en 2026.** Le Bot Framework SDK est archivé ; plus de support depuis le 31 décembre 2025. Les bots existants tournent toujours et Azure Bot Service continue de les servir. Les successeurs : le **Teams SDK** (ancien « Teams AI Library », renommé en novembre 2025) pour un bot seulement Teams ; le **Microsoft 365 Agents SDK** pour plusieurs canaux (Teams, Outlook, Copilot) [OFF] https://learn.microsoft.com/en-us/microsoftteams/platform/legacy-tools-sdks ; [TIERS] https://www.rickvanrousselt.com/blog/migrating-a-bot-framework-v4-bot-to-the-teams-sdk/.
- **Distribution.** Soit le client téléverse notre paquet d'appli (manifeste + icônes) dans son catalogue d'organisation, par son administrateur Teams ; soit nous publions au magasin Teams, avec validation par Microsoft [MEM, à vérifier ; non ressorti de la recherche].

```jsonc
// Carte adaptative de validation, envoyée par le bot. « verb » et « data » reviennent dans l'invoke.
{
  "type": "AdaptiveCard", "version": "1.5",
  "body": [
    { "type": "TextBlock", "weight": "Bolder", "text": "Brouillon prêt : réponse à Mme Martin" },
    { "type": "TextBlock", "wrap": true, "text": "Bonjour Madame, voici le devis…" }
  ],
  "actions": [
    { "type": "Action.Execute", "title": "Envoyer", "verb": "agent_approve", "data": { "actionId": "act_123" } },
    { "type": "Action.Execute", "title": "Refuser", "verb": "agent_reject",  "data": { "actionId": "act_123" } },
    { "type": "Action.OpenUrl", "title": "Ouvrir dans Outlook", "url": "https://outlook.office.com/…" }
  ]
}
```

### Pièges

- Teams demande bien plus de travail que Slack pour le même résultat : une appli Teams, une ressource Azure Bot, un point d'entrée de messagerie, le stockage des références de conversation, l'installation par l'administrateur de chaque client [DED].
- Idempotence : rien trouvé, ni côté Graph ni côté bot.
- Identité : par Graph, le message est signé de l'utilisateur ; par le bot, il est signé de l'appli. Les collègues ne voient pas la même chose [DED].

---

## 7. HubSpot

Base : `https://api.hubapi.com`. Jeton OAuth en `Authorization: Bearer`. Le brouillon n'avait pas encore cette fiche : elle est complétée ici.

### Les actions

| Action | Méthode et point d'API | Champs obligatoires | Portée | Annulable |
|---|---|---|---|---|
| Créer un contact | `POST /crm/v3/objects/contacts` | `properties` (en pratique `email`) ; `associations` possible à la création | `crm.objects.contacts.write` | Oui : `DELETE /crm/v3/objects/contacts/{id}` (corbeille ; restauration par l'interface, 90 jours [MEM]) |
| Modifier un contact | `PATCH /crm/v3/objects/contacts/{id}` (ou `?idProperty=email`) | `properties` changées | idem | Oui, en gardant les anciennes valeurs |
| Créer une société | `POST /crm/v3/objects/companies` | `properties` (`name`, `domain`) | `crm.objects.companies.write` | Oui : `DELETE` |
| Créer une affaire | `POST /crm/v3/objects/deals` | `properties.dealname`, `pipeline`, `dealstage` [MEM] | `crm.objects.deals.write` [OFF, par résumé] | Oui : `DELETE` |
| Créer une note | `POST /crm/v3/objects/notes` (la doc de novembre 2026 montre aussi `/crm/objects/2026-09/notes`) | `properties.hs_note_body`, `properties.hs_timestamp` ; `associations` | pas de portée « notes » trouvée ; en pratique les portées d'écriture de l'objet associé [MEM, à vérifier] | Oui : `DELETE` |
| Créer une tâche | `POST /crm/v3/objects/tasks` | `properties.hs_timestamp`, `hs_task_subject` ; `hs_task_status`, `hs_task_type` | idem [MEM, à vérifier] | Oui : `DELETE` |
| Associer deux objets | `PUT /crm/v4/objects/{type}/{id}/associations/{toType}/{toId}` avec un corps de types d'association | `associationCategory`, `associationTypeId` | portée d'écriture des deux objets | Oui : `DELETE` sur le même chemin |
| Créer ou mettre à jour par clé | `POST /crm/v3/objects/contacts/batch/upsert` (clé `email` ou propriété unique) | `inputs[].idProperty`, `id`, `properties` | écriture | partiel |

Sources : points d'API et associations [OFF, par résumé] https://developers.hubspot.com/docs/api-reference/crm-associations-v4/guide ; https://developers.hubspot.com/docs/api-reference/latest/crm/activities/notes/guide ; https://developers.hubspot.com/docs/api-reference/crm-tasks-v3/guide ; portées https://developers.hubspot.com/docs/apps/legacy-apps/authentication/scopes. Les pages mélangent des versions : `/crm/v3/...` (ancien, toujours là), `/crm/objects/2026-09/...` et `/crm/associations/2026-03/...` (versions datées). **Choisir une version, la figer, et la relire sur la page.** Le point `batch/upsert` : [MEM, à vérifier].

Ordre à garder : les identifiants `associationTypeId` par défaut (ex. note vers contact) se lisent sur la page des associations ou par `GET /crm/v4/associations/{from}/{to}/labels` [MEM, à vérifier].

### Débit

- Applis publiques OAuth : 110 requêtes par 10 secondes **par compte client qui installe l'appli** ; l'option « API limit increase » achetée par le client ne joue pas pour les applis de la place de marché. La recherche CRM a sa propre limite de 5 requêtes par seconde et par compte. Pas d'en-têtes de quota journalier pour OAuth [TIERS, citant la doc] https://appnigma.ai/blogs/hubspot-api-rate-limits-guide/. Un autre tiers donne l'ancien chiffre de 100 par 10 secondes : la page officielle fait foi.
- Applis privées (jeton d'accès par compte) : 100 à 190 requêtes par 10 secondes et 250 000 à 1 000 000 par jour selon l'offre [TIERS] https://pipeline.zoominfo.com/sales/hubspot-api. L'ancien guide des associations cite 500 000 par jour pour Professional et Enterprise [OFF, par résumé].
- Lots : jusqu'à 100 enregistrements par appel `batch` [MEM] ; 2 000 entrées par appel pour les associations en lot [OFF, par résumé].

### Idempotence et pièges

- **Pas de clé d'idempotence trouvée** pour la création. Le contact est unique par `email` : un second `POST` avec le même mail rend `409 Conflict` ; l'identifiant existant est **dans le texte de l'erreur**, pas dans un champ structuré, et la forme de la réponse a changé avec le temps. Une création ou un `batch/upsert` en lot est refusé en entier si un seul courriel existe déjà. Le bon réflexe : chercher par courriel (`POST /crm/v3/objects/contacts/search`), puis `PATCH` si trouvé, sinon `POST`, sans fusion automatique [TIERS, forum HubSpot] https://community.hubspot.com/t/409-conflict-on-createorupdate-call/140754 ; https://dev.to/flowpaja/a-hubspot-409-is-a-record-matching-problem-1a86. Pour les sociétés, pas d'unicité native sauf propriété unique ; chercher d'abord par `domain` via `POST /crm/v3/objects/companies/search` (5 par seconde).
- Une note ou une tâche rejouée crée un doublon. Garder l'`id` rendu dans notre ligne d'action.
- La note ne se voit sur la fiche que si elle est **associée** au contact, à la société ou à l'affaire. Sans association, elle existe mais reste invisible [MEM].
- `hs_timestamp` est obligatoire sur notes et tâches ; format ISO 8601 ou millisecondes [MEM].
- **Revue de l'éditeur** : une appli publique OAuth n'a pas besoin d'être sur la place de marché pour fonctionner. L'inscription à la place de marché (obligatoire pour être listée) passe par une revue avec un minimum d'installations actives [MEM, non confirmé ici].
- La conformité : les données sensibles (portées `crm.objects.contacts.sensitive.*`) demandent un accord à part [MEM, à vérifier].

---

## 8. Pipedrive (API version 2)

Base : `https://api.pipedrive.com/api/v2` (OAuth : le domaine de la société est donné au retour d'OAuth, `api_domain`) [MEM].

- État de la v2 : Activités, Affaires, Organisations, Personnes (avec leurs « followers ») et Champs sont en v2 ; **les notes n'ont pas d'équivalent v2 confirmé** : un guide de migration tiers dit de rester sur `POST /api/v1/notes` ; un autre parle d'une route v2. Les deux se contredisent [OFF, par résumé] https://pipedrive.readme.io/docs/pipedrive-api-v2 ; [TIERS] https://www.innovaty.co/guide/pipedrive-api-v2-migration. Les points v1 sont annoncés en fin de vie sans date trouvée.

| Action | Méthode et point d'API | Champs obligatoires | Portée | Annulable |
|---|---|---|---|---|
| Créer une personne | `POST /api/v2/persons` | `name` [MEM] | `contacts:full` [MEM, à vérifier] | Oui : `DELETE /api/v2/persons/{id}` (restauration 30 jours par l'interface [MEM]) |
| Créer une organisation | `POST /api/v2/organizations` | `name` | `contacts:full` | Oui : `DELETE` |
| Créer une affaire | `POST /api/v2/deals` | `title` | `deals:full` | Oui : `DELETE` |
| Modifier une affaire | `PATCH /api/v2/deals/{id}` | champs changés | `deals:full` | Oui, en gardant l'ancienne valeur |
| Créer une activité (tâche, appel) | `POST /api/v2/activities` | `subject` ; `type`, `due_date` | `activities:full` | Oui : `DELETE` |
| Créer une note | `POST /api/v1/notes` (v1) | `content` + un de `deal_id`, `person_id`, `org_id`, `lead_id` | `deals:full` couvre les notes d'affaire [OFF, par résumé] https://github.com/pipedrive/client-nodejs/blob/master/docs/v2.md | Oui : `DELETE /api/v1/notes/{id}` |

- Débit : système de « jetons » par appel : lecture d'un objet 2, liste 20, mise à jour 10, suppression 6, recherche 40 ; limite de rafale par jeton d'API sur 2 secondes [OFF, par résumé] https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting. Budget journalier de société : 30 000 jetons × multiplicateur d'offre × nombre de licences [TIERS, non confirmé] https://aibrevo.com/research/crm-api-rate-limits-compared-2026/. La v2 est annoncée moins chère que la v1 ; le chiffre de 50 % n'est pas officiel.
- Idempotence : rien trouvé.
- Revue : une appli publique doit être validée par Pipedrive pour la place de marché ; une appli privée par client fonctionne sans [MEM, à vérifier].

---

## 9. Attio

Base : `https://api.attio.com/v2`. OAuth ou jeton de compte de travail, `Authorization: Bearer`. Un jeton neuf n'a aucune portée par défaut [TIERS].

| Action | Méthode et point d'API | Champs obligatoires | Portée | Annulable |
|---|---|---|---|---|
| Créer un enregistrement | `POST /v2/objects/{object}/records` | `data.values` | `record_permission:read-write` [OFF, par résumé] https://docs.attio.com/rest-api/endpoint-reference/workspaces/create-a-workspace-record | Oui : `DELETE /v2/objects/{object}/records/{id}` |
| **Créer ou mettre à jour (assert)** | `PUT /v2/objects/{object}/records?matching_attribute={slug}` | `data.values`, dont la valeur de l'attribut de rapprochement | idem | Partiel : la mise à jour demande l'ancienne valeur |
| Modifier | `PATCH /v2/objects/{object}/records/{id}` | `data.values` ; **attention** : sur un attribut à valeurs multiples, `PATCH` ajoute, `PUT` remplace [MEM, à vérifier] | idem | Oui |
| Note | `POST /v2/notes` | `parent_object`, `parent_record_id`, `title`, `format`, `content` [MEM, à vérifier] | portée de notes (nom non trouvé) | Oui : `DELETE /v2/notes/{id}` [MEM] |
| Tâche | `POST /v2/tasks` | `content`, `format`, `deadline_at`, `is_completed`, `linked_records`, `assignees` [MEM, à vérifier] | portée de tâches (nom non trouvé) | Oui : `DELETE /v2/tasks/{id}` [MEM] |

- **L'assert est la seule vraie idempotence du lot** : même valeur d'attribut unique (courriel pour les personnes, domaine pour les sociétés) donne la même fiche, sans doublon. Si la valeur manque dans le corps, Attio crée une nouvelle fiche [TIERS] https://www.craftt.io/blog/building-against-the-attio-api ; https://getmembrane.com/integrations/attio.
- Débit : 100 requêtes par seconde en lecture, 25 par seconde en écriture ; `429` avec `Retry-After` (format contesté : une date pour une source, des secondes pour d'autres) [TIERS, concordants] https://pipeline.zoominfo.com/sales/attio-api ; https://www.coffee.ai/articles/attio-crm-public-api-docs/.
- Revue : pas de revue trouvée pour une appli OAuth ; les applis se déclarent dans le portail développeur [non trouvé].
- Noms exacts des portées de notes et de tâches : **non trouvé**.

---

## 10. Close

Base : `https://api.close.com/api/v1`. Clé d'API en Basic (clé comme nom d'utilisateur) ou OAuth 2 [MEM].

| Action | Méthode et point d'API | Champs obligatoires | Portée | Annulable |
|---|---|---|---|---|
| Note sur un lead | `POST /api/v1/activity/note/` | `lead_id`, `note` | OAuth : `all.full_access` ou `offline_access` [MEM, à vérifier] | Oui : `DELETE /api/v1/activity/note/{id}/` |
| Tâche | `POST /api/v1/task/` | `lead_id`, `text` ; `date` | idem | Oui : `DELETE /api/v1/task/{id}/` |
| Créer un lead | `POST /api/v1/lead/` | `name` | idem | Oui : `DELETE` |
| Modifier un lead | `PUT /api/v1/lead/{id}/` | champs changés | idem | Oui |

- Point confirmé : `POST /api/v1/activity/note/` [TIERS] https://getknit.dev/blog/close-api-directory-bjpPxE/. Les autres chemins viennent de la mémoire.
- Débit : limite par groupe de points d'API, par organisation et par clé ; chaque `429` porte les en-têtes `ratelimit` et `retry-after` [OFF] https://developer.close.com/topics/rate-limits/. Les chiffres d'un tiers varient de 60 par minute à 20 par seconde : **ne pas s'y fier**, lire l'en-tête.
- Idempotence : rien trouvé.
- Portées OAuth : aucune portée fine trouvée ; la forme semble « tout ou rien » [DED, à vérifier].

---

## 11. folk

Base : `https://api.folk.app/v1` [MEM]. Clé d'API en `Bearer`.

- Débit officiel : 600 requêtes par minute et par utilisateur ; rafale de 20 par 2 secondes ; `429` avec `Retry-After` [OFF] https://developer.folk.app/api-reference/rate-limits ; https://developer.folk.app/changelog. Un tiers de 2025 donne 10 par seconde : l'officiel fait foi.
- Points d'API trouvés : créer, modifier, lire une personne ; groupes ; utilisateurs ; suppression en lot (100 personnes) ; affaires (liste) [OFF, par résumé] https://developer.folk.app/api-reference/deals/list-deals. **Notes et rappels : non trouvés.**
- Accès à l'API : conflit entre sources (offre Premium à 48 $ par utilisateur et par mois contre offre Enterprise seulement) [TIERS] https://github.com/api-evangelist/folk ; https://damgun.com/folk-crm-review.html. À vérifier sur la page de tarifs.
- Auth : clé d'API, pas d'OAuth trouvé [TIERS]. Donc pas de « droits OAuth déjà accordés » : il faudra demander une clé à chaque client.
- Annulation : `DELETE` des objets créés [MEM]. Idempotence : rien trouvé.

## 12. Zendesk

Base : `https://{sous-domaine}.zendesk.com/api/v2`. OAuth 2 ou jeton d'API.

| Action | Méthode et point d'API | Champs obligatoires | Annulable |
|---|---|---|---|
| Réponse publique | `PUT /api/v2/tickets/{id}.json` avec `{"ticket":{"comment":{"body":"…","public":true}}}` | `comment.body`, `comment.public: true` | **Non** (le client l'a reçue). Un commentaire public ne se rend plus privé après coup [OFF, par résumé] https://support.zendesk.com/hc/en-us/articles/4408835109018 |
| Note interne | même appel avec `"public": false` (ou sans `public`) | idem | Pas de suppression simple d'un commentaire ; l'API ne l'offre qu'en cas particuliers [MEM, à vérifier] |
| Assigner | même appel, `ticket.assignee_id` (ou `group_id`) | | Oui : remettre l'ancienne valeur |
| Étiquettes | même appel : `ticket.additional_tags` (ajoute) ; `ticket.remove_tags` (retire) ; `ticket.tags` **remplace tout** [MEM, à vérifier] | | Oui |
| Statut | même appel, `ticket.status` (`open`, `pending`, `hold`, `solved`) | | Oui, tant que le ticket n'est pas « closed » (clos : non modifiable) [MEM] |
| Créer un ticket | `POST /api/v2/tickets.json` | `ticket.comment.body` ou `description` ; `subject` | Oui : `DELETE /api/v2/tickets/{id}.json` (corbeille 30 jours [MEM]) |

- **Un seul commentaire par appel** : une réponse publique et une note interne demandent deux appels [OFF, par résumé] https://community.zendesk.com/support-7/adding-comments-via-api-can-you-include-a-public-and-private-comment-15080. Statut, assigné et étiquettes peuvent partir dans le même appel que le commentaire.
- **Idempotence : oui, à la création de ticket.** En-tête `Idempotency-Key: {clé}`. Même clé et même corps dans les 2 heures : la réponse en mémoire revient (en-tête `x-idempotency-lookup: hit`) ; même clé avec un autre corps : `400 IdempotentRequestError`. Tous les points d'API ne le prennent pas en charge ; **pas de preuve pour `PUT` d'un ticket** [OFF, par résumé] https://developer.zendesk.com/api-reference/ticketing/introduction/ ; [TIERS] https://www.eesel.ai/blog/zendesk-api-idempotency-keys. Un rapport d'un tiers signale que des pièces jointes recopiées changent le corps et cassent le rejeu : https://github.com/fiscaltec/zendesk-mcp/issues/91.
- **Rejouer un `PUT` avec `comment` ajoute un second commentaire.** Pour la réponse publique (non annulable), toujours relire les commentaires du ticket avant de rejouer (`GET /api/v2/tickets/{id}/comments.json`) [DED].
- **Débit** (par compte et par minute) : Team 200, Growth et Professional 400, Enterprise 700, avec l'option « High Volume » 2 500 [OFF, par résumé] https://support.zendesk.com/hc/en-us/articles/4408836402074-Managing-API-usage-in-your-Zendesk-account. Tiers : 30 mises à jour par ticket, par utilisateur et par 10 minutes [TIERS] https://www.eesel.ai/blog/zendesk-api-rate-limit-requests-per-minute. `429` avec `Retry-After`.
- Portées OAuth : `read` (GET) et `write` (POST, PUT, DELETE) sur tout ; portées fines par ressource : `tickets:read` (contenu, commentaires, étiquettes) et `tickets:write` (créer, modifier, supprimer, suppression définitive comprise). On peut les combiner. `impersonate` : un administrateur agit au nom d'utilisateurs finaux [OFF, par résumé] https://developer.zendesk.com/api-reference/ticketing/oauth/grant_type_tokens/ ; https://support.zendesk.com/hc/en-us/articles/11093380955674-Announcing-more-granular-OAuth-client-scopes. Les portées permises du client plafonnent celles des jetons. Piège : avec OAuth, l'auteur du commentaire est l'utilisateur qui a donné l'accord.
- Revue : une appli OAuth globale doit être enregistrée dans l'administration ; la place de marché a sa propre revue [MEM, à vérifier].

---

## 13. Intercom

Base : `https://api.intercom.io` (ou `api.eu.intercom.io` pour l'Europe [MEM]). En-tête `Intercom-Version: 2.14` ou plus récent ; les exemples de la doc montrent 2.17 [OFF, par résumé] https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/replyconversation. Sans l'en-tête, la version de l'appli s'applique.

| Action | Méthode et point d'API | Champs obligatoires | Annulable |
|---|---|---|---|
| Réponse au client | `POST /conversations/{id}/reply` | `message_type: "comment"`, `type: "admin"`, `admin_id`, `body` | **Non** |
| Note interne | même point, `message_type: "note"`, `type: "admin"`, `admin_id`, `body` | | Pas de suppression de note par l'API trouvée |
| Assigner, fermer, mettre en attente | `POST /conversations/{id}/parts` avec `message_type: "assignment"`, `"close"`, `"snoozed"`, `"open"` ; `admin_id`, `assignee_id`, `body` selon le cas | `admin_id` | Oui : ouvrir à nouveau, ré-assigner |
| Étiquette | `POST /conversations/{id}/tags` `{ "id": tag_id, "admin_id" }` ; retrait : `DELETE /conversations/{id}/tags/{tag_id}` | | Oui |

Source : [OFF, par résumé] https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/manageconversation ; https://www.intercom.com/help/en/articles/9071694-intercom-developer-faqs. Les chemins `/parts` et `/tags` : [MEM, à vérifier].

- **`admin_id` est obligatoire** pour tout ce qui écrit : le message part au nom d'un administrateur existant. Avec OAuth, prendre l'identifiant de l'utilisateur qui a donné l'accord (`GET /me`) [MEM].
- Débit : appli publique 10 000 appels par minute et par appli, 25 000 par minute par espace de travail ; appli privée : 10 000 par minute par espace, partagés ; `429` ; en-têtes `X-RateLimit-*` [OFF] https://www.intercom.com/help/en/articles/9071694-intercom-developer-faqs. Les guides tiers qui disent 1 000 par minute sont périmés.
- Idempotence : rien trouvé pour les réponses [DED]. Portées OAuth : cases à cocher du type « lire et écrire les conversations » ; noms exacts **non trouvés**.
- Revue : une appli publique qui va à la place de marché Intercom est revue par Intercom ; une appli privée de client : non [MEM, à vérifier].

---

## 14. Front

Base : `https://api2.frontapp.com`. Jeton d'API ou OAuth ; Front propose aussi un serveur MCP en bêta ouverte (OAuth 2.1 avec PKCE, par collègue) [TIERS] https://www.getmacha.com/blog/how-to-use-the-front-api.

| Action | Méthode et point d'API | Portée | Annulable |
|---|---|---|---|
| Brouillon de réponse | `POST /conversations/{conversation_id}/drafts` : répond au dernier message, **pas envoyé** ; `author_id` optionnel (sans lui, le brouillon est au nom du jeton) ; `mode` : `private` ou `shared` | `drafts:write` [OFF, par résumé] https://dev.frontapp.com/reference/create-draft-reply | Oui : suppression du brouillon `DELETE /drafts/{id}` [MEM] |
| Note interne | `POST /conversations/{id}/comments` | portée de commentaires (nom non trouvé) | Pas de suppression trouvée |
| Assigner | `PUT /conversations/{id}/assignee` `{ "assignee_id": … ou null }` [MEM] | | Oui |
| Étiqueter | `POST /conversations/{id}/tags` [MEM, à vérifier] | | Oui |
| Envoyer un message | `POST /channels/{id}/messages` ou `POST /conversations/{id}/messages` | | **Non** |

- **Front est le seul outil du lot, avec Help Scout, Missive et Gmail, qui sait faire un vrai brouillon de réponse dans la boîte partagée** : le collègue le voit dans Front et l'envoie. C'est le meilleur « propose » pour le support par courriel [DED].
- Débit : par entreprise (pas par jeton). 50 requêtes par minute (Starter), 100 (Professional), 200 (Enterprise) ; option de 100 de plus par module acheté ; `429` avec `Retry-After`, même si `X-RateLimit-Remaining` est positif (gardes par route) [OFF, par résumé] https://help.front.com/en/articles/2438 ; https://dev.frontapp.com/docs/rate-limiting. L'en-tête `x-ratelimit-burst-limit` est déprécié. Un ancien guide parle d'offres Starter, Growth, Scale : périmé. **50 par minute est très bas** pour un agent qui lit et écrit : prévoir une file avec plafond par client. Idempotence : non trouvée. Noms des portées OAuth : non trouvés.
- Les brouillons de commentaire ou de discussion interne ne se créent pas par l'API (fil de 2022) [TIERS, ancien] https://community.front.com/developer-q-a-37/create-a-new-internal-discussion-draft-287.

---

## 15. Freshdesk

Base : `https://{domaine}.freshdesk.com/api/v2`. Clé d'API (Basic) ; OAuth ouvert aux applis Freshworks.

| Action | Méthode et point d'API | Champs obligatoires | Annulable |
|---|---|---|---|
| Note (privée par défaut) | `POST /api/v2/tickets/{id}/notes` | `body` ; `private` (`false` pour publique) | Oui : `DELETE /api/v2/conversations/{id}` [MEM] |
| Réponse au client | `POST /api/v2/tickets/{id}/reply` | `body` | **Non** |
| Modifier (statut, priorité, agent, étiquettes) | `PUT /api/v2/tickets/{id}` | champs changés ; `status` : 2 ouvert, 3 en attente, 4 résolu, 5 clos [MEM] ; `responder_id` ; `tags` (**remplace tout**) [MEM] | Oui |

- Portées OAuth pour les notes : `freshdesk.conversations.create` et `freshdesk.tickets.view` [OFF, par résumé] https://developers.freshdesk.com/api/.
- Débit par compte et par minute, toutes clés comprises. Chiffres contradictoires : Growth 100 ou 200, Pro 400, Enterprise 700 ; essai 50 [TIERS] https://www.getmacha.com/blog/freshdesk-api-explained ; https://partnersupport.freshworks.com/support/solutions/articles/225439-what-are-the-rate-limits-for-the-api-calls-to-freshdesk-. L'en-tête `X-RateLimit-Remaining` n'arrive qu'une fois la limite atteinte [TIERS].
- Idempotence : rien trouvé. Pas de brouillon de réponse : seul « note privée » joue le rôle de « propose » [DED].

---

## 16. Help Scout

Base : `https://api.helpscout.net/v2`. OAuth 2 ; jeton valable 2 jours selon un tiers [TIERS, à vérifier] https://www.getmacha.com/blog/how-to-use-the-help-scout-api.

| Action | Méthode et point d'API | Champs obligatoires | Annulable |
|---|---|---|---|
| **Brouillon de réponse** | `POST /v2/conversations/{id}/reply` avec `draft: true` | `customer`, `text` ; `draft: true` | Oui : le brouillon se supprime ou se remplace [MEM] |
| Réponse envoyée | même point, sans `draft` | idem | **Non** |
| Note interne | `POST /v2/conversations/{id}/notes` | `text` ; pas de brouillon possible pour une note | Pas de suppression trouvée |
| Statut | `status` accepté sur réponse et note (depuis 2019) ; ou `PATCH /v2/conversations/{id}` [MEM] | | Oui |
| Étiquettes | `PUT /v2/conversations/{id}/tags` (**remplace tout**) [MEM, à vérifier] | | Oui |

Source : [OFF, par résumé] https://developer.helpscout.com/mailbox-api/endpoints/conversations/threads/reply/ ; https://developer.helpscout.com/mailbox-api/changelog/. Piège : un fil de conversation tient 100 messages au plus ; au-delà, `412`.

- Débit : **non trouvé** (400 par minute [MEM], non confirmé). Idempotence : rien trouvé.

---

## 17. Crisp

Base : `https://api.crisp.chat/v1`. Authentification en Basic (identifiant et clé) avec l'en-tête `X-Crisp-Tier: plugin` pour une extension [OFF, par résumé] https://docs.crisp.chat/guides/rest-api/quickstart/. Pas d'OAuth au sens habituel : un jeton de « plugin » par installation [DED].

| Action | Méthode et point d'API | Portée | Annulable |
|---|---|---|---|
| Message ou note | `POST /v1/website/{website_id}/conversation/{session_id}/message` ; `type: "note"` pour la note interne [MEM, à vérifier] ; corps `type`, `from`, `origin`, `content` | `website:conversation:messages` [OFF] https://docs.crisp.chat/references/rest-api/v1/ | Non trouvé |

- Débit, idempotence, étiquettes, statut : **non trouvés**. La référence est la seule bonne source ; le portage Python date de la révision de janvier 2023.

---

## 18. Missive

Base : `https://public.missiveapp.com/v1` [MEM]. Jeton d'API personnel.

| Action | Méthode et point d'API | Remarque | Annulable |
|---|---|---|---|
| Brouillon (nouveau ou réponse) | `POST /v1/drafts` | e-mail, SMS, WhatsApp, chat ; envoyable tout de suite ou à éditer dans l'appli ; 25 pièces jointes, corps de 10 Mo au plus [OFF, par résumé] https://missiveapp.com/docs/developers/rest-api/endpoints | Oui : suppression du brouillon [MEM] |
| Message ou « post » interne | `POST /v1/posts` [MEM, à vérifier] | note visible de l'équipe | Non trouvé |

- Débit : 5 requêtes simultanées, 300 par minute, 900 par 15 minutes en fenêtre glissante [TIERS, citant missiveapp.com]. Idempotence, portées : non trouvées ; pas d'OAuth trouvé.

---

## 19. Plain

API GraphQL : `https://core-api.uk.plain.com/graphql/v1` [MEM, à vérifier]. Clé d'API d'un « utilisateur machine », avec des permissions fines [OFF, par résumé] https://www.plain.com/docs/agents/support-agent.

| Action | Mutation | Permission | Annulable |
|---|---|---|---|
| Créer un fil | `createThread` (statut `TODO`) ; `externalId` possible | `thread:create`, `thread:read` | Non trouvé |
| Répondre | `replyToThread` ; e-mail, chat, Slack, Teams | `thread:reply` | **Non** |
| Note interne | `createNote` | `note:create` (+ `thread:read`, `customer:read`) | Non trouvé |
| Assigner | `assignThread` / `unassignThread` [MEM] | `thread:assign`, `thread:unassign` | Oui |

- **Les permissions sont fines et la séparation « note » et « réponse » est tenue par la clé** : on peut créer un utilisateur machine sans `thread:reply`. Un « propose » garanti par l'éditeur, comme Microsoft [DED].
- Une réponse peut partir au nom d'un humain si celui-ci est sur la liste d'usurpation de la clé [OFF, par résumé] même page. Le défaut : au nom de l'utilisateur machine.
- Débit : non trouvé. Idempotence : `externalId` sur `createThread` sert de clé de rapprochement [OFF] https://www.plain.com/docs/graphql-reference/mutations/createThread.

---

## 20. Passerelles : Nango, Pipedream, Composio

- **Nango** : gère l'OAuth, le renouvellement des jetons et le proxy ; **les actions d'écriture sont à coder soi-même** en fonctions TypeScript [TIERS] https://nango.dev/blog/best-tools-to-trigger-ai-agents-from-email/ ; https://composio.dev/content/nango-alternatives-ai-agents (source partisane : Composio).
- **Composio** : catalogue d'outils prêts (environ 1 000 à 1 600 selon la source) dont HubSpot. En mai 2026, HubSpot a annoncé un accès non autorisé aux systèmes de Composio, avec des identifiants OAuth et des clés exposés ; HubSpot dit avoir fait tourner les siens [TIERS, résumé] même page. Un fait à peser pour confier des jetons clients à un tiers.
- **Pipedream** : plus de 10 000 actions ; un article de 2026 annonce son rachat par Workday [TIERS] https://peliqan.io/blog/pipedream-alternatives/. Nous l'utilisons déjà pour Gmail et Slack [code]. À suivre : la direction du produit après le rachat.
- Aucune de ces sources ne liste les actions d'écriture par outil : **non trouvé**. Pour un agent, les actions ci-dessus (une dizaine de points d'API par outil) sont assez peu nombreuses pour être écrites à la main sur un client HTTP à nous.

---

## Tableau final

Effort : S = une demi-journée ou moins ; M = un à deux jours ; L = plus (revue de l'éditeur ou outillage lourd). Annulable : O = oui par l'API ; N = non ; P = partiel.

| Outil | Action | Méthode et point d'API | Portée | Annulable | Effort |
|---|---|---|---|---|---|
| Gmail | Brouillon en réponse | `POST /gmail/v1/users/me/drafts` (`raw`, `threadId`) | `gmail.compose` | O (`DELETE /drafts/{id}`) | M |
| Gmail | Envoyer un brouillon | `POST /drafts/send` | `gmail.compose` | N | S |
| Gmail | Libellé, archiver | `POST /threads/{id}/modify` | `gmail.modify` | O | S |
| Google Agenda | Créer (id fourni) | `POST /calendar/v3/calendars/primary/events?sendUpdates=none` | `calendar.events` | O (mais invitations parties : N) | M |
| Google Agenda | Disponibilités | `POST /calendar/v3/freeBusy` | `calendar.freebusy` | sans objet | M (calcul des créneaux à écrire) |
| Outlook | Brouillon de réponse | `POST /me/messages/{id}/createReply` puis `PATCH` | `Mail.ReadWrite` | O | S |
| Outlook | Envoyer | `POST /me/messages/{id}/send` | `Mail.Send` | N | S (+ nouvel accord admin) |
| Outlook | Catégories | `PATCH /me/messages/{id}` | `Mail.ReadWrite` | O | S |
| Outlook | Événement | `POST /me/events` (`transactionId`) | `Calendars.ReadWrite` | O / P | M |
| Outlook | Créneaux | `POST /me/findMeetingTimes` | `Calendars.Read.Shared` | sans objet | M (nouvel accord) |
| Slack | Message, boutons | `chat.postMessage` + `blocks` | `chat:write` (bot) | O (`chat.delete`) | M (appli propre) |
| Slack | Clic | POST vers l'URL d'interactivité | aucune | sans objet | M |
| Teams | Message au nom de l'utilisateur | `POST /chats/{id}/messages` | `ChatMessage.Send` | P (suppression douce) | M |
| Teams | Carte avec boutons | bot Teams, `Action.Execute` | appli Teams | O (remplacer la carte) | L |
| HubSpot | Contact | `POST /crm/v3/objects/contacts` | `crm.objects.contacts.write` | O | S |
| HubSpot | Affaire | `POST /crm/v3/objects/deals` | `crm.objects.deals.write` | O | S |
| HubSpot | Note, tâche | `POST /crm/v3/objects/notes` et `/tasks` | à vérifier | O | S |
| HubSpot | Association | `PUT /crm/v4/objects/{a}/{id}/associations/{b}/{id}` | écriture des deux | O | S |
| Pipedrive | Affaire, personne | `POST /api/v2/deals`, `/persons` | `deals:full`, `contacts:full` | O | S |
| Pipedrive | Note | `POST /api/v1/notes` | `deals:full` | O | S |
| Attio | Assert (upsert) | `PUT /v2/objects/{o}/records?matching_attribute=` | `record_permission:read-write` | P | S |
| Attio | Note, tâche | `POST /v2/notes`, `/v2/tasks` | non trouvé | O | S |
| Close | Note, tâche | `POST /api/v1/activity/note/`, `/task/` | non trouvé | O | S |
| folk | Personne | `POST /v1/people` [MEM] | clé d'API | O | S (notes non trouvées) |
| Zendesk | Note interne | `PUT /api/v2/tickets/{id}.json` `comment.public=false` | `tickets:write` | P | S |
| Zendesk | Réponse publique | idem, `public=true` | `tickets:write` | N | S |
| Zendesk | Assigné, étiquettes, statut | idem | `tickets:write` | O | S |
| Intercom | Note, réponse | `POST /conversations/{id}/reply` | non trouvé | P / N | S |
| Front | Brouillon de réponse | `POST /conversations/{id}/drafts` | `drafts:write` | O | S |
| Front | Note interne | `POST /conversations/{id}/comments` | non trouvé | P | S |
| Freshdesk | Note privée | `POST /api/v2/tickets/{id}/notes` | `freshdesk.conversations.create` | O | S |
| Help Scout | Brouillon de réponse | `POST /v2/conversations/{id}/reply` `draft:true` | OAuth | O | S |
| Help Scout | Note | `POST /v2/conversations/{id}/notes` | OAuth | P | S |
| Crisp | Message ou note | `POST /v1/website/{w}/conversation/{s}/message` | `website:conversation:messages` | non trouvé | S |
| Missive | Brouillon | `POST /v1/drafts` | jeton | O | S |
| Plain | Note, réponse | `createNote`, `replyToThread` (GraphQL) | `note:create`, `thread:reply` | P / N | S |

---

## Ce que je recommande

1. **Séparer les actions en trois classes dans le code** : lecture, écriture annulable, envoi externe non annulable. Le curseur d'autonomie s'applique par classe : l'envoi externe reste « propose » par défaut. Raison : aucune API ne rappelle un envoi.
2. **Pour le mail, écrire des brouillons dans la boîte de l'utilisateur** (Gmail `drafts.create`, Outlook `createReply`). Le brouillon se voit dans l'outil de l'utilisateur, s'annule par `DELETE`. Raison : zéro interface à construire pour valider.
3. **Outlook : ne pas demander `Mail.Send` au départ.** Garder `Mail.ReadWrite` : Microsoft garantit alors qu'aucun envoi n'est possible. Gmail n'offre pas cette garantie : `gmail.compose` envoie aussi ; l'interdit doit venir de notre code.
4. **Gmail : prévoir CASA dès que nous aurons notre appli Google** (portée restreinte, évaluation annuelle, 4 à 12 semaines). Tant que Pipedream porte l'appli, ne rien changer.
5. **Une table « actions » en base avec une clé unique, écrite avant l'appel**, avec l'ancienne valeur et l'identifiant créé. C'est la seule idempotence générale, car presque aucune API n'en a. Exceptions à exploiter : Google Agenda (`id` fourni), Outlook (`transactionId`), Zendesk (`Idempotency-Key` à la création), Attio (assert), Plain (`externalId`), HubSpot (rapprochement par courriel).
6. **Slack : créer notre appli avec un jeton de bot** (`chat:write`, `im:write`, `users:read.email`) et valider en message direct. Pas besoin du Marketplace pour écrire. Vérifier `payload.user.id` à chaque clic.
7. **Teams : repousser le bot.** Pour une première version, un lien « Ouvrir dans Leon » dans un message Graph suffit ; les boutons exigent un bot, une ressource Azure et l'installation par chaque administrateur. Raison : effort L pour un gain faible.
8. **CRM : commencer par HubSpot, Pipedrive et Attio** (OAuth, API claires, débit confortable). Close et folk ensuite ; folk n'a ni OAuth ni notes trouvées.
9. **Support : Zendesk d'abord** (le plus répandu, idempotence à la création, portées fines). Pour le « propose » du support : Front et Help Scout ont de vrais brouillons ; Zendesk, Intercom, Freshdesk n'ont que la note interne ; Plain donne la garantie par la clé.
10. **Plafonner le débit par client dans pg-boss** : Front 50 à 200 par minute, Zendesk 200 à 700, Freshdesk 100 à 700, HubSpot 110 par 10 secondes. Respecter `Retry-After` partout.
11. **Écrire à la main les 30 actions du tableau** sur le client HTTP existant. Elles sont courtes. Les passerelles prêtes à l'emploi n'apportent que le OAuth, que Pipedream et Nango fournissent déjà ; l'incident Composio de mai 2026 plaide pour ne pas leur confier plus de jetons.

---

## Ce que je n'ai pas trouvé

- Aucune page d'éditeur ouverte directement : tout vient de résumés de recherche. Les chiffres de débit tiers sont signalés comme tels et se contredisent parfois (Close, Freshdesk, Pipedrive, Missive).
- **Portées exactes** : HubSpot pour notes et tâches ; Attio pour notes et tâches ; Close ; Intercom ; Front (hors `drafts:write`) ; Pipedrive (noms `contacts:full`, `activities:full` de mémoire) ; Help Scout ; Missive ; folk.
- **Débit** : Help Scout, Crisp, Plain, Intercom (par point d'API), Pipedrive (budget officiel).
- **Idempotence** : confirmée pour Google Agenda, Outlook (événements), Zendesk (création), Attio (assert), Plain (`externalId`) ; rien trouvé ailleurs, et rien pour `PUT` Zendesk.
- **Annulation** de notes et commentaires (Zendesk, Intercom, Front, Close hors `DELETE`) : à tester sur un compte d'essai.
- **Revue par l'éditeur** : chiffres seulement pour Google (CASA), Slack (Marketplace) et Microsoft (éditeur vérifié). HubSpot, Pipedrive, Zendesk, Intercom, Front, Attio : non trouvé ou de mémoire.
- Prix et offres donnant accès à l'API de folk, Front, Zendesk : contradictoires ou non vérifiés.
- Restauration d'un événement Google Agenda supprimé par l'API ; chemin exact de l'envoi proactif d'un bot Teams ; manifeste Slack contre la référence à jour.
- Versions de paquets : non vérifiées dans cette passe (pas de paquet cité). Aucune commande npm lancée.
