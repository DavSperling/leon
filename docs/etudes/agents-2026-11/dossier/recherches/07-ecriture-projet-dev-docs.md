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
- Première passe (Linear, Jira, Confluence) : 54 requêtes. Seconde passe, le 19 novembre 2026 : 18 requêtes pour les autres outils (Asana à Miro) ; les fiches de la seconde passe sont plus courtes et marquent [V] ce qui vient de la mémoire.
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

### Asana

- API : REST. Base `https://app.asana.com/api/1.0` [O](A1). OAuth 2.0 ou jeton personnel [O](A1).
- Créer une tâche : `POST /tasks`, portée `tasks:write` [O](A1). Corps `{ "data": { ... } }`. Les champs non donnés prennent leur valeur par défaut. Une tâche vit dans un espace de travail (workspace), non modifiable ensuite. On peut omettre `workspace` si on donne `projects` ou `parent` [O](A1).
- Portées fines de type `tasks:read`, `tasks:write`, `tasks:delete`, `stories:write` : forme confirmée pour `tasks:write` seulement. Le reste est [V].

| Action | Méthode et point d'API | Champs obligatoires | Portée | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer une tâche | `POST /tasks` [O](A1) | `workspace` ou `projects` ou `parent` ; `name` en pratique [V] | `tasks:write` [O](A1) | Pas d'en-tête. Champ `external` (`gid`, `data`) comme clé naturelle [V] | `DELETE /tasks/{task_gid}` : corbeille 30 jours [V] |
| Modifier / terminer | `PUT /tasks/{task_gid}` (`completed: true`, `assignee`, `due_on`) [V] | `task_gid` | `tasks:write` [V] | Naturelle [D] | Compensation : réécrire l'état lu avant [D] |
| Commenter | `POST /tasks/{task_gid}/stories` avec `text` ou `html_text` [V] | `text` | `stories:write` [V] | Non trouvée | `DELETE /stories/{story_gid}` (seulement ses propres commentaires) [V] |
| Ajouter à une section | `POST /sections/{section_gid}/addTask` [O](A2) | `task` | `tasks:write` [V] | Naturelle [D] | Remettre dans l'ancienne section [D] |
| Lier une source | Pas de lien distant dédié trouvé. Mettre le lien dans `html_text` ou dans un champ personnalisé de type texte [D] | | | | |

**Débit.** Les sources se contredisent [T](A3) : 1 500 requêtes par minute par jeton (payant), 150 par minute (gratuit), ou 150 pour la plupart des applications, ou 100 (ancien). Concurrence : 50 lectures et 15 écritures en parallèle [T]. Réponse 429 avec `Retry-After` [T]. Relire la page officielle des limites avant de dimensionner.

**Pièges.** L'écriture se fait au nom de l'utilisateur [D]. La tâche créée sans projet n'est visible que de son créateur [V]. Revue de l'application par l'éditeur : non trouvée.

Sources Asana :
- A1 https://developers.asana.com/reference/createtask
- A2 https://developers.asana.com/reference/addtaskforsection
- A3 https://unified.to/blog/how_to_integrate_with_asana et https://jentic.com/apis/asana.com/asana

### ClickUp

- API : REST v2, base `https://api.clickup.com/api/v2` [T](CU1). OAuth 2.0 sans portées : le jeton donne les droits de l'utilisateur sur les espaces qu'il a autorisés [T](CU2) [V].
- Créer une tâche : `POST /api/v2/list/{list_id}/task` [T](CU1). Champ obligatoire : `name` [V].
- Supprimer une tâche : `DELETE /api/v2/task/{task_id}` [T](CU1). Corbeille ou suppression définitive : non trouvé.
- Commentaire : `POST /api/v2/task/{task_id}/comment` (`comment_text`) [V]. Suppression : `DELETE /api/v2/comment/{comment_id}` [V]. Les résultats de recherche n'ont pas confirmé la suppression d'un commentaire.
- Modifier : `PUT /api/v2/task/{task_id}` [V]. Statut : champ `status` (nom du statut de la liste) [V].
- Idempotence : non trouvée.
- **Débit** [T](CU3) : 100 requêtes par minute et par jeton (plans Free, Unlimited, Business) ; 1 000 par minute en Business Plus ; un guide ancien dit 900. Un jeton OAuth compte sur le quota de l'utilisateur. 429 avec `Retry-After` [T].
- Pièges : pas de portées, donc pas de moindre privilège possible [T]. Un statut inconnu de la liste est refusé [V].

