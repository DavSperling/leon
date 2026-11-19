# 07 - Écrire dans les outils de tâches, de code, de documents et de retours produit

État des lieux au 19 novembre 2026.

Sujet : ce qu'un agent peut écrire dans chaque outil avec la connexion OAuth d'un utilisateur. Pour chaque outil : actions, point d'API, champs, portée, idempotence, annulation, débit, pièges, interdits, revue par l'éditeur.

## Comment lire cette note

- **[O]** officiel : documentation, journal des changements ou schéma public de l'éditeur.
- **[T]** tiers : blog, comparatif, forum, bibliothèque cliente.
- **[D]** déduit : raisonnement à partir des sources.
- **[V]** à vérifier : vient de la mémoire du rédacteur, pas d'une source trouvée pendant cette recherche. À confirmer sur la page officielle avant de coder.
- « non trouvé » : la recherche n'a rien donné. Le trou n'est pas comblé.
- Les numéros entre parenthèses (L1, J3...) renvoient à la liste « Sources » en bas de chaque fiche.

Limites de cette recherche :

- Les pages officielles n'ont pas pu être ouvertes (réseau restreint). Les faits [O] viennent des résumés de recherche qui citent ces pages. Relire la page avant de coder un point sensible.
- 54 requêtes de recherche ont abouti. Le quota de recherche partagé s'est épuisé avant les deux dernières (débit Notion, publication d'une intégration Sentry).
- Les versions des SDK viennent du registre npm, relevé le 19 novembre 2026.

## L'essentiel

1. **Presque aucune API n'accepte de clé d'idempotence.** Aucun en-tête du type `Idempotency-Key` n'a été trouvé pour ces outils. Il faut un journal d'actions côté produit. Quatre outils offrent une clé naturelle : Linear (`attachmentCreate`, même URL et même ticket) [O], Airtable (`performUpsert`) [O], Jira (lien distant avec `globalId`) [V], Asana (champ `external`) [V].
2. **L'annulation dépend de l'outil.** Corbeille de 30 jours chez Linear [O] et Asana [O]. Corbeille chez Confluence [O] et Notion (`in_trash`) [O]. Suppression définitive chez Jira [V] et GitLab [V]. Un commentaire supprimé a quand même envoyé ses notifications [D].
3. **Les portées d'écriture sont souvent larges.** GitLab : seule la portée `api` écrit [T]. ClickUp et Basecamp : pas de portées du tout [T]. Notion : des « capacités » réglées sur l'intégration, plus un choix de pages par l'utilisateur [O].
4. **Trois nouveautés de 2026 changent la donne.** Atlassian applique des quotas en points depuis le 2 mars 2026 [O]. Trello propose OAuth 2.0 depuis le 15 septembre 2026 [O]. Notion a publié la version `2026-03-11` (`archived` remplacé par `in_trash`) [O]. monday a coupé les anciens jetons OAuth le 1er octobre 2026 [O].
5. **Google : rester sur `drive.file`.** Cette portée est non sensible et suffit pour créer un document et y écrire [O]. Elle ne permet pas de modifier un document existant que l'utilisateur n'a pas ouvert avec l'application [O]. `drive` est une portée restreinte, avec évaluation de sécurité annuelle [O].
6. **Linear est le seul outil avec un vrai statut d'agent.** `actor=app`, portées `app:assignable` et `app:mentionable`, sessions d'agent [O].
7. **Outils de réunion : presque rien à écrire.** Fathom est en lecture seule [T]. Les écritures de Fireflies, tl;dv, Gong et Leexi servent à importer des enregistrements, pas à agir [T][O].

## Règles communes pour le moteur d'actions

Ces règles sont déduites des fiches. Elles valent pour tous les outils.

### Le contrat d'une action [D]

```ts
// Contrat commun d'une action d'écriture. À adapter au moteur.
export interface WriteAction<I, O> {
  name: string;                       // ex. 'jira.issue.create'
  scopes: string[];                   // portées à contrôler avant l'appel
  reversibility: 'restorable' | 'compensable' | 'irreversible';
  // restorable   : corbeille ou archive, l'éditeur sait restaurer
  // compensable  : on réécrit l'état d'avant (il faut l'avoir lu)
  // irreversible : notification partie, suppression définitive
  findExisting?: (ctx: Ctx, input: I, runKey: string) => Promise<O | null>;
  execute: (ctx: Ctx, input: I, runKey: string) => Promise<O>;
  undo?: (ctx: Ctx, output: O, before: unknown) => Promise<void>;
}
```

