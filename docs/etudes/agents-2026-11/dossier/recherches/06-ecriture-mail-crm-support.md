# Recherche 06 : écrire dans le mail, l'agenda, la messagerie, le CRM et le support depuis un agent

19 novembre 2026 · note de recherche pour le dossier de conception · **en cours d'écriture, sections ajoutées au fil de l'eau**

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

(suite en cours : CRM, support, tableau final, recommandations)