Sources : CU1 https://ones.com/blog/the-clickup-api-reference-explained-endpoints-limits-and-examples/ ; CU2 https://www.scalekit.com/blog/clickup-mcp-vs-api ; CU3 https://www.hashlogics.com/stack/clickup

### monday.com (GraphQL)

- API : GraphQL `POST https://api.monday.com/v2` [V]. En-tête `API-Version: 2026-10` ou la version courante [V] : numéro exact non trouvé.
- OAuth : portées `boards:read`, `boards:write` (créer, modifier, supprimer éléments et valeurs de colonnes) [O](M1)[T](M3). Aussi `updates:write` pour les commentaires [V]. Anciens jetons OAuth coupés le 1er octobre 2026 [O] (cité par le brouillon de la recherche précédente, non revérifié ici).

| Action | Mutation | Champs obligatoires | Portée | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer un élément | `create_item(board_id, item_name, group_id, column_values)` [V] | `board_id`, `item_name` | `boards:write` [O](M1) | Non trouvée. Coût d'une mutation : 10 000 points d'après un guide [O](M2) (peut être périmé) | `delete_item(item_id)` ; `archive_item` [V] |
| Modifier colonnes | `change_multiple_column_values(item_id, board_id, column_values)` [V] | | `boards:write` | Naturelle [D] | Réécrire l'ancien état [D] |
| Commenter | `create_update(item_id, body)` [V] | `item_id`, `body` | `updates:write` [V] | Non trouvée | `delete_update(id)` [V] |

- **Débit** [O](M1) : budget de complexité par minute (5 M points pour un jeton standard ; la page « Build with AI » cite 20 M pour les agents) ; plafond de 5 M par requête (`REQUEST_MAX_COMPLEXITY_EXCEEDED`) ; plafond quotidien selon le plan. Un blog donne 10 M [T]. Ajouter le champ `complexity` à la mutation pour mesurer.
- Pièges : ne pas lancer de mutations simultanées sur le même tableau [O](M2). `column_values` est une chaîne JSON dont le format dépend du type de colonne [V].

Sources : M1 https://developer.monday.com/api-reference/docs/rate-limits ; M2 https://developer.monday.com/apps/docs/development-best-practices ; M3 https://developer.monday.com/api-reference/docs/build-on-monday-with-ai

### Trello

- API : REST, base `https://api.trello.com/1` [O](T1). OAuth 2.0 (3LO) : disponible depuis le 15 septembre 2026 d'après un seul agrégateur [T](T4) ; la page officielle « OAuth 2.0 Client Configuration » existe [O](T3). Un guide dit encore OAuth 1.0 : périmé d'après la doc Atlassian [T].
- Portées : `read:board:trello`, `write:board:trello` couvrent cartes et listes [O](T3). Une liste de dix portées fines est citée par un seul tiers [T](T4).
- Créer une carte : `POST /1/cards`, champs `idList` (obligatoire) et `name` [V]. Commenter : `POST /1/cards/{id}/actions/comments` (`text`) [V]. Déplacer : `PUT /1/cards/{id}` avec `idList` [V]. Archiver : `closed=true` [V]. Supprimer : `DELETE /1/cards/{id}` : définitif [V]. Lien : `POST /1/cards/{id}/attachments` (`url`) [V].
- Idempotence : non trouvée.
- **Débit** [T](T2) : 300 requêtes par 10 secondes par clé, 100 par 10 secondes par jeton. 429 en dépassement. Les sources se contredisent sur la présence d'en-têtes de débit : tester.
- Annulation : l'archivage est réversible (`closed=false`) [V]. La suppression ne l'est pas.

Sources : T1 https://developer.atlassian.com/cloud/trello/rest/api-group-cards/ ; T2 https://www.lilachbullock.com/does-trello-have-an-api/ ; T3 https://developer.atlassian.com/cloud/trello/guides/rest-api/oauth-2-client-configuration/ ; T4 https://apis.io/providers/trello/

### Basecamp (3 et 4)