### Le journal d'actions, à la place de la clé d'idempotence [D]

```sql
create table action_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid not null,        -- utilisateur dont le jeton OAuth sert
  action      text not null,        -- 'jira.issue.create'
  run_key     text not null,        -- hash(agent, événement déclencheur, action, cible)
  status      text not null,        -- 'pending' | 'done' | 'failed' | 'undone'
  request     jsonb not null,
  before      jsonb,                -- état lu avant modification, pour compenser
  result      jsonb,                -- identifiants créés, URL
  created_at  timestamptz not null default now(),
  unique (org_id, action, run_key)
);
```

Déroulé d'une écriture :

1. Insérer la ligne en `pending`. Si la contrainte d'unicité échoue, l'action a déjà été lancée : relire la ligne.
2. Si la ligne est `pending` depuis une tentative précédente, appeler `findExisting` avant de réécrire. On cherche l'objet par sa clé naturelle ou par un marqueur posé dans l'objet.
3. Écrire, puis passer la ligne en `done` avec les identifiants.

Marqueur à poser quand l'outil n'a pas de clé naturelle : un lien vers la source avec `?run=<run_key>`, ou une ligne discrète en bas de la description. `findExisting` recherche ce marqueur.

### Débit [D]

- Une file par couple (outil, jeton). Le quota est presque toujours par jeton d'utilisateur.
- Lire `Retry-After` sur un 429. Ne jamais rejouer une écriture sur une erreur réseau sans passer par `findExisting`.
- Les plafonds les plus bas : Plane 60 par minute [O], ClickUp 100 par minute [O], Airtable 5 par seconde et par base [O], Trello 100 par 10 secondes et par jeton [O], Asana 15 écritures en parallèle [T].

### Qui signe l'écriture [D]