- API : REST JSON, `https://3.basecampapi.com/{account_id}/...` [V]. OAuth 2.0 obligatoire, Basic retiré [O](B1). Pas de portées [T](B2) [V]. Il faut un en-tête `User-Agent` avec nom et contact [V].
- Commentaire : `POST /buckets/{projectId}/recordings/{recordingId}/comments.json` (`content` en HTML) [V]. Tâche : `POST /buckets/{projectId}/todolists/{todolistId}/todos.json` (`content`) [V]. Les chemins exacts n'ont pas été confirmés dans cette recherche.
- Annulation : mise à la corbeille `PUT /buckets/{projectId}/recordings/{recordingId}/status/trashed.json` [V] ; la matrice du CLI officiel parle d'une suppression douce [O](B3). Restauration par `status/active.json` [V].
- Idempotence : non trouvée.
- **Débit** [O](B1) : 50 requêtes par 10 secondes depuis la même IP pour le même compte. 429 avec `Retry-After`. Des tiers disent « par jeton » [T] : deux sources, prendre la plus stricte.
- Piège : l'IP de sortie compte. Dans un service unique, tous les clients partagent la même IP : une file par compte Basecamp [D].

Sources : B1 https://github.com/basecamp/bc3-api ; B2 https://rollout.com/integration-guides/basecamp-3/api-essentials ; B3 https://github.com/basecamp/basecamp-cli/blob/main/API-COVERAGE.md

### Shortcut

- API : REST v3, `POST https://api.app.shortcut.com/api/v3/stories` [O](S1). Authentification : en-tête `Shortcut-Token` avec un jeton personnel. Les jetons n'ont pas de portées et donnent tout l'accès au compte [O](S1)[T]. OAuth 2.0 pour applications tierces : non trouvé dans cette recherche.
- Créer une histoire : exactement un champ parmi `workflow_state_id` et `project_id` (refus si les deux ou aucun) ; `workflow_state_id` conseillé, les Projects étant retirés [O](S1). `name` obligatoire [V].
- Commentaire : `POST /api/v3/stories/{story-public-id}/comments` (`text`) [V]. Suppression : `DELETE /api/v3/stories/{id}` et `.../comments/{id}` [V]. Lien : champ `external_links` ou `story-links` [V].
- Idempotence : non trouvée. Champ `external_id` sur l'histoire : clé naturelle possible [V].
- **Débit** [O](S1) : 200 requêtes par minute, 429 au-delà.
- Piège : jeton personnel seulement = l'utilisateur doit en créer un et le coller. Pas de flux d'autorisation propre : [D] à confirmer.

Source : S1 https://developer.shortcut.com/api/rest/v3

### Plane

- API : REST. `POST /api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/`, portée `projects.work_items:write` [O](P1). Authentification : `X-API-Key` ou jeton OAuth `Bearer` [O](P1).
- Champs : `name` obligatoire [V]. Commentaire : `.../work-items/{id}/comments/` [V]. Suppression : `DELETE .../work-items/{id}/` [V].
- Idempotence : non trouvée (champs `external_id` et `external_source` existent chez Plane [V], utiles comme clé naturelle).
- **Débit** [O](P1) : 60 requêtes par minute par clé, en-têtes `X-RateLimit-Remaining` et `X-RateLimit-Reset`. Hébergé chez soi : variable `API_KEY_RATE_LIMIT` (défaut `60/minute`). Limite propre aux jetons OAuth : non trouvée.

Source : P1 https://developers.plane.so/api-reference/issue/add-issue et https://developers.plane.so/api-reference/introduction

### Airtable

- API : `https://api.airtable.com/v0/{baseId}/{tableIdOrName}` [O](AT1). OAuth 2.0 avec PKCE [V].
- Portées : `data.records:read`, `data.records:write` (créer, modifier, supprimer des enregistrements) [T](AT2). `schema.bases:read` pour lire les champs [V].
- Créer : `POST` avec `records: [{fields}]`, 10 enregistrements au plus par requête [T](AT2). Modifier : `PATCH` ou `PUT`. Supprimer : `DELETE ...?records[]=rec...`, 10 au plus [T](AT2).
- **Idempotence : oui, par upsert.** `performUpsert: { fieldsToMergeOn: [...] }` sur la requête de mise à jour multiple, avec `id` facultatif [O](AT1). Méthode : la doc officielle donne PATCH, un guide donne POST : prendre PATCH [O].
- Annulation : pas de corbeille d'enregistrement par l'API trouvée ; la suppression est définitive côté API [D]. Historique des révisions dans l'interface seulement [V].
- **Débit** [T](AT3) : 5 requêtes par seconde et par base, quel que soit le plan. Au-delà : 429, base bloquée 30 secondes. L'éditeur peut traiter l'upsert autrement [O](AT1).

Sources : AT1 https://airtable.com/developers/web/api/update-multiple-records ; AT2 https://hyperops.fr/en/blog/use-the-airtable-api ; AT3 https://www.zite.com/benchmarks/airtable

### Notion

- API : `https://api.notion.com/v1`, en-tête `Notion-Version: 2026-03-11` [O](N1). Changements de cette version : `archived` remplacé par `in_trash` dans les requêtes et les réponses ; le paramètre `after` d'« Append block children » remplacé par un objet `position` [O](N1)(N2).
- La version `2026-03-11` existe : confirmé par la page officielle « Upgrade guide » [O](N2).
- OAuth : pas de portées. Des « capacités » sont réglées sur l'intégration : lecture, modification, insertion de contenu ; lecture et insertion de commentaires. Les capacités de commentaire sont désactivées par défaut. Sans « insert comment », `POST /v1/comments` renvoie 403 [O](N3). Dans une intégration publique, l'utilisateur choisit les pages partagées (sélecteur de pages) [V] : non confirmé dans cette recherche.
- Si l'utilisateur perd le droit d'écrire sur une page, l'intégration devient en lecture seule sur cette page [T](N4).

| Action | Méthode et point d'API | Champs obligatoires | Capacité | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer une page | `POST /v1/pages` [T](N5) | `parent` (page, source de données ou espace) ; `properties` (titre) [V] ; `children` facultatif | Insert content | Non trouvée | `PATCH /v1/pages/{id}` avec `in_trash: true` ; restauration avec `in_trash: false` [O](N1) |
| Ajouter des blocs | `PATCH /v1/blocks/{block_id}/children` avec `children` et `position` [O](N1) | `children` (100 blocs au plus par appel [V]) | Insert content | Non trouvée | `DELETE /v1/blocks/{id}` (mise en corbeille) [V] |
| Commenter | `POST /v1/comments` : `parent.page_id`, ou `parent.block_id`, ou `discussion_id` pour répondre [O](N3) | `rich_text` + un des trois parents | Insert comments [O](N3) | Non trouvée | Suppression d'un commentaire via l'API : non trouvée [V] |
| Modifier propriétés | `PATCH /v1/pages/{id}` [V] | | Update content | Naturelle [D] | Compensation [D] |

- **Débit** : 3 requêtes par seconde en moyenne par intégration, rafales tolérées, 429 avec `Retry-After` [T](N4). Un tableau tiers parle de 10 par seconde pour Business et Enterprise : non vérifié [T]. Depuis peu, tout 429 ou 529 avec `Retry-After` répète l'attente dans le corps [O](N1). Page officielle sur le débit : non rouverte.
- Pièges : le grand nombre de blocs impose plusieurs appels ; le texte brut doit passer en `rich_text` ; l'ancien champ `archived` est refusé en `2026-03-11` [O](N1).
- Revue de l'intégration publique par l'éditeur : non trouvé.

Sources : N1 https://developers.notion.com/page/changelog ; N2 https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11 ; N3 https://developers.notion.com/reference/create-a-comment ; N4 https://github.com/FroeMic/notion-cli/blob/main/docs/02-capabilities-and-limits.md ; N5 https://freeapihub.com/apis/notion-api

### Google Drive et Google Docs

- Docs : `POST https://docs.googleapis.com/v1/documents` ne traite que le titre. Tout le contenu passe par `POST /v1/documents/{id}:batchUpdate` [T](G3). `batchUpdate` accepte les portées `documents`, `drive` ou `drive.file` [O](G1).
- Par défaut le document est créé à la racine du Drive. Pour le ranger : créer par Drive `files.create` avec `mimeType: application/vnd.google-apps.document` et `parents: [folderId]` [V], ou déplacer ensuite avec `files.update` (`addParents`) [T](G3). Sous `drive.file`, comportement avec `parents` : non trouvé.
- `drive.file` : « voir, modifier, créer et supprimer seulement les fichiers Drive que vous utilisez avec cette application » [O](G1). Portée non sensible : pas d'évaluation de sécurité [T](G4).
- Portée restreinte (`drive`, `drive.readonly`) : évaluation CASA, à refaire tous les 12 mois, environ six semaines, laboratoire à partir d'environ 540 dollars par an d'après un blog [T](G4)(G5). Le forum Google confirme que les portées restreintes de Drive exigent CASA [T](G5).