- Avec le jeton OAuth d'un utilisateur, l'écriture apparaît au nom de cet utilisateur. C'est vrai partout, sauf mention contraire.
- Linear permet une identité propre à l'application (`actor=app`) [O].
- Ailleurs, ajouter une mention en fin de texte (« écrit par l'agent X pour Prénom »). Sinon les collègues croient que la personne a écrit elle-même.

### Échelle d'effort [D]

L'OAuth et la lecture existent déjà pour ces outils. L'effort compte l'action, son annulation et ses tests.

- **S** : une demi-journée.
- **M** : une journée.
- **L** : deux à trois jours.

## Fiches par outil

### Linear

- API : GraphQL. `POST https://api.linear.app/graphql`, en-tête `Authorization: Bearer <jeton>` [O](L9).
- OAuth : portées séparées par des virgules [T](L10). `actor=user` par défaut, `actor=app` pour agir comme application [O](L2).
- Portées utiles : `read`, `write`, `issues:create`, `comments:create` [T](L11), confirmées en partie par la page officielle [O](L3). Avec `actor=app` : `app:assignable`, `app:mentionable` [O](L2).
- SDK : `@linear/sdk` 103.0.0, publié le 18 novembre 2026 [O](npm).

| Action | Mutation | Champs obligatoires | Portée | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer un ticket | `issueCreate(input: IssueCreateInput!)` | `teamId` [T](L7). `title` est facultatif dans le schéma mais exigé en pratique [T](L7) | `issues:create` ou `write` [T](L11) | Pas de clé. `id` (UUID fourni par le client) dans l'entrée [V] | `issueDelete(id)` : corbeille 30 jours [O](L6). Restauration par `issueUnarchive(id)` [T](L7) |
| Modifier un ticket | `issueUpdate(id, input: IssueUpdateInput!)` | `id` | `write` [V] | Naturelle : réécrire le même état ne change rien [D] | Compensation : relire avant, réécrire l'ancien état [D] |
| Commenter | `commentCreate(input: CommentCreateInput!)` | `issueId` et `body` en pratique [T](L7) | `comments:create` ou `write` [T](L11) | Pas de clé. `id` client [V] | `commentDelete(id)` [V]. Les notifications sont déjà parties [D] |
| Étiqueter | `issueUpdate` avec `labelIds` (remplace tout le jeu) [V]. `issueAddLabel(id, labelId)` et `issueRemoveLabel` [V] | `id`, `labelId` | `write` [V] | Naturelle [D] | Retirer l'étiquette [D] |
| Créer une étiquette | `issueLabelCreate(input: {name, teamId})` [V] | `name` | `write` [V] | Chercher par nom avant [D] | Non trouvé |
| Lier une source | `attachmentCreate(input: {issueId, url, title})` | `issueId`, `url`, `title` [V] | `write` [V] | **Oui** : même `url` et même `issueId` = mise à jour, pas de doublon [O](L6) | `attachmentDelete(id)` [V] |
| Déléguer à l'agent | `issueUpdate` avec `delegateId` [T](L7) | `id`, `delegateId` | `app:assignable` côté application [O](L2) | Naturelle | Remettre `delegateId` à nul [D] |

Extrait [V], à tester :

```graphql
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url }
  }
}
# variables
# { "input": { "teamId": "...", "title": "...", "description": "markdown",
#              "labelIds": ["..."], "stateId": "...", "assigneeId": "..." } }
```

```graphql
mutation LinkSource($input: AttachmentCreateInput!) {
  attachmentCreate(input: $input) { success attachment { id } }
}
# { "input": { "issueId": "...", "url": "https://app.exemple/sources/123",
#              "title": "Mail du client", "subtitle": "12 nov. 2026" } }
```

**Agents Linear et attribution à une application**

- `actor=app` dans l'URL d'autorisation installe l'application comme membre de l'espace, au lieu d'agir comme l'utilisateur qui autorise [O](L2).
- L'installation se fait à l'échelle de l'espace. Elle demande un administrateur [O](L2).
- `app:assignable` : l'application peut être « delegate » d'un ticket. L'humain reste « assignee » [O](L2).
- `app:mentionable` : l'application peut être mentionnée dans les tickets, les documents et les autres éditeurs [O](L2).
- Les équipes visibles par l'agent sont choisies par la personne qui installe [O](L12).
- `createAsUser` et `displayIconUrl` sur `issueCreate` et `commentCreate` : affichage « Nom (via Application) » [O](L4). Ces champs existent aussi sur `attachmentCreate` [O](L6). Ils ne servent qu'en mode `actor=app` [T](L7).
- Sessions d'agent : une délégation ou une mention déclenche un webhook `AgentSessionEvent` (action `created`) avec un objet `agentSession` [O](L5). Le champ s'appelle `agentSession`, pas `data` [T](L8).
- Délais : répondre au webhook en 5 secondes [O](L5). Envoyer une première activité en 10 secondes, sinon la session est marquée sans réponse [T](L8).
- Activités : mutation `agentActivityCreate`, types `thought`, `action`, `elicitation`, `response`, `error` [T](L8).
- Dès qu'une application s'abonne à `AgentSessionEvent`, Linear montre l'interface de session d'agent aux clients [T](L8).

**Débit** [O](L1) : application OAuth = 5 000 requêtes par heure et 2 000 000 points de complexité par heure, par utilisateur ou par « app user ». Clé d'API : 3 000 000 points par heure. Une requête : 10 000 points au plus [T](L13). Les limites dépendent du plan de l'espace. En-têtes `X-RateLimit-Requests-Limit`, `X-RateLimit-Complexity-Remaining`. Des sources anciennes donnent d'autres chiffres (500 requêtes par heure, 1 500 points) : périmées [T].

**Pièges**

- `labelIds` dans `issueUpdate` remplace tout le jeu d'étiquettes [V]. Préférer l'ajout unitaire.
- Les statuts et les étiquettes appartiennent à une équipe. Un `stateId` d'une autre équipe est refusé [V].
- `issueDelete` : le schéma dit « corbeille » [O](L6). Deux connecteurs tiers disent « suppression définitive » [T](L14). Le schéma fait foi. `permanentlyDelete` saute les 30 jours et reste réservé aux administrateurs [O](L6).

**Interdits et revue**

- `admin` ne peut pas être demandé avec `actor=app` [O](L2).
- L'application ne peut pas être « assignee », seulement « delegate » [O](L2).
- Revue de l'application par Linear pour un usage par d'autres espaces : non trouvé.

Sources Linear :
- L1 https://linear.app/developers/rate-limiting
- L2 https://linear.app/developers/agents
- L3 https://linear.app/developers/oauth-2-0-authentication
- L4 https://linear.app/developers/oauth-actor-authorization
- L5 https://linear.app/developers/agent-interaction
- L6 https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/objects/Mutation
- L7 https://github.com/iatsiuk/linear-cli/blob/master/docs/linear-api.md
- L8 https://hookdeck.com/webhooks/platforms/how-to-build-linear-agents-with-hookdeck-cli
- L9 https://linear.app/developers/graphql
- L10 https://github.com/nshkrdotcom/linear_sdk/blob/main/guides/oauth-and-token-management.md
- L11 https://better-auth.com/docs/authentication/linear et https://developers.frontegg.com/agen-for-work/connectors/marketplace/linear
- L12 https://linear.app/now/our-approach-to-building-the-agent-interaction-sdk
- L13 https://www.lilachbullock.com/linear-api-rate-limit/
- L14 https://www.scalekit.com/connectors/linear

### Jira Cloud

- API : REST v3. Base avec OAuth : `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...` [O](J5).
- OAuth 2.0 (3LO). Le `cloudId` se lit avec `GET https://api.atlassian.com/oauth/token/accessible-resources` [O](J5). Il n'est pas dans le jeton : le mettre en cache [T](J13).
- Jeton d'accès : 3 600 secondes [T](J14). Jeton de rafraîchissement avec la portée `offline_access` [T](J15). Il tourne : chaque rafraîchissement invalide l'ancien, il faut stocker le nouveau [O](J5). Sinon `invalid_grant` [T](J15). Fenêtre d'inactivité de 90 jours [T](J14).
- Portées classiques : `read:jira-work`, `write:jira-work`. `write:jira-work` est la portée recommandée pour `POST /issueLink` [O](J3). Pour créer, commenter et faire une transition : `write:jira-work` aussi [V].
- Portées fines affichées par la référence : voir le tableau [O](J1).
- Corps de texte au format ADF (Atlassian Document Format) en v3 [O](J2).
- SDK : `jira.js` 6.4.0 du 27 octobre 2026, bibliothèque communautaire [O](npm).

| Action | Méthode et point d'API | Champs obligatoires | Portée | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer un ticket | `POST /rest/api/3/issue` | `fields.project`, `fields.issuetype`, `fields.summary` [V]. D'autres champs selon le projet | Fines : `write:issue:jira`, `write:comment:jira`, `write:comment.property:jira`, `write:attachment:jira`, `read:issue:jira` [O](J1). Classique : `write:jira-work` [V] | Non trouvée | `DELETE /rest/api/3/issue/{issueIdOrKey}`, portée fine `delete:issue:jira`, option `deleteSubtasks` [O](J1). Définitif, pas de corbeille [V] |
| Commenter | `POST /rest/api/3/issue/{issueIdOrKey}/comment` [O](J2) | `body` (ADF) | `write:comment:jira` [O](J1), classique `write:jira-work` [V] | Non trouvée | `DELETE .../comment/{id}` [V]. Notifications déjà parties [D] |
| Changer de statut | `GET` puis `POST /rest/api/3/issue/{issueIdOrKey}/transitions` | `transition.id` [T](J16) | Écriture : `write:issue:jira`, `write:issue.property:jira`. Lecture : `read:issue.transition:jira`, `read:status:jira`, `read:field-configuration:jira` [O](J1) | Naturelle si on relit le statut avant [D] | Seulement si le flux de travail a la transition inverse [D] |
| Lier deux tickets | `POST /rest/api/3/issueLink` [O](J3) | `type`, `inwardIssue`, `outwardIssue` [V] | `write:jira-work` [O](J3) | Non trouvée | `DELETE /rest/api/3/issueLink/{linkId}` [O](J3) |
| Lier une source externe | `POST /rest/api/3/issue/{issueIdOrKey}/remotelink` [O](J9) | `object.url`, `object.title` [V] | `write:jira-work` [V] | `globalId` : même identifiant = mise à jour [V] | `DELETE .../remotelink/{linkId}` [V] |

Extrait [V], à tester :

```bash
# 1. Créer
curl -X POST "https://api.atlassian.com/ex/jira/$CLOUD_ID/rest/api/3/issue" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"fields":{"project":{"key":"OPS"},"issuetype":{"name":"Task"},
       "summary":"Relancer le client",
       "description":{"type":"doc","version":1,"content":[
         {"type":"paragraph","content":[{"type":"text","text":"Contexte..."}]}]}}}'

# 2. Lire les transitions possibles, puis en appliquer une
curl "https://api.atlassian.com/ex/jira/$CLOUD_ID/rest/api/3/issue/OPS-12/transitions" \
  -H "Authorization: Bearer $TOKEN"
curl -X POST "https://api.atlassian.com/ex/jira/$CLOUD_ID/rest/api/3/issue/OPS-12/transitions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"transition":{"id":"31"}}'
```

**Débit**

- Quotas en points, appliqués depuis le 2 mars 2026 aux applications Forge, Connect et OAuth 2.0 (3LO) [O](J4)(J12). Le trafic par jeton d'API personnel n'est pas concerné [O](J6).
- Niveau 1 : réserve globale de 65 000 points par heure. Niveau 2 : réserve par site, à partir de 65 000 points, qui grandit avec le nombre d'utilisateurs [O](J4). Remise à zéro au début de chaque heure UTC [T](J7).
- Une écriture coûte 1 point [T](J6).
- En-têtes `RateLimit` et `RateLimit-Policy`, `Retry-After` sur un 429. La raison indique le plafond touché (`jira-quota-global-based`, `jira-burst-based`) [O](J4).
- Rafale : 100 requêtes par seconde en GET et POST, 50 en PUT et DELETE [T](J7).
- Par ticket : 20 écritures par 2 secondes et 100 par 30 secondes [T](J7). Non confirmé dans le texte officiel.

**Pièges**

- On ne fixe pas un statut. On applique une transition. L'identifiant de transition n'est pas l'identifiant de statut, et il change d'un flux de travail à l'autre [T](J16).
- Les champs obligatoires dépendent du projet et du type de ticket. Les lire avant de créer (`createmeta`) [V].
- `GET` et `POST /rest/api/3/search` ont été retirés. Utiliser `POST /rest/api/3/search/jql` [T](J17). Utile pour `findExisting`.
- Bogue JRACLOUD-73751 : un commentaire ADF dans une transition v3 était refusé (« invalid comment body »). Marqué corrigé [O](J8). Par prudence, faire la transition puis le commentaire en deux appels [D].

**Interdits et revue**

- Une application 3LO est privée par défaut. On active le partage dans la section « Distribution » de la console. La fiche sur le Marketplace est recommandée, pas obligatoire [O](J10). Pas de procédure d'approbation pour partager par lien [T](J11).
- Pour installer l'application sur un site, la personne doit être administratrice du site ou de l'application Atlassian [T](J10). À confirmer : cela peut bloquer un simple utilisateur.
- Exigences de sécurité 2026 d'Atlassian pour les clients OAuth externes : portée exacte non trouvée.

Sources Jira :
- J1 https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- J2 https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/
- J3 https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/
- J4 https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- J5 https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
- J6 https://community.developer.atlassian.com/t/2026-point-based-rate-limits/97828
- J7 https://www.lilachbullock.com/jira-api-rate-limit/
- J8 https://jira.atlassian.com/browse/JRACLOUD-73751
- J9 https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-remote-links/
- J10 https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/
- J11 https://community.developer.atlassian.com/t/do-i-really-need-to-list-my-oauth-2-0-3lo-app-on-marketplace-to-share-with-other-people/69937
- J12 https://www.atlassian.com/blog/development/evolving-api-rate-limits
- J13 https://community.atlassian.com/forums/Jira-questions/How-to-identify-the-site-cloudId-from-an-OAuth-2-0-3LO-access/qaq-p/3022480
- J14 https://crosstowntech.com/apps/api-for-jira/
- J15 https://dev.to/issuecapture/jira-rest-api-a-practical-guide-for-saas-integrations-1n75
- J16 https://jiraalternatives.com/guides/jira-cloud-rest-api-a-practical-guide-to-making-requests
- J17 https://www.lilachbullock.com/does-jira-have-an-api/

### Confluence Cloud

- API : REST v2. Base avec OAuth : `https://api.atlassian.com/ex/confluence/{cloudId}/wiki/api/v2/...` [V]. Même OAuth 3LO et mêmes quotas en points que Jira [O](J4).
- La v2 affiche des portées fines : `read:page:confluence`, `write:page:confluence`, `delete:page:confluence` [O](C1)[T](C5).
- SDK : `confluence.js` 3.3.1 du 13 octobre 2026, bibliothèque communautaire [O](npm).

| Action | Méthode et point d'API | Champs obligatoires | Portée | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer une page | `POST /wiki/api/v2/pages` | `spaceId` (identifiant numérique, pas la clé) [O](C1). `title`, `status`, `body` en pratique [T](C4) | `write:page:confluence` [T](C5) | Non trouvée. Un titre déjà pris dans l'espace est refusé [V] : c'est une protection de fait | `DELETE /wiki/api/v2/pages/{id}` : corbeille. Portée `delete:page:confluence` [O](C1) |
| Modifier une page | `PUT /wiki/api/v2/pages/{id}` | `id`, `status`, `title`, `body`, `version.number` = version actuelle + 1 [T](C4) | `read:page:confluence` + `write:page:confluence` [T](C5) | Le numéro de version sert de verrou : une réécriture concurrente échoue [D] | Republier l'ancien corps comme nouvelle version [D]. Restauration native d'une version : non trouvée en v2 |
| Créer un brouillon | `POST /wiki/api/v2/pages` avec `status: "draft"` [T](C4) | idem | idem | idem | Supprimer le brouillon |
| Commenter | `POST /wiki/api/v2/footer-comments` [V] | `pageId`, `body` [V] | `write:comment:confluence` [V] | Non trouvée | `DELETE /wiki/api/v2/footer-comments/{id}` [V] |
| Supprimer pour de bon | `DELETE /wiki/api/v2/pages/{id}?purge=true` sur une page déjà en corbeille. Demande le droit de gérer l'espace [O](C1) | | `delete:page:confluence` | | Aucune |

**Format du corps**

- `body: { "representation": "storage", "value": "<p>...</p>" }` : XHTML de stockage Confluence [T](C4).
- `body: { "representation": "atlas_doc_format", "value": "<chaîne JSON>" }` : ADF. La valeur est une **chaîne** JSON, pas un objet [T](C2). Un autre exemple du même fil montre un objet : tester.
- Du texte brut sans balise ne s'affiche pas comme prévu en `storage` [T](C4).

Extrait [T](C4), à tester :

```bash
curl -X POST "https://api.atlassian.com/ex/confluence/$CLOUD_ID/wiki/api/v2/pages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"spaceId":"123456","status":"current","title":"Compte rendu du 19 novembre",
       "parentId":"789","body":{"representation":"storage","value":"<p>Bonjour</p>"}}'

# Mise à jour : lire la version, puis envoyer version + 1
curl -X PUT "https://api.atlassian.com/ex/confluence/$CLOUD_ID/wiki/api/v2/pages/987" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"987","status":"current","title":"Compte rendu du 19 novembre",
       "body":{"representation":"storage","value":"<p>Texte corrigé</p>"},
       "version":{"number":4,"message":"Mise à jour par l agent"}}'
```

**Pièges**

- Une clé d'espace (`DOCS`) à la place de `spaceId` renvoie une erreur 400 [T](C4).
- Par défaut, la v2 ne renvoie pas le corps d'une page. Demander `body-format=storage` [T](C4).
- Une page créée en `storage` peut être vue comme « ancien éditeur ». Correctif cité : propriété de contenu `editor` à `v2` [T](C3).
- Une source de 2023 dit que la v2 ne sait pas purger la corbeille. La référence actuelle documente `purge=true` [O](C1). La source ancienne est périmée.

**Interdits et revue** : comme Jira.

Sources Confluence :
- C1 https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/
- C2 https://community.developer.atlassian.com/t/confluence-rest-api-v2-create-page-with-atlas-doc-format-representation/67565
- C3 https://community.developer.atlassian.com/t/confluence-rest-api-v2-struggling-to-create-a-page-with-the-new-editor/75235
- C4 https://dev.to/yamuno/confluence-rest-api-create-and-update-pages-2l6i
- C5 https://github.com/pchuri/confluence-cli

<!-- SUITE -->