| Action | Méthode et point d'API | Champs | Portée | Idempotence | Annulation |
|---|---|---|---|---|---|
| Créer un document | `POST /drive/v3/files` (mimeType Docs) ou `POST /v1/documents` | `name` ou `title` | `drive.file` [O](G1) | Non trouvée. Pas de clé native. Marquer par `appProperties` [V] | `PATCH /drive/v3/files/{id}` avec `trashed: true` [V] (le MCP Drive du poste propose `trash_file`) |
| Écrire dans le document | `POST /v1/documents/{id}:batchUpdate` (`insertText`, `insertTable`, `updateTextStyle`...) [O](G2) | `requests[]` | `drive.file` [O](G1) | `writeControl.requiredRevisionId` : refus si le document a changé [V] | Réécriture inverse ; `files.revisions` pour restaurer [V] |
| Modifier un document existant | idem | | `drive.file` seulement si l'application l'a créé ou l'utilisateur l'a ouvert avec elle (Google Picker) [D](G1) | | |

- Limites de l'accès `drive.file` : l'agent ne voit pas les documents que l'utilisateur n'a pas choisis. Pour les connecteurs de lecture existants, c'est une autre portée : à ne pas mélanger [D].
- Débit : Docs et Drive ont des quotas par minute et par utilisateur ; chiffres non trouvés dans cette recherche.

Sources : G1 https://developers.google.com/workspace/docs/api/auth ; G2 https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate ; G3 https://www.rapidevelopers.com/api-automations/how-to-automate-google-docs-reports-using-the-api ; G4 https://yurudeep.com/posts/aicoding/2026/20260717/en/ ; G5 https://discuss.google.dev/t/is-casa-required-for-all-access-restricted-scopes/340650

### GitLab

- API : REST v4, `https://gitlab.com/api/v4` [V]. Créer un ticket : `POST /projects/:id/issues`, seul `title` est obligatoire [O](GL1). Commentaire : `POST /projects/:id/issues/:issue_iid/notes` (`body`) [V]. Modifier : `PUT /projects/:id/issues/:issue_iid` (`state_event=close`, `assignee_ids`, `labels`) [V]. Supprimer : `DELETE /projects/:id/issues/:issue_iid` : définitif, droit propriétaire [V].
- Portées OAuth : `api` donne la lecture et l'écriture complètes ; `read_api` ne lit que. Aucune portée plus fine pour les tickets [T](GL2). `write_repository` ne sert qu'à pousser du Git [V].
- Idempotence : non trouvée.
- Annulation : réouvrir (`state_event=reopen`) pour une clôture [V] ; une note se supprime avec `DELETE .../notes/:note_id` [V].
- **Débit** [O](GL3) : 2 000 requêtes par minute et par utilisateur authentifié (jeton personnel ou OAuth). Changement annoncé : des plafonds horaires par plan (Free 5 000, Premium 15 000, Ultimate 25 000) [T](GL4), appliqués à partir du 19 octobre 2026 pour le Free et le non authentifié, janvier 2027 pour Premium et Ultimate d'après les tiers. Non authentifié : 60 par heure par IP [T]. La page officielle trouvée ne décrit pas les plafonds horaires : deux sources en désaccord, à relire. 429 avec `Retry-After` et `RateLimit-*` [T].
- Revue : une application OAuth GitLab.com ne demande pas de revue de l'éditeur d'après ce qui a été trouvé : non confirmé.

Sources : GL1 https://docs.gitlab.com/api/issues/ ; GL2 https://thelinuxcode.com/how-to-access-the-gitlab-api-rest-v4-base-urls-tokens-pagination-and-practical-scripts/ ; GL3 https://docs.gitlab.com/user/gitlab_com/rate_limits/ ; GL4 https://workos.com/blog/gitlab-rate-limits-authenticated-automation et https://prflow.dev/blog/gitlab-com-rate-limits/

### Sentry

- API : `https://sentry.io/api/0/`. Modifier un problème : `PUT /api/0/organizations/{org}/issues/{issue_id}/` avec `status` (`resolved`, `unresolved`, `ignored`) et `assignedTo` (nom d'utilisateur, courriel ou `team:<id>`) [O](SE1)[T](SE2). Résoudre dans la prochaine version : `{"status":"resolved","statusDetails":{"inNextRelease":true}}` [T](SE2).
- Portées : la page « Permissions & Scopes » dit que GET demande des portées de lecture, PUT/POST des portées d'écriture, DELETE des portées d'admin ; `event:read`, `event:write`, `event:admin` ne couvrent que mise à jour et suppression de problèmes [O](SE3). Un guide tiers associe la gestion des problèmes à `event:write` [T](SE4).
- Commentaire sur un problème : `POST /api/0/organizations/{org}/issues/{id}/comments/` [V]. Non confirmé par cette recherche.
- Lier un ticket externe : Sentry « Issue Linking » passe par une application Sentry (intégration) et `external-issues` [V] : non confirmé.
- Idempotence : non trouvée. Mise à jour d'état naturellement idempotente [D].
- Annulation : remettre `status: unresolved` ; réassigner [D].
- Débit : non trouvé. Revue d'une intégration publique par l'éditeur : non trouvée (le quota de recherche a limité ce point).
- Piège : les jetons OAuth d'une application publique Sentry sont liés à une installation d'organisation, pas à un utilisateur seul [V].

Sources : SE1 https://docs.sentry.io/api/events/update-an-issue ; SE2 https://getsentry-sentry.mintlify.app/api/projects/issues ; SE3 https://docs.sentry.io/api/permissions ; SE4 https://github.com/Streaming-Tech/sentry-mcp

### Productboard

- API v2 : `POST https://api.productboard.com/v2/notes` [O](PB1). `fields.name` obligatoire pour tout type de note. Types créables : `textNote` et `conversationNote`. `opportunityNote` n'est pas créable. Lire `/v2/notes/configurations` pour les champs de chaque type [O](PB1).
- OAuth : flux code d'autorisation, et flux serveur à serveur JWT Bearer [O](PB2). Portée `notes:create` [O](PB2). L'utilisateur ne peut autoriser que les portées permises par son rôle [O](PB2). Lien exact entre `notes:create` et `POST /v2/notes` : non confirmé.
- Idempotence : non trouvée. Annulation : suppression d'une note par `DELETE /v2/notes/{id}` [V].
- **Débit** [O](PB3) : 50 requêtes par seconde par jeton, 429, en-têtes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`. Un tiers dit 1 000 par minute [T] : l'officiel fait foi.
- Nango sait gérer Productboard [T](PB4).
- Piège : un guide cite un en-tête `X-Version: 1` pour l'ancienne API [T] ; la v2 n'en parle pas dans ce qui a été trouvé.

Sources : PB1 https://developer.productboard.com/reference/createnote ; PB2 https://developer.productboard.com/v1.0.0/docs/how-to-integrate-with-productboard-via-oauth2-developer-documentation ; PB3 https://developer.productboard.com/reference/rate-limits ; PB4 https://docs.nango.dev/integrations/all/productboard

### Miro

- API REST v2. Créer une note : `POST /v2/boards/{board_id}/sticky_notes`, portée `boards:write`, niveau de débit 2 [O](MI1). Création en lot : jusqu'à 20 éléments par appel, facturés par élément au niveau 2 [O](MI1).
- Débit : niveau 2 = 100 crédits par appel ; plafond de 100 000 crédits par minute (soit environ 1 000 appels de niveau 2). La page citée est écrite pour le SDK Web : à confirmer pour REST [O](MI2).
- Idempotence et annulation (`DELETE /v2/boards/{board_id}/items/{item_id}`) : suppression [V]. Pas de corbeille trouvée.
- Utilité pour un agent : poser des notes ou connecteurs sur un tableau depuis un compte rendu ; intérêt moyen.

Sources : MI1 https://developers.miro.com/reference/create-sticky-note-item-1 ; MI2 https://developers.miro.com/docs/rate-limiting

### Outils de réunion : écriture utile ?

Réponse courte : non. Aucun outil de réunion ne propose une écriture utile à un agent d'action.

- Fireflies : API GraphQL avec jeton Bearer ; elle rend transcriptions, tours de parole, résumés ; webhook de fin de traitement [T](R1). Les écritures connues servent à envoyer un enregistrement ou à faire rejoindre un bot (`addToLiveMeeting`, [V]). Pas d'écriture de contenu utile. Limite gratuite : 50 appels par jour [T](R1).
- Gong : API REST plafonnée à 3 requêtes par seconde [T](R1). Les écritures servent à importer des appels [V].
- Fathom, tl;dv, Leexi : détails d'écriture non trouvés. Fathom serait en lecture seule [T] (déjà noté plus haut, non revérifié).
- Conséquence : les réunions sont une source de déclencheurs (voir note 05), pas une cible d'écriture. Les actions se font dans les outils de tâches.

Source : R1 https://overloop.com/blog/best-ai-note-takers et https://tldv.io/blog/fireflies-review/

## Tableau de synthèse

Effort : S = demi-journée, M = une journée, L = deux à trois jours (échelle définie plus haut). Annulable : oui = l'éditeur sait restaurer ; compensable = réécrire l'état d'avant ; non = définitif ou notifications parties.

| Outil | Action | Méthode et point d'API | Portée | Annulable | Effort |
|---|---|---|---|---|---|
| Linear | Créer un ticket | GraphQL `issueCreate` | `issues:create` ou `write` | oui (corbeille 30 j, `issueDelete`) | S |
| Linear | Modifier | `issueUpdate` | `write` | compensable | S |
| Linear | Commenter | `commentCreate` | `comments:create` | non (notification partie) | S |
| Linear | Lier une source | `attachmentCreate` (clé naturelle url + ticket) | `write` | oui (`attachmentDelete`) | S |
| Linear | Agir en tant qu'agent | `actor=app`, `agentActivityCreate` | `app:assignable`, `app:mentionable` | compensable | L |
| Jira | Créer | `POST /rest/api/3/issue` | `write:jira-work` | non (suppression définitive) | M |
| Jira | Commenter | `POST .../issue/{id}/comment` | `write:comment:jira` | non | M |
| Jira | Transition | `POST .../issue/{id}/transitions` | `write:issue:jira` | compensable (si transition inverse) | M |
| Jira | Lier tickets | `POST /rest/api/3/issueLink` | `write:jira-work` | oui (`DELETE issueLink`) | S |
| Jira | Lier une source | `POST .../issue/{id}/remotelink` | `write:jira-work` | oui | S |
| Confluence | Créer une page | `POST /wiki/api/v2/pages` | `write:page:confluence` | oui (corbeille) | M |
| Confluence | Modifier | `PUT /wiki/api/v2/pages/{id}` (version + 1) | `write:page:confluence` | compensable | M |
| Asana | Créer une tâche | `POST /tasks` | `tasks:write` | oui (corbeille 30 j) [V] | S |
| Asana | Commenter | `POST /tasks/{gid}/stories` | `stories:write` [V] | oui (propre commentaire) | S |
| ClickUp | Créer une tâche | `POST /api/v2/list/{id}/task` | aucune (jeton entier) | non établi | S |
| ClickUp | Commenter | `POST /api/v2/task/{id}/comment` [V] | aucune | `DELETE .../comment/{id}` [V] | S |
| monday | Créer un élément | `create_item` (GraphQL) | `boards:write` | oui (`archive_item`) [V] | M |
| monday | Commenter | `create_update` | `updates:write` [V] | oui (`delete_update`) [V] | S |
| Trello | Créer une carte | `POST /1/cards` | `write:board:trello` | oui (archiver) | S |
| Trello | Commenter | `POST /1/cards/{id}/actions/comments` | `write:board:trello` | oui [V] | S |
| Basecamp | Tâche, commentaire | `POST .../todos.json`, `.../comments.json` [V] | aucune | oui (corbeille) | S |
| Shortcut | Créer une histoire | `POST /api/v3/stories` | jeton complet | non établi | S |
| Plane | Créer un work item | `POST /api/v1/workspaces/{slug}/projects/{id}/work-items/` | `projects.work_items:write` | `DELETE` [V] | S |
| Notion | Créer une page | `POST /v1/pages` | capacité Insert content | oui (`in_trash`) | M |
| Notion | Ajouter des blocs | `PATCH /v1/blocks/{id}/children` | Insert content | oui (corbeille du bloc) [V] | M |
| Notion | Commenter | `POST /v1/comments` | Insert comments | non établi | S |
| Airtable | Créer ou mettre à jour | `POST` / `PATCH /v0/{base}/{table}` + `performUpsert` | `data.records:write` | non (suppression définitive) | M |
| Google Docs | Créer et écrire | `POST /v1/documents`, `:batchUpdate` | `drive.file` | oui (corbeille Drive, révisions) | L |
| GitLab | Créer un ticket | `POST /projects/:id/issues` | `api` | compensable (fermer) | S |
| GitLab | Commenter | `POST /projects/:id/issues/:iid/notes` [V] | `api` | oui (`DELETE note`) [V] | S |
| Sentry | Assigner, résoudre | `PUT /api/0/organizations/{org}/issues/{id}/` | `event:write` [T] | compensable | S |
| Sentry | Lier un ticket externe | `external-issues` | `event:write` [O] | non établi | M |
| Productboard | Note de retour | `POST /v2/notes` | `notes:create` | `DELETE` [V] | S |
| Miro | Note sur tableau | `POST /v2/boards/{id}/sticky_notes` | `boards:write` | suppression d'élément | S |

## Versions de paquets (registre npm, 19 novembre 2026)

| Paquet | Version |
|---|---|
| `@linear/sdk` | 103.0.0 |
| `jira.js` | 6.4.0 (relevé 27 oct. 2026) |
| `confluence.js` | 3.3.1 (relevé 13 oct. 2026) |
| `@notionhq/client` | 5.31.1 |
| `asana` | 3.4.0 |
| `@gitbeaker/rest` | 44.1.5 |
| `airtable` | 0.12.2 |
| `googleapis` | 190.0.0 |
| `@sentry/api` | 2.16.0 |

Pour les autres outils, il n'y a pas de SDK à adopter : un client `fetch` maison dans le moteur d'actions suffit [D].

## Ce que je recommande

1. **Un journal d'actions maison pour tout le monde** (voir « Règles communes »). Aucune API n'offre de clé d'idempotence générale. Raison : sans lui, une reprise après erreur réseau crée des doublons.
2. **Premier lot d'actions : Linear, Jira, Notion, Google Docs, Asana.** Ce sont les outils les plus répandus dans des sociétés de 20 à 200 salariés, avec une portée d'écriture claire et une annulation ou une compensation possible. Les autres (ClickUp, monday, Trello, Basecamp, Shortcut, Plane) suivent avec le même contrat d'action, un client `fetch` de quelques dizaines de lignes chacun.
3. **Google : `drive.file` seulement.** Portée non sensible, pas de CASA. Le prix : l'agent ne modifie que les documents qu'il a créés ou que l'utilisateur a choisis. Garder `drive` restreint pour plus tard, après évaluation de sécurité.
4. **Notifications = irréversible.** Marquer les commentaires et les assignations « non annulables » et les mettre derrière le curseur « propose » par défaut. Les créations avec corbeille peuvent passer en « agit et prévient ».
5. **Linear en mode agent (`actor=app`)** à étudier à part : c'est le seul outil avec un statut d'agent. Les autres sont signés au nom de l'utilisateur : ajouter une mention « écrit par l'agent » dans le texte.
6. **Une file par couple (outil, jeton)**, avec les plafonds ci-dessus. Plus bas : Plane 60 par minute, ClickUp 100 par minute, Airtable 5 par seconde et par base, Trello 100 par 10 secondes par jeton, Shortcut 200 par minute, Notion environ 3 par seconde.
7. **Basecamp : une file par compte**, la limite est comptée par IP d'après l'éditeur.
8. **Lire avant d'écrire** : Jira (transitions, champs obligatoires), Confluence (version), Notion (propriétés), pour avoir l'état d'avant utile à l'annulation.
9. **Jira et Confluence : `jira.js` et `confluence.js` ou `fetch`.** Prévoir le renouvellement du jeton rotatif et le `cloudId`. Prévoir aussi les quotas en points depuis mars 2026.
10. **GitLab : surveiller la nouvelle politique de limites** (octobre 2026 et janvier 2027).

## Ce que je n'ai pas trouvé

- Clé d'idempotence officielle pour Linear, Jira, Asana, ClickUp, monday, Trello, Basecamp, Shortcut, Plane, Notion, Google, GitLab, Sentry, Productboard, Miro : aucune trouvée.
- Débit officiel de Notion (page rouverte) ; Sentry ; Google Docs et Drive ; Jira par ticket (source tierce seulement).
- Portée exacte de Sentry pour commenter, et chemin exact : une source tierce donne `POST /api/0/issues/{id}/notes/` [T], non confirmé. `external-issues` exige `event:write` [O].
- Procédure de revue d'une application publique : Linear, Notion, Asana, ClickUp, monday, Trello, Basecamp, Shortcut, Plane, GitLab, Sentry, Airtable, Miro : non trouvée. Jira : partage par lien sans approbation [T] ; Google : évaluation CASA pour portées restreintes [T].
- OAuth public de Shortcut (jeton personnel seulement trouvé).
- Numéro de version actuelle de l'API monday.
- Chemins exacts de Basecamp, ClickUp (suppression de commentaire), Plane (commentaires), Trello (OAuth 2.0 général : un seul tiers) : de mémoire [V].
- Écritures des outils de réunion : détail par éditeur non trouvé.
- Documentation de Nango, Pipedream et Composio sur ces écritures : seule la page Nango de Productboard est apparue. Une revue de leur catalogue d'actions reste à faire.

