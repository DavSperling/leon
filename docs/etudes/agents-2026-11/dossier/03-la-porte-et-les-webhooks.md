# 03. La porte et les webhooks

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Sources : l'architecture (`00-architecture.md`, sections 3, 4, 5.2, 7.2, 7.4, 8.3, 9.4, 9.5, 9.10, 10.1, 11, 14.3), le chapitre 01 (migration `0083-webhooks.sql`, section 11 ; schéma `schema/webhooks.ts`, section 14.2 ; lignes de `.env.example`, section 15.4), le chapitre 05 (`openConnection`, section 6), les cartes 01 et 08, les notes 02, 04 et 05. Code relu le 20/11/2026 (commits `500e246` et `b075333`, identiques sous `src/`).

Convention : **existe** (lu dans le dépôt, avec chemin et ligne), **à créer** (le nom vient de l'architecture, sinon de ce chapitre), **à vérifier** (vient d'une note de recherche qui ne l'a pas confirmé, ou de ma mémoire : à lire dans la documentation de l'éditeur avant d'écrire le code).

**Jalon.** Rien de ce chapitre n'est dans le jalon 1 (architecture, 14.3) : le premier agent se contente du sondage de 15 minutes. Tout ce qui suit se construit quand arrive « un agent dont la valeur tient à la fraîcheur : `boite_mail` sur Outlook ». Le service Rust vient encore après (chapitre 15).

Rien n'a été lancé : ni serveur, ni migration, ni test du dépôt. Les signatures, les chiffrés et les sommes de contrôle des exemples de la section 7 ont été calculés par un script Node à part (`node:crypto`), qui suit l'algorithme de la section 4. Les tests de la section 13 rejouent ces exemples ; ils n'en calculent aucun. Deux relectures contradictoires ont suivi ; ce qu'elles ont changé est en section 17.

## 1. Ce que ce chapitre fixe

1. **La porte en Hono** : `src/server/webhooks/hono-gate.ts` et `verify.ts` en entier, le pool `portePool`, la réécriture `/h/:chemin*`, la limite de débit, les caches, la liste blanche d'en-têtes, l'écho de validation, chaque réponse HTTP.
2. **Le contrat avec le service Rust** : le format exact de `services/porte/fournisseurs.json` et de `services/porte/vecteurs.json`, un exemple complet de chacun, leur générateur (`providers-json.ts`) et leur vérification en CI.
3. **Les secrets d'abonnement** (`webhooks/crypto.ts`, `LEON_PORTE_KEY`, format `v1:`) et **les abonnements** (`subscriptions.ts` : abonner, renouveler aux trois quarts, cycle de vie, désabonner, « Reconnecter »).
4. **Le chemin d'une livraison dans le worker** : l'écoute de `leon_porte`, les files `porte-traiter`, `porte-tic`, `abonnement-tic`, `abonnement-renouveler`, `connector-fetch`, `inbox.ts` et la relève ciblée `fetch-one.ts`.
5. **Le premier lot de `WebhookSpec`** : Outlook, Fathom, HubSpot, en entier, et pourquoi les autres outils du lot d'écriture attendent le chapitre 10.

## 2. Vue d'ensemble

```mermaid
flowchart LR
  E[Éditeur : Graph, Fathom, HubSpot] -- POST signé --> R["LEON_PORTE_URL/h/…<br/>réécriture Next"]
  R --> G["hono-gate.ts<br/>/api/v1/porte/h/…"]
  G -- verify.ts --> G
  G -- "porte_secret, porte_deposer<br/>(rôle leon_porte, portePool)" --> B[(boite_entree_webhooks<br/>+ NOTIFY leon_porte)]
  B -- "LISTEN leon_porte<br/>porte-tic chaque minute" --> W["worker.ts<br/>file porte-traiter"]
  W --> I["inbox.ts<br/>prendre_livraison, match, lifecycle"]
  I -- "connector-fetch" --> F["fetch-one.ts<br/>fetchOne, ou relève hors tour"]
  I -- "abonnement-renouveler" --> S["subscriptions.ts"]
  F --> N["normalizeItem, ingestConnectorItems<br/>(existent)"]
  N --> X["indexation, puis emitIndexed (chapitre 02)"]
  T["runConnectorSync (existe)"] -- "subscribeConnection" --> S
  S -- "subscribe, renew, unsubscribe" --> E
```

Les pièces, dans l'ordre où une livraison les traverse :

| # | Pièce | Fichier | État | Rôle |
|---|---|---|---|---|
| 1 | Types du contrat | `src/server/connectors/types.ts` | existe (`:100-117`), à étendre | `WebhookSpec`, `WebhookVerification`, `ItemRef`, `fetchOne`, `webhook` (architecture 8.3, recopiés) |
| 2 | Réécriture | `next.config.ts` | existe, à étendre | `/h/:chemin*` vers `/api/v1/porte/h/:chemin*` |
| 3 | La porte | `src/server/webhooks/hono-gate.ts` | à créer | route publique, vérifie, dépose, répond |
| 4 | L'interprète | `src/server/webhooks/verify.ts` | à créer | le seul interprète TypeScript de `WebhookVerification` |
| 5 | Les secrets | `src/server/webhooks/crypto.ts` | à créer | `v1:` sous `LEON_PORTE_KEY`, lié à `<tenant>:<abonnement>` |
| 6 | Le pool de la porte | `src/server/db/client.ts` | existe (`:12`), à étendre | `portePool`, 2 connexions, rôle `leon_porte` |
| 7 | Le contrat Rust | `services/porte/fournisseurs.json`, `vecteurs.json` | à créer | générés, commités, comparés en CI |
| 8 | Le générateur | `src/server/webhooks/providers-json.ts` | à créer | construit les deux fichiers |
| 9 | Files et écoute | `src/server/webhooks/queue.ts`, `worker.ts` | à créer | `LISTEN leon_porte`, quatre files |
| 10 | La boîte d'entrée | `src/server/webhooks/inbox.ts` | à créer | `prendre_livraison` dans une transaction, `match`, `lifecycle` |
| 11 | La relève ciblée | `src/server/webhooks/fetch-one.ts`, `connectors/queue.ts`, `connectors/worker.ts` | à créer, existent | `connector-fetch` : par abonnement, par compte |
| 12 | Les abonnements | `src/server/webhooks/subscriptions.ts`, `connectors/sync.ts` | à créer, existe | abonner après la lecture de chaque relève, renouveler, désabonner |
| 13 | Le premier lot | `src/server/connectors/{outlook,fathom,hubspot}/webhook.ts` | à créer | trois `WebhookSpec` complètes |

Ce que ce chapitre ne refait pas : le SQL de `0083` (chapitre 01, section 11, recopié ici seulement par ses deux appels), le service Rust (chapitre 15), la liste par connecteur (chapitre 10), le déploiement Railway et le domaine de `LEON_PORTE_URL` (chapitre 13), `openConnection` (chapitre 05, section 6).

**Le premier lot.** L'architecture ne nomme pas les outils du premier lot de webhooks. Je le fixe à trois : Outlook (le déclencheur de tout le lot, `boite_mail`), Fathom (la source de l'agent du jalon 1, `suivi_echange`) et HubSpot (le seul webhook d'application dont la vérification est officielle dans les notes, et le cas qui exerce `connexions_du_compte`). Ce sont les trois que l'architecture cite « au départ » (14.3, ligne « Le lot 2 d'écriture ; `fetchOne` et les webhooks »). Les autres outils du lot d'écriture (D14) attendent, pour une raison écrite :

| Outil | Pourquoi pas dans le premier lot | Ce qu'il faut pour l'ajouter (chapitre 10) |
|---|---|---|
| Gmail | Relevé par Pipedream : aucun webhook tant que Leon n'a pas sa propre appli Google (architecture 8.3, question Q3) | L'appli Google vérifiée (CASA), Pub/Sub, un jeton OIDC à vérifier : un mode de vérification de plus |
| Linear | Webhook d'application ; mais `accountKey` vaut `<viewer.id>:<organization.id>` (`src/server/connectors/linear/client.ts:146`), alors que le corps porte l'organisation seule (à vérifier) | L'écart E-b (fonction `account`), puis `LEON_PORTE_SECRET_LINEAR` |
| GitHub | `accountKey` est l'identifiant de la personne (`github/connector.ts:247`) ; une livraison désigne une installation. La note 05 sur GitHub vient de mémoire | Même écart E-b, et la liste des installations visibles d'une connexion |
| Notion | Abonnement créé dans l'interface de l'intégration, pas par API ; poignée de main par `verification_token` collé à la main (note 05) | Un état `manuelle` saisi par un administrateur, et un mode de poignée de main |
| Zendesk | Le format de `X-Zendesk-Webhook-Signature-Timestamp` n'est pas dans la note 04 (une date ISO, de mémoire) : `WebhookTimestamp.unit` n'a que `s` et `ms` | L'écart E-l (`unit: 'iso8601'`), et un déclencheur Zendesk qui appelle le webhook |
| Jira | En-tête et algorithme de signature des webhooks dynamiques non confirmés (note 05) | La documentation d'Atlassian |
| Asana | Poignée de main `X-Hook-Secret` à renvoyer : absente de `WebhookSpec.handshake` (note 05) | L'écart E-m |

## 3. Le contrat dans `types.ts`

Fichier : `src/server/connectors/types.ts` (existe). `Connector<Config>` est aux lignes `:100-117`, en syntaxe de méthode (« elle rend un `Connector<Config>` assignable à `AnyConnector` », `:99`). Les blocs ci-dessous sont ceux de l'architecture (8.3), recopiés nom pour nom. J'ajoute seulement des commentaires qui fixent leur sens ; ils ne changent aucun type. Le champ `write` et l'import d'`ActionSpec` sont du chapitre 05.

```ts
// src/server/connectors/types.ts (existe) : à ajouter après SyncPage (:46-51).

// L'identifiant d'élément du connecteur, celui de sources.external_id : 'issue:10001', 'thread:<id>'.
// Rendu par WebhookSpec.match, c'est une clé de lecture que fetchOne comprend : souvent l'external_id de la
// source, parfois un identifiant plus fin que fetchOne résout (Outlook : 'message:<id>', dont le fil est
// 'thread:<conversationId>'). Une ref marquée `removed` est toujours un external_id de source (écart E-c).
export type ItemRef = { externalId: string };

// Où la porte trouve le secret.
// 'abonnement' : abonnements_webhook.secret, chiffré par LEON_PORTE_KEY.
// 'env' : un secret de signature d'application, dans une variable donnée à la porte. Son nom : LEON_PORTE_SECRET_<OUTIL>,
// ou celui du secret client quand l'éditeur signe avec lui (HubSpot v3, Intercom). La porte ne reçoit que cette variable-là.
export type WebhookSecret = { from: 'abonnement' } | { from: 'env'; name: string };

// L'horodatage que l'éditeur fournit. Hors tolérance : refus.
// `name` : un nom d'en-tête en minuscules (source 'header'), ou un pointeur JSON sans « * » (source 'body').
// La valeur lue est un entier écrit en chiffres décimaux (au plus 16), ou un nombre entier JSON.
export type WebhookTimestamp = {
  source: 'header' | 'body'; // un en-tête, ou un pointeur JSON dans le corps (Linear : /webhookTimestamp)
  name: string;
  unit: 's' | 'ms';
  toleranceSeconds: number; // 300 par défaut ; Linear : 60
};

// 'timestamp' : le texte exact de l'en-tête d'horodatage, tel que reçu. Un horodatage signé vient donc
// toujours d'un en-tête (contrat webhook-specs.test.ts).
export type SignedPart = 'method' | 'uri' | 'timestamp' | 'body' | { literal: string };

// Les noms d'en-tête sont en minuscules. Un pointeur JSON (RFC 6901) peut porter un seul segment « * » : chaque
// élément du tableau doit alors donner la valeur attendue, et le tableau ne doit pas être vide (verify.ts, 4.3).
export type WebhookVerification =
  | {
      mode: 'hmac-sha256' | 'hmac-sha1';
      header: string;
      encoding: 'hex' | 'base64';
      prefix?: string; // 'sha256=', 'v0='
      // La chaîne signée : des morceaux joints par `separator`.
      // Corps seul (GitHub, Attio, Linear, Intercom) : ['body'] et ''.
      // Slack : [{ literal: 'v0' }, 'timestamp', 'body'] et ':'. Front : ['timestamp', 'body'] et ':'.
      // Zendesk, Close : ['timestamp', 'body'] et ''. HubSpot v3 : ['method', 'uri', 'body', 'timestamp'] et ''.
      signed: SignedPart[];
      separator: string;
      timestamp?: WebhookTimestamp; // obligatoire si `signed` contient 'timestamp' (test de contrat)
      secret: WebhookSecret;
      secretEncoding?: 'utf8' | 'hex' | 'base64'; // Close : clé hexadécimale à décoder
    }
  // En-têtes webhook-id, webhook-timestamp, webhook-signature ; tolérance de 300 s.
  | { mode: 'standard-webhooks'; secret: WebhookSecret }
  // Un jeton comparé en temps constant : dans un en-tête (Google : X-Goog-Channel-Token) ou dans le corps
  // (Microsoft : clientState). Pas d'horodatage.
  | { mode: 'jeton'; header?: string; bodyPointer?: string; secret: WebhookSecret };

export type WebhookMatch = { ref: ItemRef; removed?: boolean };
export type LifecycleEvent = { externalId: string; event: 'reautoriser' | 'supprime' | 'manque' };

export type WebhookSpec<Config> = {
  scope: 'app' | 'abonnement'; // une adresse par appli (le compte est lu dans le corps) ou une par abonnement
  bodyFormat: 'json' | 'form-payload';
  accountPointer?: string; // scope 'app' : pointeur JSON vers la clé de compte (celle de config.accountKey)
  deliveryHeader?: string; // identifiant de livraison ; absent : SHA-256 du corps
  handshake?: 'echo-validation-token' | 'slack-challenge';
  verification: WebhookVerification;
  // Pure. Valide le corps par zod et ne rend que des identifiants. Jamais de contenu.
  // Ne lève jamais : un corps illisible rend [] (inbox.ts le journalise). inbox.ts garde au plus 100 suppressions
  // et 50 modifications par livraison, les suppressions d'abord.
  match(body: string, headers: Record<string, string>): WebhookMatch[];
  // Microsoft Graph : ce que dit une notification de cycle de vie. Pure, comme match.
  // Présent : subscribe déclare l'adresse de cycle de vie à la création (elle ne s'ajoute pas ensuite).
  lifecycle?(body: string): LifecycleEvent[];
  // expiresAt est lu dans la réponse de l'éditeur, jamais dans une constante. null : l'abonnement n'expire pas.
  // Premier lot : un appel crée un seul abonnement (l'adresse porte l'id d'une seule ligne, écart E-a).
  subscribe?(config: Config, http: ConnectorHttp, target: { url: string; lifecycleUrl: string; secret: string }):
    Promise<Array<{ resource: string; externalId: string; expiresAt: string | null; secret?: string }>>;
  renew?(config: Config, http: ConnectorHttp, subscription: { externalId: string }):
    Promise<{ expiresAt: string | null }>;
  unsubscribe?(config: Config, http: ConnectorHttp, subscription: { externalId: string }): Promise<void>;
};
```

Dans `Connector<Config>` (`:100-117`), après `pipedream?` (`:116`) :

```ts
  // Lire en direct un objet : relève ciblée après un webhook, relecture après une écriture.
  // null : l'objet n'existe plus, ou cette connexion ne le voit pas.
  fetchOne?(config: Config, ref: ItemRef, http: ConnectorHttp): Promise<ConnectorItem | null>;
  // Recevoir : vérification (déclarative, exportée vers la porte), correspondance, abonnement, renouvellement.
  webhook?: WebhookSpec<Config>;
```

`ConnectorHttp` est déjà importé (`:4`). Aucun connecteur existant ne change : les deux champs sont facultatifs.

## 4. `verify.ts` : l'interprète de `WebhookVerification`

Fichier : `src/server/webhooks/verify.ts` (à créer). Il sert la porte en Hono (section 6) et, plus tard, la route des clics Slack (architecture 9.12, chapitre 07). Le service Rust en est la seconde mise en œuvre (`services/porte/src/verifier.rs`, chapitre 15). Les deux doivent rendre le même verdict sur chaque cas de `vecteurs.json`. Cette section est donc la règle, et le code la suit.

### 4.1 La règle, mode par mode

Toutes les comparaisons de secrets et de signatures se font en temps constant. Un en-tête se lit par son nom en minuscules. Le corps est l'octet brut reçu, jamais un JSON relu puis réécrit (notes 02 et 05 : « re-sérialiser casse la signature »).

| Étape | `hmac-sha256`, `hmac-sha1` | `standard-webhooks` | `jeton` |
|---|---|---|---|
| 0 | Secret vide : `secret` | idem | idem |
| 1 | Clé : le secret décodé selon `secretEncoding` (défaut `utf8`). Illisible : `secret` | En-têtes `webhook-id`, `webhook-timestamp`, `webhook-signature`. Un absent : `entete` | `header` : l'en-tête absent donne `entete`. `bodyPointer` : corps illisible en JSON, `format` ; pointeur sans valeur, `entete` |
| 2 | En-tête `header` absent : `entete` | `webhook-timestamp` : 1 à 16 chiffres, à 300 s au plus de l'heure. Sinon `horodatage` | Chaque valeur trouvée est comparée au secret, en temps constant (empreintes SHA-256 des deux textes) |
| 3 | `prefix` : l'en-tête doit commencer par lui, qui est retiré. Sinon `signature` | Clé : le secret sans son préfixe `whsec_` s'il l'a, décodé en base64. Illisible : `secret` | Toutes égales : `ok`. Une seule différente : `signature` |
| 4 | Décoder la signature : `hex` (majuscules admises) ou base64 standard avec remplissage. Illisible : `signature` | Attendu : HMAC-SHA256 de `<webhook-id>.<webhook-timestamp>.<corps>` | |
| 5 | `timestamp` présent : lire la valeur (en-tête, ou pointeur dans le corps), 1 à 16 chiffres, convertir selon `unit`, écart à l'heure au plus `toleranceSeconds`. Sinon `horodatage` | `webhook-signature` : des entrées séparées par une espace, chacune `version,signature`. Seules les entrées `v1` comptent. Une qui correspond : `ok` | |
| 6 | Message signé : les morceaux de `signed` joints par `separator`. `method` en majuscules ; `uri` : l'adresse publique appelée ; `timestamp` : le texte exact de l'en-tête ; `body` : les octets bruts ; `literal` : le texte donné | Aucune : `signature` | |
| 7 | HMAC (SHA-256 ou SHA-1) du message. Égal à la signature décodée : `ok`. Sinon `signature` | | |

Les cinq raisons d'un refus : `entete`, `signature`, `horodatage`, `secret`, `format`. Elles vont au journal et aux vecteurs, jamais à l'éditeur : la porte répond toujours la même chose (section 6.1). L'ordre des étapes fait partie du contrat : un cas qui cumule deux défauts rend la première raison rencontrée, dans les deux mises en œuvre.

`uri`, pour HubSpot v3 : l'adresse publique telle que l'éditeur l'a appelée, `LEON_PORTE_URL` suivie de `/h/<outil>…` et de la chaîne de requête reçue (`?…`, vide le plus souvent). Pas l'adresse interne `/api/v1/porte/h/…` que voit Hono après la réécriture. Le décodage de certains caractères que HubSpot applique à l'adresse avant de signer est à vérifier dans la documentation de l'éditeur ; nos adresses n'en contiennent aucun.

### 4.2 Les pointeurs JSON

`bodyPointer`, `accountPointer` et `timestamp.name` (source `body`) sont des pointeurs RFC 6901 : `/value/0/clientState`, avec `~1` pour `/` et `~0` pour `~`. Une seule extension : un segment `*`, au plus un par pointeur, parcourt un tableau **non vide**.

- Pour un jeton (`bodyPointer`), chaque élément doit porter le secret. Microsoft regroupe plusieurs notifications dans `value[]`, et chacune porte son `clientState` (note 04 : « écho de `clientState` dans chaque notification ») : contrôler la première seule laisserait passer une notification ajoutée derrière elle.
- Pour un compte (`accountPointer`), toutes les valeurs doivent être égales. Sinon la livraison n'est déposée nulle part (section 6.1, étape 8).
- Une valeur est une chaîne, ou un entier JSON sûr, rendu en chiffres décimaux (HubSpot : `portalId` est un nombre, `accountKey` une chaîne, `hubspot/connector.ts:137`). Tout autre type : pas de valeur.

### 4.3 Le code

```ts
// src/server/webhooks/verify.ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  SignedPart,
  WebhookSpec,
  WebhookTimestamp,
  WebhookVerification,
} from '@/server/connectors/types';

// L'interprète de WebhookVerification (dossier agents, 8.3) : le seul en TypeScript. Il sert la porte en Hono
// (hono-gate.ts) et la route des clics Slack. Sa seconde mise en œuvre est en Rust (services/porte/src/verifier.rs,
// chapitre 15) : les deux passent services/porte/vecteurs.json. Pur : ni base, ni réseau, ni variable
// d'environnement. L'heure est un argument, le secret arrive en clair. Un refus dit pourquoi, pour le journal et
// les vecteurs, jamais à l'éditeur : la porte lui répond toujours la même chose.

export const VERDICT_REASONS = ['entete', 'signature', 'horodatage', 'secret', 'format'] as const;
export type VerdictReason = (typeof VERDICT_REASONS)[number];
export type Verdict = { ok: true } | { ok: false; reason: VerdictReason };

export type VerifyInput = {
  verification: WebhookVerification;
  bodyFormat: WebhookSpec<unknown>['bodyFormat'];
  secret: string; // en clair : déchiffré (abonnement) ou lu dans sa variable (application)
  method: string;
  uri: string; // l'adresse publique appelée : LEON_PORTE_URL, puis /h/…, puis la chaîne de requête reçue
  headers: Readonly<Record<string, string>>; // noms en minuscules
  body: Uint8Array; // le corps brut, jamais re-sérialisé
  nowMs: number;
};

type HmacVerification = Extract<WebhookVerification, { mode: 'hmac-sha256' | 'hmac-sha1' }>;
type TokenVerification = Extract<WebhookVerification, { mode: 'jeton' }>;

const STANDARD_TOLERANCE_SECONDS = 300;
const DIGITS = /^\d{1,16}$/;
const HEX = /^(?:[0-9a-fA-F]{2})+$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const POINTER = /^(?:\/(?:[^/~]|~[01])*)+$/;
const INDEX = /^(?:0|[1-9]\d*)$/;

const OK: Verdict = { ok: true };
const refuse = (reason: VerdictReason): Verdict => ({ ok: false, reason });
const utf8 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('utf8');

// Hexadécimal (majuscules admises) ou base64 standard avec remplissage. null : vide ou illisible.
export function decodeBytes(text: string, encoding: 'hex' | 'base64'): Buffer | null {
  if (text === '') return null;
  if (encoding === 'hex') return HEX.test(text) ? Buffer.from(text, 'hex') : null;
  return BASE64.test(text) ? Buffer.from(text, 'base64') : null;
}

// Temps constant pour une même longueur ; la longueur d'une signature n'est pas un secret.
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// Temps constant quelle que soit la longueur : on compare les empreintes des deux textes.
function sameText(a: string, b: string): boolean {
  const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

// Le corps lu comme JSON : tel quel, ou le champ `payload` d'un formulaire (Slack). undefined : illisible. Le message
// d'une erreur de JSON.parse peut citer le corps : il n'est jamais gardé.
export function parseBodyJson(format: VerifyInput['bodyFormat'], text: string): unknown {
  try {
    if (format === 'json') return JSON.parse(text);
    const payload = new URLSearchParams(text).get('payload');
    return payload === null ? undefined : JSON.parse(payload);
  } catch {
    return undefined;
  }
}

// Un pointeur JSON (RFC 6901), avec au plus un segment « * » qui parcourt un tableau non vide. Rend les valeurs
// trouvées en texte : une chaîne telle quelle, un entier sûr en chiffres décimaux. null : pointeur mal formé, chemin
// absent, tableau vide, ou une valeur d'un autre type.
export function readPointer(document: unknown, pointer: string): string[] | null {
  if (!POINTER.test(pointer)) return null;
  const segments = pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (segments.filter((segment) => segment === '*').length > 1) return null;
  let nodes: unknown[] = [document];
  for (const segment of segments) {
    const next: unknown[] = [];
    for (const node of nodes) {
      if (segment === '*') {
        if (!Array.isArray(node) || node.length === 0) return null;
        next.push(...node);
      } else if (Array.isArray(node)) {
        if (!INDEX.test(segment) || Number(segment) >= node.length) return null;
        next.push(node[Number(segment)]);
      } else if (node !== null && typeof node === 'object' && Object.hasOwn(node, segment)) {
        next.push((node as Record<string, unknown>)[segment]);
      } else {
        return null;
      }
    }
    nodes = next;
  }
  const values: string[] = [];
  for (const value of nodes) {
    if (typeof value === 'string') values.push(value);
    else if (typeof value === 'number' && Number.isSafeInteger(value)) values.push(String(value));
    else return null;
  }
  return values.length > 0 ? values : null;
}

// Les en-têtes qui portent un secret ou une signature : jamais gardés avec une livraison (hono-gate.ts).
export function secretHeaders(verification: WebhookVerification): string[] {
  if (verification.mode === 'standard-webhooks') return ['webhook-signature'];
  if (verification.mode === 'jeton') return verification.header ? [verification.header] : [];
  return [verification.header];
}

// LEON_PORTE_URL sans « / » final, ou null quand elle n'est pas réglée. La porte en rebâtit l'adresse publique appelée
// (morceau `uri`) ; subscriptions.ts en tire les adresses données aux éditeurs. Ici, et non dans subscriptions.ts :
// la porte n'importe rien de ce qui touche aux jetons des outils (contrat porte-surface.test.ts).
export function porteBase(url: string | undefined): string | null {
  return url ? url.replace(/\/+$/, '') : null;
}

function keyOf(secret: string, encoding: HmacVerification['secretEncoding'] = 'utf8'): Buffer | null {
  return encoding === 'utf8' ? Buffer.from(secret, 'utf8') : decodeBytes(secret, encoding);
}

type Stamp = { text: string; ms: number };

function readStamp(timestamp: WebhookTimestamp, input: VerifyInput): Stamp | null {
  let text: string | undefined;
  if (timestamp.source === 'header') {
    text = input.headers[timestamp.name];
  } else {
    const values = readPointer(parseBodyJson(input.bodyFormat, utf8(input.body)), timestamp.name);
    text = values?.length === 1 ? values[0] : undefined;
  }
  if (text === undefined || !DIGITS.test(text)) return null;
  return { text, ms: timestamp.unit === 's' ? Number(text) * 1000 : Number(text) };
}

const fresh = (ms: number, nowMs: number, toleranceSeconds: number) =>
  Math.abs(nowMs - ms) <= toleranceSeconds * 1000;

function signedBytes(parts: SignedPart[], separator: string, input: VerifyInput, stamp: Stamp | null) {
  const pieces = parts.map((part): Buffer => {
    if (typeof part === 'object') return Buffer.from(part.literal, 'utf8');
    if (part === 'method') return Buffer.from(input.method.toUpperCase(), 'utf8');
    if (part === 'uri') return Buffer.from(input.uri, 'utf8');
    if (part === 'timestamp') return Buffer.from(stamp?.text ?? '', 'utf8');
    return Buffer.from(input.body);
  });
  const glue = Buffer.from(separator, 'utf8');
  return Buffer.concat(pieces.flatMap((piece, index) => (index === 0 ? [piece] : [glue, piece])));
}

function verifyHmac(verification: HmacVerification, input: VerifyInput): Verdict {
  const key = keyOf(input.secret, verification.secretEncoding);
  if (!key) return refuse('secret');
  let header = input.headers[verification.header];
  if (header === undefined) return refuse('entete');
  if (verification.prefix !== undefined) {
    if (!header.startsWith(verification.prefix)) return refuse('signature');
    header = header.slice(verification.prefix.length);
  }
  const given = decodeBytes(header, verification.encoding);
  if (!given) return refuse('signature');
  let stamp: Stamp | null = null;
  if (verification.timestamp) {
    stamp = readStamp(verification.timestamp, input);
    if (!stamp || !fresh(stamp.ms, input.nowMs, verification.timestamp.toleranceSeconds)) {
      return refuse('horodatage');
    }
  }
  const algorithm = verification.mode === 'hmac-sha1' ? 'sha1' : 'sha256';
  const message = signedBytes(verification.signed, verification.separator, input, stamp);
  const expected = createHmac(algorithm, key).update(message).digest();
  return sameBytes(given, expected) ? OK : refuse('signature');
}

function verifyStandard(input: VerifyInput): Verdict {
  const id = input.headers['webhook-id'];
  const timestamp = input.headers['webhook-timestamp'];
  const signatures = input.headers['webhook-signature'];
  if (id === undefined || timestamp === undefined || signatures === undefined) return refuse('entete');
  if (!DIGITS.test(timestamp) || !fresh(Number(timestamp) * 1000, input.nowMs, STANDARD_TOLERANCE_SECONDS)) {
    return refuse('horodatage');
  }
  const encoded = input.secret.startsWith('whsec_') ? input.secret.slice('whsec_'.length) : input.secret;
  const key = decodeBytes(encoded, 'base64');
  if (!key) return refuse('secret');
  const message = Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), Buffer.from(input.body)]);
  const expected = createHmac('sha256', key).update(message).digest();
  for (const entry of signatures.split(' ')) {
    const comma = entry.indexOf(',');
    if (comma < 0 || entry.slice(0, comma) !== 'v1') continue;
    const given = decodeBytes(entry.slice(comma + 1), 'base64');
    if (given && sameBytes(given, expected)) return OK;
  }
  return refuse('signature');
}

function verifyToken(verification: TokenVerification, input: VerifyInput): Verdict {
  if (verification.header !== undefined) {
    const given = input.headers[verification.header];
    if (given === undefined) return refuse('entete');
    return sameText(given, input.secret) ? OK : refuse('signature');
  }
  if (verification.bodyPointer === undefined) return refuse('format');
  const document = parseBodyJson(input.bodyFormat, utf8(input.body));
  if (document === undefined) return refuse('format');
  const values = readPointer(document, verification.bodyPointer);
  if (!values) return refuse('entete');
  return values.every((value) => sameText(value, input.secret)) ? OK : refuse('signature');
}

export function verifyWebhook(input: VerifyInput): Verdict {
  if (input.secret === '') return refuse('secret');
  const { verification } = input;
  if (verification.mode === 'standard-webhooks') return verifyStandard(input);
  if (verification.mode === 'jeton') return verifyToken(verification, input);
  return verifyHmac(verification, input);
}
```

À savoir :

- `timingSafeEqual` lève si les longueurs diffèrent : `sameBytes` les compare d'abord. La longueur d'un HMAC est publique (32 ou 20 octets).
- Un `JSON.parse` ne voit jamais que le corps d'une livraison dont la signature reste à vérifier, et seulement pour un jeton ou un horodatage dans le corps. Il ne lève pas hors de `parseBodyJson`.
- La route des clics Slack (chapitre 07) appelle `verifyWebhook` avec `{ mode: 'hmac-sha256', header: 'x-slack-signature', encoding: 'hex', prefix: 'v0=', signed: [{ literal: 'v0' }, 'timestamp', 'body'], separator: ':', timestamp: { source: 'header', name: 'x-slack-request-timestamp', unit: 's', toleranceSeconds: 300 }, secret: { from: 'env', name: 'LEON_SLACK_SIGNING_SECRET' } }` et `bodyFormat: 'form-payload'` (architecture 9.12 ; schéma de Slack « à vérifier », note 04).

## 5. `crypto.ts` : les secrets d'abonnement

Fichier : `src/server/webhooks/crypto.ts` (à créer). Il réutilise `encryptSecret` et `decryptSecret` de `src/server/connectors/crypto.ts` (existe, `:33` et `:42`), qui prennent déjà une clé en argument : même format `v1:<iv>:<tag>:<chiffré>` en base64url, même AES-256-GCM, mêmes longueurs imposées (IV de 12 octets, étiquette de 16, `:52-54`). Seules changent la clé (`LEON_PORTE_KEY`) et les données associées (`<tenant_id>:<abonnement_id>`). Le service Rust déchiffre le même format (`secret.rs`, chapitre 15) ; `vecteurs.json` porte deux cas de déchiffrement (section 7.2).

```ts
// src/server/webhooks/crypto.ts
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from '@/server/connectors/crypto';
import { env } from '@/server/env';

// Les secrets d'abonnement (abonnements_webhook.secret, dossier agents 7.2 et 8.3). Même format que les clés des
// connecteurs (v1:<iv>:<tag>:<chiffré>, AES-256-GCM), mais une autre clé : LEON_PORTE_KEY, la seule que la porte
// reçoit. Les données associées, `<tenant_id>:<abonnement_id>`, lient le secret à sa ligne : recopié sur un autre
// abonnement, il ne se déchiffre plus.

export class PorteKeyMissingError extends Error {
  override name = 'PorteKeyMissingError';
  constructor() {
    super('LEON_PORTE_KEY est absente : impossible de chiffrer ou de lire un secret d’abonnement');
  }
}

export function porteKey(): Buffer | null {
  return env.LEON_PORTE_KEY ? Buffer.from(env.LEON_PORTE_KEY, 'base64') : null;
}

export type SubscriptionIds = { tenantId: string; abonnementId: string };

export const subscriptionAad = ({ tenantId, abonnementId }: SubscriptionIds): string =>
  `${tenantId}:${abonnementId}`;

// 32 octets tirés au hasard, en base64url : 43 caractères sans « + », « / » ni « = ». Il part chez l'éditeur
// (clientState de Graph, 128 caractères au plus : à vérifier dans la documentation de l'éditeur).
export const newSubscriptionSecret = (): string => randomBytes(32).toString('base64url');

export function sealSubscriptionSecret(plain: string, ids: SubscriptionIds, key = porteKey()): string {
  if (!key) throw new PorteKeyMissingError();
  return encryptSecret(plain, subscriptionAad(ids), key);
}

// Lève Error('Secret illisible') (connectors/crypto.ts:45, :61), sans le secret ni le chiffré.
export function openSubscriptionSecret(stored: string, ids: SubscriptionIds, key = porteKey()): string {
  if (!key) throw new PorteKeyMissingError();
  return decryptSecret(stored, subscriptionAad(ids), key);
}
```

`LEON_PORTE_KEY` n'est jamais la même valeur que `LEON_CONNECTORS_KEY` : `env.ts` le refuse au démarrage (section 6.3). La porte ne connaît pas `LEON_CONNECTORS_KEY` (architecture, section 3).

**Changer ou perdre `LEON_PORTE_KEY`.** Le format `v1:` ne porte pas d'identifiant de clé, et la porte n'en lit qu'une. Sous une autre clé, chaque secret devient illisible : la porte refuse tout (`porte.secret_illisible`, journalisé à chaque livraison), et les lignes restent `active`, donc `subscribeConnection` ne recrée rien d'elle-même. La marche à suivre, pour une clé perdue comme pour une rotation :

1. Poser la nouvelle clé sur `web` et `worker` (chapitre 13), redémarrer.
2. Sous le rôle propriétaire (celui des migrations), passer les abonnements à recréer à `expiree` :

```sql
update abonnements_webhook set etat = 'expiree', erreur = null
 where portee = 'abonnement' and etat = 'active';
```

3. La relève suivante de chaque connexion (15 minutes au plus) coupe l'ancien abonnement chez l'éditeur (`externe_id` est en clair) et en crée un neuf, sous une adresse neuve et un secret chiffré par la nouvelle clé (section 11). Pendant ces 15 minutes, les livraisons sont refusées et le sondage couvre.

Les lignes `manuelle` (secret collé par un administrateur, chapitre 10) sont à ressaisir. Les lignes de portée `app` n'ont pas de secret. Pas de seconde clé « précédente » : la porte, puis le service Rust, n'en liraient qu'une de plus pour gagner un quart d'heure. L'alerte sur `porte.secret_illisible` est une règle Sentry (chapitre 13).

## 6. La porte en Hono : `hono-gate.ts`

Fichier : `src/server/webhooks/hono-gate.ts` (à créer). C'est la première mise en œuvre du contrat de la porte (architecture, section 3). Elle tourne dans `web` tant que le service Rust n'existe pas, avec son propre pool sous le rôle `leon_porte`.

### 6.1 Le déroulé d'une requête

Trois adresses, toutes en `POST`, montées sous `/api/v1/porte` et atteintes par la réécriture de `<LEON_PORTE_URL>/h/…` :

| Adresse publique | Route Hono | Pour |
|---|---|---|
| `/h/<outil>` | `/api/v1/porte/h/:outil` | webhook d'application (`scope: 'app'`) |
| `/h/<outil>/<abonnement>` | `/api/v1/porte/h/:outil/:abonnement` | une livraison d'abonnement (`scope: 'abonnement'`) |
| `/h/<outil>/<abonnement>/cycle` | `/api/v1/porte/h/:outil/:abonnement/cycle` | une notification de cycle de vie (spec avec `lifecycle`) |

Chaque requête suit ces étapes, dans cet ordre. Le service Rust suit le même ordre (les cas `gate` de `vecteurs.json` le vérifient).

| # | Étape | Si ça ne va pas | Réponse |
|---|---|---|---|
| 1 | Corps de 262 144 octets au plus (`bodyLimit`, avant tout) | trop gros : journalisé (`porte.trop_gros`, avec l'outil si son nom est de bonne forme) | `413 {"error":"Request too large"}` |
| 2 | L'adresse : outil connu, qui a un `webhook` ; forme de l'adresse conforme à `scope` ; abonnement en UUID minuscule ; `/cycle` seulement si la spec a `lifecycle` | adresse inconnue | **refus uniforme** |
| 3 | `handshake: 'echo-validation-token'` et `?validationToken=` présent : écho, sans rien lire en base. 1 024 caractères au plus, aucun caractère de contrôle | jeton trop long ou avec un caractère de contrôle | `200 text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff`, le jeton ; sinon `400 {"error":"Invalid request"}` |
| 4 | Le corps est de l'UTF-8 valide, sans octet nul (Postgres refuse l'octet nul dans un `text`, chapitre 01 section 11) | illisible | `400 {"error":"Invalid request"}` |
| 5 | La porte a sa base (`DATABASE_URL_PORTE`) ; et `LEON_PORTE_URL` si la signature couvre l'adresse | non réglée | `503 {"error":"Unavailable"}` |
| 6 | Le secret. `abonnement` : cache positif (60 s), cache négatif (600 s), limite des lectures vides par adresse IP, puis `porte_secret`, puis déchiffrement. `app` : la variable nommée | inconnu, résilié, illisible : **refus uniforme** ; clé ou variable absente : 503 ; limite atteinte, adresse absente des deux caches : 503 | |
| 7 | `verifyWebhook` (section 4) | `entete`, `signature`, `horodatage`, `secret`, `format` | **refus uniforme** |
| 8 | `handshake: 'slack-challenge'` : un `url_verification` signé reçoit son `challenge` en écho | | `200 text/plain` |
| 9 | `scope: 'app'` : le compte, lu par `accountPointer` ; une seule valeur, 200 caractères au plus | absent : `porte.compte_illisible` ; plusieurs comptes : `porte.comptes_multiples` ; journalisé, compté (Sentry), rien déposé | `202`, corps vide |
| 10 | Identifiant de livraison : l'en-tête `deliveryHeader` s'il fait 1 à 200 caractères ASCII visibles, sinon le SHA-256 hexadécimal du corps | | |
| 11 | En-têtes gardés : ceux de `PORTE_KEPT_HEADERS` et `deliveryHeader`, jamais celui d'une signature ou d'un jeton, 1 024 caractères par valeur ; plus de 8 Kio en tout : aucun | | |
| 12 | `porte_deposer` (rend 0 pour une livraison déjà reçue : même réponse) | erreur de base | `503` ; sinon `202`, corps vide |

Le **refus uniforme** : `401 {"error":"Invalid signature"}`, rendu au plus tôt 200 ms après l'arrivée de la requête. Une adresse inconnue, un abonnement résilié et une signature fausse reçoivent la même réponse, au même délai (architecture, section 3 : « ne pas dire si un abonnement existe »). Une erreur de base n'est pas un refus : `503`, pour que l'éditeur réessaie.

La **limite de débit** ne compte que les lectures de `porte_secret` restées vides : 300 par adresse IP sur une fenêtre fixe de 10 minutes, 3 000 pour les requêtes dont l'adresse IP est inconnue (`LEON_IP_HEADER` absent ou illisible). Ces nombres sont à mesurer. La fenêtre s'ouvre à la première lecture vide et ne se prolonge pas. Une adresse IPv6 compte pour son /64, comme dans `auth/rate-limit.ts:41-47` : un client qui tient un /64 changerait d'adresse à chaque requête. Au-delà de la limite, l'adresse IP ne lit plus la base. Ses requêtes vers une adresse absente des deux caches reçoivent `503 {"error":"Unavailable"}`, pas le refus uniforme : un abonnement vivant n'est jamais refusé pour une autre raison que sa signature, et l'éditeur réessaie. La réponse ne dit rien de l'existence d'un abonnement : toute adresse hors cache reçoit la même.

Pourquoi ne compter que les lectures vides : un abonnement Graph résilié continue d'envoyer jusqu'à son échéance (architecture 9.10), depuis les adresses IP de Microsoft. Le cache négatif, posé par clé, ramène chaque abonnement mort à une lecture toutes les 10 minutes, quelle que soit l'adresse IP qui l'envoie. Il faudrait donc plus de 300 abonnements morts différents, envoyés par la même adresse IP de Microsoft dans la même fenêtre, pour atteindre la limite. Une organisation de 200 personnes supprimée d'un coup (section 11.3) en laisse au plus 199 chez Microsoft, répartis sur les adresses de Graph. Même alors, la réponse serait `503`, que l'éditeur rejoue (écart E-g).

La limite ne vaut que si l'adresse IP est fiable. `LEON_IP_HEADER` doit être réglé avant que `LEON_PORTE_URL` soit donnée à un éditeur (section 14). Sans lui, toutes les requêtes partagent 3 000 lectures vides : n'importe qui peut les épuiser, et la porte répond alors `503` à toute livraison d'un abonnement absent des caches, jusqu'à la fin de la fenêtre. Le sondage de 15 minutes couvre. Le service Rust applique la même règle, /64 compris (chapitre 15).

### 6.2 Le code

```ts
// src/server/webhooks/hono-gate.ts
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Pool } from 'pg';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import { getConnector } from '@/server/connectors/registry';
import type { AnyConnector, WebhookSpec } from '@/server/connectors/types';
import { portePool } from '@/server/db/client';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { openSubscriptionSecret, porteKey } from './crypto';
import { parseBodyJson, porteBase, readPointer, secretHeaders, verifyWebhook } from './verify';

// La porte des webhooks, première mise en œuvre de son contrat (dossier agents, section 3). Elle reçoit une
// livraison, la vérifie sur le corps brut, la dépose par porte_deposer et répond. Son code n'appelle rien d'autre : ni
// pg-boss, ni jeton OAuth, ni LEON_CONNECTORS_KEY, ni la mémoire (contrat porte-surface.test.ts, sur les imports
// directs). Le processus, lui, est web : il charge le registre des connecteurs (getConnector, donc pipedream.ts) et
// reçoit toutes les variables de web. Le périmètre strict (un rôle, deux fonctions, une clé) est celui du service Rust
// (chapitre 15), qui fait exactement la même chose : mêmes adresses, mêmes étapes, mêmes réponses, mêmes limites
// (services/porte/fournisseurs.json), mêmes cas (services/porte/vecteurs.json, section « gate »). Une route publique :
// elle est dans PUBLIC (route-guards.db.test.ts).

// Les limites de la porte. providers-json.ts les recopie dans fournisseurs.json : le service Rust les lit là.
export const PORTE_LIMITS = {
  bodyMaxBytes: 262_144, // boite_entree_webhooks.corps
  headersMaxBytes: 8_192, // boite_entree_webhooks.entetes
  headerValueMaxChars: 1_024,
  echoMaxChars: 1_024,
  deliveryIdMaxChars: 200, // boite_entree_webhooks.livraison
  accountMaxChars: 200, // boite_entree_webhooks.compte
  refusalMinDelayMs: 200,
  lookupMissesPerIp: 300, // à mesurer ; une adresse IPv6 compte pour son /64
  lookupMissesUnknownIp: 3_000, // à mesurer ; sans LEON_IP_HEADER, toutes les requêtes partagent ce plafond
  lookupMissesWindowSeconds: 600, // fenêtre fixe, ouverte par la première lecture vide
  negativeCacheSeconds: 600,
  secretCacheSeconds: 60,
  cacheMaxEntries: 10_000,
} as const;

// Les seuls en-têtes gardés avec une livraison, plus le `deliveryHeader` de l'outil. Jamais celui qui porte la
// signature ou le jeton (secretHeaders), même s'il est dans la liste. Un outil dont `match` lit un en-tête l'ajoute
// ici (chapitre 10), puis on régénère fournisseurs.json.
export const PORTE_KEPT_HEADERS = ['content-type', 'user-agent', 'webhook-id', 'webhook-timestamp'] as const;

// Les secrets d'application qu'une WebhookSpec peut nommer (WebhookSecret, from: 'env'). Chaque variable est lue en
// toutes lettres : env-contract.test.ts ne reconnaît que cette forme. Une variable de plus : une ligne ici et une
// dans .env.example (contrat webhook-specs.test.ts).
export const APP_SECRETS: Readonly<Record<string, () => string | undefined>> = {
  LEON_OAUTH_HUBSPOT_SECRET: () => process.env.LEON_OAUTH_HUBSPOT_SECRET,
};

type Spec = WebhookSpec<Record<string, unknown>>;

export type Deposit = {
  outil: ProviderId;
  abonnement: string | null;
  compte: string | null;
  genre: 'livraison' | 'cycle';
  livraison: string;
  corps: string;
  entetes: Record<string, string>;
};

// Le contrat SQL de la porte (chapitre 01, section 11) : deux fonctions, accordées au seul rôle leon_porte.
export type PorteStore = {
  // porte_secret : null pour un abonnement inconnu, d'un autre outil, expiré, résilié, ou d'une personne partie.
  secret(outil: ProviderId, abonnement: string): Promise<{ tenantId: string; secret: string | null } | null>;
  // porte_deposer : les lignes écrites (0 : déjà reçue, ou personne n'écoute ce compte).
  deposit(deposit: Deposit): Promise<number>;
};

export function pgPorteStore(pool: Pool): PorteStore {
  return {
    async secret(outil, abonnement) {
      const { rows } = await pool.query<{ tenant_id: string; secret: string | null }>(
        'select tenant_id, secret from porte_secret($1, $2)',
        [outil, abonnement],
      );
      const row = rows[0];
      return row ? { tenantId: row.tenant_id, secret: row.secret } : null;
    },
    async deposit(deposit) {
      const { rows } = await pool.query<{ n: number }>(
        'select porte_deposer($1, $2, $3, $4, $5, $6, $7::jsonb) as n',
        [
          deposit.outil,
          deposit.abonnement,
          deposit.compte,
          deposit.genre,
          deposit.livraison,
          deposit.corps,
          JSON.stringify(deposit.entetes),
        ],
      );
      return rows[0]?.n ?? 0;
    },
  };
}

export type PorteDeps = {
  store: PorteStore | null; // null : DATABASE_URL_PORTE absente, la porte répond 503
  getConnector: (id: ProviderId) => AnyConnector | null;
  porteKey: () => Buffer | null;
  appSecret: (name: string) => string | undefined;
  base: () => string | null; // LEON_PORTE_URL sans « / » final
  clientIp: (headers: Headers) => string | null;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

// La clé d'une adresse IP pour la limite de débit. Une IPv4 telle quelle. Une IPv6 réduite à son /64, comme Better
// Auth le fait pour auth/rate-limit.ts:41-47 : un client qui tient un /64 en changerait à chaque requête. Une IPv4
// écrite en IPv6 (::ffff:a.b.c.d) compte comme l'IPv4. null : pas une adresse. Sans importer auth : la porte reste
// hors des sessions. Le service Rust calcule la même clé (chapitre 15).
export function ipKey(value: string): string | null {
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  const address = (value.split('%')[0] ?? value).toLowerCase(); // sans la zone (fe80::1%eth0)
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)?.[1];
  const [head = '', tail] = address.split('::');
  const split = (part: string) => (part === '' ? [] : part.split(':'));
  const left = split(head);
  const right = tail === undefined ? [] : split(tail);
  // Une IPv4 en fin d'adresse vaut deux groupes.
  const width = left.length + right.length + (dotted ? 1 : 0);
  const zeros = tail === undefined ? [] : Array<string>(Math.max(0, 8 - width)).fill('0');
  const groups = [...left, ...zeros, ...right].map((group) => group.replace(/^0+(?=.)/, ''));
  if (dotted && groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') return dotted;
  return `${groups.slice(0, 4).join(':')}::/64`;
}

// L'adresse IP du client, lue dans le seul en-tête que pose le proxy de confiance (comme auth/rate-limit.ts:41-47),
// réduite à sa clé.
function clientIp(headers: Headers): string | null {
  const value = env.LEON_IP_HEADER ? headers.get(env.LEON_IP_HEADER)?.trim() : undefined;
  return value ? ipKey(value) : null;
}

export const defaultPorteDeps = (): PorteDeps => ({
  store: portePool ? pgPorteStore(portePool) : null,
  getConnector,
  porteKey,
  appSecret: (name) => APP_SECRETS[name]?.() || undefined,
  base: () => porteBase(env.LEON_PORTE_URL),
  clientIp,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

// Une table bornée, à durée de vie.
// shortcut: en mémoire du processus. Juste tant que web a une seule instance (dossier agents, 4) ; avec plusieurs,
// chacune a ses caches et sa limite, ce qui reste sûr (ils ne font qu'éviter des lectures). À revoir avec le chantier
// « plusieurs instances ».
class Memo<T> {
  private readonly entries = new Map<string, { value: T; until: number }>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.until > now) return entry.value;
    this.entries.delete(key);
    return undefined;
  }

  set(key: string, value: T, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, until: now + this.ttlMs });
    if (this.entries.size <= PORTE_LIMITS.cacheMaxEntries) return;
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) this.entries.delete(oldest);
  }
}

// Des compteurs à fenêtre fixe : la fenêtre s'ouvre au premier compte et ne se prolonge pas, même si les comptes
// continuent. Même borne et même éviction que Memo.
class Counters {
  private readonly entries = new Map<string, { count: number; until: number }>();
  private readonly windowMs: number;

  constructor(windowSeconds: number) {
    this.windowMs = windowSeconds * 1000;
  }

  get(key: string, now: number): number {
    const entry = this.entries.get(key);
    return entry && entry.until > now ? entry.count : 0;
  }

  add(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (entry && entry.until > now) {
      entry.count += 1;
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, { count: 1, until: now + this.windowMs });
    if (this.entries.size <= PORTE_LIMITS.cacheMaxEntries) return;
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) this.entries.delete(oldest);
  }
}

type GateState = {
  secrets: Memo<{ tenantId: string; secret: string | null }>;
  unknown: Memo<true>;
  misses: Counters; // par clé d'adresse IP (ipKey) : lectures de porte_secret restées vides
};

const createGateState = (): GateState => ({
  secrets: new Memo(PORTE_LIMITS.secretCacheSeconds),
  unknown: new Memo(PORTE_LIMITS.negativeCacheSeconds),
  misses: new Counters(PORTE_LIMITS.lookupMissesWindowSeconds),
});

type Target = { outil: string; abonnement: string | null; cycle: boolean };

const OUTIL = /^[a-z][a-z0-9_]{1,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DELIVERY = /^[\x21-\x7e]{1,200}$/;
const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function specFor(deps: PorteDeps, target: Target): { outil: ProviderId; spec: Spec } | null {
  if (!OUTIL.test(target.outil)) return null;
  const outil = PROVIDER_IDS.find((id) => id === target.outil);
  const spec = outil ? deps.getConnector(outil)?.webhook : undefined;
  if (!outil || !spec) return null;
  const fits =
    target.abonnement === null
      ? spec.scope === 'app'
      : spec.scope === 'abonnement' && UUID.test(target.abonnement);
  if (!fits || (target.cycle && !spec.lifecycle)) return null;
  return { outil, spec };
}

// UTF-8 valide et sans octet nul, ou null.
function readText(bytes: Uint8Array): string | null {
  try {
    const text = DECODER.decode(bytes);
    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

const hasControl = (text: string) =>
  [...text].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });

// L'écho d'une poignée de main : du texte brut, jamais interprété par un navigateur.
function echo(c: Context, token: string): Response {
  if (token.length > PORTE_LIMITS.echoMaxChars || hasControl(token)) {
    return c.json({ error: 'Invalid request' }, 400);
  }
  return new Response(token, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}

const signsUri = (spec: Spec) =>
  spec.verification.mode !== 'standard-webhooks' &&
  spec.verification.mode !== 'jeton' &&
  spec.verification.signed.includes('uri');

type Secret = { kind: 'ok'; value: string } | { kind: 'refus' } | { kind: 'indisponible' };
const REFUS: Secret = { kind: 'refus' };
const INDISPONIBLE: Secret = { kind: 'indisponible' };

async function secretFor(
  deps: PorteDeps & { store: PorteStore },
  state: GateState,
  input: { outil: ProviderId; spec: Spec; abonnement: string | null; ip: string | null; now: number },
): Promise<Secret> {
  const { outil, spec, abonnement, ip, now } = input;
  const from = spec.verification.secret;
  if (spec.scope === 'abonnement' && abonnement !== null) {
    const key = `${outil}:${abonnement}`;
    let row = state.secrets.get(key, now);
    if (row === undefined) {
      if (state.unknown.get(key, now)) return REFUS;
      const source = ip ?? 'inconnue';
      const cap = ip ? PORTE_LIMITS.lookupMissesPerIp : PORTE_LIMITS.lookupMissesUnknownIp;
      // Limite atteinte : on ne lit plus la base pour cette source, mais on ne refuse pas non plus. Un abonnement
      // vivant hors cache doit pouvoir être rejoué par l'éditeur (503), jamais refusé comme une fausse signature.
      if (state.misses.get(source, now) >= cap) return INDISPONIBLE;
      const found = await deps.store.secret(outil, abonnement);
      if (!found) {
        state.unknown.set(key, true, now);
        state.misses.add(source, now);
        return REFUS;
      }
      row = found;
      state.secrets.set(key, row, now);
    }
    if (from.from === 'abonnement') {
      if (row.secret === null) {
        logError('porte.secret_absent', new Error('Subscription secret missing'), { outil, abonnement });
        return REFUS;
      }
      const key32 = deps.porteKey();
      if (!key32) {
        logError('porte.cle_absente', new Error('LEON_PORTE_KEY missing'), { outil });
        return INDISPONIBLE;
      }
      try {
        const ids = { tenantId: row.tenantId, abonnementId: abonnement };
        return { kind: 'ok', value: openSubscriptionSecret(row.secret, ids, key32) };
      } catch (error) {
        logError('porte.secret_illisible', error, { outil, abonnement });
        return REFUS;
      }
    }
  }
  if (from.from !== 'env') return REFUS; // une spec d'application signe toujours avec un secret d'application
  const value = deps.appSecret(from.name);
  if (!value) {
    logError('porte.secret_appli_absent', new Error('App secret missing'), { outil });
    return INDISPONIBLE;
  }
  return { kind: 'ok', value };
}

// Le compte d'un webhook d'application : une seule valeur. Sinon, l'événement du journal qui dit pourquoi : deux
// événements distincts, pour qu'une alerte Sentry voie des lots à plusieurs comptes s'ils existent (section 12.2).
type Account = { compte: string } | { event: 'porte.compte_illisible' | 'porte.comptes_multiples' };

function accountOf(spec: Spec, corps: string): Account {
  const values = spec.accountPointer
    ? readPointer(parseBodyJson(spec.bodyFormat, corps), spec.accountPointer)
    : null;
  if (values && new Set(values).size > 1) return { event: 'porte.comptes_multiples' };
  const [compte] = values ?? [];
  return compte && compte.length <= PORTE_LIMITS.accountMaxChars
    ? { compte }
    : { event: 'porte.compte_illisible' };
}

function slackChallenge(spec: Spec, corps: string): string | null {
  const parsed = parseBodyJson(spec.bodyFormat, corps) as { type?: unknown; challenge?: unknown } | undefined;
  return parsed?.type === 'url_verification' && typeof parsed.challenge === 'string'
    ? parsed.challenge
    : null;
}

function deliveryId(spec: Spec, headers: Record<string, string>, bytes: Uint8Array): string {
  const given = spec.deliveryHeader ? headers[spec.deliveryHeader] : undefined;
  return given !== undefined && DELIVERY.test(given)
    ? given
    : createHash('sha256').update(bytes).digest('hex');
}

function keptHeaders(spec: Spec, headers: Record<string, string>): Record<string, string> {
  const banned = new Set(secretHeaders(spec.verification));
  const wanted = new Set<string>([
    ...PORTE_KEPT_HEADERS,
    ...(spec.deliveryHeader ? [spec.deliveryHeader] : []),
  ]);
  const kept = Object.fromEntries(
    Object.entries(headers)
      .filter(([name]) => wanted.has(name) && !banned.has(name))
      .filter(([, value]) => value.length <= PORTE_LIMITS.headerValueMaxChars)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return Buffer.byteLength(JSON.stringify(kept)) <= PORTE_LIMITS.headersMaxBytes ? kept : {};
}

async function receive(
  c: Context,
  deps: PorteDeps,
  state: GateState,
  target: Target,
): Promise<Response> {
  const started = deps.now();
  // Le refus uniforme : même réponse, et au plus tôt au même délai, quelle qu'en soit la raison.
  const refuse = async () => {
    const waited = deps.now() - started;
    if (waited < PORTE_LIMITS.refusalMinDelayMs) {
      await deps.sleep(PORTE_LIMITS.refusalMinDelayMs - waited);
    }
    return c.json({ error: 'Invalid signature' }, 401);
  };
  const unavailable = () => c.json({ error: 'Unavailable' }, 503);

  const found = specFor(deps, target);
  if (!found) return refuse();
  const { outil, spec } = found;

  // Microsoft Graph vérifie l'adresse pendant la création de l'abonnement : la ligne n'existe pas encore (E-k).
  const token = c.req.query('validationToken');
  if (spec.handshake === 'echo-validation-token' && token !== undefined) return echo(c, token);

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const corps = readText(bytes);
  if (corps === null) return c.json({ error: 'Invalid request' }, 400);
  const { store } = deps;
  if (!store) return unavailable();
  const base = deps.base();
  if (base === null && signsUri(spec)) return unavailable();

  try {
    const ip = deps.clientIp(c.req.raw.headers);
    const input = { outil, spec, abonnement: target.abonnement, ip, now: started };
    const secret = await secretFor({ ...deps, store }, state, input);
    if (secret.kind === 'refus') return await refuse();
    if (secret.kind === 'indisponible') return unavailable();

    const headers = Object.fromEntries(c.req.raw.headers);
    const path = [`/h/${outil}`, target.abonnement && `/${target.abonnement}`, target.cycle && '/cycle']
      .filter(Boolean)
      .join('');
    const verdict = verifyWebhook({
      verification: spec.verification,
      bodyFormat: spec.bodyFormat,
      secret: secret.value,
      method: c.req.method,
      uri: `${base ?? ''}${path}${new URL(c.req.url).search}`,
      headers,
      body: bytes,
      nowMs: started,
    });
    if (!verdict.ok) return await refuse();

    if (spec.handshake === 'slack-challenge') {
      const challenge = slackChallenge(spec, corps);
      if (challenge !== null) return echo(c, challenge);
    }

    let compte: string | null = null;
    if (spec.scope === 'app') {
      const account = accountOf(spec, corps);
      if ('event' in account) {
        // Signée par l'éditeur, mais impossible à ranger : rien n'est déposé, l'éditeur ne doit pas réessayer.
        logError(account.event, new Error('Account not found'), { outil });
        return c.body(null, 202);
      }
      compte = account.compte;
    }

    await store.deposit({
      outil,
      abonnement: target.abonnement,
      compte,
      genre: target.cycle ? 'cycle' : 'livraison',
      livraison: deliveryId(spec, headers, bytes),
      corps,
      entetes: keptHeaders(spec, headers),
    });
    return c.body(null, 202);
  } catch (error) {
    // Une panne de base n'est pas un refus : l'éditeur réessaiera.
    logError('porte.base', error, { outil });
    return unavailable();
  }
}

export function createPorteRoutes(deps: PorteDeps = defaultPorteDeps()): Hono {
  const state = createGateState();
  const routes = new Hono();
  // Avant toute lecture : un corps de plus de 256 Kio ne tient pas dans boite_entree_webhooks.corps. Journalisé avec
  // l'outil (s'il a la forme d'un identifiant) : un éditeur qui enverrait des corps trop gros se voit dans Sentry
  // avant de désactiver son webhook.
  const limit = bodyLimit({
    maxSize: PORTE_LIMITS.bodyMaxBytes,
    onError: (c) => {
      const outil = c.req.param('outil') ?? '';
      logError('porte.trop_gros', new Error('Request too large'), {
        outil: OUTIL.test(outil) ? outil : 'inconnu',
      });
      return c.json({ error: 'Request too large' }, 413);
    },
  });
  routes.post('/h/:outil', limit, (c) =>
    receive(c, deps, state, { outil: c.req.param('outil'), abonnement: null, cycle: false }),
  );
  routes.post('/h/:outil/:abonnement', limit, (c) =>
    receive(c, deps, state, {
      outil: c.req.param('outil'),
      abonnement: c.req.param('abonnement'),
      cycle: false,
    }),
  );
  routes.post('/h/:outil/:abonnement/cycle', limit, (c) =>
    receive(c, deps, state, {
      outil: c.req.param('outil'),
      abonnement: c.req.param('abonnement'),
      cycle: true,
    }),
  );
  return routes;
}
```

À savoir :

- `Object.fromEntries(c.req.raw.headers)` rend des noms en minuscules (l'objet `Headers` les normalise) ; deux en-têtes du même nom sont joints par « , ».
- Un abonnement dont `porte_secret` rend un secret nul alors que la spec attend `from: 'abonnement'` est une incohérence de code : journalisée, refusée.
- `porte_deposer` rend 0 pour une livraison rejouée. La porte répond `202` comme pour une livraison neuve : l'éditeur ne doit pas réessayer (chapitre 01, section 11).
- `logError` ne reçoit que des identifiants (outil, abonnement), jamais un en-tête, un corps ou un secret (`src/server/log.ts:37`).
- Le refus uniforme attend par `deps.sleep` : un test le remplace par une fonction qui note la durée demandée.
- Les caches ne sont jamais invalidés : un secret ne change jamais pour une adresse donnée, parce que chaque création ou recréation d'abonnement prend une adresse neuve (section 11, écart E-o). Une adresse mise en cache négatif est celle d'une ligne morte ou inconnue, qui ne revivra pas. Seule exception : une livraison arrivée entre la réponse de l'éditeur et l'écriture de la ligne (section 11.2, « À savoir »).
- Le cache positif garde une ligne 60 secondes après sa mort. Pendant ce temps, la porte accepte encore une livraison bien signée ; `porte_deposer` ne dépose rien pour un abonnement qui n'est plus en service, et la porte répond `202`.

### 6.3 Ce qui change autour

**`src/server/env.ts`** (existe, `EnvSchema` `:30`). Trois variables, après `LEON_CONNECTORS_KEY` (`:74`), et un contrôle croisé dans `superRefine` :

```ts
    // La porte des webhooks (dossier agents, chapitre 03). L'adresse du rôle Postgres leon_porte, qui n'exécute que
    // porte_secret et porte_deposer. Absente : la porte répond 503, le sondage de 15 minutes continue.
    DATABASE_URL_PORTE: z.preprocess(emptyIsAbsent, z.string().regex(/^postgres(ql)?:\/\//).optional()),
    // Chiffre les secrets d'abonnement : 32 octets en base64. Jamais la valeur de LEON_CONNECTORS_KEY.
    LEON_PORTE_KEY: z.preprocess(
      emptyIsAbsent,
      z
        .string()
        .refine((v) => Buffer.from(v, 'base64').length === 32, 'LEON_PORTE_KEY : 32 octets en base64')
        .optional(),
    ),
    // L'adresse publique donnée aux éditeurs (un domaine à part, chapitre 13). Hors https, aucun abonnement n'est
    // créé : aucun éditeur n'atteindrait une adresse locale.
    LEON_PORTE_URL: z.preprocess(emptyIsAbsent, z.url({ protocol: /^https?$/ }).optional()),
```

```ts
    // Dans superRefine, avant le contrôle des modèles : la porte ne doit jamais pouvoir lire les clés des outils.
    if (env.LEON_PORTE_KEY !== undefined && env.LEON_PORTE_KEY === env.LEON_CONNECTORS_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['LEON_PORTE_KEY'],
        message: 'LEON_PORTE_KEY : une clé à part, jamais celle de LEON_CONNECTORS_KEY',
      });
    }
```

**`src/server/db/client.ts`** (existe, pool `:12`). Le chapitre 13 y change `max` selon `runsWorkers()` ; ce chapitre ajoute seulement le second pool :

```ts
import { logError } from '../log';

// La porte des webhooks (dossier agents, 7.4) : le rôle leon_porte, qui n'exécute que porte_secret et porte_deposer.
// 2 connexions, ouvertes à la première requête. Absent sans DATABASE_URL_PORTE : la porte répond 503. Seul
// webhooks/hono-gate.ts s'en sert (contrat porte-surface.test.ts).
const globalForPorte = globalThis as { leonPortePool?: Pool | null };
globalForPorte.leonPortePool ??= env.DATABASE_URL_PORTE
  ? new Pool({ connectionString: env.DATABASE_URL_PORTE, max: 2, connectionTimeoutMillis: 5_000 })
  : null;
// Une connexion inactive coupée par la base ne doit pas tuer le processus.
globalForPorte.leonPortePool?.on('error', (error) => logError('porte.pool', error));
export const portePool = globalForPorte.leonPortePool;
```

`log.ts` n'importe que `@sentry/nextjs` et `drizzle-orm` (`src/server/log.ts:1-2`) : pas de cycle. L'écouteur `error` s'enregistre à chaque import du module ; avec le rechargement à chaud, il peut s'en ajouter quelques-uns, sans effet que des lignes de journal en double.

**`src/server/api/app.ts`** (existe). Une ligne, après les routes OAuth des connecteurs (`:48`) :

```ts
import { createPorteRoutes } from '@/server/webhooks/hono-gate';
// …
// La porte des webhooks : publique par nature, elle vérifie la signature de l'éditeur (chapitre 03).
app.route('/v1/porte', createPorteRoutes());
```

**`next.config.ts`** (existe, `:6-31`, aucune réécriture aujourd'hui). Dans `nextConfig`, après `redirects()` :

```ts
  // La porte des webhooks (dossier agents, section 3) : l'adresse donnée aux éditeurs, <LEON_PORTE_URL>/h/…, ne change
  // jamais. Tant que la porte tient dans web, elle mène à la route Hono ; le service Rust reprendra ensuite le domaine.
  async rewrites() {
    return [{ source: '/h/:chemin*', destination: '/api/v1/porte/h/:chemin*' }];
  },
```

`/h` n'est ni dans `OLD_PATHS` (`src/lib/old-paths.ts`) ni une page de `src/app`. Ce que voit Hono après la réécriture (l'adresse d'origine ou la réécrite) est à vérifier au premier essai (« Ce que je n'ai pas vérifié ») : la vérification n'en dépend pas, `uri` est rebâtie à partir de `LEON_PORTE_URL`.

**`.env.example`** (existe). Les trois lignes du chapitre 01 (section 15.4), recopiées. Pas de `LEON_PORTE_SECRET_<OUTIL>` : aucun outil du premier lot ne signe avec un secret propre à la porte (HubSpot signe avec `LEON_OAUTH_HUBSPOT_SECRET`, déjà documentée). La ligne générique du chapitre 01 n'est pas un nom de variable ; une ligne réelle (`LEON_PORTE_SECRET_LINEAR=`) sans code qui la lise ferait échouer `env-contract.test.ts` (« ne documente que des variables lues »). La première viendra avec Linear ou GitHub (chapitre 10), avec sa ligne dans `APP_SECRETS` (écart E-h).

```bash
# La porte des webhooks. DATABASE_URL_PORTE : le rôle leon_porte (deux fonctions, aucune table) ; vide, la porte répond
# 503 et le sondage de 15 minutes continue. LEON_PORTE_KEY : chiffre les secrets d'abonnement (32 octets en base64 :
# openssl rand -base64 32), jamais commitée. LEON_PORTE_URL : l'adresse publique donnée aux éditeurs.
DATABASE_URL_PORTE=postgres://leon_porte:leon_porte@127.0.0.1:54329/leon
LEON_PORTE_KEY=
LEON_PORTE_URL=http://localhost:3000
```

**`src/test/contracts/route-guards.db.test.ts`** (existe, `PUBLIC` `:24-29`) : la ligne du chapitre 01, recopiée :

```ts
  /^\/api\/v1\/porte\//, // la porte en Hono (chapitre 03) : elle vérifie la signature de l'éditeur, pas une session
```

**`biome.json`** (existe). Les deux fichiers générés sortent du formateur : `JSON.stringify` met un élément de tableau par ligne, Biome les voudrait sur une seule et `pnpm lint` échouerait. Dans `files.includes`, après `"!pnpm-lock.yaml"` :

```json
      "!services/porte/fournisseurs.json",
      "!services/porte/vecteurs.json"
```

## 7. `fournisseurs.json` et `vecteurs.json` : le contrat avec le service Rust

Deux fichiers, dans `services/porte/` (à créer, avec la porte en Hono). Ils sont **générés depuis le TypeScript**, commités, et comparés en CI à ce que produit le générateur (architecture, section 3 : « le sens est TypeScript vers Rust »). Le service Rust du chapitre 15 les lit tels quels : `fournisseurs.json` au démarrage (il refuse de démarrer si `version` n'est pas celle qu'il connaît), `vecteurs.json` dans ses tests (`cargo test`).

Règles communes :

- UTF-8, objets JSON indentés de deux espaces, une fin de ligne finale. Les clés suivent le nom de ce qu'elles décrivent : les champs des types TypeScript (`scope`, `verification`…) en anglais, les paramètres de `porte_deposer` (`outil`, `abonnement`…) en français, sans `p_`.
- Un champ facultatif absent n'est pas écrit (pas de `null`), sauf dans les dépôts attendus, où `abonnement` et `compte` valent `null` comme les paramètres SQL.
- `version` change à toute modification qui oblige le Rust à changer de code (un champ, un mode, une étape). Ajouter un outil ou un vecteur ne la change pas.
- Les fichiers sont hors de Biome (section 6.3) et hors de tout traitement à la main : on les refait par `pnpm porte:generer`.

### 7.1 `fournisseurs.json`

Ce que la porte sait de chaque outil qui a un `webhook`. Rien d'autre : ni `match`, ni `subscribe`, qui restent dans le worker.

| Champ | Type | Sens |
|---|---|---|
| `version` | entier | `1` |
| `generatedBy` | texte | rappel : fichier généré |
| `paths` | objet | les trois formes d'adresse publique ; `{outil}` : un identifiant d'outil, `{abonnement}` : un UUID en minuscules |
| `limits` | objet | `PORTE_LIMITS` (section 6.2), champ pour champ |
| `keptHeaders` | tableau de textes | `PORTE_KEPT_HEADERS`, en minuscules |
| `tools` | objet | une entrée par outil, triées par identifiant |
| `tools.<outil>.scope` | `"app"` ou `"abonnement"` | la forme d'adresse admise |
| `tools.<outil>.bodyFormat` | `"json"` ou `"form-payload"` | comment lire le corps pour un pointeur |
| `tools.<outil>.accountPointer` | texte, facultatif | `scope: "app"` seulement |
| `tools.<outil>.deliveryHeader` | texte, facultatif | l'en-tête d'identifiant de livraison |
| `tools.<outil>.handshake` | texte, facultatif | `"echo-validation-token"` ou `"slack-challenge"` |
| `tools.<outil>.lifecycle` | booléen | vrai : l'adresse `…/cycle` est admise |
| `tools.<outil>.verification` | objet | un `WebhookVerification` (section 3), tel quel |

Un secret `{ "from": "env", "name": "…" }` nomme la variable d'environnement que le service Rust doit recevoir, et seulement elle. `{ "from": "abonnement" }` veut dire : `porte_secret`, puis déchiffrement par `LEON_PORTE_KEY`.

L'exemple complet, tel que le générateur le produit avec le premier lot (section 12) :

```json
{
  "version": 1,
  "generatedBy": "pnpm porte:generer (src/server/webhooks/providers-json.ts) : ne pas modifier à la main",
  "paths": {
    "app": "/h/{outil}",
    "abonnement": "/h/{outil}/{abonnement}",
    "cycle": "/h/{outil}/{abonnement}/cycle"
  },
  "limits": {
    "bodyMaxBytes": 262144,
    "headersMaxBytes": 8192,
    "headerValueMaxChars": 1024,
    "echoMaxChars": 1024,
    "deliveryIdMaxChars": 200,
    "accountMaxChars": 200,
    "refusalMinDelayMs": 200,
    "lookupMissesPerIp": 300,
    "lookupMissesUnknownIp": 3000,
    "lookupMissesWindowSeconds": 600,
    "negativeCacheSeconds": 600,
    "secretCacheSeconds": 60,
    "cacheMaxEntries": 10000
  },
  "keptHeaders": [
    "content-type",
    "user-agent",
    "webhook-id",
    "webhook-timestamp"
  ],
  "tools": {
    "fathom": {
      "scope": "abonnement",
      "bodyFormat": "json",
      "deliveryHeader": "webhook-id",
      "lifecycle": false,
      "verification": {
        "mode": "standard-webhooks",
        "secret": {
          "from": "abonnement"
        }
      }
    },
    "hubspot": {
      "scope": "app",
      "bodyFormat": "json",
      "accountPointer": "/*/portalId",
      "lifecycle": false,
      "verification": {
        "mode": "hmac-sha256",
        "header": "x-hubspot-signature-v3",
        "encoding": "base64",
        "signed": [
          "method",
          "uri",
          "body",
          "timestamp"
        ],
        "separator": "",
        "timestamp": {
          "source": "header",
          "name": "x-hubspot-request-timestamp",
          "unit": "ms",
          "toleranceSeconds": 300
        },
        "secret": {
          "from": "env",
          "name": "LEON_OAUTH_HUBSPOT_SECRET"
        }
      }
    },
    "outlook": {
      "scope": "abonnement",
      "bodyFormat": "json",
      "handshake": "echo-validation-token",
      "lifecycle": true,
      "verification": {
        "mode": "jeton",
        "bodyPointer": "/value/*/clientState",
        "secret": {
          "from": "abonnement"
        }
      }
    }
  }
}
```

### 7.2 `vecteurs.json`

Trois sections. Chaque mise en œuvre doit passer chaque cas de chaque section.

**`verification`** : l'interprète seul (section 4). Une entrée :

| Champ | Sens |
|---|---|
| `name` | le cas, en français |
| `verification` | un `WebhookVerification` |
| `bodyFormat` | `"json"` ou `"form-payload"` |
| `secret` | le secret en clair |
| `method`, `uri` | la méthode et l'adresse publique appelée |
| `headers` | les en-têtes, noms en minuscules |
| `body` | le corps, en texte UTF-8 (les octets sont son encodage UTF-8) |
| `now` | l'heure, en millisecondes depuis 1970 |
| `expected` | `"ok"`, ou la raison du refus : `"entete"`, `"signature"`, `"horodatage"`, `"secret"`, `"format"` |

**`decryption`** : le format `v1:` (section 5). Une entrée : `key` (32 octets en base64), `aad`, `stored`, `plain` (le texte attendu, ou `null` : le déchiffrement doit échouer).

**`gate`** : la porte entière (section 6.1), sans base ni réseau. `env` donne les variables (`LEON_PORTE_URL`, `LEON_PORTE_KEY`, les secrets d'application ; une valeur vide vaut absente) ; un cas peut en remplacer dans son propre `env`. `store` remplace la base :

- `porte_secret(outil, id)` rend `{ tenant_id, secret: stored }` si `store.subscriptions` a une ligne de même `outil` et de même `id`, sinon rien ;
- `porte_deposer(…)` note ses sept arguments et rend 1.

La requête : `request.method`, `request.path` (l'adresse publique, `/h/…`), `request.query` (sans `?`, vide si aucune), `request.headers`, `request.body`. L'adresse IP du client est fixe et la limite n'est jamais atteinte ; le délai du refus uniforme n'est pas mesuré. Attendu : `expected.status`, `expected.body` (texte exact), `expected.contentType` s'il est donné, et `expected.deposits`, la liste exacte des appels à `porte_deposer`, dans l'ordre, avec `entetes` comparé comme un objet.

L'exemple complet ci-dessous est un extrait du fichier généré : toutes ses sections, avec 5 des 22 cas de vérification, les 2 cas de déchiffrement et 5 des 11 cas de porte. Ses signatures, chiffrés et sommes ont été calculés (Node, `node:crypto`), puis rejoués sur le code des sections 4, 5 et 6 : 22 cas de vérification sur 22, 11 cas de porte sur 11. Exemple fictif : secrets, clés, identifiants et corps sont inventés.

```json
{
  "version": 1,
  "generatedBy": "pnpm porte:generer (src/server/webhooks/providers-json.ts) : ne pas modifier à la main",
  "verification": [
    {
      "name": "outlook : clientState juste dans chaque notification",
      "verification": {
        "mode": "jeton",
        "bodyPointer": "/value/*/clientState",
        "secret": {
          "from": "abonnement"
        }
      },
      "bodyFormat": "json",
      "secret": "exemple-fictif-clientstate-0123456789abcde",
      "method": "POST",
      "uri": "https://porte.exemple.test/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f",
      "headers": {
        "content-type": "application/json"
      },
      "body": "{\"value\":[{\"subscriptionId\":\"abonnement-exemple-1\",\"clientState\":\"exemple-fictif-clientstate-0123456789abcde\",\"changeType\":\"created\",\"resource\":\"Users('u1')/Messages('m1')\",\"resourceData\":{\"id\":\"AAMkAGI2-exemple-fictif-1\"}},{\"subscriptionId\":\"abonnement-exemple-1\",\"clientState\":\"exemple-fictif-clientstate-0123456789abcde\",\"changeType\":\"created\",\"resource\":\"Users('u1')/Messages('m2')\",\"resourceData\":{\"id\":\"AAMkAGI2-exemple-fictif-2\"}}]}",
      "now": 1795165200000,
      "expected": "ok"
    },
    {
      "name": "hubspot : méthode, adresse, corps et horodatage signés",
      "verification": {
        "mode": "hmac-sha256",
        "header": "x-hubspot-signature-v3",
        "encoding": "base64",
        "signed": [
          "method",
          "uri",
          "body",
          "timestamp"
        ],
        "separator": "",
        "timestamp": {
          "source": "header",
          "name": "x-hubspot-request-timestamp",
          "unit": "ms",
          "toleranceSeconds": 300
        },
        "secret": {
          "from": "env",
          "name": "LEON_OAUTH_HUBSPOT_SECRET"
        }
      },
      "bodyFormat": "json",
      "secret": "exemple-fictif-secret-client-hubspot",
      "method": "POST",
      "uri": "https://porte.exemple.test/h/hubspot",
      "headers": {
        "content-type": "application/json",
        "x-hubspot-request-timestamp": "1795165198000",
        "x-hubspot-signature-v3": "GWs7KXRb9x+a8cyZCCCKBhD2pgUQxb+ZXtoS0SN16hQ="
      },
      "body": "[{\"eventId\":1001,\"subscriptionId\":2001,\"portalId\":12345678,\"occurredAt\":1795165190000,\"subscriptionType\":\"object.creation\",\"objectTypeId\":\"0-46\",\"objectId\":3001}]",
      "now": 1795165200000,
      "expected": "ok"
    },
    {
      "name": "hubspot : la même requête reçue sur une autre adresse",
      "verification": {
        "mode": "hmac-sha256",
        "header": "x-hubspot-signature-v3",
        "encoding": "base64",
        "signed": [
          "method",
          "uri",
          "body",
          "timestamp"
        ],
        "separator": "",
        "timestamp": {
          "source": "header",
          "name": "x-hubspot-request-timestamp",
          "unit": "ms",
          "toleranceSeconds": 300
        },
        "secret": {
          "from": "env",
          "name": "LEON_OAUTH_HUBSPOT_SECRET"
        }
      },
      "bodyFormat": "json",
      "secret": "exemple-fictif-secret-client-hubspot",
      "method": "POST",
      "uri": "https://porte.exemple.test/h/hubspot?x=1",
      "headers": {
        "content-type": "application/json",
        "x-hubspot-request-timestamp": "1795165198000",
        "x-hubspot-signature-v3": "GWs7KXRb9x+a8cyZCCCKBhD2pgUQxb+ZXtoS0SN16hQ="
      },
      "body": "[{\"eventId\":1001,\"subscriptionId\":2001,\"portalId\":12345678,\"occurredAt\":1795165190000,\"subscriptionType\":\"object.creation\",\"objectTypeId\":\"0-46\",\"objectId\":3001}]",
      "now": 1795165200000,
      "expected": "signature"
    },
    {
      "name": "fathom : standard-webhooks",
      "verification": {
        "mode": "standard-webhooks",
        "secret": {
          "from": "abonnement"
        }
      },
      "bodyFormat": "json",
      "secret": "whsec_ZXhlbXBsZS1maWN0aWYtZmF0aG9tLTMyLW9jdGV0cyE=",
      "method": "POST",
      "uri": "https://porte.exemple.test/h/fathom/9c4e1a27-8b3d-4e6f-a0b1-c2d3e4f5a6b7",
      "headers": {
        "content-type": "application/json",
        "webhook-id": "msg_exemple_fictif_0001",
        "webhook-timestamp": "1795165198",
        "webhook-signature": "v1,/3J0tD0qA5b//XHWXngsIpnG0RnKm1RadU3H3RtNZgY="
      },
      "body": "{\"recording_id\":4242,\"title\":\"Exemple fictif\",\"created_at\":\"2026-11-20T08:55:00Z\"}",
      "now": 1795165200000,
      "expected": "ok"
    },
    {
      "name": "horodatage dans le corps, tolérance de 60 secondes",
      "verification": {
        "mode": "hmac-sha256",
        "header": "x-signature-exemple",
        "encoding": "hex",
        "signed": [
          "body"
        ],
        "separator": "",
        "timestamp": {
          "source": "body",
          "name": "/webhookTimestamp",
          "unit": "ms",
          "toleranceSeconds": 60
        },
        "secret": {
          "from": "abonnement"
        }
      },
      "bodyFormat": "json",
      "secret": "exemple-fictif-secret",
      "method": "POST",
      "uri": "https://porte.exemple.test/h/exemple",
      "headers": {
        "content-type": "application/json",
        "x-signature-exemple": "aafdc04788ffa74bbd1b91e92ffae616a686bd2feea6f3d99a579660fed2a504"
      },
      "body": "{\"action\":\"create\",\"type\":\"Issue\",\"organizationId\":\"org-exemple\",\"data\":{\"id\":\"iss-exemple\"},\"webhookTimestamp\":1795165199000}",
      "now": 1795165200000,
      "expected": "ok"
    }
  ],
  "decryption": [
    {
      "name": "secret d’un abonnement Outlook",
      "key": "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=",
      "aad": "0b7a3c52-6f0e-4d9a-9e1f-2a4c5b6d7e8f:5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f",
      "stored": "v1:AQEBAQEBAQEBAQEB:Ntdy2t7CLUJQv0o3cBPEdg:3AjkCGOLrV13Jzy5jOmtcNCsoaSRswmhmNYkpB3za-YGTjFuH7mP4wJd",
      "plain": "exemple-fictif-clientstate-0123456789abcde"
    },
    {
      "name": "le même secret lu pour un autre abonnement : refusé",
      "key": "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=",
      "aad": "0b7a3c52-6f0e-4d9a-9e1f-2a4c5b6d7e8f:9c4e1a27-8b3d-4e6f-a0b1-c2d3e4f5a6b7",
      "stored": "v1:AQEBAQEBAQEBAQEB:Ntdy2t7CLUJQv0o3cBPEdg:3AjkCGOLrV13Jzy5jOmtcNCsoaSRswmhmNYkpB3za-YGTjFuH7mP4wJd",
      "plain": null
    }
  ],
  "gate": {
    "env": {
      "LEON_PORTE_URL": "https://porte.exemple.test",
      "LEON_PORTE_KEY": "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=",
      "LEON_OAUTH_HUBSPOT_SECRET": "exemple-fictif-secret-client-hubspot"
    },
    "store": {
      "subscriptions": [
        {
          "outil": "outlook",
          "id": "5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f",
          "tenantId": "0b7a3c52-6f0e-4d9a-9e1f-2a4c5b6d7e8f",
          "stored": "v1:AQEBAQEBAQEBAQEB:Ntdy2t7CLUJQv0o3cBPEdg:3AjkCGOLrV13Jzy5jOmtcNCsoaSRswmhmNYkpB3za-YGTjFuH7mP4wJd"
        },
        {
          "outil": "fathom",
          "id": "9c4e1a27-8b3d-4e6f-a0b1-c2d3e4f5a6b7",
          "tenantId": "0b7a3c52-6f0e-4d9a-9e1f-2a4c5b6d7e8f",
          "stored": "v1:AgICAgICAgICAgIC:f47B5yN3vE5-Qhyn9yeniA:jXyVET0dyhyHj3lolOggfA1cRDnWpDaUWasmnLm4nJ1Q8ch-n6fHkmO3rMf2yroQbFk"
        }
      ]
    },
    "cases": [
      {
        "name": "outlook : écho du jeton de validation",
        "request": {
          "method": "POST",
          "path": "/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f",
          "query": "validationToken=jeton%20de%20validation%20exemple",
          "headers": {
            "content-type": "text/plain"
          },
          "body": ""
        },
        "now": 1795165200000,
        "expected": {
          "status": 200,
          "contentType": "text/plain; charset=utf-8",
          "body": "jeton de validation exemple",
          "deposits": []
        }
      },
      {
        "name": "outlook : livraison juste",
        "request": {
          "method": "POST",
          "path": "/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f",
          "query": "",
          "headers": {
            "content-type": "application/json",
            "user-agent": "exemple-fictif"
          },
          "body": "{\"value\":[{\"subscriptionId\":\"abonnement-exemple-1\",\"clientState\":\"exemple-fictif-clientstate-0123456789abcde\",\"changeType\":\"created\",\"resource\":\"Users('u1')/Messages('m1')\",\"resourceData\":{\"id\":\"AAMkAGI2-exemple-fictif-1\"}},{\"subscriptionId\":\"abonnement-exemple-1\",\"clientState\":\"exemple-fictif-clientstate-0123456789abcde\",\"changeType\":\"created\",\"resource\":\"Users('u1')/Messages('m2')\",\"resourceData\":{\"id\":\"AAMkAGI2-exemple-fictif-2\"}}]}"
        },
        "now": 1795165200000,
        "expected": {
          "status": 202,
          "body": "",
          "deposits": [
            {
              "outil": "outlook",
              "abonnement": "5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f",
              "compte": null,
              "genre": "livraison",
              "livraison": "e80a1ac0c7a48455a7c93692772a7c4bbafdef4510bd35421e889a1a04aeecbf",
              "corps": "{\"value\":[{\"subscriptionId\":\"abonnement-exemple-1\",\"clientState\":\"exemple-fictif-clientstate-0123456789abcde\",\"changeType\":\"created\",\"resource\":\"Users('u1')/Messages('m1')\",\"resourceData\":{\"id\":\"AAMkAGI2-exemple-fictif-1\"}},{\"subscriptionId\":\"abonnement-exemple-1\",\"clientState\":\"exemple-fictif-clientstate-0123456789abcde\",\"changeType\":\"created\",\"resource\":\"Users('u1')/Messages('m2')\",\"resourceData\":{\"id\":\"AAMkAGI2-exemple-fictif-2\"}}]}",
              "entetes": {
                "content-type": "application/json",
                "user-agent": "exemple-fictif"
              }
            }
          ]
        }
      },
      {
        "name": "hubspot : livraison juste, deux organisations écoutent le compte",
        "request": {
          "method": "POST",
          "path": "/h/hubspot",
          "query": "",
          "headers": {
            "content-type": "application/json",
            "x-hubspot-request-timestamp": "1795165198000",
            "x-hubspot-signature-v3": "GWs7KXRb9x+a8cyZCCCKBhD2pgUQxb+ZXtoS0SN16hQ="
          },
          "body": "[{\"eventId\":1001,\"subscriptionId\":2001,\"portalId\":12345678,\"occurredAt\":1795165190000,\"subscriptionType\":\"object.creation\",\"objectTypeId\":\"0-46\",\"objectId\":3001}]"
        },
        "now": 1795165200000,
        "expected": {
          "status": 202,
          "body": "",
          "deposits": [
            {
              "outil": "hubspot",
              "abonnement": null,
              "compte": "12345678",
              "genre": "livraison",
              "livraison": "4b907cad4007b804f03ef58dee38b25a571368597faa1056dd793f4f039c1e9f",
              "corps": "[{\"eventId\":1001,\"subscriptionId\":2001,\"portalId\":12345678,\"occurredAt\":1795165190000,\"subscriptionType\":\"object.creation\",\"objectTypeId\":\"0-46\",\"objectId\":3001}]",
              "entetes": {
                "content-type": "application/json"
              }
            }
          ]
        }
      },
      {
        "name": "hubspot : deux comptes dans une même livraison",
        "request": {
          "method": "POST",
          "path": "/h/hubspot",
          "query": "",
          "headers": {
            "content-type": "application/json",
            "x-hubspot-request-timestamp": "1795165198000",
            "x-hubspot-signature-v3": "dtZtn6GSBPoIvJ0fiEq+DPyxgKLA4OKQOYQ8R0A5/kA="
          },
          "body": "[{\"portalId\":12345678,\"objectId\":1},{\"portalId\":87654321,\"objectId\":2}]"
        },
        "now": 1795165200000,
        "expected": {
          "status": 202,
          "body": "",
          "deposits": []
        }
      },
      {
        "name": "fathom : livraison juste, identifiée par webhook-id",
        "request": {
          "method": "POST",
          "path": "/h/fathom/9c4e1a27-8b3d-4e6f-a0b1-c2d3e4f5a6b7",
          "query": "",
          "headers": {
            "content-type": "application/json",
            "webhook-id": "msg_exemple_fictif_0001",
            "webhook-timestamp": "1795165198",
            "webhook-signature": "v1,/3J0tD0qA5b//XHWXngsIpnG0RnKm1RadU3H3RtNZgY="
          },
          "body": "{\"recording_id\":4242,\"title\":\"Exemple fictif\",\"created_at\":\"2026-11-20T08:55:00Z\"}"
        },
        "now": 1795165200000,
        "expected": {
          "status": 202,
          "body": "",
          "deposits": [
            {
              "outil": "fathom",
              "abonnement": "9c4e1a27-8b3d-4e6f-a0b1-c2d3e4f5a6b7",
              "compte": null,
              "genre": "livraison",
              "livraison": "msg_exemple_fictif_0001",
              "corps": "{\"recording_id\":4242,\"title\":\"Exemple fictif\",\"created_at\":\"2026-11-20T08:55:00Z\"}",
              "entetes": {
                "content-type": "application/json",
                "webhook-id": "msg_exemple_fictif_0001",
                "webhook-timestamp": "1795165198"
              }
            }
          ]
        }
      }
    ]
  }
}
```

Tous les cas que le générateur écrit :

| Section | Cas | Attendu |
|---|---|---|
| verification | outlook : clientState juste dans chaque notification | ok |
| verification | outlook : une notification sur deux porte un autre clientState | signature |
| verification | outlook : value vide | entete |
| verification | hubspot : méthode, adresse, corps et horodatage signés | ok |
| verification | hubspot : la même requête reçue sur une autre adresse | signature |
| verification | hubspot : horodatage de plus de 300 secondes | horodatage |
| verification | fathom : standard-webhooks | ok |
| verification | fathom : deux signatures, la seconde juste (rotation du secret) | ok |
| verification | fathom : horodatage de 6 minutes | horodatage |
| verification | corps seul, hexadécimal avec préfixe sha256= | ok |
| verification | corps seul : un octet du corps changé | signature |
| verification | corps seul : en-tête de signature absent | entete |
| verification | corps seul : hexadécimal en majuscules | ok |
| verification | horodatage dans le corps, tolérance de 60 secondes | ok |
| verification | horodatage dans le corps, à 61 secondes | horodatage |
| verification | littéral, horodatage et corps joints par « : » | ok |
| verification | horodatage puis corps, secret hexadécimal | ok |
| verification | secret hexadécimal illisible | secret |
| verification | hmac-sha1 en base64, corps seul | ok |
| verification | jeton dans un en-tête | ok |
| verification | jeton dans un en-tête : mauvais jeton | signature |
| verification | jeton dans le corps : corps illisible | format |
| decryption | secret d'un abonnement Outlook | le clair |
| decryption | le même secret lu pour un autre abonnement | échec |
| gate | outlook : écho du jeton de validation | 200, texte |
| gate | outlook : jeton de validation avec un caractère de contrôle | 400 |
| gate | outlook : livraison juste | 202, un dépôt |
| gate | outlook : adresse inconnue | 401 |
| gate | outlook : octet nul dans le corps | 400 |
| gate | outlook : notification de cycle de vie | 202, un dépôt `cycle` |
| gate | hubspot : livraison juste, deux organisations écoutent le compte | 202, un dépôt (porte_deposer écrit les deux lignes) |
| gate | hubspot : reçu sur une adresse d'abonnement | 401 |
| gate | hubspot : deux comptes dans une même livraison | 202, aucun dépôt |
| gate | hubspot : secret d'application absent | 503 |
| gate | fathom : livraison juste, identifiée par webhook-id | 202, un dépôt |

Un cas de plus dès qu'un éditeur publie un exemple signé dans sa documentation : on le recopie tel quel (corps, en-têtes, secret, heure), c'est la seule preuve indépendante de notre lecture de son schéma. Aucun n'est dans les notes 04 et 05.

### 7.3 Le générateur et sa vérification en CI

Fichier : `src/server/webhooks/providers-json.ts` (à créer). Code complet. Il a été rejoué hors du dépôt (Node 22, `--experimental-strip-types`, modules du dépôt remplacés par des bouchons) : il produit le `fournisseurs.json` de la section 7.1 à l'octet près, et un `vecteurs.json` dont la section 7.2 est un extrait exact. Depuis, la relecture (section 17) a changé deux valeurs de `PORTE_LIMITS` (`lookupMissesPerIp`, `lookupMissesUnknownIp`) : elles sont reportées à la main dans l'exemple de 7.1, sans nouveau passage du générateur. Les longues lignes de la liste des cas seront repliées par `pnpm format`, comme celles de tout le code de ce chapitre (section 14).

```ts
// src/server/webhooks/providers-json.ts
import { createCipheriv, createHash, createHmac } from 'node:crypto';
import type { ProviderId } from '@/capture/turn';
import type { AnyConnector, WebhookSpec, WebhookVerification } from '@/server/connectors/types';
import { type Deposit, PORTE_KEPT_HEADERS, PORTE_LIMITS } from './hono-gate';
import { type VerdictReason, verifyWebhook } from './verify';

// Génère les deux fichiers que lit le service Rust de la porte (chapitre 15) : services/porte/fournisseurs.json (ce
// que la porte sait de chaque outil, tiré des WebhookSpec) et services/porte/vecteurs.json (les cas que les deux mises
// en œuvre rendent à l'identique). Le sens est TypeScript vers Rust (dossier agents, section 3). Les deux fichiers
// sont commités ; providers-json.test.ts échoue s'ils ne sont plus ce que ce module produit. Les refaire :
// pnpm porte:generer.
//
// Exemple fictif : secrets, clés, identifiants et corps des vecteurs sont inventés pour ces cas. Aucun n'a servi ni ne
// servira chez un éditeur ou en production.

export const PROVIDERS_JSON_PATH = 'services/porte/fournisseurs.json';
export const VECTORS_JSON_PATH = 'services/porte/vecteurs.json';
export const PORTE_FORMAT_VERSION = 1;

const GENERATED_BY =
  'pnpm porte:generer (src/server/webhooks/providers-json.ts) : ne pas modifier à la main';
const PATHS = {
  app: '/h/{outil}',
  abonnement: '/h/{outil}/{abonnement}',
  cycle: '/h/{outil}/{abonnement}/cycle',
};

type Spec = WebhookSpec<Record<string, unknown>>;
const asJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// L'ordre des clés est celui de la table de la section 7.1 du chapitre 03 ; un champ absent n'est pas écrit.
const toolEntry = (spec: Spec) => ({
  scope: spec.scope,
  bodyFormat: spec.bodyFormat,
  accountPointer: spec.accountPointer,
  deliveryHeader: spec.deliveryHeader,
  handshake: spec.handshake,
  lifecycle: spec.lifecycle !== undefined,
  verification: spec.verification,
});

export function buildProvidersJson(
  connectors: Readonly<Record<ProviderId, AnyConnector | null>>,
): string {
  const tools = Object.entries(connectors)
    .flatMap(([id, connector]) =>
      connector?.webhook ? [[id, toolEntry(connector.webhook)] as const] : [],
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return asJson({
    version: PORTE_FORMAT_VERSION,
    generatedBy: GENERATED_BY,
    paths: PATHS,
    limits: PORTE_LIMITS,
    keptHeaders: PORTE_KEPT_HEADERS,
    tools: Object.fromEntries(tools),
  });
}

// --- Les vecteurs ------------------------------------------------------------------------------------------------

const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const BASE = 'https://porte.exemple.test';
const KEY = Buffer.alloc(32, 9);
const TENANT = '0b7a3c52-6f0e-4d9a-9e1f-2a4c5b6d7e8f';
const OUTLOOK_SUB = '5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f';
const FATHOM_SUB = '9c4e1a27-8b3d-4e6f-a0b1-c2d3e4f5a6b7';
const CLIENT_STATE = 'exemple-fictif-clientstate-0123456789abcde';
const HUBSPOT_SECRET = 'exemple-fictif-secret-client-hubspot';
const FATHOM_SECRET = `whsec_${Buffer.from('exemple-fictif-fathom-32-octets!').toString('base64')}`;
const SECRET = 'exemple-fictif-secret';
const HEX_SECRET = Buffer.from('exemple-fictif-cle-hexadecimale').toString('hex');

// Les descriptions des cas : celles du premier lot, recopiées de leur webhook.ts (le test de contrat vérifie qu'elles
// n'ont pas divergé), et des formes génériques qui couvrent chaque morceau de `signed`.
const OUTLOOK: WebhookVerification = {
  mode: 'jeton',
  bodyPointer: '/value/*/clientState',
  secret: { from: 'abonnement' },
};
const HUBSPOT: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-hubspot-signature-v3',
  encoding: 'base64',
  signed: ['method', 'uri', 'body', 'timestamp'],
  separator: '',
  timestamp: { source: 'header', name: 'x-hubspot-request-timestamp', unit: 'ms', toleranceSeconds: 300 },
  secret: { from: 'env', name: 'LEON_OAUTH_HUBSPOT_SECRET' },
};
const FATHOM: WebhookVerification = { mode: 'standard-webhooks', secret: { from: 'abonnement' } };
const abonnement = { from: 'abonnement' } as const;
const BODY_ONLY: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-signature-exemple',
  encoding: 'hex',
  prefix: 'sha256=',
  signed: ['body'],
  separator: '',
  secret: abonnement,
};
const BODY_STAMP: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-signature-exemple',
  encoding: 'hex',
  signed: ['body'],
  separator: '',
  timestamp: { source: 'body', name: '/webhookTimestamp', unit: 'ms', toleranceSeconds: 60 },
  secret: abonnement,
};
const LITERAL: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-signature-exemple',
  encoding: 'hex',
  prefix: 'v0=',
  signed: [{ literal: 'v0' }, 'timestamp', 'body'],
  separator: ':',
  timestamp: { source: 'header', name: 'x-horodatage-exemple', unit: 's', toleranceSeconds: 300 },
  secret: abonnement,
};
const HEX_KEY: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-signature-exemple',
  encoding: 'hex',
  signed: ['timestamp', 'body'],
  separator: '',
  timestamp: { source: 'header', name: 'x-horodatage-exemple', unit: 's', toleranceSeconds: 300 },
  secret: abonnement,
  secretEncoding: 'hex',
};
const SHA1: WebhookVerification = {
  mode: 'hmac-sha1',
  header: 'x-signature-exemple',
  encoding: 'base64',
  signed: ['body'],
  separator: '',
  secret: abonnement,
};
const HEADER_TOKEN: WebhookVerification = {
  mode: 'jeton',
  header: 'x-jeton-exemple',
  secret: abonnement,
};

const notification = (n: number, clientState: string) => ({
  subscriptionId: 'abonnement-exemple-1',
  clientState,
  changeType: 'created',
  resource: `Users('u1')/Messages('m${n}')`,
  resourceData: { id: `AAMkAGI2-exemple-fictif-${n}` },
});
const OUTLOOK_BODY = JSON.stringify({
  value: [notification(1, CLIENT_STATE), notification(2, CLIENT_STATE)],
});
const OUTLOOK_FORGED = JSON.stringify({
  value: [notification(1, CLIENT_STATE), notification(2, 'autre')],
});
const HUBSPOT_BODY = JSON.stringify([
  {
    eventId: 1001,
    subscriptionId: 2001,
    portalId: 12345678,
    occurredAt: NOW - 10_000,
    subscriptionType: 'object.creation',
    objectTypeId: '0-46',
    objectId: 3001,
  },
]);
const HUBSPOT_MIXED = JSON.stringify([
  { portalId: 12345678, objectId: 1 },
  { portalId: 87654321, objectId: 2 },
]);
const FATHOM_BODY = JSON.stringify({
  recording_id: 4242,
  title: 'Exemple fictif',
  created_at: '2026-11-20T08:55:00Z',
});
const issue = (at: number) =>
  JSON.stringify({
    action: 'create',
    type: 'Issue',
    organizationId: 'org-exemple',
    data: { id: 'iss-exemple' },
    webhookTimestamp: at,
  });
const PLAIN = '{"exemple":"fictif","n":1}';
const LIFECYCLE_BODY = JSON.stringify({
  value: [
    {
      subscriptionId: 'abonnement-exemple-1',
      lifecycleEvent: 'reauthorizationRequired',
      clientState: CLIENT_STATE,
    },
  ],
});

// L'éditeur : signe comme lui, à partir de la même description. Une seconde écriture de l'algorithme, faite à
// l'envers (signer et non vérifier) : une erreur de verify.ts ne s'y recopie pas.
function sign(
  verification: WebhookVerification,
  input: { secret: string; body: string; uri: string; at: number },
): Record<string, string> {
  const body = Buffer.from(input.body, 'utf8');
  if (verification.mode === 'standard-webhooks') {
    const id = 'msg_exemple_fictif_0001';
    const timestamp = String(Math.floor(input.at / 1000));
    const key = Buffer.from(input.secret.slice('whsec_'.length), 'base64');
    const message = Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]);
    const signature = createHmac('sha256', key).update(message).digest('base64');
    return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` };
  }
  if (verification.mode === 'jeton') {
    return verification.header ? { [verification.header]: input.secret } : {};
  }
  const headers: Record<string, string> = {};
  const { timestamp } = verification;
  const stamp = timestamp
    ? String(timestamp.unit === 's' ? Math.floor(input.at / 1000) : input.at)
    : '';
  if (timestamp?.source === 'header') headers[timestamp.name] = stamp;
  const encoding = verification.secretEncoding ?? 'utf8';
  const key = Buffer.from(input.secret, encoding === 'utf8' ? 'utf8' : encoding);
  const parts = verification.signed.map((part) => {
    if (typeof part === 'object') return Buffer.from(part.literal);
    if (part === 'method') return Buffer.from('POST');
    if (part === 'uri') return Buffer.from(input.uri);
    if (part === 'timestamp') return Buffer.from(stamp);
    return body;
  });
  const glue = Buffer.from(verification.separator);
  const message = Buffer.concat(parts.flatMap((part, index) => (index === 0 ? [part] : [glue, part])));
  const algorithm = verification.mode === 'hmac-sha1' ? 'sha1' : 'sha256';
  const signature = createHmac(algorithm, key).update(message).digest(verification.encoding);
  headers[verification.header] = `${verification.prefix ?? ''}${signature}`;
  return headers;
}

type VerificationVector = {
  name: string;
  verification: WebhookVerification;
  bodyFormat: Spec['bodyFormat'];
  secret: string;
  method: 'POST';
  uri: string;
  headers: Record<string, string>;
  body: string;
  now: number;
  expected: 'ok' | VerdictReason;
};

// Un cas : signé juste, puis éventuellement abîmé par `change`. Le générateur refuse un cas dont verify.ts ne rend pas
// le verdict annoncé : un fichier faux ne sort jamais d'ici.
function vector(
  name: string,
  verification: WebhookVerification,
  input: { secret: string; body: string; uri?: string; at?: number },
  expected: VerificationVector['expected'],
  change?: (vector: VerificationVector) => Partial<VerificationVector>,
): VerificationVector {
  const uri = input.uri ?? `${BASE}/h/exemple`;
  const at = input.at ?? NOW - 2000;
  const headers = { 'content-type': 'application/json', ...sign(verification, { ...input, uri, at }) };
  const base: VerificationVector = {
    name,
    verification,
    bodyFormat: 'json',
    secret: input.secret,
    method: 'POST',
    uri,
    headers,
    body: input.body,
    now: NOW,
    expected,
  };
  const result = { ...base, ...change?.(base) };
  const verdict = verifyWebhook({ ...result, body: Buffer.from(result.body, 'utf8'), nowMs: result.now });
  if ((verdict.ok ? 'ok' : verdict.reason) !== expected) throw new Error(`Vecteur incohérent : ${name}`);
  return result;
}

const outlookUri = `${BASE}/h/outlook/${OUTLOOK_SUB}`;
const fathomUri = `${BASE}/h/fathom/${FATHOM_SUB}`;
const hubspotUri = `${BASE}/h/hubspot`;
const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

const verificationVectors = (): VerificationVector[] => [
  vector('outlook : clientState juste dans chaque notification', OUTLOOK, { secret: CLIENT_STATE, body: OUTLOOK_BODY, uri: outlookUri }, 'ok'),
  vector('outlook : une notification sur deux porte un autre clientState', OUTLOOK, { secret: CLIENT_STATE, body: OUTLOOK_FORGED, uri: outlookUri }, 'signature'),
  vector('outlook : value vide', OUTLOOK, { secret: CLIENT_STATE, body: '{"value":[]}', uri: outlookUri }, 'entete'),
  vector('hubspot : méthode, adresse, corps et horodatage signés', HUBSPOT, { secret: HUBSPOT_SECRET, body: HUBSPOT_BODY, uri: hubspotUri }, 'ok'),
  vector('hubspot : la même requête reçue sur une autre adresse', HUBSPOT, { secret: HUBSPOT_SECRET, body: HUBSPOT_BODY, uri: hubspotUri }, 'signature', () => ({ uri: `${hubspotUri}?x=1` })),
  vector('hubspot : horodatage de plus de 300 secondes', HUBSPOT, { secret: HUBSPOT_SECRET, body: HUBSPOT_BODY, uri: hubspotUri, at: NOW - 301_000 }, 'horodatage'),
  vector('fathom : standard-webhooks', FATHOM, { secret: FATHOM_SECRET, body: FATHOM_BODY, uri: fathomUri }, 'ok'),
  vector('fathom : deux signatures, la seconde juste (rotation du secret)', FATHOM, { secret: FATHOM_SECRET, body: FATHOM_BODY, uri: fathomUri }, 'ok', ({ headers }) => ({
    headers: { ...headers, 'webhook-signature': `v1,${Buffer.alloc(32, 1).toString('base64')} ${headers['webhook-signature']}` },
  })),
  vector('fathom : horodatage de 6 minutes', FATHOM, { secret: FATHOM_SECRET, body: FATHOM_BODY, uri: fathomUri, at: NOW - 360_000 }, 'horodatage'),
  vector('corps seul, hexadécimal avec préfixe sha256=', BODY_ONLY, { secret: SECRET, body: PLAIN }, 'ok'),
  vector('corps seul : un octet du corps changé', BODY_ONLY, { secret: SECRET, body: PLAIN }, 'signature', () => ({ body: PLAIN.replace('1', '2') })),
  vector('corps seul : en-tête de signature absent', BODY_ONLY, { secret: SECRET, body: PLAIN }, 'entete', ({ headers }) => ({ headers: without(headers, 'x-signature-exemple') })),
  vector('corps seul : hexadécimal en majuscules', BODY_ONLY, { secret: SECRET, body: PLAIN }, 'ok', ({ headers }) => ({
    headers: { ...headers, 'x-signature-exemple': `sha256=${(headers['x-signature-exemple'] ?? '').slice(7).toUpperCase()}` },
  })),
  vector('horodatage dans le corps, tolérance de 60 secondes', BODY_STAMP, { secret: SECRET, body: issue(NOW - 1000) }, 'ok'),
  vector('horodatage dans le corps, à 61 secondes', BODY_STAMP, { secret: SECRET, body: issue(NOW - 61_000) }, 'horodatage'),
  vector('littéral, horodatage et corps joints par « : »', LITERAL, { secret: SECRET, body: PLAIN }, 'ok'),
  vector('horodatage puis corps, secret hexadécimal', HEX_KEY, { secret: HEX_SECRET, body: PLAIN }, 'ok'),
  vector('secret hexadécimal illisible', HEX_KEY, { secret: HEX_SECRET, body: PLAIN }, 'secret', () => ({ secret: 'zz-pas-hexa' })),
  vector('hmac-sha1 en base64, corps seul', SHA1, { secret: SECRET, body: PLAIN }, 'ok'),
  vector('jeton dans un en-tête', HEADER_TOKEN, { secret: 'exemple-fictif-jeton', body: '' }, 'ok'),
  vector('jeton dans un en-tête : mauvais jeton', HEADER_TOKEN, { secret: 'exemple-fictif-jeton', body: '' }, 'signature', ({ headers }) => ({
    headers: { ...headers, 'x-jeton-exemple': 'autre' },
  })),
  vector('jeton dans le corps : corps illisible', OUTLOOK, { secret: CLIENT_STATE, body: '{"value":' }, 'format'),
];

// Le format v1 de connectors/crypto.ts, avec un vecteur d'initialisation fixe : le fichier ne change pas à chaque
// génération. Jamais ailleurs que dans ce générateur : un IV fixe sous une vraie clé casserait AES-GCM.
function sealFixed(plain: string, aad: string, iv: Buffer): string {
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), encrypted].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join(':');
}

const OUTLOOK_STORED = sealFixed(CLIENT_STATE, `${TENANT}:${OUTLOOK_SUB}`, Buffer.alloc(12, 1));
const FATHOM_STORED = sealFixed(FATHOM_SECRET, `${TENANT}:${FATHOM_SUB}`, Buffer.alloc(12, 2));

const decryptionVectors = () => [
  { name: 'secret d’un abonnement Outlook', key: KEY.toString('base64'), aad: `${TENANT}:${OUTLOOK_SUB}`, stored: OUTLOOK_STORED, plain: CLIENT_STATE },
  { name: 'le même secret lu pour un autre abonnement : refusé', key: KEY.toString('base64'), aad: `${TENANT}:${FATHOM_SUB}`, stored: OUTLOOK_STORED, plain: null },
];

type GateCase = {
  name: string;
  env?: Record<string, string>;
  request: { method: 'POST'; path: string; query: string; headers: Record<string, string>; body: string };
  now: number;
  expected: { status: number; contentType?: string; body: string; deposits: Deposit[] };
};

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const REFUSED = { status: 401, body: '{"error":"Invalid signature"}', deposits: [] };
const INVALID = { status: 400, body: '{"error":"Invalid request"}', deposits: [] };
const accepted = (deposits: Deposit[]) => ({ status: 202, body: '', deposits });
const post = (path: string, headers: Record<string, string>, body: string, query = '') => ({
  method: 'POST' as const,
  path,
  query,
  headers,
  body,
});

function gateCases(): GateCase[] {
  const json = { 'content-type': 'application/json' };
  const outlookPath = `/h/outlook/${OUTLOOK_SUB}`;
  const hubspot = sign(HUBSPOT, { secret: HUBSPOT_SECRET, body: HUBSPOT_BODY, uri: hubspotUri, at: NOW - 2000 });
  const mixed = sign(HUBSPOT, { secret: HUBSPOT_SECRET, body: HUBSPOT_MIXED, uri: hubspotUri, at: NOW - 2000 });
  const fathom = sign(FATHOM, { secret: FATHOM_SECRET, body: FATHOM_BODY, uri: fathomUri, at: NOW - 2000 });
  const cases: Array<Omit<GateCase, 'now'>> = [
    {
      name: 'outlook : écho du jeton de validation',
      request: post(outlookPath, { 'content-type': 'text/plain' }, '', 'validationToken=jeton%20de%20validation%20exemple'),
      expected: { status: 200, contentType: 'text/plain; charset=utf-8', body: 'jeton de validation exemple', deposits: [] },
    },
    {
      name: 'outlook : jeton de validation avec un caractère de contrôle',
      request: post(outlookPath, {}, '', 'validationToken=a%0Ab'),
      expected: INVALID,
    },
    {
      name: 'outlook : livraison juste',
      request: post(outlookPath, { ...json, 'user-agent': 'exemple-fictif' }, OUTLOOK_BODY),
      expected: accepted([{ outil: 'outlook', abonnement: OUTLOOK_SUB, compte: null, genre: 'livraison', livraison: sha256(OUTLOOK_BODY), corps: OUTLOOK_BODY, entetes: { ...json, 'user-agent': 'exemple-fictif' } }]),
    },
    {
      name: 'outlook : adresse inconnue',
      request: post('/h/outlook/00000000-0000-4000-8000-000000000000', json, OUTLOOK_BODY),
      expected: REFUSED,
    },
    {
      name: 'outlook : octet nul dans le corps',
      request: post(outlookPath, json, OUTLOOK_BODY.replace('"created"', '"cre\u0000ated"')),
      expected: INVALID,
    },
    {
      name: 'outlook : notification de cycle de vie',
      request: post(`${outlookPath}/cycle`, json, LIFECYCLE_BODY),
      expected: accepted([{ outil: 'outlook', abonnement: OUTLOOK_SUB, compte: null, genre: 'cycle', livraison: sha256(LIFECYCLE_BODY), corps: LIFECYCLE_BODY, entetes: json }]),
    },
    {
      name: 'hubspot : livraison juste, deux organisations écoutent le compte',
      request: post('/h/hubspot', { ...json, ...hubspot }, HUBSPOT_BODY),
      expected: accepted([{ outil: 'hubspot', abonnement: null, compte: '12345678', genre: 'livraison', livraison: sha256(HUBSPOT_BODY), corps: HUBSPOT_BODY, entetes: json }]),
    },
    {
      name: 'hubspot : reçu sur une adresse d’abonnement',
      request: post(`/h/hubspot/${OUTLOOK_SUB}`, { ...json, ...hubspot }, HUBSPOT_BODY),
      expected: REFUSED,
    },
    {
      name: 'hubspot : deux comptes dans une même livraison',
      request: post('/h/hubspot', { ...json, ...mixed }, HUBSPOT_MIXED),
      expected: accepted([]),
    },
    {
      name: 'hubspot : secret d’application absent',
      env: { LEON_OAUTH_HUBSPOT_SECRET: '' },
      request: post('/h/hubspot', { ...json, ...hubspot }, HUBSPOT_BODY),
      expected: { status: 503, body: '{"error":"Unavailable"}', deposits: [] },
    },
    {
      name: 'fathom : livraison juste, identifiée par webhook-id',
      request: post(`/h/fathom/${FATHOM_SUB}`, { ...json, ...fathom }, FATHOM_BODY),
      expected: accepted([{ outil: 'fathom', abonnement: FATHOM_SUB, compte: null, genre: 'livraison', livraison: 'msg_exemple_fictif_0001', corps: FATHOM_BODY, entetes: { ...json, 'webhook-id': fathom['webhook-id'] ?? '', 'webhook-timestamp': fathom['webhook-timestamp'] ?? '' } }]),
    },
  ];
  return cases.map(({ name, env, request, expected }) => ({ name, ...(env ? { env } : {}), request, now: NOW, expected }));
}

export function buildVectorsJson(): string {
  return asJson({
    version: PORTE_FORMAT_VERSION,
    generatedBy: GENERATED_BY,
    verification: verificationVectors(),
    decryption: decryptionVectors(),
    gate: {
      env: { LEON_PORTE_URL: BASE, LEON_PORTE_KEY: KEY.toString('base64'), LEON_OAUTH_HUBSPOT_SECRET: HUBSPOT_SECRET },
      store: {
        subscriptions: [
          { outil: 'outlook', id: OUTLOOK_SUB, tenantId: TENANT, stored: OUTLOOK_STORED },
          { outil: 'fathom', id: FATHOM_SUB, tenantId: TENANT, stored: FATHOM_STORED },
        ],
      },
      cases: gateCases(),
    },
  });
}
```

Le test, `src/server/webhooks/providers-json.test.ts` (à créer, projet `unit`) : il compare les deux fichiers commités à ce que produit le générateur, et les réécrit quand on le lui demande.

```ts
// src/server/webhooks/providers-json.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONNECTORS } from '@/server/connectors/registry';
import {
  buildProvidersJson,
  buildVectorsJson,
  PROVIDERS_JSON_PATH,
  VECTORS_JSON_PATH,
} from './providers-json';

// Le contrat avec le service Rust de la porte : deux fichiers générés, commités. pnpm porte:generer les refait
// (LEON_PORTE_GENERER=oui) ; sans cela, un fichier qui n'est plus à jour fait échouer la CI (job code, test:unit).
const ROOT = new URL('../../../', import.meta.url);
const regenerate = process.env.LEON_PORTE_GENERER === 'oui';

describe('le contrat de la porte : fournisseurs.json et vecteurs.json', () => {
  it.each([
    [PROVIDERS_JSON_PATH, () => buildProvidersJson(CONNECTORS)],
    [VECTORS_JSON_PATH, buildVectorsJson],
  ])('%s est ce que produit le générateur', (path, build) => {
    const expected = build();
    const file = new URL(path, ROOT);
    if (regenerate) writeFileSync(file, expected);
    expect(readFileSync(file, 'utf8'), 'fichier périmé : pnpm porte:generer').toBe(expected);
  });

  it('génère deux fois le même texte', () => {
    expect(buildVectorsJson()).toBe(buildVectorsJson());
  });
});
```

`process.env.LEON_PORTE_GENERER` n'est lu que dans un fichier de test : `env-contract.test.ts` ne lit que les sources de production (`productionSources` écarte `*.test.ts`, `src/test/contracts/files.ts:20-28`), la variable n'entre donc pas dans `.env.example`.

Le script, dans `package.json` (existe, `scripts`) :

```json
    "porte:generer": "LEON_PORTE_GENERER=oui vitest run --project unit src/server/webhooks/providers-json.test.ts",
```

`scripts-contract.test.ts` vérifie que le chemin cité existe : le script entre dans la même PR que le test.

La vérification en CI est ce test, dans le job `code` (`pnpm test:unit`, `.github/workflows/tests.yml`). Aucune étape de plus dans `tests.yml` tant que le service Rust n'existe pas ; le job `porte` du chapitre 15 lira les mêmes fichiers.

## 8. Les files et l'écoute de `leon_porte`

### 8.1 `src/server/webhooks/queue.ts` (à créer)

Les noms et les politiques sont ceux de l'architecture (10.1), recopiés. Forme des `queue.ts` existants (`src/server/connectors/queue.ts:1-13`, `src/server/briefing/queue.ts:18-53`) : noms de files, schémas zod des jobs, options.

```ts
// src/server/webhooks/queue.ts
import { z } from 'zod';

// Les files des webhooks (dossier agents, 10.1). porte-traiter prend une livraison de la boîte d'entrée (réveillée par
// NOTIFY leon_porte) ; porte-tic rattrape chaque minute une notification perdue et purge la boîte une fois par heure ;
// abonnement-tic cherche toutes les 10 minutes les abonnements à renouveler ; abonnement-renouveler renouvelle un
// abonnement, ou fait ce qu'a dit une notification de cycle de vie. Un job ne porte que des identifiants.
export const WEBHOOK_QUEUES = {
  process: 'porte-traiter',
  tick: 'porte-tic',
  renewTick: 'abonnement-tic',
  renew: 'abonnement-renouveler',
} as const;

// Le canal que porte_deposer notifie (0083) ; la charge est l'id de la ligne déposée.
export const PORTE_CHANNEL = 'leon_porte';

export const PORTE_TICK_CRON = '* * * * *';
export const RENEW_TICK_CRON = '*/10 * * * *';

export const InboxJobSchema = z.object({ id: z.uuid() });
export type InboxJob = z.infer<typeof InboxJobSchema>;

// Pourquoi un job abonnement-renouveler existe. echeance : le tic (renouveler_le est passé). Les trois autres viennent
// d'une notification de cycle de vie (LifecycleEvent.event) : reautoriser, supprime, manque. `externeId` : l'identifiant
// d'abonnement que l'éditeur a mis dans la notification, comparé à la ligne avant d'agir.
export const SUBSCRIPTION_MOTIVES = ['echeance', 'reautoriser', 'supprime', 'manque'] as const;
export type SubscriptionMotive = (typeof SUBSCRIPTION_MOTIVES)[number];

export const SubscriptionJobSchema = z.object({
  abonnementId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
  motif: z.enum(SUBSCRIPTION_MOTIVES),
  externeId: z.string().min(1).max(500).optional(),
});
export type SubscriptionJob = z.infer<typeof SubscriptionJobSchema>;

// Architecture, 10.1, sauf la politique de porte-traiter : `short` et non `standard` (écart E-p). Sous `standard`,
// pg-boss 12 ne dédoublonne pas par singletonKey (aucun index unique, dist/plans.js:1186-1195) : chaque tic remettrait
// en file les mêmes lignes en attente. Sous `short`, une seule en attente par ligne ; send rend null pour la seconde.
// pg-boss ne change pas la politique d'une file qui existe : ensureQueue la recrée.
export const PROCESS_QUEUE = { policy: 'short', retryLimit: 3, retryDelay: 30 } as const;
export const TICK_QUEUE = { policy: 'stately', retryLimit: 0 } as const;
export const RENEW_QUEUE = {
  policy: 'stately',
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
} as const;
```

### 8.2 `src/server/connectors/queue.ts` (existe, `:1-13`) : la file `connector-fetch`

`CONNECTOR_QUEUES` gagne `fetch` (architecture, 6 et 10.1). Le job a deux formes, une par portée. Ajout après `ConnectorSyncJob` (`:13`) :

```ts
// src/server/connectors/queue.ts (existe) : CONNECTOR_QUEUES gagne fetch.
export const CONNECTOR_QUEUES = {
  tick: 'connector-tick',
  sync: 'connector-sync',
  fetch: 'connector-fetch',
} as const;

// La relève ciblée d'un objet qu'un webhook a désigné (webhooks/fetch-one.ts). Portée abonnement : la livraison est
// arrivée sur l'adresse d'un abonnement, donc d'une connexion et d'une personne. Portée app : elle désigne un compte
// (un portail HubSpot) ; la connexion qui lira se choisit au moment du job (connexions_du_compte). `removed` : l'éditeur
// dit l'objet supprimé ; rien n'est retiré sans qu'une lecture le confirme.
const fetchBase = {
  tenantId: z.uuid(),
  outil: z.enum(PROVIDER_IDS),
  externalId: z.string().min(1).max(500),
  removed: z.boolean(),
};
export const ConnectorFetchJobSchema = z.discriminatedUnion('portee', [
  z.object({ portee: z.literal('abonnement'), userId: z.uuid(), abonnementId: z.uuid(), ...fetchBase }),
  z.object({ portee: z.literal('app'), compte: z.string().min(1).max(200), ...fetchBase }),
]);
export type ConnectorFetchJob = z.infer<typeof ConnectorFetchJobSchema>;

// La clé unique du job (singletonKey) : la même livraison rejouée, ou deux notifications du même objet, ne donnent
// qu'une relève en attente. L'organisation est dans la clé d'un webhook d'application : deux organisations peuvent
// écouter le même compte, et la seconde ne doit pas perdre sa relève (écart E-d).
export function fetchJobKey(job: ConnectorFetchJob): string {
  return job.portee === 'abonnement'
    ? `abonnement:${job.abonnementId}:${job.externalId}`
    : `app:${job.tenantId}:${job.outil}:${job.compte}:${job.externalId}`;
}

// Le groupe pg-boss d'un job de portée app : les relèves ciblées d'un même compte passent une à une
// (groupConcurrency: 1, connectors/worker.ts). HubSpot compte 110 requêtes par 10 secondes pour tout le portail
// (architecture 8.3), partagées avec la relève et les écritures : un lot de 50 activités lu par 4 jobs en parallèle
// les dépasserait. Pas d'organisation dans le groupe : deux organisations qui écoutent un portail partagent sa limite.
// Portée abonnement : pas de groupe.
export function fetchJobGroup(job: ConnectorFetchJob): { id: string } | undefined {
  return job.portee === 'app' ? { id: `${job.outil}:${job.compte}` } : undefined;
}

export const FETCH_QUEUE = { policy: 'short', retryLimit: 2 } as const;
```

avec `import { PROVIDER_IDS } from '@/capture/turn';` (existe, `src/capture/turn.ts:29`). `group` et `groupConcurrency` sont dans les types de pg-boss 12.37.1 (`JobOptions.group`, `WorkConcurrencyOptions.groupConcurrency`, « limit concurrent jobs per group globally across all nodes ») ; leur comportement avec la politique `short` est à vérifier au premier essai.

### 8.3 `src/server/webhooks/worker.ts` (à créer)

Trois choses : les quatre lecteurs pg-boss, les deux plannings, et l'écoute de `leon_porte`. Forme de `src/server/connectors/worker.ts` (`:19-64`) : `registerWorkers`, `ensureQueue` pour chaque file, `wakeQueueAfter` autour de chaque lecteur (contrat `pgboss-wake.test.ts`), démarrage gardé sur `globalThis`. La purge horaire suit le patron du chapitre 04 (`purgedAt`, modèle `purgeCited`, `src/server/search/worker.ts:92-94`).

L'écoute tient une connexion à part, hors du pool : `LISTEN` la garde ouverte. C'est la connexion « écoute de `leon_porte` » du budget de l'architecture (section 4 : worker à 20 connexions). Elle se rouvre seule après une coupure ; pendant ce temps `porte-tic` rattrape, au bout de 30 secondes, ce qui attend (`webhooks_a_traiter`).

Le fichier arrive en deux PR (section 14). W6 le livre sans les lignes marquées `// W7` : l'import de `subscriptions.ts`, `enqueueDueRenewals`, le planning d'`abonnement-tic` et les lecteurs d'`abonnement-tic` et d'`abonnement-renouveler`. Sans eux, `RENEW_TICK_CRON` et `SubscriptionJobSchema` ne servent plus : W6 les retire aussi de l'import de `./queue`, et W7 les y remet. W6 crée pourtant les quatre files (`ensureQueue`) : `inbox.ts` envoie déjà des jobs `abonnement-renouveler`, et pg-boss 12 refuse un envoi vers une file qui n'existe pas (« Queue … does not exist », `dist/manager.js:914`). Avant W7, aucun abonnement n'existe, donc aucune notification de cycle de vie n'arrive ; un job qui arriverait quand même attendrait son lecteur. W7 ajoute les lignes marquées.

```ts
// src/server/webhooks/worker.ts
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import { getConnector } from '@/server/connectors/registry';
import type { AnyConnector } from '@/server/connectors/types';
import { db } from '@/server/db/client';
import { env } from '@/server/env';
import { logError, safeErrorSummary } from '@/server/log';
import { ensureQueue, getBoss, wakeQueueAfter } from '@/server/pipeline/queue';
import { processDelivery } from './inbox';
import {
  InboxJobSchema,
  PORTE_CHANNEL,
  PORTE_TICK_CRON,
  PROCESS_QUEUE,
  RENEW_QUEUE,
  RENEW_TICK_CRON,
  SubscriptionJobSchema,
  TICK_QUEUE,
  WEBHOOK_QUEUES,
} from './queue';
import { runSubscriptionJob } from './subscriptions'; // W7

// Le worker des webhooks (dossier agents, chapitre 03). Il prend les livraisons que la porte a déposées, rattrape
// celles dont la notification s'est perdue, purge la boîte d'entrée, et tient les abonnements en vie.

export type WebhooksDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  fetchImpl?: typeof fetch; // tests
};

const PROCESS_CONCURRENCY = 4; // architecture, 10.1
const RENEW_CONCURRENCY = 2;
const WAITING_MAX = 100; // webhooks_a_traiter(100)
const RENEWALS_MAX = 100; // abonnements_a_renouveler(100)
const PURGE_EVERY_MS = 60 * 60 * 1000;
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60 * 1000;

function rethrowSummary(event: string, error: unknown, ids: Record<string, string> = {}): never {
  logError(event, error, ids);
  throw new Error(safeErrorSummary(error));
}

// Une livraison à prendre : un job par ligne, clé = l'id de la ligne. Rend vrai si un job a été créé ; faux si un job
// de la même ligne attend déjà (politique `short`, écart E-p).
export async function enqueueDelivery(id: string): Promise<boolean> {
  const boss = await getBoss();
  const sent = await boss.send(WEBHOOK_QUEUES.process, { id }, { singletonKey: id });
  return sent !== null;
}

// Le tic de la minute : les livraisons reçues depuis plus de 30 secondes et pas encore prises (une notification
// perdue, un worker arrêté). Des identifiants seulement.
export async function enqueueWaitingDeliveries(): Promise<number> {
  const { rows } = await db.execute<{ id: string }>(
    sql`select id from webhooks_a_traiter(${WAITING_MAX})`,
  );
  let queued = 0;
  for (const row of rows) if (await enqueueDelivery(row.id)) queued += 1;
  return queued;
}

// W7. Le tic des 10 minutes : un job par abonnement dont l'heure de renouvellement est passée.
export async function enqueueDueRenewals(): Promise<number> {
  const { rows } = await db.execute<{ abonnement_id: string; tenant_id: string; user_id: string }>(
    sql`select abonnement_id, tenant_id, user_id from abonnements_a_renouveler(${RENEWALS_MAX})`,
  );
  const boss = await getBoss();
  let queued = 0;
  for (const row of rows) {
    const job = {
      abonnementId: row.abonnement_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      motif: 'echeance' as const,
    };
    const sent = await boss.send(WEBHOOK_QUEUES.renew, job, { singletonKey: job.abonnementId });
    if (sent !== null) queued += 1;
  }
  return queued;
}

// L'écoute de leon_porte. Une connexion à part (LISTEN la garde), rouverte après une coupure : 5 secondes, puis le
// double, 5 minutes au plus. Une charge qui n'est pas un UUID est ignorée : seule porte_deposer notifie ce canal, mais
// tout rôle connecté peut y écrire.
export type PorteListener = { stop(): Promise<void> };

export function listenPorte(
  onDelivery: (id: string) => Promise<unknown>,
  options: { createClient?: () => Client } = {},
): PorteListener {
  const create =
    options.createClient ??
    (() => new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000 }));
  const Id = z.uuid();
  let stopped = false;
  let current: Client | null = null;
  let timer: NodeJS.Timeout | null = null;
  let delay = RECONNECT_MIN_MS;

  const lost = (client: Client, error: unknown) => {
    if (current !== client) return; // déjà remplacée
    current = null;
    client.end().catch(() => {});
    if (stopped) return;
    logError('porte.ecoute', error);
    timer = setTimeout(() => {
      timer = null;
      void open();
    }, delay);
    delay = Math.min(delay * 2, RECONNECT_MAX_MS);
  };

  async function open(): Promise<void> {
    const client = create();
    current = client;
    client.on('notification', (message) => {
      if (message.channel !== PORTE_CHANNEL) return;
      const id = Id.safeParse(message.payload);
      if (!id.success) return;
      onDelivery(id.data).catch((error) => logError('porte.ecoute_envoi', error, { id: id.data }));
    });
    client.on('error', (error) => lost(client, error));
    client.on('end', () => lost(client, new Error('Listen connection ended')));
    try {
      await client.connect();
      await client.query(`listen ${PORTE_CHANNEL}`);
      delay = RECONNECT_MIN_MS;
    } catch (error) {
      lost(client, error);
    }
  }

  void open();
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      const client = current;
      current = null;
      await client?.end().catch(() => {});
    },
  };
}

async function registerWorkers(deps: WebhooksDeps, pollingIntervalSeconds: number | undefined) {
  const boss = await getBoss();
  await ensureQueue(boss, WEBHOOK_QUEUES.process, PROCESS_QUEUE);
  await ensureQueue(boss, WEBHOOK_QUEUES.tick, TICK_QUEUE);
  await ensureQueue(boss, WEBHOOK_QUEUES.renewTick, TICK_QUEUE);
  await ensureQueue(boss, WEBHOOK_QUEUES.renew, RENEW_QUEUE);
  await boss.schedule(WEBHOOK_QUEUES.tick, PORTE_TICK_CRON);
  await boss.schedule(WEBHOOK_QUEUES.renewTick, RENEW_TICK_CRON); // W7
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  const one = { batchSize: 1, localConcurrency: 1, ...polling };

  await boss.work(
    WEBHOOK_QUEUES.process,
    { ...one, localConcurrency: PROCESS_CONCURRENCY },
    wakeQueueAfter(boss, WEBHOOK_QUEUES.process, async ([job]) => {
      const { id } = InboxJobSchema.parse(job?.data);
      await processDelivery(id, deps).catch((error) => rethrowSummary('porte.traiter', error, { id }));
    }),
  );

  let purgedAt = 0;
  await boss.work(
    WEBHOOK_QUEUES.tick,
    one,
    wakeQueueAfter(boss, WEBHOOK_QUEUES.tick, async () => {
      if (Date.now() - purgedAt >= PURGE_EVERY_MS) {
        purgedAt = Date.now();
        await db
          .execute(sql`select purger_boite_entree() as n`)
          .catch((error) => logError('porte.purge', error));
      }
      await enqueueWaitingDeliveries().catch((error) => rethrowSummary('porte.tic', error));
    }),
  );

  // W7 : les deux lecteurs qui suivent.
  await boss.work(
    WEBHOOK_QUEUES.renewTick,
    one,
    wakeQueueAfter(boss, WEBHOOK_QUEUES.renewTick, async () => {
      await enqueueDueRenewals().catch((error) => rethrowSummary('abonnement.tic', error));
    }),
  );

  await boss.work(
    WEBHOOK_QUEUES.renew,
    { ...one, localConcurrency: RENEW_CONCURRENCY },
    wakeQueueAfter(boss, WEBHOOK_QUEUES.renew, async ([job]) => {
      const parsed = SubscriptionJobSchema.parse(job?.data);
      await runSubscriptionJob(parsed, deps).catch((error) =>
        rethrowSummary('abonnement.renouveler', error, { abonnementId: parsed.abonnementId }),
      );
    }),
  );

  globalForWorker.leonPorteListener ??= listenPorte(enqueueDelivery);
}

const globalForWorker = globalThis as typeof globalThis & {
  leonWebhooksWorker?: Promise<void>;
  leonPorteListener?: PorteListener; // shutdown.ts (chapitre 13) l'arrête avant boss.stop
};

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startWebhooksWorker(
  deps: WebhooksDeps = { getConnector },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  globalForWorker.leonWebhooksWorker ??= registerWorkers(deps, options.pollingIntervalSeconds).catch(
    (error) => {
      globalForWorker.leonWebhooksWorker = undefined; // un démarrage raté doit pouvoir être retenté
      throw error;
    },
  );
  return globalForWorker.leonWebhooksWorker;
}

export const stopPorteListener = (): Promise<void> =>
  globalForWorker.leonPorteListener?.stop() ?? Promise.resolve();
```

À savoir :

- `pg` émet `notification` avec `channel` et `payload` (API de `pg` 8, à relire dans `node_modules` au premier essai : `node_modules` était absent à la rédaction de l'architecture).
- Une notification arrive à la validation de la transaction de la porte (`pg_notify`, chapitre 01, section 11). Le job part donc après que la ligne est visible : `prendre_livraison` la trouve.
- `porte-traiter` reçoit un job par ligne. Une organisation qui écoute un compte HubSpot avec 20 personnes n'a qu'une ligne : `porte_deposer` dépose une fois par organisation.

### 8.4 `src/instrumentation-node.ts` (existe, `:45-51`)

Le worker des webhooks démarre avec celui des connecteurs : sans `LEON_CONNECTORS_KEY`, aucune connexion ne se lit, donc aucun abonnement ne se renouvelle. Après `startConnectorWorker()` (`:47-48`), dans le même `if` :

```ts
    // Les webhooks (dossier agents, chapitre 03) : boîte d'entrée, écoute de leon_porte, abonnements.
    const { startWebhooksWorker } = await import('@/server/webhooks/worker');
    await startWebhooksWorker();
```

Le chapitre 13 garde ce bloc derrière `runsWorkers()` et appelle `stopPorteListener()` dans `shutdown.ts`.

**`src/instrumentation-node.test.ts`** (existe) : il remplace chaque `startXWorker` par un faux qui note son nom, et attend l'ordre exact. Sans un faux de plus, le vrai worker des webhooks démarre pg-boss et trois tests échouent. Dans la même PR (W6), après le faux de `@/server/connectors/worker` :

```ts
vi.mock('@/server/webhooks/worker', () => ({
  startWebhooksWorker: vi.fn(async () => {
    mocks.order.push('webhooks');
  }),
}));
```

et `'webhooks'` après `'connecteurs'` dans les deux listes attendues qui contiennent `'connecteurs'` (les cas « lance l'indexation… puis la relève des connecteurs » et « démarre la même chose, avec ou sans clé Anthropic », qui compare deux fois). Les listes sans clé des connecteurs ne changent pas : le worker des webhooks ne démarre pas sans elle.

### 8.5 `src/server/connectors/worker.ts` (existe) : le lecteur de `connector-fetch`

Dans `registerWorkers` (`:20-47`), après le lecteur de `connector-sync` :

```ts
  await ensureQueue(boss, CONNECTOR_QUEUES.fetch, FETCH_QUEUE);
  // Quatre relèves ciblées à la fois (architecture, 10.1). Chacune lit un objet, sous la connexion d'une personne. Une
  // seule à la fois par compte d'application (fetchJobGroup, connectors/queue.ts) : la limite d'un portail HubSpot.
  await boss.work(
    CONNECTOR_QUEUES.fetch,
    { ...options, localConcurrency: 4, groupConcurrency: 1 },
    wakeQueueAfter(boss, CONNECTOR_QUEUES.fetch, async ([job]) => {
      const parsed = ConnectorFetchJobSchema.parse(job?.data);
      await fetchOneAndIngest(parsed, deps).catch((error) =>
        rethrowSummary('connector.fetch_failed', error, { tenantId: parsed.tenantId, outil: parsed.outil }),
      );
    }),
  );
```

avec `import { fetchOneAndIngest } from '@/server/webhooks/fetch-one';` et `ConnectorFetchJobSchema`, `FETCH_QUEUE` de `./queue`. Un job sans groupe (portée abonnement) n'est pas limité par `groupConcurrency` (`j.group_id IS NULL OR …`, `dist/plans.js:2246-2255`). `SyncDeps` (`sync.ts:29-33`) contient déjà ce que `fetchOneAndIngest` demande (`getConnector`, `fetchImpl`).

## 9. `inbox.ts` : prendre une livraison

Fichier : `src/server/webhooks/inbox.ts` (à créer). Le seul fichier de production qui nomme la fonction de prise (contrat `src/test/contracts/prendre-livraison.test.ts`, chapitre 01, 16.9). Aucun autre fichier de ce chapitre ne la nomme, même en commentaire.

Le déroulé, dans **une transaction sans contexte** (chapitre 01, section 11 et écart 4) :

1. Prendre la ligne. Rien : elle est déjà prise, inconnue, ou ignorée (abonnement plus en service, personne partie). Fin.
2. Lire la ligne par zod. Une ligne illisible est une faute de code : journalisée, et la prise est validée (le corps est vidé, la ligne `traitee`). La reprendre 24 heures durant n'apprendrait rien.
3. Trouver la `WebhookSpec` de l'outil. Aucune (outil retiré du code) : journalisé, validé.
4. `genre = 'livraison'` : `spec.match(corps, entetes)` ; un job `connector-fetch` par objet distinct. Les suppressions d'abord, `REMOVED_MAX` (100) au plus : aucune relève ne les rattrape (HubSpot n'en rend aucune, section 12.2). Puis les modifications, `MATCH_MAX` (50) au plus : la relève de 15 minutes rattrape le reste. Un job de portée app porte le groupe de son compte (`fetchJobGroup`).
   `genre = 'cycle'` : `spec.lifecycle(corps)` ; un seul job `abonnement-renouveler`, avec le motif le plus fort de la livraison.
5. Valider. Un envoi en file qui échoue lève : la transaction est annulée, la ligne reste `recue` avec son corps, le job est repris (3 fois), puis `porte-tic` la reprend après 30 secondes.

Aucune requête HTTP, aucun appel au modèle dans la transaction (architecture, 4 et 9.4). `match` et `lifecycle` sont pures ; un envoi pg-boss est une écriture en base, sur une autre connexion.

```ts
// src/server/webhooks/inbox.ts
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import {
  CONNECTOR_QUEUES,
  type ConnectorFetchJob,
  fetchJobGroup,
  fetchJobKey,
} from '@/server/connectors/queue';
import type {
  AnyConnector,
  LifecycleEvent,
  WebhookMatch,
  WebhookSpec,
} from '@/server/connectors/types';
import { db } from '@/server/db/client';
import { logError } from '@/server/log';
import { getBoss } from '@/server/pipeline/queue';
import { type SubscriptionJob, type SubscriptionMotive, WEBHOOK_QUEUES } from './queue';

// La boîte d'entrée des webhooks (dossier agents, 7.2 et écart E18). Une livraison sort une seule fois, par
// prendre_livraison, pour la correspondance (WebhookSpec.match), qui n'en tire que des identifiants. Le corps n'est
// lu par aucun modèle et ne sort pas d'ici : ni journal, ni job, ni erreur. Ce fichier est le seul qui nomme cette
// fonction (contrat prendre-livraison.test.ts).
//
// La prise vide le corps dans le même geste qu'elle le rend. Elle se fait donc dans une transaction qui n'est validée
// qu'après la mise en file : un échec avant la validation laisse la ligne « recue », corps compris.

// Par livraison. Les modifications au-delà : la relève de 15 minutes les rattrape. Les suppressions : rien ne les
// rattrape, d'où une borne à part, celle d'une requête HubSpot (100 événements, note 04).
export const MATCH_MAX = 50;
export const REMOVED_MAX = 100;

const Row = z.object({
  tenant_id: z.uuid(),
  user_id: z.uuid().nullable(),
  outil: z.enum(PROVIDER_IDS),
  portee: z.enum(['app', 'abonnement']),
  genre: z.enum(['livraison', 'cycle']),
  abonnement_id: z.uuid().nullable(),
  compte: z.string().min(1).max(200).nullable(),
  corps: z.string().nullable(),
  entetes: z.record(z.string(), z.string()),
});
type Delivery = z.infer<typeof Row>;

type SendOptions = { singletonKey: string; group?: { id: string } };
type Send = (queue: string, data: object, options: SendOptions) => Promise<string | null>;

export type InboxDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  send?: Send; // tests
};

// absente : rien à prendre. illisible, sans_suite : prise et validée sans job. en_file : au moins un job envoyé.
export type InboxOutcome = 'absente' | 'illisible' | 'sans_suite' | 'en_file';

type Planned = { queue: string; data: object; key: string; group?: { id: string } };

// Les noms d'événements de l'éditeur, en motifs. Une seule livraison de cycle de vie peut en porter plusieurs : on
// garde le plus fort. Un motif plus faible perdu ne coûte qu'un délai, la relève de 15 minutes le rattrape.
const MOTIVE: Record<LifecycleEvent['event'], SubscriptionMotive> = {
  supprime: 'supprime',
  reautoriser: 'reautoriser',
  manque: 'manque',
};
const STRENGTH: SubscriptionMotive[] = ['supprime', 'reautoriser', 'manque'];

// match et lifecycle ne doivent pas lever (contrat webhook-specs.test.ts). S'ils lèvent quand même, on n'en garde que
// le fait : le message d'une erreur de lecture peut citer le corps.
function safely<T>(event: string, ids: Record<string, string>, read: () => T[]): T[] {
  try {
    const result = read();
    return Array.isArray(result) ? result : [];
  } catch {
    logError(event, new Error('Webhook body reader threw'), ids);
    return [];
  }
}

function fetchJobs(spec: WebhookSpec<unknown>, delivery: Delivery, corps: string): Planned[] {
  const ids = { outil: delivery.outil, tenantId: delivery.tenant_id };
  const matches = safely<WebhookMatch>('porte.correspondance', ids, () =>
    spec.match(corps, delivery.entetes),
  );
  // Un objet une fois : « supprimé » l'emporte sur « modifié » dans la même livraison.
  const byRef = new Map<string, boolean>();
  for (const { ref, removed } of matches) {
    const externalId = ref?.externalId;
    if (typeof externalId !== 'string' || externalId === '' || externalId.length > 500) continue;
    byRef.set(externalId, (byRef.get(externalId) ?? false) || removed === true);
  }
  // Les suppressions d'abord : une suppression perdue n'est rattrapée par aucune relève.
  const removals = [...byRef].filter(([, removed]) => removed);
  const changes = [...byRef].filter(([, removed]) => !removed);
  if (removals.length > REMOVED_MAX || changes.length > MATCH_MAX) {
    logError('porte.trop_d_objets', new Error('Too many matches'), ids);
  }
  const kept = [...removals.slice(0, REMOVED_MAX), ...changes.slice(0, MATCH_MAX)];
  return kept.flatMap(([externalId, removed]): Planned[] => {
    let job: ConnectorFetchJob;
    if (delivery.portee === 'abonnement') {
      if (!delivery.user_id || !delivery.abonnement_id) return [];
      job = {
        portee: 'abonnement',
        tenantId: delivery.tenant_id,
        userId: delivery.user_id,
        abonnementId: delivery.abonnement_id,
        outil: delivery.outil,
        externalId,
        removed,
      };
    } else {
      if (!delivery.compte) return [];
      job = {
        portee: 'app',
        tenantId: delivery.tenant_id,
        compte: delivery.compte,
        outil: delivery.outil,
        externalId,
        removed,
      };
    }
    return [{ queue: CONNECTOR_QUEUES.fetch, data: job, key: fetchJobKey(job), group: fetchJobGroup(job) }];
  });
}

function lifecycleJobs(spec: WebhookSpec<unknown>, delivery: Delivery, corps: string): Planned[] {
  // Le cycle de vie n'existe que pour un abonnement (Microsoft Graph) : la porte refuse /cycle ailleurs.
  if (!spec.lifecycle || delivery.portee !== 'abonnement') return [];
  if (!delivery.user_id || !delivery.abonnement_id) return [];
  const read = spec.lifecycle.bind(spec);
  const events = safely<LifecycleEvent>('porte.cycle', { outil: delivery.outil }, () => read(corps));
  const motifs = new Set(events.map((event) => MOTIVE[event.event]).filter(Boolean));
  const motif = STRENGTH.find((candidate) => motifs.has(candidate));
  if (!motif) return [];
  const externeId = events.find((event) => MOTIVE[event.event] === motif)?.externalId;
  const job: SubscriptionJob = {
    abonnementId: delivery.abonnement_id,
    tenantId: delivery.tenant_id,
    userId: delivery.user_id,
    motif,
    ...(externeId && externeId.length <= 500 ? { externeId } : {}),
  };
  return [{ queue: WEBHOOK_QUEUES.renew, data: job, key: job.abonnementId }];
}

const defaultSend: Send = async (queue, data, options) => (await getBoss()).send(queue, data, options);

export async function processDelivery(id: string, deps: InboxDeps): Promise<InboxOutcome> {
  const send = deps.send ?? defaultSend;
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`select * from prendre_livraison(${id}::uuid)`);
    if (rows.length === 0) return 'absente';
    const parsed = Row.safeParse(rows[0]);
    if (!parsed.success) {
      // Jamais les détails de zod : ils peuvent citer une valeur de la ligne.
      logError('porte.ligne_illisible', new Error('Unexpected inbox row'), { id });
      return 'illisible';
    }
    const delivery = parsed.data;
    const spec = deps.getConnector(delivery.outil)?.webhook;
    if (!spec || delivery.corps === null) {
      logError('porte.sans_spec', new Error('No webhook for this delivery'), { id, outil: delivery.outil });
      return 'sans_suite';
    }
    const planned =
      delivery.genre === 'cycle'
        ? lifecycleJobs(spec as WebhookSpec<unknown>, delivery, delivery.corps)
        : fetchJobs(spec as WebhookSpec<unknown>, delivery, delivery.corps);
    // Une erreur ici annule la prise : la ligne reste « recue », corps compris, et sera reprise.
    for (const job of planned) {
      await send(job.queue, job.data, { singletonKey: job.key, ...(job.group ? { group: job.group } : {}) });
    }
    return planned.length > 0 ? 'en_file' : 'sans_suite';
  });
}
```

À savoir :

- `prendre_livraison` verrouille la ligne (`for update skip locked`, chapitre 01) : deux jobs sur la même ligne ne la prennent pas deux fois. Le second trouve 0 ligne pendant que le premier tient le verrou, puis 0 ligne parce qu'elle est `traitee`.
- `send` rend `null` quand un job de même clé attend déjà (`short` : `connector-fetch`, `porte-traiter` ; `stately` : `abonnement-renouveler`) : ce n'est pas une erreur. Sous `standard`, pg-boss 12 ne dédoublonne rien par `singletonKey` (index uniques `job_i1` à `job_i3` réservés à `short`, `singleton`, `stately`, `dist/plans.js:1186-1195`) : d'où l'écart E-p.
- Deux jobs pour la même ligne (une notification et le tic, quand le premier tourne déjà) : le second trouve la ligne verrouillée ou `traitee` et rend `absente`. `inbox.db.test.ts` le vérifie.
- Si l'envoi réussit et que la validation échoue, la ligne est reprise et renvoyée : la clé unique du job de relève le dédoublonne tant que le premier n'a pas tourné, et une relève de trop ne fait que relire (chapitre 01, section 11).
- `WebhookSpec<Record<string, unknown>>` (le type de `AnyConnector`) est converti en `WebhookSpec<unknown>` : `match` et `lifecycle` ne lisent pas la configuration.

## 10. `fetch-one.ts` : la relève ciblée

Fichier : `src/server/webhooks/fetch-one.ts` (à créer). Lu par la file `connector-fetch` (section 8.5). Il suit le chemin de la relève (architecture, 8.3 ; `sync.ts:94-97`, existe) : lire, `normalizeItem(item, provider)`, `ingestConnectorItems`. La lecture passe par `openConnection` (chapitre 05, section 6) : la connexion de la personne, la sienne seulement, hors pause, jetons frais sous le verrou `renew_lock_at`.

### 10.1 Les règles

| Cas | Ce que fait le job |
|---|---|
| Portée `abonnement` | La personne de l'abonnement (`userId` du job), sa connexion (lue sur la ligne d'abonnement, sous ses droits). Une seule tentative |
| Portée `app` | `connexions_du_compte(tenant, outil, compte)`, par ancienneté. La plus ancienne d'abord ; la suivante si l'objet est introuvable ou interdit, ou si la connexion est inutilisable ou refusée ; trois lectures au plus (architecture, 8.3). Les jobs d'un même compte passent un à un (`fetchJobGroup`, 8.2) |
| Le connecteur a `fetchOne` | Lire l'objet ; `null` : introuvable ou invisible pour cette connexion |
| Le connecteur n'a pas `fetchOne` (Fathom) | Une relève ordinaire, hors tour : `requestSyncNow` (existe, `connections.ts:297`) avance l'échéance ; le tic `connector-tick` la met en file `connector-sync` dans la minute. C'est la « relève hors tour » de l'architecture (10.1) |
| Objet lu, avec du texte | `normalizeItem`, puis `ingestConnectorItems` sous la connexion qui l'a lu, avec ses droits ordinaires. Les autres connexions du compte le reçoivent à leur sondage |
| Objet lu, sans texte | Rien à ingérer (`normalizeItem` rend `null`) ; c'est une réussite : on ne passe pas à la connexion suivante |
| `removed` et lecture `null`, portée `abonnement` | `removeConnectorItems` (existe, `ingest-items.ts:144`) pour cette connexion |
| `removed` et lecture `null`, portée `app` | `removeConnectorItems` pour la connexion qui a lu, puis pour **chaque** connexion que rend `connexions_du_compte` (20 au plus), sous les droits de sa personne et sans relire : la suppression est signée par l'éditeur et une lecture l'a confirmée. Chaque membre a sa propre copie (une source par personne : clé `tenant_id, owner_user_id, kind, external_id`, `ingest-items.ts:56`), et aucune relève HubSpot ne retire rien (section 12.2). Relire chez chacun coûterait une requête par personne et par événement, ce que l'architecture écarte (8.3). Écart E-q |
| `removed` et objet lu | L'éditeur s'est trompé ou l'objet est revenu : on l'ingère ; aucune copie n'est retirée |
| Autorisation refusée pendant le job : `OAuthRefusedError` (jeton de renouvellement absent ou révoqué, levée par `ensureFreshTokens` dans `openConnection`, `oauth.ts:25` et `:202`), ou `ConnectorAuthError` (401, ou 403 hors `fetchOne`) | Portée `app` : journalisé, connexion suivante. Portée `abonnement` : journalisé, `sans_connexion`, sans reprise (reprendre n'y changerait rien). Dans les deux cas, la relève de cette connexion la marque « à reconnecter » (`sync.ts:205`, qui traite les deux classes ensemble). Un 403 sur l'objet lui-même n'est pas un refus du jeton : `fetchOne` rend `null` (`missingAsNull`, 10.2) |
| Autre erreur (5xx, réseau, délai) | Le job lève ; pg-boss le reprend deux fois (`short`, 2 reprises) |

Un objet n'est jamais retiré sur la seule foi du corps d'un webhook : il faut une lecture qui rende `null` (architecture, 9.5, point 10 : « l'objet est toujours relu par l'API »).

### 10.2 `missingAsNull`, dans `src/server/connectors/http.ts` (existe)

Un `fetchOne` rend `null` pour un objet parti ou caché. Le client HTTP lève `ConnectorHttpError(404, …)` sur un 404 et `ConnectorAuthError(label, 403)` sur un 403 (`http.ts:225-226`). Une aide, ajoutée après `NothingToReadError` (`:67-69`), pour que chaque connecteur dise la même chose :

```ts
// Lire en direct un objet qui a pu disparaître : null pour introuvable (404), parti (410) ou interdit à cette
// connexion (403). Le reste remonte : un 401 (jeton refusé), une limite, un 5xx. Sert à Connector.fetchOne.
export async function missingAsNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ConnectorHttpError && (error.status === 404 || error.status === 410)) return null;
    if (error instanceof ConnectorAuthError && error.status === 403) return null;
    throw error;
  }
}
```

### 10.3 Le code

```ts
// src/server/webhooks/fetch-one.ts
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ProviderId } from '@/capture/turn';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { requestSyncNow } from '@/server/connectors/connections';
import { ConnectorAuthError } from '@/server/connectors/http';
import { ingestConnectorItems, removeConnectorItems } from '@/server/connectors/ingest-items';
import { normalizeItem } from '@/server/connectors/normalize';
import { OAuthRefusedError } from '@/server/connectors/oauth';
import { openConnection } from '@/server/connectors/open';
import type { ConnectorFetchJob } from '@/server/connectors/queue';
import type { AnyConnector } from '@/server/connectors/types';
import { db } from '@/server/db/client';
import { abonnementsWebhook } from '@/server/db/schema/webhooks';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';

// La relève ciblée (dossier agents, 5.2 et 8.3) : un webhook a désigné un objet, on le relit en direct chez l'éditeur
// avec la connexion d'une personne, puis il rejoint l'ingestion ordinaire. Un webhook ne déclenche jamais d'agent :
// l'élément indexé passe ensuite par emitIndexed, comme une relève. L'ingestion est idempotente : relire un objet déjà
// connu n'ajoute que ses tours nouveaux.

export type FetchDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  fetchImpl?: typeof fetch; // tests
};

// ingere : lu et ingéré (ou lu sans texte). releve : relève hors tour demandée. retire : copie retirée.
// absent : aucune connexion n'a vu l'objet. sans_connexion : personne ne peut lire pour ce job.
export type FetchOutcome = 'ingere' | 'releve' | 'retire' | 'absent' | 'sans_connexion';

// Architecture, 8.3 : « s'arrête à trois ». Des lectures : retirer les copies des autres connexions n'en coûte aucune.
export const APP_TRIES_MAX = 3;

type Attempt = Exclude<FetchOutcome, 'sans_connexion'> | 'inutilisable';
type Listener = { connection_id: string; user_id: string };

// Une autorisation refusée, sous ses deux formes : le jeton de renouvellement absent ou révoqué (OAuthRefusedError,
// levée par ensureFreshTokens dans openConnection), ou le jeton refusé par l'outil (ConnectorAuthError). Deux classes
// distinctes, que la relève traite déjà ensemble (sync.ts:205). Reprendre le job n'y changerait rien.
const isRefusal = (error: unknown) =>
  error instanceof ConnectorAuthError || error instanceof OAuthRefusedError;

const refOf = (ctx: TenantContext, connectionId: string, job: ConnectorFetchJob, connector: AnyConnector) => ({
  id: connectionId,
  provider: job.outil,
  createdBy: ctx.userId,
  privateRaw: connector.privateRaw,
});

async function tryConnection(
  ctx: TenantContext,
  connectionId: string,
  connector: AnyConnector,
  job: ConnectorFetchJob,
  deps: FetchDeps,
): Promise<Attempt> {
  const provider = job.outil;
  if (!connector.fetchOne) {
    // Pas de lecture d'un objet chez cet outil (Fathom) : la relève ordinaire de la connexion, tout de suite.
    return (await requestSyncNow(ctx, connectionId)) ? 'releve' : 'inutilisable';
  }
  const live = await openConnection(ctx, provider, { connectionId, fetchImpl: deps.fetchImpl });
  if (!live) return 'inutilisable'; // en pause, supprimée, configuration refusée
  const item = await connector.fetchOne(live.config, { externalId: job.externalId }, live.http);
  const connection = refOf(ctx, connectionId, job, connector);
  if (item === null) {
    if (!job.removed) return 'absent';
    await removeConnectorItems(ctx, connection, [job.externalId]);
    return 'retire';
  }
  const normalized = normalizeItem(item, provider);
  if (normalized) await ingestConnectorItems(ctx, connection, [normalized]);
  return 'ingere';
}

async function forSubscription(
  job: Extract<ConnectorFetchJob, { portee: 'abonnement' }>,
  connector: AnyConnector,
  deps: FetchDeps,
): Promise<FetchOutcome> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'sans_connexion'; // partie de l'organisation
  // La ligne est privée à la personne (modèle P) : lue sous ses droits.
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ connectionId: abonnementsWebhook.connectionId })
      .from(abonnementsWebhook)
      .where(
        and(
          eq(abonnementsWebhook.id, job.abonnementId),
          eq(abonnementsWebhook.outil, job.outil),
          inArray(abonnementsWebhook.etat, ['active', 'manuelle']),
        ),
      ),
  );
  if (!row) return 'sans_connexion';
  try {
    const attempt = await tryConnection(ctx, row.connectionId, connector, job, deps);
    return attempt === 'inutilisable' ? 'sans_connexion' : attempt;
  } catch (error) {
    // La relève de cette connexion la marquera « à reconnecter » ; trois reprises n'y changeraient rien.
    if (!isRefusal(error)) throw error;
    logError('connector.fetch_refused', error, { connectionId: row.connectionId, outil: job.outil });
    return 'sans_connexion';
  }
}

// Une suppression signée par l'éditeur, confirmée par une lecture : la copie de chaque autre connexion qui écoute ce
// compte part aussi, sous les droits de sa personne. Aucune requête chez l'éditeur (écart E-q).
async function removeOtherCopies(
  rows: Listener[],
  readBy: string,
  job: Extract<ConnectorFetchJob, { portee: 'app' }>,
  connector: AnyConnector,
): Promise<void> {
  for (const row of rows) {
    if (row.connection_id === readBy) continue;
    const ctx = await resolveTenantContext(row.user_id, job.tenantId);
    if (!ctx) continue;
    await removeConnectorItems(ctx, refOf(ctx, row.connection_id, job, connector), [job.externalId]);
  }
}

async function forAccount(
  job: Extract<ConnectorFetchJob, { portee: 'app' }>,
  connector: AnyConnector,
  deps: FetchDeps,
): Promise<FetchOutcome> {
  const { rows } = await db.execute<Listener>(
    sql`select connection_id, user_id from connexions_du_compte(${job.tenantId}, ${job.outil}, ${job.compte})`,
  );
  let tried = 0;
  for (const row of rows) {
    if (tried >= APP_TRIES_MAX) break;
    const ctx = await resolveTenantContext(row.user_id, job.tenantId);
    if (!ctx) continue;
    tried += 1;
    let attempt: Attempt;
    try {
      attempt = await tryConnection(ctx, row.connection_id, connector, job, deps);
    } catch (error) {
      // Une autorisation refusée ne dit rien de l'objet : la connexion suivante peut le lire.
      if (!isRefusal(error)) throw error;
      logError('connector.fetch_refused', error, { connectionId: row.connection_id, outil: job.outil });
      continue;
    }
    if (attempt === 'ingere' || attempt === 'releve') return attempt;
    if (attempt === 'retire') {
      await removeOtherCopies(rows, row.connection_id, job, connector);
      return 'retire';
    }
  }
  return tried === 0 ? 'sans_connexion' : 'absent';
}

export async function fetchOneAndIngest(job: ConnectorFetchJob, deps: FetchDeps): Promise<FetchOutcome> {
  const connector = deps.getConnector(job.outil);
  if (!connector?.webhook) return 'sans_connexion';
  return job.portee === 'abonnement'
    ? forSubscription(job, connector, deps)
    : forAccount(job, connector, deps);
}
```

À savoir :

- `ingestConnectorItems` prend des `NormalizedItem[]` (`ingest-items.ts:67-71`) : `normalizeItem` passe toujours avant. L'oublier était l'objection C13 de la relecture (architecture, 14.1).
- `ConnectionRef.createdBy` vaut `ctx.userId` : `openConnection` ne rend que les connexions de la personne (`loadMyConnections`, `connections.ts:347-377`, filtre `createdByMe`).
- Une connexion Pipedream n'a jamais d'abonnement (`subscribeConnection` l'écarte, section 11) : aucun job n'arrive ici pour elle, et aucun crédit n'est dépensé.
- Un objet relevé par webhook puis par le sondage de 15 minutes n'est ingéré qu'une fois : `insertNewTurns` ne crée que les tours nouveaux.
- `TokenRenewalBusyError` (chapitre 05 : un autre processus renouvelle le jeton) n'est pas un refus : elle étend `ConnectorHttpError`, le job lève et pg-boss le reprend.
- Le retrait des autres copies ne relit rien : 20 écritures en base au plus, aucune requête chez l'éditeur. Un 403 de la connexion qui lit compte comme une lecture nulle : la suppression vient d'une livraison signée par l'éditeur, et une personne qui ne voit plus l'objet n'a plus à en garder la copie (droits d'origine).

## 11. `subscriptions.ts` : abonner, renouveler, cycle de vie, désabonner

Fichier : `src/server/webhooks/subscriptions.ts` (à créer). Toutes les écritures passent sous le contexte de la personne de la connexion : `abonnements_webhook` est privée (modèle P, `acl = array[user_id]`) et la règle `own_connection` refuse une ligne pour une connexion qu'elle n'a pas branchée (chapitre 01, section 11). `leon_app` peut modifier `externe_id, secret, etat, expire_le, renouveler_le, renouvele_le, erreur`, pas `ressource` ni `compte` : une autre ressource ou un autre compte, c'est une autre ligne.

### 11.1 Les règles

| Moment | Ce qui se passe |
|---|---|
| **À chaque relève réussie, après la lecture** (`runConnectorSync`, après `rememberAccountKey`, avant `finishSync`) | `subscribeConnection` : rien si la connexion a une ligne vivante (`active` non échue), `manuelle` ou `resiliee` ; sinon on crée. Aucune file de plus (architecture, 8.3 et 10.1). Après la lecture : un éditeur lent ou en panne ne retarde jamais la mémoire, et une connexion HubSpot neuve a déjà son `accountKey` (écart E-r) |
| Portée `abonnement` | Identifiant de ligne **neuf à chaque création**, jamais celui d'une ligne morte : la porte n'a jamais vu cette adresse, aucun de ses caches ne la connaît. Secret tiré au hasard, `webhook.subscribe` chez l'éditeur, puis, dans une transaction, la ligne morte supprimée et la neuve écrite (`unique (connection_id, ressource)`). Microsoft valide l'adresse pendant l'appel : la porte répond à l'écho sans lire la base (étape 3 de 6.1, écart E-k) |
| Portée `app` | Aucun appel chez l'éditeur : l'abonnement est réglé une fois pour toutes dans l'appli de Leon (HubSpot, note 04 : « abonnement par application, configuré dans l'application développeur »). La ligne dit « cette connexion écoute ce compte » (`compte` = `config.accountKey`). Seulement pour une connexion par le bouton (`authMode = 'oauth'`) |
| Échéance | `expire_le` lue dans la réponse de l'éditeur ; `renouveler_le = maintenant + 3/4 × (expire_le − maintenant)` (architecture, 8.3). Nulle : jamais renouvelée |
| Renouvellement | `abonnement-tic` (10 minutes) → `abonnement-renouveler`, motif `echeance`. `webhook.renew` ; nouvelle échéance, nouveau `renouveler_le`, `renouvele_le = maintenant` |
| L'éditeur ne connaît plus l'abonnement (404, 410) | `etat = 'expiree'`, relève hors tour : `subscribeConnection` le recrée, sous une adresse neuve |
| L'éditeur refuse les jetons (401, 403), ou l'autorisation est perdue avant l'appel (`OAuthRefusedError` dans `openConnection`) | `etat = 'erreur'` et un message, sans reprise du job. La relève suivante marquera la connexion à reconnecter ; un abonnement `erreur` se recrée dès qu'elle repasse |
| Connexion en pause ou illisible | `etat = 'erreur'`. L'abonnement de l'éditeur s'éteint à son échéance ; il est recréé quand la relève reprend |
| Cycle de vie `reautoriser` | Renouveler tout de suite (même chemin que l'échéance) |
| Cycle de vie `supprime` | `etat = 'expiree'`, relève hors tour, qui réabonne |
| Cycle de vie `manque` | Relève hors tour seulement |
| « Reconnecter » | Les lignes `resiliee` de la connexion repassent à `expiree` ; la relève qui suit coupe l'ancien abonnement chez l'éditeur avec les jetons neufs, puis en crée un sous une adresse neuve |
| Suppression d'une connexion par son créateur, suppression du compte | Avant : relever les abonnements et ouvrir la connexion (jetons frais). Après : `webhook.unsubscribe`, une tentative chacun, sans bloquer (modèle : `pipedreamUsersOf`, `delete-account.ts:121`) |
| Suppression d'une organisation | Le même code (`runDeletion`, partagé par `deleteAccountAction` et `deleteOrganizationAction`, `settings/actions.ts:490-557`) : seuls les abonnements de l'appelant sont coupés. Ceux des autres membres restent chez l'éditeur ; leurs lignes partent avec les connexions, la porte refuse leurs livraisons. Microsoft les éteint à l'échéance ; un webhook Fathom continue d'appeler (section 16) |
| Membre retiré | Rien chez l'éditeur (ses jetons ne servent plus) ; ses lignes passent à `resiliee` par `couper_agents_du_membre` (chapitre 01) |

Une relève hors tour est `requestSyncNow(ctx, connectionId)` (existe, `connections.ts:297`) : l'échéance passe à maintenant, le tic de la minute met le job `connector-sync`. `claimConnection` exige une échéance passée (`connections.ts:403`) : envoyer directement un job `connector-sync` ne suffirait pas.

### 11.2 Le code

```ts
// src/server/webhooks/subscriptions.ts
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { ProviderId } from '@/capture/turn';
import type { LiveConnection } from '@/server/actions/spec';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { type LoadedConnection, requestSyncNow } from '@/server/connectors/connections';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { OAuthRefusedError } from '@/server/connectors/oauth';
import { openConnection } from '@/server/connectors/open';
import { connectorHttp } from '@/server/connectors/pipedream';
import type { AnyConnector, WebhookSpec } from '@/server/connectors/types';
import { abonnementsWebhook } from '@/server/db/schema/webhooks';
import { withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { newSubscriptionSecret, porteKey, sealSubscriptionSecret } from './crypto';
import type { SubscriptionJob } from './queue';
import { porteBase } from './verify';

// Les abonnements chez les éditeurs (dossier agents, 8.3). Créés à chaque relève réussie, après la lecture,
// renouvelés aux trois quarts de leur durée, recréés après un refus ou une suppression (toujours sous une adresse
// neuve), coupés à la suppression d'une connexion ou d'un compte. Le sondage de 15 minutes reste le filet : rien ici
// ne fait échouer une relève.

type Row = typeof abonnementsWebhook.$inferSelect;
type Spec = WebhookSpec<Record<string, unknown>>;

export type SubscribeDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

// sans_webhook : l'outil n'en a pas (ou connexion Pipedream). non_regle : LEON_PORTE_URL hors https, LEON_PORTE_KEY
// absente, ou pas de clé de compte. en_service : rien à faire. cree : créé ou recréé. erreur : journalisée.
export type SubscribeOutcome = 'sans_webhook' | 'non_regle' | 'en_service' | 'cree' | 'erreur';

// Lus par la page Connexions (chapitre 07) : en anglais, comme connections.last_error. 300 caractères au plus.
const ERRORS = {
  subscribe: 'The tool refused the subscription; it will be retried at the next sync.',
  refused: 'The tool refused the renewal: reconnect it.',
  renew: 'The renewal failed; it will be retried.',
  closed: 'The connection is paused or unreadable.',
} as const;

// La ressource d'une ligne de webhook d'application : une connexion n'écoute qu'un compte.
const APP_RESOURCE = 'app';

// Les éditeurs n'appellent qu'une adresse https publique : en local (http://localhost), on ne s'abonne pas.
export function subscriptionBase(url = env.LEON_PORTE_URL): string | null {
  const base = porteBase(url);
  return base?.startsWith('https://') ? base : null;
}

export function callbackUrls(base: string, outil: ProviderId, abonnementId: string) {
  const url = `${base}/h/${outil}/${abonnementId}`;
  return { url, lifecycleUrl: `${url}/cycle` };
}

// Aux trois quarts de la durée qui reste (architecture, 8.3). null : l'abonnement n'expire pas.
export function renewAt(now: Date, expiresAt: Date | null): Date | null {
  if (expiresAt === null) return null;
  const left = Math.max(0, expiresAt.getTime() - now.getTime());
  return new Date(now.getTime() + Math.floor(left * 0.75));
}

const isLive = (row: Row, now: Date) =>
  row.etat === 'active' && (row.expireLe === null || row.expireLe > now);

const rowsOf = (ctx: TenantContext, connectionId: string) =>
  withTenant(ctx, (tx) =>
    tx.select().from(abonnementsWebhook).where(eq(abonnementsWebhook.connectionId, connectionId)),
  );

async function setState(
  ctx: TenantContext,
  id: string,
  etat: 'expiree' | 'erreur',
  erreur: string | null = null,
): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx.update(abonnementsWebhook).set({ etat, erreur }).where(eq(abonnementsWebhook.id, id)),
  );
}

// Un webhook d'application (HubSpot) : rien à créer chez l'éditeur. La ligne dit à porte_deposer quelles organisations
// reçoivent une livraison pour ce compte. Une clé collée (appli privée HubSpot) ne reçoit pas les webhooks de l'appli de
// Leon : seulement une connexion par le bouton. config.accountKey est lu sur la connexion chargée, pas sur la
// configuration validée (le z.object du connecteur retire les champs qu'il ne connaît pas).
async function listenAccount(
  ctx: TenantContext,
  connection: LoadedConnection,
  dead: Row | null,
): Promise<SubscribeOutcome> {
  const { accountKey, authMode } = connection.config;
  if (authMode !== 'oauth' || typeof accountKey !== 'string') return 'non_regle';
  if (accountKey === '' || accountKey.length > 200) return 'non_regle';
  await withTenant(ctx, async (tx) => {
    if (dead?.compte === accountKey) {
      await tx
        .update(abonnementsWebhook)
        .set({ etat: 'active', erreur: null })
        .where(eq(abonnementsWebhook.id, dead.id));
      return;
    }
    if (dead) await tx.delete(abonnementsWebhook).where(eq(abonnementsWebhook.id, dead.id));
    await tx.insert(abonnementsWebhook).values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      connectionId: connection.id,
      outil: connection.provider,
      portee: 'app',
      compte: accountKey,
      ressource: APP_RESOURCE,
      acl: [ctx.userId],
    });
  });
  return 'cree';
}

async function subscribe(
  ctx: TenantContext,
  connection: LoadedConnection,
  ready: { connector: AnyConnector; config: Record<string, unknown> },
  spec: Spec,
  dead: Row | null,
  now: Date,
  deps: SubscribeDeps,
): Promise<SubscribeOutcome> {
  if (!spec.subscribe) return 'sans_webhook';
  const base = subscriptionBase();
  const key = porteKey();
  if (!base || !key) return 'non_regle';
  const http = connectorHttp(connection.provider, ready.connector, ready.config, deps);
  // L'ancien vit peut-être encore chez l'éditeur (après « Reconnecter », un 404 douteux, un refus) : on le coupe.
  if (dead?.externeId && spec.unsubscribe) {
    await spec
      .unsubscribe(ready.config, http, { externalId: dead.externeId })
      .catch((error) => logError('abonnement.couper_ancien', error, { abonnementId: dead.id }));
  }
  // Une adresse neuve à chaque création, jamais celle de la ligne morte : la porte a pu la mettre en cache négatif
  // (10 minutes) ou garder son ancien secret (60 secondes). Un id jamais vu n'est dans aucun cache (écart E-o).
  const id = randomUUID();
  const secret = newSubscriptionSecret();
  let created: Awaited<ReturnType<NonNullable<Spec['subscribe']>>>;
  try {
    created = await spec.subscribe(ready.config, http, {
      ...callbackUrls(base, connection.provider, id),
      secret,
    });
  } catch (error) {
    logError('abonnement.refuse', error, { connectionId: connection.id, outil: connection.provider });
    if (dead) await setState(ctx, dead.id, 'erreur', ERRORS.subscribe);
    return 'erreur';
  }
  // Premier lot : un appel, un abonnement ; l'adresse porte l'id d'une seule ligne (écart E-a). Le reste est coupé.
  const [first, ...others] = created;
  for (const extra of first ? others : []) {
    await spec.unsubscribe?.(ready.config, http, { externalId: extra.externalId }).catch(() => {});
  }
  if (!first) return 'erreur';
  const expireLe = first.expiresAt === null ? null : new Date(first.expiresAt);
  try {
    // La ligne morte part dans la même transaction que la neuve arrive : unique (connection_id, ressource).
    await withTenant(ctx, async (tx) => {
      if (dead) await tx.delete(abonnementsWebhook).where(eq(abonnementsWebhook.id, dead.id));
      await tx.insert(abonnementsWebhook).values({
        id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        connectionId: connection.id,
        outil: connection.provider,
        portee: 'abonnement',
        ressource: first.resource,
        externeId: first.externalId,
        // Fathom rend son propre secret (whsec_…) ; Microsoft garde le nôtre (clientState).
        secret: sealSubscriptionSecret(first.secret ?? secret, { tenantId: ctx.tenantId, abonnementId: id }, key),
        etat: 'active',
        expireLe,
        renouvelerLe: renewAt(now, expireLe),
        acl: [ctx.userId],
      });
    });
  } catch (error) {
    // La ligne n'a pas pu s'écrire : l'abonnement neuf ne doit pas rester chez l'éditeur sans adresse qui réponde. La
    // ligne morte reste (transaction annulée) : la relève suivante recommence.
    await spec.unsubscribe?.(ready.config, http, { externalId: first.externalId }).catch(() => {});
    throw error;
  }
  return 'cree';
}

// À chaque relève réussie, après la lecture (sync.ts). Ne lève jamais : la relève passe quoi qu'il arrive.
export async function subscribeConnection(
  ctx: TenantContext,
  connection: LoadedConnection,
  ready: { connector: AnyConnector; config: Record<string, unknown> },
  deps: SubscribeDeps = {},
): Promise<SubscribeOutcome> {
  const spec = ready.connector.webhook;
  // Une connexion Pipedream (Gmail, Drive, Slack) : aucun webhook tant que Leon n'a pas ses applis (architecture, 8.3).
  if (!spec || connection.config.authMode === 'pipedream') return 'sans_webhook';
  try {
    const rows = await rowsOf(ctx, connection.id);
    const now = (deps.now ?? (() => new Date()))();
    // Une adresse collée à la main, ou un abonnement coupé au départ de la personne : jamais touchés.
    if (rows.some((row) => row.etat === 'manuelle' || row.etat === 'resiliee')) return 'en_service';
    if (rows.some((row) => isLive(row, now))) return 'en_service';
    // Ce qui reste est mort : expiree, erreur, ou active échue. Premier lot : une ligne par connexion (écart E-a).
    const dead = rows[0] ?? null;
    if (spec.scope === 'app') return await listenAccount(ctx, connection, dead);
    return await subscribe(ctx, connection, ready, spec as Spec, dead, now, deps);
  } catch (error) {
    logError('abonnement.creer', error, { connectionId: connection.id, outil: connection.provider });
    return 'erreur';
  }
}

export type SubscriptionDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

// renouvele : nouvelle échéance. releve : relève hors tour demandée. a_recreer : la relève suivante réabonne.
// erreur : marqué sur la ligne. sans_suite : rien à faire (ligne partie, autre abonnement, personne partie).
export type SubscriptionOutcome = 'renouvele' | 'releve' | 'a_recreer' | 'erreur' | 'sans_suite';

async function recreateLater(ctx: TenantContext, row: Row): Promise<SubscriptionOutcome> {
  await setState(ctx, row.id, 'expiree');
  await requestSyncNow(ctx, row.connectionId);
  return 'a_recreer';
}

// Le job abonnement-renouveler : une échéance (tic) ou une notification de cycle de vie (inbox.ts).
export async function runSubscriptionJob(
  job: SubscriptionJob,
  deps: SubscriptionDeps,
): Promise<SubscriptionOutcome> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'sans_suite';
  const [row] = await withTenant(ctx, (tx) =>
    tx.select().from(abonnementsWebhook).where(eq(abonnementsWebhook.id, job.abonnementId)),
  );
  if (row?.portee !== 'abonnement' || row.etat !== 'active') return 'sans_suite';
  // Une notification qui nomme un autre abonnement que la ligne : un ancien, que l'éditeur n'a pas encore oublié.
  if (job.externeId !== undefined && job.externeId !== row.externeId) return 'sans_suite';
  const spec = deps.getConnector(row.outil)?.webhook;
  if (!spec) return 'sans_suite';
  if (job.motif === 'supprime') return recreateLater(ctx, row);
  if (job.motif === 'manque') {
    await requestSyncNow(ctx, row.connectionId);
    return 'releve';
  }
  if (!spec.renew || !row.externeId) return 'sans_suite';
  // Jeton de renouvellement absent ou révoqué : ensureFreshTokens lève OAuthRefusedError, qui n'est pas une
  // ConnectorAuthError. Sans cette garde, le job lèverait trois fois, la ligne resterait « active » et abonnement-tic la
  // remettrait en file toutes les 10 minutes, sans fin.
  let live: Awaited<ReturnType<typeof openConnection>>;
  try {
    live = await openConnection(ctx, row.outil, {
      connectionId: row.connectionId,
      fetchImpl: deps.fetchImpl,
    });
  } catch (error) {
    if (!(error instanceof OAuthRefusedError)) throw error;
    logError('abonnement.renouvellement_refuse', error, { abonnementId: row.id, outil: row.outil });
    await setState(ctx, row.id, 'erreur', ERRORS.refused);
    return 'erreur';
  }
  if (!live) {
    await setState(ctx, row.id, 'erreur', ERRORS.closed);
    return 'erreur';
  }
  const now = (deps.now ?? (() => new Date()))();
  try {
    const { expiresAt } = await spec.renew(live.config, live.http, { externalId: row.externeId });
    const expireLe = expiresAt === null ? null : new Date(expiresAt);
    await withTenant(ctx, (tx) =>
      tx
        .update(abonnementsWebhook)
        .set({ expireLe, renouvelerLe: renewAt(now, expireLe), renouveleLe: now, erreur: null })
        .where(and(eq(abonnementsWebhook.id, row.id), eq(abonnementsWebhook.etat, 'active'))),
    );
    return 'renouvele';
  } catch (error) {
    if (error instanceof ConnectorHttpError && (error.status === 404 || error.status === 410)) {
      return recreateLater(ctx, row);
    }
    if (error instanceof ConnectorAuthError) {
      logError('abonnement.renouvellement_refuse', error, { abonnementId: row.id, outil: row.outil });
      await setState(ctx, row.id, 'erreur', ERRORS.refused);
      return 'erreur';
    }
    await withTenant(ctx, (tx) =>
      tx.update(abonnementsWebhook).set({ erreur: ERRORS.renew }).where(eq(abonnementsWebhook.id, row.id)),
    );
    throw error; // pg-boss reprend (3 fois, 60 s, progressif)
  }
}

// « Reconnecter » : les abonnements coupés au départ de la personne repartent. Rend le nombre de lignes reprises.
export async function reviveSubscriptions(ctx: TenantContext, connectionId: string): Promise<number> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(abonnementsWebhook)
      .set({ etat: 'expiree', erreur: null })
      .where(
        and(eq(abonnementsWebhook.connectionId, connectionId), eq(abonnementsWebhook.etat, 'resiliee')),
      )
      .returning({ id: abonnementsWebhook.id }),
  );
  return rows.length;
}

export type PendingUnsubscribe = {
  abonnementId: string;
  outil: ProviderId;
  externalId: string;
  live: LiveConnection;
  spec: Spec;
};

// Avant de supprimer des connexions de la personne (ou son compte) : ses abonnements à couper chez l'éditeur, avec la
// connexion ouverte (jetons frais) pour le faire après. Seulement les siens : un administrateur qui supprime la
// connexion d'un collègue ne lit pas ses abonnements (modèle P) et ne se sert pas de ses jetons (architecture, 9.1,
// point 6).
export async function pendingUnsubscribes(
  ctx: TenantContext,
  connectionIds: string[] | 'toutes',
  deps: { getConnector: (id: ProviderId) => AnyConnector | null; fetchImpl?: typeof fetch },
): Promise<PendingUnsubscribe[]> {
  if (connectionIds !== 'toutes' && connectionIds.length === 0) return [];
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(abonnementsWebhook)
      .where(
        and(
          eq(abonnementsWebhook.userId, ctx.userId),
          eq(abonnementsWebhook.portee, 'abonnement'),
          isNotNull(abonnementsWebhook.externeId),
          inArray(abonnementsWebhook.etat, ['active', 'expiree', 'erreur']),
          connectionIds === 'toutes' ? undefined : inArray(abonnementsWebhook.connectionId, connectionIds),
        ),
      ),
  );
  const opened = new Map<string, LiveConnection | null>();
  const pending: PendingUnsubscribe[] = [];
  for (const row of rows) {
    const spec = deps.getConnector(row.outil)?.webhook;
    if (!spec?.unsubscribe || !row.externeId) continue;
    if (!opened.has(row.connectionId)) {
      const live = await openConnection(ctx, row.outil, {
        connectionId: row.connectionId,
        fetchImpl: deps.fetchImpl,
      }).catch(() => null);
      opened.set(row.connectionId, live);
    }
    const live = opened.get(row.connectionId);
    if (live) {
      pending.push({ abonnementId: row.id, outil: row.outil, externalId: row.externeId, live, spec: spec as Spec });
    }
  }
  return pending;
}

// Après la suppression : une tentative par abonnement, un échec journalisé, jamais remonté.
export async function cancelSubscriptions(pending: PendingUnsubscribe[]): Promise<void> {
  await Promise.all(
    pending.map(({ abonnementId, outil, externalId, live, spec }) =>
      Promise.resolve(spec.unsubscribe?.(live.config, live.http, { externalId })).catch((error) =>
        logError('abonnement.desabonner', error, { abonnementId, outil }),
      ),
    ),
  );
}
```

À savoir :

- `subscribeConnection` reçoit la connexion **chargée** (`LoadedConnection`, `connections.ts:49-54`) pour lire `config.accountKey` et `config.authMode`, et la configuration **validée** (`ready.config`) pour parler à l'éditeur. Le `z.object` de chaque connecteur retire les champs qu'il ne connaît pas : `accountKey` n'est pas dans `ready.config`.
- Le secret part chez l'éditeur avant que la ligne existe : la ligne ne peut pas s'écrire avant, `ressource` vient de la réponse de l'éditeur et `leon_app` ne peut pas la modifier ensuite. Une livraison qui arrive entre la réponse de l'éditeur et l'écriture de la ligne (quelques dizaines de millisecondes : il faut qu'un message arrive dans la boîte, ou qu'une réunion finisse, dans ce laps) est refusée, et son adresse entre au cache négatif : les livraisons suivantes de cet abonnement sont refusées jusqu'à 10 minutes. L'éditeur réessaie (Graph et Fathom : reprises « à vérifier dans la documentation de l'éditeur ») et le sondage de 15 minutes couvre. Le cache négatif n'est pas raccourci pour autant : un abonnement mort coûterait alors dix lectures par fenêtre au lieu d'une, et la limite par adresse IP serait atteinte dix fois plus vite (section 6.1). Ce n'est plus la recréation qui expose à ce cache : elle prend toujours une adresse neuve.
- Deux relèves de la même connexion ne tournent pas ensemble (`claimConnection`, `connections.ts:391-432`) : `subscribeConnection` n'a pas de course avec elle-même. Le renouvellement peut tourner en même temps : il ne met à jour qu'une ligne `active`, par son id. Si `subscribeConnection` vient de la remplacer (ligne `active` échue), la mise à jour ne trouve plus rien, et l'ancien abonnement a déjà été coupé chez l'éditeur.
- `LiveConnection` vient du chapitre 05 (`src/server/actions/spec.ts`, section 3.1) : `{ connectionId, provider, config, http }`.

### 11.3 Ce qui change autour

**`src/server/connectors/sync.ts`** (existe). Deux changements. `rememberAccountKey` (`:166-184`) rend la clé qu'elle vient d'enregistrer, `null` sinon. `accountKey` n'est écrit qu'après la première lecture réussie (`:250`), et `fresh.config` ne la porte pas : sans ce retour, une connexion HubSpot neuve n'écouterait son portail qu'à sa deuxième relève, 15 minutes plus tard (`listenAccount` rendrait `non_regle`).

```ts
// src/server/connectors/sync.ts (existe) : rememberAccountKey rend la clé enregistrée.
async function rememberAccountKey(
  ctx: TenantContext,
  connection: LoadedConnection,
  deps: SyncDeps,
  ready: Ready,
): Promise<string | null> {
  if (!isButton(connection) || 'accountKey' in connection.config) return null;
  const { connector, config } = ready;
  try {
    const http = connectorHttp(connection.provider, connector, config, deps);
    const { accountKey } = await connector.verify(config, http);
    await saveAccountKey(ctx, connection.id, connection.lockedAt, accountKey ?? null);
    return accountKey ?? null;
  } catch (error) {
    logError('connector.account_key_failed', error, {
      connectionId: connection.id,
      provider: connection.provider,
    });
    return null;
  }
}
```

Puis, dans `runConnectorSync`, l'appel à `subscribeConnection` entre `rememberAccountKey` et `finishSync` (`:250-251`) :

```ts
  if (again === 'lost') return 'skipped';
  const accountKey = await rememberAccountKey(ctx, fresh, deps, ready);
  // Les webhooks (dossier agents, 8.3) : créer ce qui manque, à chaque relève réussie. Après la lecture : un éditeur
  // lent ou en panne (30 s par appel) ne retarde jamais la mémoire. Après rememberAccountKey : une connexion HubSpot
  // neuve écoute son portail dès sa première relève. Jamais bloquant : la relève reste le filet d'un webhook perdu.
  const listening = accountKey ? { ...fresh, config: { ...fresh.config, accountKey } } : fresh;
  await subscribeConnection(ctx, listening, ready, deps).catch((error) =>
    logError('connector.subscribe_failed', error, { connectionId: fresh.id, provider: fresh.provider }),
  );
  await finishSync(ctx, connection.id, connection.lockedAt, { kind: 'ok', again });
```

avec `import { subscribeConnection } from '@/server/webhooks/subscriptions';`. `deps` (`SyncDeps`) porte `fetchImpl` et `sleep`, que `connectorHttp` accepte (`pipedream.ts:241-246`). Un connecteur sans `webhook` sort à la première ligne, sans lecture en base. La réservation de la connexion tient 30 minutes (`claimConnection`, `connections.ts:386`) : un abonnement de 30 secondes au plus la garde. Une relève qui échoue ne crée aucun abonnement : un webhook d'une connexion qui ne lit pas ne servirait à rien, la relève ciblée échouerait aussi. Rien d'autre ne change dans la relève (architecture, 6).

**`src/server/connectors/oauth-routes.ts`** (existe, `connect`, `:361-401`). Après `saveOAuthTokens(…, { reconnect: true })` réussi (`:388-389`) :

```ts
    // Les abonnements coupés au départ de la personne repartent à la relève qui suit (chapitre 03, 11).
    await reviveSubscriptions(ctx, pending.reconnectId);
```

Le même appel dans la branche Pipedream (`:438-440`) ne sert à rien (une connexion Pipedream n'a pas d'abonnement) : on ne l'ajoute pas. Import : `import { reviveSubscriptions } from '@/server/webhooks/subscriptions';`.

**`src/app/(app)/connections/actions.ts`** (existe). Import : `import { cancelSubscriptions, pendingUnsubscribes, reviveSubscriptions } from '@/server/webhooks/subscriptions';` (`getConnector` est déjà importé, `:35`). Dans `replaceKeyAction` (`:143-183`), après `replaceConnectionSecret` réussi (`:168-174`) : `await reviveSubscriptions(ctx, stored.id);` (Fathom se branche par clé). Dans `deleteConnectionAction` (`:214-222`) :

```ts
export async function deleteConnectionAction(id: string): Promise<{ ok: boolean }> {
  return manage(id, async (ctx, uuid) => {
    const stored = (await listConnections(ctx)).find((view) => view.id === uuid);
    // Ses propres abonnements seulement : ceux d'un collègue ne se lisent pas et ses jetons ne servent pas.
    const pending = stored?.isCreator
      ? await pendingUnsubscribes(ctx, [uuid], { getConnector }).catch(() => [])
      : [];
    const deleted = await deleteConnection(ctx, uuid);
    if (deleted && stored?.config.authMode === 'pipedream')
      await forgetPipedreamUser(stored.config.externalUserId);
    if (deleted) await cancelSubscriptions(pending);
    return deleted;
  });
}
```

**`src/app/(app)/connections/actions.test.ts`** (existe). Il remplace `@/server/connectors/connections` par un faux, mais pas `webhooks/subscriptions` : `reviveSubscriptions` appellerait le vrai `withTenant` avec `ctx.tenantId = 'tenant'`, et trois tests de `replaceKeyAction` échoueraient (ZodError sur l'UUID). Dans la même PR (W7), avec les autres faux (`:35-48`) :

```ts
vi.mock('@/server/webhooks/subscriptions', () => ({
  pendingUnsubscribes: vi.fn(async () => []),
  cancelSubscriptions: vi.fn(async () => {}),
  reviveSubscriptions: vi.fn(async () => 0),
}));
```

et deux cas : `replaceKeyAction` réussi appelle `reviveSubscriptions(ctx, ID)` ; `deleteConnectionAction` d'une connexion dont on est le créateur appelle `pendingUnsubscribes` avant `deleteConnection` et `cancelSubscriptions` après, et ne l'appelle pas pour la connexion d'un collègue.

**`src/app/(app)/settings/actions.ts`** (existe, `runDeletion`, `:490-534`). Imports : `import { getConnector } from '@/server/connectors/registry';` et `import { cancelSubscriptions, pendingUnsubscribes } from '@/server/webhooks/subscriptions';`. `deleteAccount` (`delete-account.ts:161`) supprime les connexions dans sa transaction (`:248`) ; on ne peut plus ouvrir une connexion après. Les abonnements à couper se relèvent donc juste avant l'appel, sous le contexte de la personne, et se coupent après, à côté de Pipedream. `runDeletion` sert aux deux actions, `deleteAccountAction` (`:541`) et `deleteOrganizationAction` (`:549-557`) : le même code coupe, dans les deux cas, les abonnements de l'appelant et seulement les siens.

```ts
  // Avant la suppression : les abonnements de la personne, connexions ouvertes (chapitre 03, 11). Après, on ne pourrait
  // plus lire ses jetons. Une suppression refusée n'en coupe aucun. Compte ou organisation : seulement les siens.
  const pending = await pendingUnsubscribes(ctx, 'toutes', { getConnector }).catch(() => []);
  let result: DeletionResult;
  try {
    result = await deletion(ctx, input);
  } catch (error) { /* inchangé */ }
  // … après forgetPipedreamUser :
  await cancelSubscriptions(pending);
```

Un abonnement créé entre la lecture et la suppression (une relève qui tombe à ce moment) reste orphelin chez l'éditeur : Microsoft l'éteint à son échéance, la porte refuse ses livraisons (sa ligne est partie avec la connexion). La suppression d'une organisation entière ne coupe que les abonnements de l'appelant : ceux des autres membres restent chez l'éditeur, car on ne lit pas leurs lignes (modèle P) et on ne se sert pas de leurs jetons (architecture 9.1, point 6). Une organisation où l'appelant n'a aucune connexion ne coupe rien.

**`src/app/(app)/settings/actions.test.ts`** (existe). Il remplace `@/server/connectors/pipedream` par un faux qui n'a que `forgetPipedreamUser` (`:97`). L'import du registre (pour `getConnector`) charge Gmail, Drive et Slack, qui importent `PipedreamConfigSchema` de ce module (`gmail/connector.ts:3`) : sans faux du registre, le fichier entier échoue à l'import (« No "PipedreamConfigSchema" export is defined on the mock »). Dans la même PR (W7), avec les autres faux :

```ts
vi.mock('@/server/connectors/registry', () => ({ getConnector: vi.fn() }));
vi.mock('@/server/webhooks/subscriptions', () => ({
  pendingUnsubscribes: vi.fn(async () => []),
  cancelSubscriptions: vi.fn(async () => {}),
}));
```

et un cas pour chaque action (`deleteAccountAction`, `deleteOrganizationAction`) : `pendingUnsubscribes(ctx, 'toutes', …)` avant la suppression, `cancelSubscriptions` après ; rien n'est coupé quand la suppression est refusée (`DeletionRefused`).

## 12. Le premier lot : Outlook, HubSpot, Fathom

Trois fichiers `src/server/connectors/<outil>/webhook.ts` (à créer, architecture 6). Chacun porte sa `WebhookSpec` en entier et, quand l'outil sait lire un objet, son `fetchOne`. L'en-tête cite les sources et dit ce qui n'est pas vérifié (architecture, 9.9). Aucune page d'éditeur n'a été ouverte pour ce chapitre : tout point d'API vient des notes 04 et 05, ou porte « à vérifier dans la documentation de l'éditeur ».

| | Outlook | HubSpot | Fathom |
|---|---|---|---|
| `scope` | `abonnement` | `app` | `abonnement` |
| Vérification | `jeton`, `/value/*/clientState` (note 04 : « écho de `clientState` dans chaque notification ») | `hmac-sha256` v3, méthode + URI + corps + horodatage, base64, `LEON_OAUTH_HUBSPOT_SECRET` (note 04, officiel) | `standard-webhooks` (note 05) |
| Horodatage | aucun (rejeu sans effet : une relève de trop) | `x-hubspot-request-timestamp`, ms, 300 s | `webhook-timestamp`, 300 s |
| `deliveryHeader` | aucun : SHA-256 du corps | aucun : SHA-256 du corps | `webhook-id` |
| `handshake` | `echo-validation-token` | aucun | aucun |
| `lifecycle` | oui | non | non |
| Abonnement | `POST /v1.0/subscriptions`, `changeType: created`, `me/mailFolders('inbox')/messages` | réglé dans l'appli de Leon, une fois | `POST /external/v1/webhooks` (à vérifier) |
| Échéance | lue dans la réponse (`expirationDateTime`) | aucune | aucune |
| `fetchOne` | `message:<id>` → `GET /me/messages/{id}` → `thread:<conversationId>` | `note:`, `call:`, `meeting:`, `email:` → le point de lecture groupée (`batch/read`, déjà employé par `names`, `client.ts:80-93`), avec un seul identifiant : un job par objet | aucun : relève hors tour |
| Ce que `match` rend | `message:<resourceData.id>` des notifications `created` | `<préfixe>:<objectId>` ; `object.deletion` → `removed` | `meeting:<recording_id>` |

### 12.1 Outlook

`src/server/connectors/outlook/webhook.ts` (à créer) :

```ts
// src/server/connectors/outlook/webhook.ts
import { z } from 'zod';
import { parseBodyJson } from '@/server/webhooks/verify';
import { type ConnectorHttp, missingAsNull } from '../http';
import type {
  ConnectorItem,
  ItemRef,
  LifecycleEvent,
  WebhookMatch,
  WebhookSpec,
  WebhookVerification,
} from '../types';
import { graphClient } from './client';
import { threadsOf } from './map';

// Recevoir les nouveaux messages de la boîte de réception par Microsoft Graph, et relire un message en direct.
//
// Sources : note 04 du dossier agents (19/11/2026, résumés de recherche, aucune page ouverte en entier) :
//   https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0 (création par POST
//     /subscriptions : changeType, notificationUrl, lifecycleNotificationUrl, resource, expirationDateTime,
//     clientState ; renouvellement par PATCH /subscriptions/{id} ; un abonnement expiré est supprimé)
//   https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks (validationToken renvoyé en
//     text/plain en moins de 10 s ; clientState repris dans chaque notification)
//   Durée : 10 080 minutes (page anglaise) ou 4 230 (copie nl-nl, tiers) : on demande 4 230, valable dans les deux
//   lectures, et on garde l'échéance que Graph rend. Cycle de vie : reauthorizationRequired, subscriptionRemoved,
//   missed ; lifecycleNotificationUrl ne s'ajoute pas après la création.
//
// Non vérifié (à lire dans la documentation de l'éditeur avant d'écrire le code) : la forme exacte d'une
// notification (value[].resourceData.id, changeType) et d'une notification de cycle de vie (value[].lifecycleEvent,
// subscriptionId, clientState présent) ; la longueur admise de clientState (128 caractères, de mémoire ; le nôtre en
// fait 43) ; qu'un abonnement inconnu rende 404 au PATCH ; que DELETE rende 204 ; les reprises de Graph après un 401
// ou un 503 ; que Mail.ReadWrite (oauth.ts:45) suffise pour s'abonner aux messages ; que GET /me/messages/{id}
// accepte $select et l'en-tête Prefer comme la liste ; le format des identifiants de message (MESSAGE_ID).

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const OUTLOOK_RESOURCE = "me/mailFolders('inbox')/messages";
const REQUESTED_MINUTES = 4_230;
// Les identifiants de Graph : base64 ou base64url (de mémoire, à vérifier). Rien d'autre n'entre dans une adresse.
const MESSAGE_ID = /^[A-Za-z0-9+/=_-]{1,400}$/;

type OutlookAuth = { accessToken: string };

const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const NotificationsSchema = z.object({
  value: z
    .array(
      z.object({
        changeType: z.string().optional(),
        resourceData: z.object({ id: z.string().optional() }).nullish(),
      }),
    )
    .max(1000),
});
const LifecycleSchema = z.object({
  value: z
    .array(z.object({ subscriptionId: z.string().min(1).max(500), lifecycleEvent: z.string() }))
    .max(1000),
});
const SubscriptionSchema = z.object({
  id: z.string().min(1).max(500),
  expirationDateTime: instant,
});
const RenewedSchema = z.object({ expirationDateTime: instant });

const LIFECYCLE = new Map<string, LifecycleEvent['event']>([
  ['reauthorizationRequired', 'reautoriser'],
  ['subscriptionRemoved', 'supprime'],
  ['missed', 'manque'],
]);

export const OUTLOOK_VERIFICATION: WebhookVerification = {
  mode: 'jeton',
  bodyPointer: '/value/*/clientState',
  secret: { from: 'abonnement' },
};

const authorization = (config: OutlookAuth) => ({ authorization: `Bearer ${config.accessToken}` });
const requestedExpiry = () => new Date(Date.now() + REQUESTED_MINUTES * 60_000).toISOString();
const subscriptionUrl = (id: string) => `${GRAPH}/subscriptions/${encodeURIComponent(id)}`;

export const outlookWebhook: WebhookSpec<OutlookAuth> = {
  scope: 'abonnement',
  bodyFormat: 'json',
  handshake: 'echo-validation-token',
  verification: OUTLOOK_VERIFICATION,

  match(body) {
    const parsed = NotificationsSchema.safeParse(parseBodyJson('json', body));
    if (!parsed.success) return [];
    const ids = new Set<string>();
    for (const notification of parsed.data.value) {
      const id = notification.resourceData?.id;
      if (notification.changeType === 'created' && id && MESSAGE_ID.test(id)) ids.add(id);
    }
    return [...ids].map((id): WebhookMatch => ({ ref: { externalId: `message:${id}` } }));
  },

  lifecycle(body) {
    const parsed = LifecycleSchema.safeParse(parseBodyJson('json', body));
    if (!parsed.success) return [];
    return parsed.data.value.flatMap((notification): LifecycleEvent[] => {
      const event = LIFECYCLE.get(notification.lifecycleEvent);
      return event ? [{ externalId: notification.subscriptionId, event }] : [];
    });
  },

  async subscribe(config, http, target) {
    // Une création ne se rejoue pas à l'aveugle : un second essai ferait un second abonnement.
    const created = await http.json(
      {
        url: `${GRAPH}/subscriptions`,
        method: 'POST',
        headers: authorization(config),
        body: {
          changeType: 'created',
          notificationUrl: target.url,
          lifecycleNotificationUrl: target.lifecycleUrl,
          resource: OUTLOOK_RESOURCE,
          expirationDateTime: requestedExpiry(),
          clientState: target.secret,
        },
        once: true,
      },
      SubscriptionSchema,
    );
    const expiresAt = new Date(created.expirationDateTime).toISOString();
    return [{ resource: OUTLOOK_RESOURCE, externalId: created.id, expiresAt }];
  },

  async renew(config, http, { externalId }) {
    const renewed = await http.json(
      {
        url: subscriptionUrl(externalId),
        method: 'PATCH',
        headers: authorization(config),
        body: { expirationDateTime: requestedExpiry() },
      },
      RenewedSchema,
    );
    return { expiresAt: new Date(renewed.expirationDateTime).toISOString() };
  },

  async unsubscribe(config, http, { externalId }) {
    // Déjà parti chez Microsoft (expiré, supprimé) : rien à faire.
    await http.text({
      url: subscriptionUrl(externalId),
      method: 'DELETE',
      headers: authorization(config),
      acceptStatus: [404],
    });
  },
};

// La relève ciblée : 'message:<id>' (ce que rend match) donne le fil 'thread:<conversationId>' avec ce seul message,
// comme une page de relève (map.ts, threadsOf). L'abonnement ne suit que la boîte de réception : le message est traité
// comme un message reçu (aucun côté, comme la relève de la boîte de réception). L'ingestion n'ajoute que les tours
// nouveaux au fil déjà connu.
export async function outlookFetchOne(
  config: OutlookAuth,
  ref: ItemRef,
  http: ConnectorHttp,
): Promise<ConnectorItem | null> {
  const id = ref.externalId.startsWith('message:') ? ref.externalId.slice('message:'.length) : '';
  if (!MESSAGE_ID.test(id)) throw new Error('Unsupported Outlook reference');
  const message = await missingAsNull(() => graphClient(config, http).message(id));
  if (!message) return null;
  const [item] = threadsOf([message], 'inbox');
  // Un message sans texte existe quand même : un élément sans tour, que normalizeItem écarte.
  return (
    item ?? {
      externalId: `thread:${message.conversationId ?? message.id}`,
      nature: 'fil',
      title: 'Sans objet',
      url: message.webLink ?? null,
      updatedAt: new Date(message.receivedDateTime).toISOString(),
      origin: {},
      turns: [],
    }
  );
}
```

`src/server/connectors/outlook/client.ts` (existe) : une méthode de plus dans `graphClient` (`:35-69`), après `messages` :

```ts
    // Un message, lu en direct après une notification (webhook.ts) : mêmes champs et même en-tête que la liste.
    message(id: string) {
      const url = `${GRAPH}/me/messages/${encodeURIComponent(id)}`;
      return http.json({ url, headers, query: { $select: MESSAGE_FIELDS } }, MessageSchema);
    },
```

`src/server/connectors/outlook/schemas.ts` (existe) : `const MessageSchema` (`:21`) devient `export const MessageSchema`, et `client.ts` l'importe.

`src/server/connectors/outlook/connector.ts` (existe, `outlookConnector`, `:112-149`) : deux champs, après `privateRaw` (`:118`) :

```ts
  fetchOne: outlookFetchOne, // webhook.ts : relève ciblée d'un message
  webhook: outlookWebhook, // webhook.ts : notifications de la boîte de réception
```

`WebhookSpec<OutlookAuth>` s'assigne à `WebhookSpec<Config>` : `Config` (`connector.ts:44-50`) a `accessToken`, et les méthodes sont en syntaxe de méthode (`types.ts:99`).

### 12.2 HubSpot

`src/server/connectors/hubspot/webhook.ts` (à créer) :

```ts
// src/server/connectors/hubspot/webhook.ts
import { z } from 'zod';
import { parseBodyJson } from '@/server/webhooks/verify';
import { type ConnectorHttp, missingAsNull } from '../http';
import type { ConnectorItem, ItemRef, WebhookMatch, WebhookSpec, WebhookVerification } from '../types';
import { hubspotClient } from './client';
import { ENGAGEMENTS, readable, toItem } from './map';
import { linkedRecords } from './read';
import type { Person } from './schemas';

// Recevoir les webhooks de l'appli HubSpot de Leon (un webhook d'application : une adresse pour tous les comptes,
// le compte lu dans le corps), et relire une activité en direct.
//
// Sources : note 04 du dossier agents (19/11/2026, résumés de recherche) :
//   https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests (X-HubSpot-Signature-v3
//     et X-HubSpot-Request-Timestamp ; HMAC-SHA256 de méthode + URI + corps + horodatage ; clé : le secret de
//     l'application ; base64 ; plus de 5 minutes : refus, conseil tiers)
//   https://developers.hubspot.com/docs/api-reference/legacy/webhooks/guide (abonnement par application, réglé dans
//     l'application développeur ; 100 événements par requête au plus ; contenu : identifiant d'objet, type
//     d'événement, propriété changée)
// La lecture groupée (POST /crm/objects/2026-03/{genre}/batch/read) est celle que client.ts emploie déjà (names).
//
// Non vérifié, à lire avant d'écrire ce fichier (étape W3-0 du chapitre 03, section 14) : que les notes, appels,
// réunions et e-mails soient abonnables, sous quels noms d'événements (object.creation, object.propertyChange,
// object.deletion : de mémoire) et avec quels objectTypeId (OBJECT_TYPES, de mémoire) ; qu'une appli créée après la fin
// des applis publiques « legacy » (23/04/2026, oauth.ts) règle et signe ses webhooks de la même façon, et ce qu'est la
// « Webhooks journal API » (note 04) ; que portalId soit dans chaque événement, et qu'une requête ne mêle jamais deux
// portails ; que la lecture groupée rende updatedAt comme la recherche, et un 207 sans résultat pour un identifiant
// inconnu ; GET /crm/owners/2026-03/{id} ; le décodage de l'URI avant signature (nos adresses n'ont aucun caractère
// concerné). La vérification v3 (HUBSPOT_VERIFICATION) est, elle, confirmée par la page officielle.

type HubspotAuth = { authMode: 'key' | 'oauth'; token?: string; accessToken?: string };
const tokenOf = (config: HubspotAuth): string =>
  (config.authMode === 'oauth' ? config.accessToken : config.token) ?? '';

export const HUBSPOT_VERIFICATION: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-hubspot-signature-v3',
  encoding: 'base64',
  signed: ['method', 'uri', 'body', 'timestamp'],
  separator: '',
  timestamp: { source: 'header', name: 'x-hubspot-request-timestamp', unit: 'ms', toleranceSeconds: 300 },
  secret: { from: 'env', name: 'LEON_OAUTH_HUBSPOT_SECRET' },
};

// L'objet HubSpot de chaque activité relevée (map.ts, ENGAGEMENTS), par son identifiant de type. À vérifier.
const OBJECT_TYPES = new Map<string, string>([
  ['0-46', 'note'],
  ['0-47', 'meeting'],
  ['0-48', 'call'],
  ['0-49', 'email'],
]);
const EVENTS = new Map<string, 'change' | 'removed'>([
  ['object.creation', 'change'],
  ['object.propertyChange', 'change'],
  ['object.deletion', 'removed'],
]);

const EventSchema = z.object({
  subscriptionType: z.string(),
  objectTypeId: z.string().optional(),
  objectId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,30}$/)]),
});
const EventsSchema = z.array(z.unknown()).max(1000);
const REF = /^(note|call|meeting|email):(\d{1,30})$/;

export const hubspotWebhook: WebhookSpec<HubspotAuth> = {
  scope: 'app',
  bodyFormat: 'json',
  // Chaque événement porte son portail : la porte exige une seule valeur (section 4.2).
  accountPointer: '/*/portalId',
  verification: HUBSPOT_VERIFICATION,

  // Un événement illisible est écarté sans écarter les autres.
  match(body) {
    const events = EventsSchema.safeParse(parseBodyJson('json', body));
    if (!events.success) return [];
    return events.data.flatMap((raw): WebhookMatch[] => {
      const event = EventSchema.safeParse(raw);
      if (!event.success) return [];
      const prefix = OBJECT_TYPES.get(event.data.objectTypeId ?? '');
      const kind = EVENTS.get(event.data.subscriptionType);
      if (!prefix || !kind) return [];
      const ref = { externalId: `${prefix}:${event.data.objectId}` };
      return [kind === 'removed' ? { ref, removed: true } : { ref }];
    });
  },
};

// La relève ciblée d'une activité : la même forme qu'à la relève (map.ts, toItem), avec son propriétaire et sa fiche
// liée. Au plus 8 requêtes (1 lecture, 1 propriétaire, 6 pour les liens) ; la relève, elle, lit tous les propriétaires
// d'un coup, ce qui coûterait jusqu'à 40 requêtes ici. Un job par activité, un job à la fois par portail
// (fetchJobGroup) : au plus 4 requêtes par seconde (minIntervalMs: 250), 40 par 10 secondes sur les 110 du portail.
export async function hubspotFetchOne(
  config: HubspotAuth,
  ref: ItemRef,
  http: ConnectorHttp,
): Promise<ConnectorItem | null> {
  const [, prefix, id] = REF.exec(ref.externalId) ?? [];
  const spec = ENGAGEMENTS.find((candidate) => candidate.prefix === prefix);
  if (!spec || !id) throw new Error('Unsupported HubSpot reference');
  const hubspot = hubspotClient(tokenOf(config), http);
  const hits = await missingAsNull(() => hubspot.read(spec.type, spec.properties, [id]));
  const hit = hits?.find((candidate) => candidate.id === id);
  if (!hit) return null;
  const ownerId = hit.properties.hubspot_owner_id;
  // Un propriétaire parti ou caché : l'activité sort sans auteur, comme à la relève (read.ts, optional).
  const owner = ownerId ? await missingAsNull(() => hubspot.owner(ownerId)) : null;
  const owners = new Map<string, Person>(owner && ownerId ? [[ownerId, owner]] : []);
  const [row] = readable(spec, [hit]);
  // Une activité sans texte existe quand même : un élément sans tour, que normalizeItem écarte.
  if (!row) return { ...toItem(spec, { hit, text: '' }, owners, undefined), turns: [] };
  const linked = (await linkedRecords(hubspot, spec.type, [id])).get(id);
  return toItem(spec, row, owners, linked);
}
```

`src/server/connectors/hubspot/client.ts` (existe) : deux méthodes de plus dans `hubspotClient` (`:36-125`), après `names` :

```ts
    // Des activités par identifiant (lecture groupée, comme names) : la relève ciblée d'un webhook.
    async read(type: EngagementType, properties: string[], ids: string[]): Promise<Hit[]> {
      const body = { inputs: ids.map((id) => ({ id })), properties, propertiesWithHistory: [] };
      return (await post(`${objects(type)}/batch/read`, body, ReadReply)).results;
    },

    // Un propriétaire par son identifiant (chemin à vérifier dans la documentation de l'éditeur).
    async owner(id: string): Promise<Person> {
      const url = `${ROOT}/crm/owners/${VERSION}/${encodeURIComponent(id)}`;
      const owner = await http.json({ url, headers }, OwnerReply);
      const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
      return { name: name || owner.email || null, email: owner.email ?? null };
    },
```

`client.ts` ajoute `OwnerReply` et `ReadReply` à son import de `./schemas` (`:3-13`). `src/server/connectors/hubspot/schemas.ts` (existe) : `ReadReply = z.object({ results: z.array(HitSchema) })`, et `OwnerReply`, la ligne de `OwnersReply` (`:30-40`) sortie en schéma à part et réutilisée par lui :

```ts
export const OwnerReply = z.object({
  id: z.string(),
  email: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
});
export const OwnersReply = z.object({
  results: z.array(OwnerReply),
  paging: z.object({ next: z.object({ after: z.string() }).nullish() }).nullish(),
});
export const ReadReply = z.object({ results: z.array(HitSchema) });
```

`src/server/connectors/hubspot/connector.ts` (existe, `hubspotConnector`, `:121-145`) : `fetchOne: hubspotFetchOne,` et `webhook: hubspotWebhook,` après `oauth` (`:144`).

Côté HubSpot (hors code, une fois) : dans l'appli de Leon, l'adresse cible `<LEON_PORTE_URL>/h/hubspot` et les abonnements aux créations, modifications et suppressions des notes, appels, réunions et e-mails. Comment s'y prend une appli créée après le 23/04/2026 : à vérifier dans la documentation de l'éditeur. Les connexions par clé (appli privée) n'ont pas de ligne d'écoute (`subscribeConnection` exige `authMode = 'oauth'` et `accountKey`) : elles restent au sondage.

**Les suppressions HubSpot ne passent que par le webhook.** Aucun code HubSpot ne rend de `removed` à la relève (`grep removed src/server/connectors/hubspot/` : rien ; seul Outlook en rend, `outlook/connector.ts:52-139`). Une activité supprimée chez HubSpot n'est donc retirée de Leon que par une livraison `object.deletion` (section 10.1, écart E-q). Pour une connexion par clé, qui n'a pas de webhook, elle ne l'est jamais. C'est vrai aujourd'hui déjà, sans webhook ; à dire au client, et à reprendre au chapitre 10 (une relève qui compare les identifiants, ou la « Webhooks journal API »).

**Étape W3-0, avant d'écrire ce fichier.** Lire le guide des webhooks de HubSpot et la page de la « Webhooks journal API », et recopier dans l'en-tête ce qu'ils disent des points « Non vérifié ». Deux issues :

- Les activités sont abonnables : le fichier s'écrit tel quel, aux noms et `objectTypeId` près.
- Seules les fiches le sont (contact, entreprise, affaire) : `match` rend `fiche:<objectTypeId>:<objectId>`, `hubspotConnector` n'a pas de `fetchOne`, et chaque livraison déclenche une relève hors tour de la plus ancienne connexion qui écoute le portail (le chemin de Fathom, `tryConnection`). `hubspotFetchOne`, `read` et `owner` ne s'écrivent pas. Les suppressions d'activités ne sont alors jamais reprises.

Dans les deux cas, la partie qu'exerce la porte ne change pas : la vérification v3 est confirmée (note 04, page officielle), et `accountPointer` ne lit que `portalId`. Les cas `gate` HubSpot de `vecteurs.json` restent justes, et W5 n'attend pas. Si la documentation dit qu'une requête peut mêler plusieurs portails, la porte doit déposer un corps par portail : un changement de `fournisseurs.json` (version 2) et des cas `gate`, à faire avant W5. D'ici là, une telle livraison est écartée et comptée (`porte.comptes_multiples`, section 6.1, étape 9).

### 12.3 Fathom

`src/server/connectors/fathom/webhook.ts` (à créer) :

```ts
// src/server/connectors/fathom/webhook.ts
import { z } from 'zod';
import { parseBodyJson } from '@/server/webhooks/verify';
import type { WebhookSpec, WebhookVerification } from '../types';

// Recevoir « une réunion est prête » de Fathom. Pas de fetchOne : la relève ordinaire de la connexion passe hors tour
// (webhooks/fetch-one.ts) ; elle lit la réunion avec sa transcription comme d'habitude (connector.ts). Le webhook ne
// demande donc que le plus petit contenu permis : le résumé. Avec la transcription, le corps d'une longue réunion
// dépasserait les 256 Kio de la porte (413, jamais déposé), et l'on stockerait une transcription pour n'en lire qu'un
// identifiant.
//
// Sources : note 05 du dossier agents (19/11/2026, résumés de recherche) : un seul événement, « new meeting content
// ready » ; webhook créé dans l'interface ou par API ; au moins un de include_transcript, include_summary,
// include_action_items, include_crm_matches ; le corps est la réunion ; Standard Webhooks (webhook-id,
// webhook-timestamp, webhook-signature ; HMAC-SHA256 de id.horodatage.corps, base64, clé après whsec_ ; 5 minutes) ;
// le secret est rendu à la création. Sources de la note : hookdeck.com (tiers), https://developers.fathom.ai.
// Base et en-tête : client.ts (doc lue le 15/10/2026).
//
// Non vérifié, à lire avant d'écrire ce fichier (étape W4-0 du chapitre 03, section 14 ; openapi.yaml, déjà lu pour
// GET /meetings) : le chemin POST /webhooks et DELETE /webhooks/{id} ; les champs destination_url, id et secret ; un
// champ qui choisit les réunions (triggered_for, de mémoire, peut-être obligatoire : il doit couvrir ce que voit la
// clé, ses réunions et celles partagées avec elle) ; qu'un webhook « résumé seul » parte aussi pour une réunion sans
// résumé (appels très courts, note 05 : sinon le sondage la rattrape) ; que le corps porte recording_id comme
// GET /meetings ; les reprises de Fathom.

const BASE_URL = 'https://api.fathom.ai/external/v1';

type FathomAuth = { apiKey: string };

const CreatedSchema = z.object({
  id: z.union([z.string().min(1).max(200), z.number().int().nonnegative()]).transform(String),
  secret: z.string().min(1).max(500),
});
const MeetingRefSchema = z.object({ recording_id: z.number().int().nonnegative() });

export const FATHOM_VERIFICATION: WebhookVerification = {
  mode: 'standard-webhooks',
  secret: { from: 'abonnement' },
};

const headers = (config: FathomAuth) => ({ 'X-Api-Key': config.apiKey });

export const fathomWebhook: WebhookSpec<FathomAuth> = {
  scope: 'abonnement',
  bodyFormat: 'json',
  deliveryHeader: 'webhook-id',
  verification: FATHOM_VERIFICATION,

  // Le même identifiant que la relève (map.ts : meeting:<recording_id>).
  match(body) {
    const parsed = MeetingRefSchema.safeParse(parseBodyJson('json', body));
    return parsed.success ? [{ ref: { externalId: `meeting:${parsed.data.recording_id}` } }] : [];
  },

  async subscribe(config, http, target) {
    const created = await http.json(
      {
        url: `${BASE_URL}/webhooks`,
        method: 'POST',
        headers: headers(config),
        body: {
          destination_url: target.url,
          // Au moins un contenu est exigé (note 05) : le plus petit. Jamais la transcription (voir l'en-tête).
          include_transcript: false,
          include_summary: true,
          include_action_items: false,
          include_crm_matches: false,
        },
        once: true,
      },
      CreatedSchema,
    );
    // Fathom choisit le secret (whsec_…) : c'est lui qui est gardé, pas target.secret.
    return [{ resource: 'meetings', externalId: created.id, expiresAt: null, secret: created.secret }];
  },

  async unsubscribe(config, http, { externalId }) {
    await http.text({
      url: `${BASE_URL}/webhooks/${encodeURIComponent(externalId)}`,
      method: 'DELETE',
      headers: headers(config),
      acceptStatus: [404],
    });
  },
};
```

`src/server/connectors/fathom/connector.ts` (existe, `fathomConnector`, `:33-64`) : `webhook: fathomWebhook,` après `hosts` (`:37`). Aucun `fetchOne` : la documentation lue le 15/10/2026 ne cite que `GET /meetings` (`connector.ts:7-12`).

### 12.4 Après chaque outil : régénérer

Les trois specs entrent avant la porte (section 14) : le premier `fournisseurs.json` commité est celui de la section 7.1. Ensuite, chaque PR qui ajoute ou change une `webhook` (chapitre 10) lance `pnpm porte:generer` et commite `services/porte/fournisseurs.json` : sinon `providers-json.test.ts` échoue.

## 13. Tests à écrire

Conventions du dépôt (carte 08) : `x.test.ts` sans base (projet `unit`), `x.db.test.ts` avec Postgres (projet `db`), contrats transverses dans `src/test/contracts/`. Aucun test n'appelle un vrai service : `fetchImpl`, `send`, `store`, `sleep` et `now` sont injectés.

### 13.1 La liste

| Fichier | Projet | Ce qu'il prouve | PR |
|---|---|---|---|
| `src/server/webhooks/verify.test.ts` | unit | Chaque cas `verification` de `vecteurs.json` rend son verdict ; chaque cas `decryption` déchiffre ou échoue ; `readPointer` (tableau vide, `*` en double, entier non sûr, `~1`) | W1 (`readPointer`), W5 (vecteurs) |
| `src/server/webhooks/crypto.test.ts` | unit | Aller-retour sous `LEON_PORTE_KEY` ; un secret recopié sur un autre abonnement ne se déchiffre plus ; sans clé : `PorteKeyMissingError` | W1 |
| `src/server/env.test.ts` (existe) | unit | `LEON_PORTE_KEY` égale à `LEON_CONNECTORS_KEY` : refusée ; `LEON_PORTE_KEY` de 31 octets : refusée | W1 |
| `src/server/webhooks/hono-gate.test.ts` | unit | Chaque cas `gate` de `vecteurs.json` ; refus au plus tôt à 200 ms ; limite des lectures vides par adresse IP (au-delà : 503, plus aucune lecture), fenêtre fixe ; `ipKey` (deux adresses d'un même /64 : une clé ; deux IPv4 voisines : deux ; `::ffff:a.b.c.d` : l'IPv4) ; cache négatif ; 413 ; 503 sans base, sur panne de base ; livraison rejouée → 202 ; en-têtes de signature jamais gardés | W5 |
| `src/server/webhooks/hono-gate.db.test.ts` | db | `pgPorteStore` sous le vrai rôle `leon_porte` : un abonnement inconnu rend `null`, un dépôt écrit une ligne et notifie `leon_porte` (modèle : `0083-webhooks.db.test.ts`, chapitre 01, 16.8) | W5 |
| `src/server/webhooks/providers-json.test.ts` | unit | Les deux fichiers commités sont ceux du générateur (section 7.3, code complet) | W5 |
| `src/test/contracts/webhook-specs.test.ts` | unit | Chaque `WebhookSpec` est cohérente (règles ci-dessous) ; les copies des vecteurs n'ont pas divergé ; `match` et `lifecycle` ne lèvent jamais | W5 |
| `src/test/contracts/porte-surface.test.ts` | unit | `portePool` n'est employé que par la porte ; les deux fonctions de la porte ne sont appelées que par elle ; les fichiers de la porte n'importent directement ni pg-boss, ni les jetons, ni `LEON_CONNECTORS_KEY` (imports directs seulement : le registre, lui, charge tout, section 13.5) | W5 |
| `src/test/contracts/route-guards.db.test.ts` (existe) | db | La ligne `PUBLIC` de la porte (section 6.3) ; sans elle, le contrat échoue sur `/api/v1/porte/h/:outil` | W5 |
| `src/server/webhooks/worker.test.ts` | unit | `listenPorte` : une notification de `leon_porte` met un job ; une charge qui n'est pas un UUID est ignorée ; une coupure rouvre l'écoute après 5 s, puis 10 s ; `stop` n'en rouvre plus | W6 |
| `src/instrumentation-node.test.ts` (existe) | unit | Le faux de `startWebhooksWorker` et `'webhooks'` après `'connecteurs'` dans l'ordre attendu (section 8.4) ; sans eux, trois tests échouent | W6 |
| `src/server/webhooks/inbox.db.test.ts` | db | Une livraison prise met ses jobs et vide le corps ; un envoi qui échoue laisse la ligne `recue`, corps compris ; deux jobs pour la même ligne : le second rend `absente` ; un corps illisible pour `match` est pris sans job ; 120 suppressions et 60 modifications : 100 suppressions puis 50 modifications ; un job de portée app porte le groupe `<outil>:<compte>` ; cycle de vie : un seul job, le motif le plus fort | W6 |
| `src/server/webhooks/fetch-one.db.test.ts` | db | Portée abonnement : lu et ingéré sous la connexion de la personne ; `null` sans `removed` : rien ; `removed` et `null` : source retirée ; outil sans `fetchOne` : `next_sync_at` passe à maintenant ; jeton de renouvellement révoqué (`OAuthRefusedError`) : `sans_connexion`, le job ne lève pas. Portée app : la plus ancienne connexion, puis la suivante sur un 404 ou un 403, trois lectures au plus ; un jeton refusé (401) ou une autorisation perdue (`OAuthRefusedError`) font passer à la suivante ; `removed` et `null` chez la première : les copies des cinq membres qui écoutent le portail sont retirées, une seule lecture faite | W6 |
| `src/server/connectors/http.test.ts` (existe) | unit | `missingAsNull` : 404, 410, 403 → `null` ; 401, 429, 500 → lève | W2 |
| `src/server/webhooks/subscriptions.test.ts` | unit | `renewAt` (trois quarts, échéance passée, nulle) ; `subscriptionBase` refuse `http://` ; `callbackUrls` | W7 |
| `src/server/webhooks/subscriptions.db.test.ts` | db | Création (ligne écrite, secret chiffré lié à l'id, `renouveler_le` aux trois quarts) ; ligne vivante, `manuelle`, `resiliee` : aucun appel ; ligne morte : supprimée, une ligne neuve sous un id neuf, l'ancien abonnement coupé ; écriture refusée : l'abonnement neuf est coupé, la ligne morte reste ; portée app : ligne d'écoute, aucun appel, rien pour une connexion par clé ; renouvellement : 404 → `expiree` et relève demandée, 401 → `erreur`, jeton de renouvellement révoqué (`OAuthRefusedError` dans `openConnection`) → `erreur` avec le message de refus et aucune reprise, 500 → lève ; cycle de vie `supprime`, `manque` ; « Reconnecter » ; désabonnement à la suppression | W7 |
| `src/server/connectors/sync.db.test.ts` (existe) | db | Une relève réussie appelle `subscribeConnection` après la lecture ; un abonnement qui échoue ne fait pas échouer la relève ; une relève qui échoue n'abonne pas ; une connexion HubSpot neuve écoute son portail dès sa première relève | W7 |
| `src/app/(app)/connections/actions.test.ts` (existe) | unit | Le faux de `webhooks/subscriptions` (section 11.3) ; `replaceKeyAction` réussi appelle `reviveSubscriptions` ; `deleteConnectionAction` coupe les abonnements de son créateur, pas ceux d'un collègue. Sans le faux, trois tests de `replaceKeyAction` échouent | W7 |
| `src/app/(app)/settings/actions.test.ts` (existe) | unit | Les faux du registre et de `webhooks/subscriptions` (section 11.3) ; `deleteAccountAction` et `deleteOrganizationAction` coupent les abonnements de l'appelant après la suppression, aucun sur un refus. Sans le faux du registre, le fichier entier échoue à l'import | W7 |
| `src/server/connectors/outlook/webhook.test.ts` | unit | `match` (notifications `created`, doublons, identifiant douteux écarté, corps illisible → `[]`) ; `lifecycle` ; la requête exacte de `subscribe` (`once`, champs), `renew`, `unsubscribe` (404 accepté) ; `outlookFetchOne` (404 → `null`, fil `thread:<conversationId>`) | W2 |
| `src/server/connectors/hubspot/webhook.test.ts` | unit | `match` (types d'objet, suppression → `removed`, événement illisible écarté seul) ; `hubspotFetchOne` (lecture groupée vide → `null`, activité sans texte → élément sans tour, propriétaire introuvable → sans auteur) | W3 |
| `src/server/connectors/fathom/webhook.test.ts` | unit | `match` (`meeting:<recording_id>`) ; la requête exacte de `subscribe` (`include_summary` seul, jamais `include_transcript`) ; le secret rendu est celui de Fathom | W4 |

### 13.2 `verify.test.ts`

```ts
// src/server/webhooks/verify.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WebhookVerification } from '@/server/connectors/types';
import { openSubscriptionSecret } from './crypto';
import { VECTORS_JSON_PATH } from './providers-json';
import { readPointer, verifyWebhook } from './verify';

// Les cas de services/porte/vecteurs.json : le service Rust (chapitre 15) passe les mêmes. Un verdict qui change ici
// change le contrat des deux mises en œuvre.

type Vectors = {
  verification: Array<{
    name: string;
    verification: WebhookVerification;
    bodyFormat: 'json' | 'form-payload';
    secret: string;
    method: string;
    uri: string;
    headers: Record<string, string>;
    body: string;
    now: number;
    expected: string;
  }>;
  decryption: Array<{ name: string; key: string; aad: string; stored: string; plain: string | null }>;
};

const vectors = JSON.parse(
  readFileSync(new URL(`../../../${VECTORS_JSON_PATH}`, import.meta.url), 'utf8'),
) as Vectors;

describe('verifyWebhook, cas de vecteurs.json', () => {
  it.each(vectors.verification.map((v) => [v.name, v] as const))('%s', (_, v) => {
    const verdict = verifyWebhook({ ...v, body: Buffer.from(v.body, 'utf8'), nowMs: v.now });
    expect(verdict.ok ? 'ok' : verdict.reason).toBe(v.expected);
  });
});

describe('secrets v1, cas de vecteurs.json', () => {
  it.each(vectors.decryption.map((v) => [v.name, v] as const))('%s', (_, v) => {
    const [tenantId = '', abonnementId = ''] = v.aad.split(':');
    const open = () =>
      openSubscriptionSecret(v.stored, { tenantId, abonnementId }, Buffer.from(v.key, 'base64'));
    if (v.plain === null) expect(open).toThrow('Secret illisible');
    else expect(open()).toBe(v.plain);
  });
});

describe('readPointer', () => {
  const doc = { value: [{ a: 'x' }, { a: 'x' }], n: 12, big: 2 ** 60, 'a/b': 'y', vide: [] };
  it('parcourt un tableau par « * »', () => expect(readPointer(doc, '/value/*/a')).toEqual(['x', 'x']));
  it('rend un entier sûr en chiffres', () => expect(readPointer(doc, '/n')).toEqual(['12']));
  it('refuse un entier non sûr', () => expect(readPointer(doc, '/big')).toBeNull());
  it('lit ~1 comme « / »', () => expect(readPointer(doc, '/a~1b')).toEqual(['y']));
  it('refuse un tableau vide', () => expect(readPointer(doc, '/vide/*')).toBeNull());
  it('refuse deux « * »', () => expect(readPointer({ v: [[1]] }, '/v/*/*')).toBeNull());
  it('refuse un pointeur sans « / » initial', () => expect(readPointer(doc, 'n')).toBeNull());
});
```

### 13.3 `hono-gate.test.ts`

```ts
// src/server/webhooks/hono-gate.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getConnector } from '@/server/connectors/registry';
import {
  createPorteRoutes,
  type Deposit,
  ipKey,
  PORTE_LIMITS,
  type PorteDeps,
  type PorteStore,
} from './hono-gate';
import { VECTORS_JSON_PATH } from './providers-json';
import { porteBase } from './verify';

// La porte en Hono rejoue les cas « gate » de vecteurs.json, comme le service Rust. Les autres cas couvrent ce que
// les vecteurs ne mesurent pas : le délai du refus, la limite par adresse IP, le cache négatif, les pannes.

type GateCase = {
  name: string;
  env?: Record<string, string>;
  request: { method: string; path: string; query: string; headers: Record<string, string>; body: string };
  now: number;
  expected: { status: number; contentType?: string; body: string; deposits: Deposit[] };
};
type Gate = {
  env: Record<string, string>;
  store: { subscriptions: Array<{ outil: string; id: string; tenantId: string; stored: string }> };
  cases: GateCase[];
};

const gate = (
  JSON.parse(readFileSync(new URL(`../../../${VECTORS_JSON_PATH}`, import.meta.url), 'utf8')) as {
    gate: Gate;
  }
).gate;

type Harness = { deps: PorteDeps; deposits: Deposit[]; lookups: string[]; sleeps: number[] };

function harness(input: { env?: Record<string, string>; now?: number; ip?: string | null } = {}): Harness {
  const env = { ...gate.env, ...input.env };
  const value = (name: string) => env[name] || undefined;
  const deposits: Deposit[] = [];
  const lookups: string[] = [];
  const sleeps: number[] = [];
  const store: PorteStore = {
    async secret(outil, abonnement) {
      lookups.push(abonnement);
      const row = gate.store.subscriptions.find((s) => s.outil === outil && s.id === abonnement);
      return row ? { tenantId: row.tenantId, secret: row.stored } : null;
    },
    async deposit(deposit) {
      deposits.push(deposit);
      return 1;
    },
  };
  const key = value('LEON_PORTE_KEY');
  const deps: PorteDeps = {
    store,
    getConnector,
    porteKey: () => (key ? Buffer.from(key, 'base64') : null),
    appSecret: value,
    base: () => porteBase(value('LEON_PORTE_URL')),
    clientIp: () => (input.ip === undefined ? '203.0.113.7' : input.ip),
    now: () => input.now ?? Date.parse('2026-11-20T09:00:00.000Z'),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  return { deps, deposits, lookups, sleeps };
}

const send = (deps: PorteDeps, request: GateCase['request']) =>
  createPorteRoutes(deps).request(`${request.path}${request.query ? `?${request.query}` : ''}`, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

describe('la porte, cas « gate » de vecteurs.json', () => {
  it.each(gate.cases.map((c) => [c.name, c] as const))('%s', async (_, c) => {
    const { deps, deposits } = harness({ env: c.env, now: c.now });
    const response = await send(deps, c.request);
    expect(response.status).toBe(c.expected.status);
    expect(await response.text()).toBe(c.expected.body);
    if (c.expected.contentType) expect(response.headers.get('content-type')).toBe(c.expected.contentType);
    expect(deposits).toEqual(c.expected.deposits);
  });
});

const unknown = (n: number) => ({
  method: 'POST',
  path: `/h/outlook/00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  query: '',
  headers: { 'content-type': 'application/json' },
  body: '{"value":[]}',
});

describe('la porte, au-delà des vecteurs', () => {
  it('refuse au plus tôt 200 ms après l’arrivée', async () => {
    const { deps, sleeps } = harness();
    expect((await send(deps, unknown(1))).status).toBe(401);
    expect(sleeps).toEqual([200]);
  });

  it('ne relit pas un abonnement inconnu pendant 10 minutes (cache négatif)', async () => {
    const { deps, lookups } = harness();
    const routes = createPorteRoutes(deps);
    for (let i = 0; i < 3; i++) await routes.request(unknown(1).path, { method: 'POST', body: '{}' });
    expect(lookups).toHaveLength(1);
  });

  it('cesse de lire la base au plafond de lectures vides d’une adresse IP, et répond alors 503', async () => {
    const { deps, lookups } = harness();
    const routes = createPorteRoutes(deps);
    const cap = PORTE_LIMITS.lookupMissesPerIp;
    for (let i = 0; i < cap; i++) {
      const response = await routes.request(unknown(i).path, { method: 'POST', body: '{}' });
      expect(response.status).toBe(401);
    }
    // Au-delà : ni lecture, ni refus. Un abonnement vivant hors cache doit pouvoir être rejoué par l'éditeur.
    expect((await routes.request(unknown(cap).path, { method: 'POST', body: '{}' })).status).toBe(503);
    expect(lookups).toHaveLength(cap);
    // Une adresse déjà en cache négatif reçoit toujours le refus uniforme.
    expect((await routes.request(unknown(0).path, { method: 'POST', body: '{}' })).status).toBe(401);
  });

  it('ne prolonge pas la fenêtre de la limite', async () => {
    let now = Date.parse('2026-11-20T09:00:00.000Z');
    const { deps, lookups } = harness();
    const routes = createPorteRoutes({ ...deps, now: () => now });
    const cap = PORTE_LIMITS.lookupMissesPerIp;
    const post = (n: number) => routes.request(unknown(n).path, { method: 'POST', body: '{}' });
    await post(0); // ouvre la fenêtre
    now += 300_000;
    for (let i = 1; i < cap; i++) await post(i);
    expect((await post(cap)).status).toBe(503);
    // 601 s après la première lecture vide, 301 s après la dernière : une fenêtre fixe est close.
    now += 301_000;
    expect((await post(cap + 1)).status).toBe(401);
    expect(lookups).toHaveLength(cap + 1);
  });

  it('compte une adresse IPv6 pour son /64, une IPv4 pour elle-même', () => {
    expect(ipKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:0DB8:0001:0002:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:db8:1:3::1')).not.toBe(ipKey('2001:db8:1:2::1'));
    expect(ipKey('203.0.113.7')).not.toBe(ipKey('203.0.113.8'));
    expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipKey('pas une adresse')).toBeNull();
  });

  it('refuse un corps de plus de 256 Kio avant de le lire', async () => {
    const { deps, lookups } = harness();
    const response = await send(deps, { ...unknown(1), body: 'x'.repeat(262_145) });
    expect(response.status).toBe(413);
    expect(lookups).toEqual([]);
  });

  it('répond 503 sans base, et sur une panne de base', async () => {
    const outlook = gate.cases.find((c) => c.name === 'outlook : livraison juste');
    if (!outlook) throw new Error('cas absent de vecteurs.json');
    const sansBase = harness();
    expect((await send({ ...sansBase.deps, store: null }, outlook.request)).status).toBe(503);
    const panne = harness();
    const store = panne.deps.store;
    if (!store) throw new Error('store attendu');
    const failing: PorteStore = { ...store, deposit: async () => Promise.reject(new Error('base')) };
    expect((await send({ ...panne.deps, store: failing }, outlook.request)).status).toBe(503);
  });

  it('répond 202 à une livraison déjà reçue (porte_deposer rend 0)', async () => {
    const outlook = gate.cases.find((c) => c.name === 'outlook : livraison juste');
    if (!outlook) throw new Error('cas absent de vecteurs.json');
    const { deps } = harness();
    const store = deps.store;
    if (!store) throw new Error('store attendu');
    const replay: PorteStore = { ...store, deposit: async () => 0 };
    expect((await send({ ...deps, store: replay }, outlook.request)).status).toBe(202);
  });

  it('ne garde jamais l’en-tête qui porte la signature', async () => {
    const hubspot = gate.cases.find((c) => c.name.startsWith('hubspot : livraison juste'));
    if (!hubspot) throw new Error('cas absent de vecteurs.json');
    const { deps, deposits } = harness();
    await send(deps, hubspot.request);
    expect(Object.keys(deposits[0]?.entetes ?? {})).not.toContain('x-hubspot-signature-v3');
  });
});
```

`Hono.request(path, init)` existe dans hono 4 (à vérifier au premier essai : que `bodyLimit` voie la taille d'un corps passé en chaîne, sans en-tête `content-length`).

### 13.4 `webhook-specs.test.ts`

```ts
// src/test/contracts/webhook-specs.test.ts
import { describe, expect, it } from 'vitest';
import { CONNECTORS } from '@/server/connectors/registry';
import type { WebhookSpec, WebhookVerification } from '@/server/connectors/types';
import { APP_SECRETS } from '@/server/webhooks/hono-gate';
import { buildVectorsJson } from '@/server/webhooks/providers-json';
import { readText } from './files';

// La vérification d'un webhook est déclarative (dossier agents, 8.3) : deux interprètes la lisent, verify.ts et le
// service Rust. Ce contrat refuse une description qu'ils liraient différemment, ou qui ne pourrait pas marcher.

type Spec = WebhookSpec<Record<string, unknown>>;
const SPECS = Object.entries(CONNECTORS).flatMap(([id, connector]) =>
  connector?.webhook ? [[id, connector.webhook as Spec] as const] : [],
);
const HEADER = /^[a-z0-9-]{1,100}$/;
const POINTER = /^(?:\/(?:[^/~]|~[01])*)+$/;
const pointerOk = (pointer: string) =>
  POINTER.test(pointer) && pointer.split('/').filter((part) => part === '*').length <= 1;
const JUNK = ['', 'null', '[', '{}', '[]', '{"value":7}', '[1,"a",null]', 'x'.repeat(1000)];

function headersOf(verification: WebhookVerification): string[] {
  if (verification.mode === 'standard-webhooks') return [];
  if (verification.mode === 'jeton') return verification.header ? [verification.header] : [];
  const stamp = verification.timestamp?.source === 'header' ? [verification.timestamp.name] : [];
  return [verification.header, ...stamp];
}

describe('les WebhookSpec', () => {
  it('lit le registre', () => {
    expect(Object.keys(CONNECTORS).length).toBeGreaterThan(40);
  });

  it.each(SPECS)('%s : en-têtes en minuscules, pointeurs valides', (_, spec) => {
    for (const name of [...headersOf(spec.verification), ...(spec.deliveryHeader ? [spec.deliveryHeader] : [])])
      expect(name).toMatch(HEADER);
    const pointers = [
      spec.accountPointer,
      spec.verification.mode === 'jeton' ? spec.verification.bodyPointer : undefined,
      spec.verification.mode !== 'jeton' &&
      spec.verification.mode !== 'standard-webhooks' &&
      spec.verification.timestamp?.source === 'body'
        ? spec.verification.timestamp.name
        : undefined,
    ].filter((pointer): pointer is string => pointer !== undefined);
    for (const pointer of pointers) expect(pointerOk(pointer), pointer).toBe(true);
  });

  it.each(SPECS)('%s : la chaîne signée est lisible par les deux interprètes', (_, spec) => {
    const v = spec.verification;
    if (v.mode === 'jeton') expect(v.header === undefined).not.toBe(v.bodyPointer === undefined);
    if (v.mode !== 'hmac-sha256' && v.mode !== 'hmac-sha1') return;
    expect(v.signed.length).toBeGreaterThan(0);
    // Un horodatage signé est le texte exact d'un en-tête (verify.ts, 4.1, étape 6).
    if (v.signed.includes('timestamp')) expect(v.timestamp?.source).toBe('header');
    if (v.timestamp) {
      expect(v.timestamp.toleranceSeconds).toBeGreaterThan(0);
      expect(v.timestamp.toleranceSeconds).toBeLessThanOrEqual(600);
    }
  });

  it.each(SPECS)('%s : la portée et le secret vont ensemble', (_, spec) => {
    const { secret } = spec.verification;
    if (spec.scope === 'app') {
      expect(spec.accountPointer).toBeDefined();
      expect(secret.from).toBe('env');
      expect(spec.subscribe ?? spec.renew ?? spec.unsubscribe ?? spec.lifecycle).toBeUndefined();
      expect(spec.handshake).not.toBe('echo-validation-token');
    } else {
      expect(spec.accountPointer).toBeUndefined();
    }
    if (spec.renew || spec.lifecycle) expect(spec.subscribe).toBeDefined();
    expect(spec.subscribe === undefined).toBe(spec.unsubscribe === undefined);
  });

  it.each(SPECS)('%s : un secret d’application est lu par la porte et documenté', (_, spec) => {
    const { secret } = spec.verification;
    if (secret.from !== 'env') return;
    expect(Object.keys(APP_SECRETS)).toContain(secret.name);
    expect(readText('.env.example')).toMatch(new RegExp(`^${secret.name}=`, 'm'));
  });

  it.each(SPECS)('%s : match et lifecycle ne lèvent jamais', (_, spec) => {
    for (const body of JUNK) {
      expect(Array.isArray(spec.match(body, {}))).toBe(true);
      if (spec.lifecycle) expect(Array.isArray(spec.lifecycle(body))).toBe(true);
    }
  });

  it('les vecteurs d’un outil décrivent sa vérification réelle', () => {
    const vectors = JSON.parse(buildVectorsJson()) as {
      verification: Array<{ name: string; verification: WebhookVerification }>;
    };
    for (const vector of vectors.verification) {
      const outil = vector.name.split(' : ')[0] ?? '';
      const spec = SPECS.find(([id]) => id === outil)?.[1];
      if (spec) expect(vector.verification, vector.name).toEqual(spec.verification);
    }
  });
});
```

### 13.5 `porte-surface.test.ts`

```ts
// src/test/contracts/porte-surface.test.ts
import { describe, expect, it } from 'vitest';
import { productionSources, readText } from './files';

// La porte (dossier agents, section 3) : deux fonctions SQL, son propre pool, et rien d'autre. Ni pg-boss, ni les
// jetons des outils, ni LEON_CONNECTORS_KEY. Ce contrat regarde le code de la porte et ses imports directs, pas le
// processus : la porte en Hono tourne dans web, avec toutes ses variables, et charge le registre des connecteurs
// (getConnector), donc pipedream.ts. Il garde ce que la porte appelle ; le périmètre strict (un rôle, une clé, deux
// fonctions) n'existe que dans le service Rust (chapitre 15).

const GATE = 'src/server/webhooks/hono-gate.ts';
const GATE_FILES = [GATE, 'src/server/webhooks/verify.ts', 'src/server/webhooks/crypto.ts'];
const sources = () => productionSources('src/**/*.{ts,tsx}');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la surface de la porte', () => {
  it('portePool ne sert qu’à la porte', () => {
    const users = sources()
      .filter(({ text }) => /\bportePool\b/.test(withoutComments(text)))
      .map(({ path }) => path);
    expect(users.sort()).toEqual(['src/server/db/client.ts', GATE].sort());
  });

  it('seule la porte appelle porte_secret et porte_deposer', () => {
    const callers = sources()
      .filter(({ text }) => /\bporte_(?:secret|deposer)\(/.test(text))
      .map(({ path }) => path);
    expect(callers).toEqual([GATE]);
  });

  it('les fichiers de la porte n’importent directement ni pg-boss, ni les jetons, ni la clé des connecteurs', () => {
    const FORBIDDEN =
      /pg-boss|pipeline\/queue|connectors\/(?:oauth|connections|pipedream|sync|open)\b|webhooks\/(?:subscriptions|inbox|fetch-one|worker)\b|LEON_CONNECTORS_KEY|connectorsKey|\bdb\b.*from '@\/server\/db\/client'/;
    for (const path of GATE_FILES) expect(withoutComments(readText(path)), path).not.toMatch(FORBIDDEN);
  });
});
```

La dernière alternative du motif refuse `import { db }` depuis `db/client` (le pool de `leon_app`) ; `import { portePool }` passe.

Ce contrat ne suit pas les imports de proche en proche : `hono-gate.ts` importe `@/server/connectors/registry`, qui charge les 42 connecteurs, dont Gmail, Drive et Slack, qui importent `connectors/pipedream`. Il ne dit donc pas que le processus de la porte est privé des jetons : il ne l'est pas tant qu'elle vit dans `web` (architecture 4 : `web` « tient la porte en Hono tant que le service Rust n'existe pas » ; écart E-s). Il dit que le code de la porte ne s'en sert pas. Le faire porter sur tout le graphe d'imports demanderait que la porte lise `fournisseurs.json` au lieu du registre, comme le fera le service Rust ; ce n'est pas fait ici, parce que la porte en Hono ne protège rien de plus tant qu'elle partage le processus de `web`. Le chapitre 15 refait ce contrat sur le service Rust, où il devient vrai du processus.

### 13.6 `inbox.db.test.ts`

```ts
// src/server/webhooks/inbox.db.test.ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { CONNECTORS, getConnector } from '@/server/connectors/registry';
import { abonnementsWebhook, boiteEntreeWebhooks } from '@/server/db/schema/webhooks';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { TEST_ENV } from '@/test/test-env';
import { processDelivery } from './inbox';

// La prise d'une livraison : une fois, dans une transaction validée après la mise en file.

const porte = new Pool({
  connectionString: TEST_ENV.DATABASE_URL.replace('leon_app:leon_app', 'leon_porte:leon_porte'),
  max: 1,
});
const tenantIds: string[] = [];
afterAll(async () => {
  await porte.end();
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

async function outlookSubscription(): Promise<{ ctx: TenantContext; id: string }> {
  const { tenantId, members } = await createTestTenant(['claire']);
  tenantIds.push(tenantId);
  const ctx = members[0];
  if (!ctx) throw new Error('membre attendu');
  const [row] = await adminDb
    .insert(abonnementsWebhook)
    .values({
      tenantId,
      userId: ctx.userId,
      connectionId: await seedConnection(ctx, { provider: 'outlook' }),
      outil: 'outlook',
      portee: 'abonnement',
      ressource: "me/mailFolders('inbox')/messages",
      externeId: 'abonnement-exemple-1',
      secret: 'v1:secret-de-test',
      expireLe: new Date(Date.now() + 86_400_000),
      acl: [ctx.userId],
    })
    .returning({ id: abonnementsWebhook.id });
  if (!row) throw new Error('abonnement non créé');
  return { ctx, id: row.id };
}

// Exemple fictif.
const NOTIFICATION = JSON.stringify({
  value: [{ changeType: 'created', clientState: 'x', resourceData: { id: 'AAMkAGI2-exemple-fictif-1' } }],
});

async function deposit(abonnement: string, corps: string, genre = 'livraison'): Promise<string> {
  await porte.query('select porte_deposer($1, $2, null, $3, $4, $5, $6)', [
    'outlook',
    abonnement,
    genre,
    randomUUID(),
    corps,
    '{}',
  ]);
  const [line] = await adminDb
    .select({ id: boiteEntreeWebhooks.id })
    .from(boiteEntreeWebhooks)
    .where(eq(boiteEntreeWebhooks.abonnementId, abonnement));
  if (!line) throw new Error('livraison non déposée');
  return line.id;
}

const lineOf = async (id: string) =>
  (await adminDb.select().from(boiteEntreeWebhooks).where(eq(boiteEntreeWebhooks.id, id)))[0];

describe('processDelivery', () => {
  it('met un job de relève ciblée par message, puis vide le corps', async () => {
    const { ctx, id: abonnement } = await outlookSubscription();
    const id = await deposit(abonnement, NOTIFICATION);
    const sent: Array<{ queue: string; data: object; key: string }> = [];
    const send = async (queue: string, data: object, { singletonKey }: { singletonKey: string }) => {
      sent.push({ queue, data, key: singletonKey });
      return randomUUID();
    };

    expect(await processDelivery(id, { getConnector, send })).toBe('en_file');
    expect(sent).toEqual([
      {
        queue: 'connector-fetch',
        data: {
          portee: 'abonnement',
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          abonnementId: abonnement,
          outil: 'outlook',
          externalId: 'message:AAMkAGI2-exemple-fictif-1',
          removed: false,
        },
        key: `abonnement:${abonnement}:message:AAMkAGI2-exemple-fictif-1`,
      },
    ]);
    expect(await lineOf(id)).toMatchObject({ statut: 'traitee', corps: null });
    expect(await processDelivery(id, { getConnector, send })).toBe('absente');
  });

  it('laisse la ligne « recue », corps compris, quand la mise en file échoue', async () => {
    const { id: abonnement } = await outlookSubscription();
    const id = await deposit(abonnement, NOTIFICATION);
    const send = async () => Promise.reject(new Error('pg-boss indisponible'));

    await expect(processDelivery(id, { getConnector, send })).rejects.toThrow('pg-boss indisponible');
    expect(await lineOf(id)).toMatchObject({ statut: 'recue', corps: NOTIFICATION });
  });

  it('prend sans job un corps que match ne sait pas lire', async () => {
    const { id: abonnement } = await outlookSubscription();
    const id = await deposit(abonnement, '{"pas":"une notification"}');
    expect(await processDelivery(id, { getConnector, send: async () => randomUUID() })).toBe('sans_suite');
    expect(await lineOf(id)).toMatchObject({ statut: 'traitee', corps: null });
  });

  it('ne met qu’un job de cycle de vie, avec le motif le plus fort', async () => {
    expect(CONNECTORS.outlook?.webhook?.lifecycle).toBeDefined();
    const { id: abonnement } = await outlookSubscription();
    const corps = JSON.stringify({
      value: [
        { subscriptionId: 'abonnement-exemple-1', lifecycleEvent: 'missed', clientState: 'x' },
        { subscriptionId: 'abonnement-exemple-1', lifecycleEvent: 'subscriptionRemoved', clientState: 'x' },
      ],
    });
    const id = await deposit(abonnement, corps, 'cycle');
    const sent: Array<{ queue: string; data: object }> = [];
    await processDelivery(id, {
      getConnector,
      send: async (queue, data) => {
        sent.push({ queue, data });
        return randomUUID();
      },
    });
    expect(sent).toEqual([
      {
        queue: 'abonnement-renouveler',
        data: expect.objectContaining({ motif: 'supprime', externeId: 'abonnement-exemple-1' }),
      },
    ]);
  });
});
```

### 13.7 `outlook/webhook.test.ts` : la requête d'abonnement

```ts
// src/server/connectors/outlook/webhook.test.ts (extrait)
import { describe, expect, it } from 'vitest';
import { createConnectorHttp } from '../http';
import { OUTLOOK_RESOURCE, outlookWebhook } from './webhook';

describe('outlookWebhook.subscribe', () => {
  it('crée un abonnement aux messages reçus, avec les deux adresses et le secret', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), method: String(init?.method), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: 'abonnement-exemple-1', expirationDateTime: '2026-11-23T07:30:00Z' });
    };
    const http = createConnectorHttp({ provider: 'outlook', hosts: ['graph.microsoft.com'], fetchImpl });
    const target = {
      url: 'https://porte.exemple.test/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f',
      lifecycleUrl: 'https://porte.exemple.test/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f/cycle',
      secret: 'exemple-fictif-clientstate-0123456789abcde',
    };
    const created = await outlookWebhook.subscribe?.({ accessToken: 'jeton' }, http, target);

    expect(created).toEqual([
      { resource: OUTLOOK_RESOURCE, externalId: 'abonnement-exemple-1', expiresAt: '2026-11-23T07:30:00.000Z' },
    ]);
    expect(calls).toEqual([
      {
        url: 'https://graph.microsoft.com/v1.0/subscriptions',
        method: 'POST',
        body: {
          changeType: 'created',
          notificationUrl: target.url,
          lifecycleNotificationUrl: target.lifecycleUrl,
          resource: "me/mailFolders('inbox')/messages",
          expirationDateTime: expect.any(String),
          clientState: target.secret,
        },
      },
    ]);
  });
});
```

Les autres tests de la liste suivent les mêmes patrons : faux `fetch` qui note les requêtes (`outlook/connector.test.ts`, existe), base réelle et `adminDb` pour poser l'état (`connectors/sync.db.test.ts`, existe).

## 14. Ordre de mise en œuvre

Rien de ce chapitre n'est dans le jalon 1 (architecture, 14.3). Le lot se lance quand arrive « un agent dont la valeur tient à la fraîcheur : `boite_mail` sur Outlook ». Une PR par sujet (`CLAUDE.md`), dans cet ordre. Le code de ce chapitre n'est pas mis en forme par Biome : des lignes dépassent les 100 colonnes de `biome.json`. Chaque PR passe donc `pnpm format` sur ses fichiers, puis `pnpm lint`, `pnpm test:unit` et, quand elle touche la base, `pnpm test:db`.

Préalables, écrits ailleurs : la migration `0083-webhooks.sql`, `schema/webhooks.ts`, le rôle `leon_porte` dans `docker/postgres/init.sql` et la commande du README (chapitre 01, sections 11, 14.2, 15.2, 15.3) ; `openConnection` (chapitre 05, section 6, jalon 1) ; la PR n° 0 et `LEON_ROLE` (chapitre 13).

| PR | Sujet | Fichiers | Tests | Dépend de | Effet en production |
|---|---|---|---|---|---|
| W1 | Le contrat et la vérification | `connectors/types.ts` (section 3) ; `webhooks/verify.ts` (4) ; `webhooks/crypto.ts` (5) ; `env.ts` et `.env.example` (6.3) | `crypto.test.ts`, `env.test.ts`, `verify.test.ts` (partie `readPointer`) | rien | aucun |
| W2 | Outlook : la spec et la lecture d'un message | `outlook/webhook.ts`, `outlook/client.ts`, `outlook/schemas.ts`, `outlook/connector.ts` (12.1) ; `connectors/http.ts` (`missingAsNull`, 10.2) | `outlook/webhook.test.ts`, `http.test.ts` | W1 | aucun : ni porte, ni abonnement |
| W3-0 | Lire la documentation de HubSpot (aucun code) | En-tête de `hubspot/webhook.ts` : les points « Non vérifié » (12.2), et le choix entre les deux issues de 12.2 | aucun | rien | aucun |
| W3 | HubSpot : la spec et la lecture d'une activité | `hubspot/webhook.ts`, `hubspot/client.ts`, `hubspot/schemas.ts`, `hubspot/connector.ts` (12.2) | `hubspot/webhook.test.ts` | W2 (`missingAsNull`), W3-0 | aucun |
| W4-0 | Lire la documentation de Fathom (aucun code) | En-tête de `fathom/webhook.ts` : chemin, champs, `triggered_for` ou ce qui choisit les réunions, suppression (12.3) | aucun | rien | aucun |
| W4 | Fathom : la spec | `fathom/webhook.ts`, `fathom/connector.ts` (12.3) | `fathom/webhook.test.ts` | W1, W4-0 | aucun |
| W5 | La porte en Hono | `db/client.ts` (`portePool`), `webhooks/hono-gate.ts`, `api/app.ts`, `next.config.ts`, `route-guards.db.test.ts` (`PUBLIC`), `biome.json` (6) ; `webhooks/providers-json.ts`, `services/porte/fournisseurs.json`, `services/porte/vecteurs.json`, script `porte:generer` (7) | `hono-gate.test.ts`, `hono-gate.db.test.ts`, `providers-json.test.ts`, `verify.test.ts` (partie vecteurs), contrats `webhook-specs.test.ts` et `porte-surface.test.ts` | W2 à W4, 0083 | `/h/…` répond. Tout est refusé ou ignoré : aucun abonnement, aucune ligne d'écoute |
| W6 | La boîte d'entrée et la relève ciblée | `webhooks/queue.ts`, `webhooks/worker.ts` sans les lignes marquées `// W7` (8) ; `webhooks/inbox.ts` (9) ; `webhooks/fetch-one.ts` (10) ; `connectors/queue.ts`, `connectors/worker.ts`, `instrumentation-node.ts` (8.2, 8.4, 8.5) | `worker.test.ts`, `inbox.db.test.ts`, `fetch-one.db.test.ts`, `instrumentation-node.test.ts` (existe, 8.4) | W5, `openConnection` | le worker écoute `leon_porte` et crée les quatre files ; `inbox.ts` peut envoyer des jobs `abonnement-renouveler`, que personne ne lit encore ; rien n'arrive encore |
| W7 | Les abonnements | `webhooks/subscriptions.ts` (11.2) ; dans `webhooks/worker.ts`, les lignes marquées `// W7` (8.3) ; `connectors/sync.ts`, `oauth-routes.ts`, `(app)/connections/actions.ts`, `(app)/settings/actions.ts`, avec leurs imports (11.3) | `subscriptions.test.ts`, `subscriptions.db.test.ts`, quatre cas dans `sync.db.test.ts`, `connections/actions.test.ts` et `settings/actions.test.ts` (existent, 11.3) | W6 | avec `LEON_PORTE_URL` en https et `LEON_PORTE_KEY` réglées (chapitre 13) : chaque relève Outlook abonne la boîte, chaque connexion Fathom crée son webhook, chaque connexion HubSpot par le bouton écoute son portail. Côté HubSpot, l'appli de Leon est réglée une fois (12.2) |

Pourquoi les trois specs avant la porte : `vecteurs.json` porte des cas `gate` pour Outlook, HubSpot et Fathom, et `hono-gate.test.ts` les rejoue avec le vrai registre. Une porte livrée avant ses specs échouerait à ses propres vecteurs. Les specs seules sont inertes : sans route, sans boîte d'entrée et sans abonnement, rien ne les appelle.

Mise en service (chapitre 13) : `web` reçoit `DATABASE_URL_PORTE`, `LEON_PORTE_KEY` et `LEON_PORTE_URL` ; `worker` reçoit `LEON_PORTE_KEY` et `LEON_PORTE_URL` (il chiffre les secrets et écrit les adresses ; il n'ouvre pas `portePool`). Le domaine de `LEON_PORTE_URL` pointe sur `web`. `LEON_IP_HEADER` est réglé sur `web` avant que `LEON_PORTE_URL` passe en https : sans lui, la limite de la porte est commune à tous et n'importe qui peut l'épuiser (section 6.1). Avant d'annoncer « moins d'une seconde » : la mesure de latence d'un `porte_deposer` depuis Railway (chapitre 13).

Le service Rust (chapitre 15) vient après, sur une des trois mesures de l'architecture (section 3) : il lit `fournisseurs.json` et passe `vecteurs.json` tels que W2 à W7 les ont laissés.

## 15. Écarts avec l'architecture

Aucun nom de l'architecture n'est changé : tables, colonnes, fonctions SQL, types, files, modules et variables sont les siens. Ce qui suit ne pouvait pas être suivi à la lettre, ou précise ce qu'elle ne dit pas.

| # | Ce que dit l'architecture | Ce qui heurte, et la preuve | Ce qui est écrit ici, et ma proposition |
|---|---|---|---|
| E-a | 8.3 : `subscribe` rend un tableau d'abonnements ; `target.url` est une seule adresse | L'adresse porte l'`id` d'une seule ligne d'`abonnements_webhook` (5.2, étape 0). Deux abonnements créés par un appel partageraient une adresse, donc une ligne, donc un secret et une échéance | Premier lot : un appel, un abonnement. `subscribeConnection` garde le premier et coupe les autres (11.2). Le type ne change pas. Proposition, au chapitre 10 (Outlook agenda, Teams) : `WebhookSpec.resources(config): string[]`, et `subscribe` reçoit la ressource ; la clé `unique (connection_id, ressource)` le permet déjà |
| E-b | 8.3 : `accountPointer` désigne « la clé de compte (celle de `config.accountKey`) » | Linear : `accountKey` vaut `<viewer.id>:<organization.id>` (`linear/client.ts:146`) ; un webhook désigne l'organisation seule (à vérifier). GitHub : `accountKey` est l'identifiant de la personne (`github/connector.ts:247`), une livraison désigne une installation. Le compte lu par la porte ne serait jamais égal à `abonnements_webhook.compte` | Premier lot sans eux (section 2). Proposition : `WebhookSpec.account?(config: Config): string | null`, lu par `subscribeConnection` (côté worker) pour remplir `compte` ; par défaut `config.accountKey`. La porte reste déclarative : elle ne lit que `accountPointer` |
| E-c | 8.3 : `ItemRef` est « l'identifiant d'élément du connecteur, celui de `sources.external_id` » | Graph notifie un message ; la source Outlook est le fil (`thread:<conversationId>`, `outlook/map.ts:47`), que la notification ne donne pas | `match` peut rendre un identifiant plus fin que `fetchOne` résout (`message:<id>`). Une ref marquée `removed` reste un `external_id` de source : `removeConnectorItems` ne connaît qu'eux. Écrit en commentaire dans `types.ts` (section 3), sans changer le type |
| E-d | 10.1 : clé de `connector-fetch` : `connectionId:externalId` (abonnement), `outil:compte:externalId` (app) | `prendre_livraison` ne rend pas `connection_id` (chapitre 01, 7.4) : la boîte d'entrée ne le connaît pas sans relire la ligne d'abonnement, privée, hors contexte. Et deux organisations peuvent écouter le même compte HubSpot : avec `outil:compte:externalId`, le job de la seconde serait écarté par pg-boss tant que celui de la première attend | `abonnement:<abonnementId>:<externalId>` (un abonnement n'a qu'une connexion : même dédoublonnage) et `app:<tenantId>:<outil>:<compte>:<externalId>` (`fetchJobKey`, 8.2). Proposition : recopier ces deux clés en 10.1 |
| E-e | 5.2 et 8.3 : la relève ciblée passe par `fetchOne` ; 10.1 : une relève hors tour passe « par la file existante `connector-sync` » | Fathom ne documente pas la lecture d'une réunion par identifiant (`fathom/connector.ts:7-12`, seul `GET /meetings`). Et un job `connector-sync` envoyé directement ne fait rien : `claimConnection` exige `next_sync_at <= now()` (`connections.ts:403`) | Un outil sans `fetchOne` reçoit une relève hors tour : `requestSyncNow` (existe) avance l'échéance, le tic de la minute met le job `connector-sync`. Même chemin pour le cycle de vie (`manque`, `supprime`). Délai : une minute au plus |
| E-f | 10.1 : `abonnement-renouveler`, clé `abonnementId` ; 8.3 : `reautoriser` renouvelle, `supprime` et `manque` relèvent | Rien ne dit quel job porte un événement de cycle de vie, ni comment la boîte d'entrée, hors contexte, écrirait `etat = 'expiree'` sur une ligne privée | Le job `abonnement-renouveler` porte un `motif` (`echeance`, `reautoriser`, `supprime`, `manque`) et l'identifiant d'abonnement de l'éditeur ; il agit sous le contexte de la personne. Une livraison donne un job, avec le motif le plus fort. Un motif écarté par la clé unique ne coûte qu'un délai : la relève de 15 minutes et le renouvellement suivant le rattrapent |
| E-g | 3 : « limite de débit par adresse IP et cache négatif avant `porte_secret` ; même réponse et même délai qu'une signature fausse » | Un abonnement Graph résilié (membre retiré, 9.10) ou orphelin (organisation supprimée, 11.3) continue d'envoyer jusqu'à son échéance, depuis les adresses IP de Microsoft. Compter chaque refus bloquerait Microsoft pour tous nos clients ; refuser (401) une adresse hors cache au-delà de la limite refuserait aussi des abonnements vivants, qu'un éditeur finit par désactiver | La limite ne compte que les lectures de `porte_secret` restées vides : 300 par clé d'adresse IP (une IPv6 compte pour son /64) sur une fenêtre fixe de 10 minutes, 3 000 quand l'adresse IP est inconnue, à mesurer. Le cache négatif (10 minutes) ramène un abonnement mort à une lecture par fenêtre (6.1). Au-delà de la limite, une adresse absente des caches reçoit `503` (l'éditeur rejoue), jamais le refus uniforme ; la réponse ne dit toujours rien de l'existence d'un abonnement. `LEON_IP_HEADER` est un préalable de la mise en service (14) |
| E-h | 7.5 : « un `LEON_PORTE_SECRET_<OUTIL>` par outil du premier lot signé par un secret d'application » ; le chapitre 01 (15.4) écrit la ligne `LEON_PORTE_SECRET_<OUTIL>=` dans `.env.example` | Aucun outil du premier lot n'en a besoin : HubSpot signe avec le secret client, `LEON_OAUTH_HUBSPOT_SECRET`, déjà documenté (`.env.example:86`), ce que 8.3 prévoit (« ou celui du secret client quand l'éditeur signe avec lui (HubSpot v3, Intercom) ») | Aucune ligne `LEON_PORTE_SECRET_…` dans W1 à W7. La ligne générique du chapitre 01 ne s'écrit pas telle quelle. `APP_SECRETS` (6.2) lit chaque variable en toutes lettres, pour `env-contract.test.ts` |
| E-i | 6 : `services/porte/src/main.rs` : « routes `/h/:outil` et `/h/:outil/:abonnement`, `/sante` » | 8.3 fixe l'adresse de cycle de vie `<LEON_PORTE_URL>/h/<outil>/<abonnement_id>/cycle` : sans elle, Graph ne peut pas prévenir d'un abonnement retiré | La porte en Hono a les trois routes (6.1) ; `fournisseurs.json` les donne (`paths.cycle`, `tools.<outil>.lifecycle`). Proposition : ajouter la troisième route à la liste de 6 ; le chapitre 15 la prend dans `fournisseurs.json` |
| E-j | 8.3 : webhook d'application : « plusieurs personnes branchent le même compte, chacune avec son OAuth » | Une connexion HubSpot peut être une clé collée (appli privée, `hubspot/connector.ts:66-80`) : l'appli de Leon n'y est pas installée et ne reçoit rien pour ce portail. Et `accountKey` n'est posé que pour une connexion par le bouton (`rememberAccountKey`, `sync.ts:172`) | La ligne d'écoute n'est créée que pour `authMode = 'oauth'` avec `accountKey` (11.2). Une connexion par clé reste au sondage de 15 minutes |
| E-k | 3 : même réponse et même délai pour une adresse inconnue et une signature fausse ; 5.2, étape 0 : Graph valide l'adresse | Graph appelle l'adresse avec `validationToken` pendant la création de l'abonnement, donc avant que la ligne existe (on ne connaît `externe_id` et l'échéance qu'à la réponse) | L'écho de validation se fait sans lire la base (6.1, étape 3), pour toute adresse de forme valide d'un outil qui a `handshake: 'echo-validation-token'`. Il ne dit rien de l'existence d'un abonnement : il renvoie le jeton de l'appelant, à toute adresse de bonne forme |
| E-l | 8.3 : `WebhookTimestamp.unit` vaut `'s'` ou `'ms'` | Zendesk : le format de `X-Zendesk-Webhook-Signature-Timestamp` n'est pas dans la note 04 (une date ISO, de mémoire) | Zendesk hors du premier lot (section 2). Proposition au chapitre 10, si la documentation le confirme : `unit: 'iso8601'`, et `vecteurs.json` passe en version 2 |
| E-m | 8.3 : `handshake` vaut `'echo-validation-token'` ou `'slack-challenge'` | Asana ouvre un webhook par une poignée de main `X-Hook-Secret` à renvoyer en en-tête (note 05) | Asana hors du premier lot. Proposition au chapitre 10 : `handshake: 'echo-hook-secret'` ; la porte garde alors le secret reçu, ce qui demande une troisième fonction SQL ou un état « en attente » : à concevoir là |
| E-n | 7.5 : `deleteAccount` « avant de supprimer les connexions, relève leurs abonnements ; après la transaction, désabonne » | Pour désabonner, il faut des jetons frais ; `ensureFreshTokens` les enregistre sur la ligne de la connexion (`oauth.ts:215`), que la transaction de `deleteAccount` supprime (`delete-account.ts:248`) | La relève se fait juste avant `deleteAccount`, dans `runDeletion` (`settings/actions.ts:490`), connexions ouvertes par `openConnection` ; le désabonnement juste après, à côté de Pipedream (11.3). Un abonnement créé entre les deux reste orphelin : Microsoft l'éteint à son échéance, la porte refuse ses livraisons |
| E-o | Chapitre 01, précision 15 : « "Reconnecter" supprime les abonnements `resiliee` de la connexion » | Supprimer la ligne tout de suite perd son `externe_id`, et laisse l'abonnement de l'éditeur sans personne pour le couper (Fathom n'expire jamais) | « Reconnecter » repasse les lignes `resiliee` à `expiree` (`reviveSubscriptions`, 11.2). La relève suivante coupe l'ancien abonnement avec les jetons neufs, puis supprime la ligne morte et en écrit une neuve, sous un id neuf, dans la même transaction. Toute recréation prend une adresse neuve : la porte a pu mettre l'ancienne en cache négatif pour 10 minutes, ou garder son ancien secret 60 secondes (6.2) |
| E-p | 10.1 : `porte-traiter`, politique `standard`, 3 reprises, 30 s | Sous `standard`, pg-boss 12.37.1 ne dédoublonne pas par `singletonKey` : les index uniques n'existent que pour `short`, `singleton` et `stately` (`dist/plans.js:1186-1195`). Chaque tic de la minute remettrait en file les mêmes lignes en attente, et `send` ne rendrait jamais `null` | `PROCESS_QUEUE = { policy: 'short', retryLimit: 3, retryDelay: 30 }` (8.1) : un seul job en attente par ligne, reprises inchangées. Un job de trop reste sans effet (`prendre_livraison` rend 0 ligne). Proposition : recopier `short` en 10.1 |
| E-q | 8.3 : « essaie la plus ancienne, passe à la suivante si l'outil répond "introuvable" ou "interdit", s'arrête à trois » ; « les autres connexions du compte le reçoivent à leur sondage » | Pour une suppression, chaque membre a sa copie (une source par personne, `ingest-items.ts:56`), et aucune relève HubSpot ne retire rien (12.2) : avec trois essais, les copies du quatrième membre et des suivants resteraient pour toujours. Relire chez chacun coûterait une requête par personne et par événement, ce que 8.3 écarte | Les lectures s'arrêtent toujours à trois. Une suppression signée par l'éditeur et confirmée par une lecture nulle retire la copie de chaque connexion que rend `connexions_du_compte` (20 au plus), sous les droits de sa personne, sans relire (10.1, 10.3). Et `inbox.ts` garde 100 suppressions par livraison avant 50 modifications (9) |
| E-r | 8.3 : « `subscribeConnection` est appelée par le worker au début de chaque relève » | `accountKey` n'est écrit qu'après la première lecture réussie (`rememberAccountKey`, `sync.ts:166-184`, appelée `:250`) : une connexion HubSpot neuve n'écouterait qu'à sa deuxième relève. Et un appel d'abonnement lent (30 s) retarderait chaque lecture | `subscribeConnection` est appelée après `rememberAccountKey`, avant `finishSync`, avec la clé que celle-ci rend (11.3). Une relève qui échoue n'abonne pas. Proposition : « après la lecture de chaque relève réussie » en 8.3 |
| E-s | 3 : la porte « ne connaît ni pg-boss, ni les jetons OAuth, ni `LEON_CONNECTORS_KEY` », règle qui lie ses deux mises en œuvre | La porte en Hono vit dans `web` (architecture 4), dont le processus a toutes ces variables ; `hono-gate.ts` importe le registre, qui charge `connectors/pipedream` (Gmail, Drive, Slack) | La règle tient pour le code de la porte et ses imports directs (contrat `porte-surface.test.ts`, 13.5), pas pour son processus. Elle ne devient vraie du processus qu'avec le service Rust. Proposition : le dire en 3 |

Précisions, sans écart :

- `porteBase` vit dans `verify.ts`, pas dans `subscriptions.ts` : la porte n'importe rien de ce qui touche aux jetons (contrat `porte-surface.test.ts`).
- `abonnements_webhook.erreur` reçoit des messages fixes en anglais, comme `connections.last_error` (`sync.ts:186-192`) : la page Connexions (chapitre 07) les traduit ou les remplace par l'état.
- La porte répond `202` sans rien déposer à une livraison d'application signée mais dont le compte est illisible ou multiple (6.1, étape 9) : l'éditeur ne doit pas réessayer une livraison qu'on ne saura jamais ranger. Les deux cas ont chacun leur événement de journal (`porte.compte_illisible`, `porte.comptes_multiples`), pour une alerte.
- Les jobs `connector-fetch` de portée app portent un groupe pg-boss, `<outil>:<compte>`, lu avec `groupConcurrency: 1` (8.2, 8.5) : un portail HubSpot n'a qu'une relève ciblée à la fois. L'architecture fixe la concurrence de la file (4), pas celle d'un compte.

## 16. Ce que je n'ai pas vérifié

- **Rien n'a tourné dans le dépôt** de ma main : ni serveur, ni migration, ni test. Le code des sections 4, 6 et 7.3 a été rejoué hors du dépôt (Node 22, modules du dépôt remplacés par des bouchons). Une relecture l'a appliqué sur une copie du dépôt (`tsc --noEmit` et 73 tests verts, section 17) ; les corrections qui ont suivi, dans les sections 6, 8 à 12 et 13, n'ont été ni compilées ni lancées.
- **Aucune page d'éditeur n'a été ouverte** : `developers.hubspot.com` n'est pas joignable depuis la session de rédaction (réseau fermé), il faut l'autoriser pour lire. Tout vient des notes 04 et 05, faites de résumés de recherche. Les lectures qui bloquent sont devenues des étapes : W3-0 (HubSpot, 12.2) et W4-0 (Fathom, 12.3). À lire encore avant W2 et W7 : la forme des notifications Graph et de leur cycle de vie, la durée maximale d'un abonnement Outlook (10 080 ou 4 230 minutes), le code d'un abonnement inconnu, les reprises de Graph.
- **pg-boss 12.37.1**, lu dans le paquet publié (`dist/plans.js`, `dist/manager.js`, `dist/types.d.ts`) et non lancé : les index uniques par politique (d'où l'écart E-p), le refus d'envoyer vers une file absente, `group` et `groupConcurrency` (un job sans groupe n'est pas limité). Leur effet ensemble, `short` avec `groupConcurrency`, est à voir au premier essai.
- **`pg`** : l'événement `notification` et son champ `payload`, l'événement `end` d'un `Client` coupé par la base (`node_modules` absent).
- **Next et Hono** : ce que voit Hono après la réécriture `/h/:chemin*` (adresse d'origine ou réécrite) ; la vérification n'en dépend pas, `uri` est rebâtie depuis `LEON_PORTE_URL`. Que `bodyLimit` borne un corps sans `content-length`. Que `Hono.request` des tests passe le corps tel quel. Que `c.req.param('outil')` soit lisible dans le `onError` de `bodyLimit`.
- **Les reprises des éditeurs** après un `401`, un `413` ou un `503` de la porte (Graph, Fathom) : le sondage de 15 minutes couvre une livraison perdue, mais un éditeur qui désactive un webhook après des échecs se verrait seulement par `dernier_recu_le` (chapitre 07) et par les événements `porte.trop_gros`, `porte.secret_illisible` du journal.
- **La relève ciblée sous charge** : une livraison HubSpot de 100 événements donne jusqu'à 100 jobs (toutes les suppressions, 50 modifications au plus), passés un à un par portail : 40 requêtes par 10 secondes au plus pour la relève ciblée, sur les 110 du portail (architecture 8.3). Une suppression en masse prend donc quelques minutes. Pas mesuré. Lire plusieurs activités par job (`batch/read` jusqu'à 100 identifiants) changerait la forme du job de 10.1 : à proposer si le journal montre des refus pour débit.
- **Les abonnements orphelins** : un administrateur qui supprime la connexion d'un collègue, ou la suppression d'une organisation (qui ne coupe que les abonnements de l'appelant, 11.3), laisse les autres chez l'éditeur. Microsoft les éteint à l'échéance ; un webhook Fathom continuerait d'appeler la porte, qui refuse. Combien de temps Fathom insiste avant de le désactiver : non trouvé.
- **Les suppressions HubSpot** : aucune relève ne les reprend (12.2). Une connexion par clé garde donc pour toujours la copie d'une activité supprimée, et une livraison perdue aussi.
- **`LEON_IP_HEADER`** : la limite par adresse IP suppose l'en-tête posé par le proxy de Railway ; quel en-tête Railway pose, et s'il est fiable, est au chapitre 13. C'est un préalable de la mise en service (14). Les plafonds de 300 et 3 000 lectures vides ne viennent d'aucune mesure.
- **`ipKey`** a été rejoué hors du dépôt, en JavaScript (Node, `node:net`), sur 14 adresses : un /64 donne une clé, deux /64 voisins deux, `::ffff:a.b.c.d` et `0:0:0:0:0:ffff:a.b.c.d` l'IPv4, une zone (`%eth0`) est retirée. La forme de la clé (`2001:db8:1:2::/64`) est la nôtre ; celle de Better Auth n'a pas été relue (`node_modules` absent). Les deux limites n'ont pas à partager leurs clés.

## 17. Relecture contradictoire

Deux relectures, le 20/11/2026 : l'une sur le code (appliqué sur une copie du dépôt, `tsc --noEmit` et 73 tests verts avant corrections), l'autre sur le fond. Chaque objection a été vérifiée dans le dépôt, l'architecture ou la source (pg-boss 12.37.1 lu dans le paquet publié). Les pages des éditeurs n'ont pas pu être ouvertes (réseau de la session fermé à `developers.hubspot.com`).

| # | Objection | Décision | Ce qui a changé, ou pourquoi rien |
|---|---|---|---|
| Code 1 | `OAuthRefusedError` (n'étend pas `ConnectorAuthError`) n'est pas rattrapée dans `fetch-one.ts` ni autour d'`openConnection` dans `runSubscriptionJob` | Retenue (vérifiée : `oauth.ts:25`, `:202`, `sync.ts:205`) | `isRefusal` dans `fetch-one.ts` (portée app : connexion suivante ; portée abonnement : `sans_connexion`, sans reprise) ; garde autour d'`openConnection` : `etat = 'erreur'`, `ERRORS.refused`, aucune reprise (10.1, 10.3, 11.1, 11.2) ; cas de test (13.1) |
| Code 2 | W6 ne compile pas : `worker.ts` importe `subscriptions.ts`, livré en W7 | Retenue | Lignes marquées `// W7` dans `worker.ts` ; W6 crée les quatre files (pg-boss refuse un envoi vers une file absente, `dist/manager.js:914`), W7 ajoute le planning et les deux lecteurs (8.3, 14) |
| Code 3 | Trois tests existants cassés et non listés | Retenue | `instrumentation-node.test.ts` (8.4, W6), `connections/actions.test.ts` et `settings/actions.test.ts` (11.3, W7), avec les faux à écrire, les imports des actions et les cas nouveaux (13.1, 14) |
| Code 4 | `porte-traiter` en `standard` : pg-boss ne dédoublonne pas par `singletonKey` | Retenue (vérifiée : `dist/plans.js:1186-1195`) | `PROCESS_QUEUE` en `short`, écart E-p ; « À savoir » de 9 corrigé ; point retiré de « non vérifié » (16) |
| Code 5 | La limite par adresse IP compte l'adresse brute : un /64 IPv6 la contourne | Retenue (vérifiée : `auth/rate-limit.ts:41-47`) | `ipKey` (IPv6 → /64, `::ffff:` → IPv4), rejoué en Node ; tests ; même règle pour le service Rust (6.1, 6.2, 13.3) |
| Code 6 | Fathom demande la transcription : 413 sur les longues réunions | Retenue ; vecteur `gate` de 300 Kio écarté | `include_summary` seul (12.3), test exact (13.1). Pas de cas de 300 Kio dans `vecteurs.json` : 300 Ko de texte dans un fichier commité, alors que la limite est déjà dans `fournisseurs.json` (`limits.bodyMaxBytes`), que `hono-gate.test.ts` la teste, et que le chapitre 15 peut bâtir ce corps depuis elle |
| Code 7 | Le code ne passe pas `pnpm lint` (ordre d'imports, format, `useOptionalChain`) | Retenue | Imports de `worker.ts` inversés ; `row?.portee !== 'abonnement'` ; `pnpm format` avant `pnpm lint` dans chaque PR (7.3, 14). Les blocs ne sont pas remis en forme ici |
| Code 8 | `runDeletion` sert aussi à `deleteOrganizationAction` : le texte disait qu'elle ne coupe rien | Retenue (vérifiée : `settings/actions.ts:490-557`) | Phrase corrigée (seuls les abonnements de l'appelant), ligne de 11.1, un cas de test par action, imports (11.3) |
| Code 9 | `porte-surface.test.ts` ne voit que les imports directs ; le registre charge `pipedream.ts` | Retenue (option « le dire ») | En-tête de `hono-gate.ts`, contrat et texte de 13.5, écart E-s. Faire lire `fournisseurs.json` à la porte en Hono : écarté, elle partage le processus de `web` et ne protégerait rien de plus |
| Code 10 | Cache négatif de 600 s et recréation sur la même adresse : 10 minutes de refus | Retenue, autre correction | Chaque recréation prend une adresse neuve (11.2, E-o) : ni cache négatif ni ancien secret ne la touchent. Le cache négatif reste à 600 s : à 60 s, un abonnement mort coûterait dix lectures par fenêtre et atteindrait dix fois plus vite la limite par IP. Reste la fenêtre de création, écrite en 11.2 |
| Code, hors chapitre | `schema/webhooks.ts` du chapitre 01 cite `adminDb` dans un commentaire et fait échouer `privileges.test.ts` | Hors chapitre | Rien ici : à corriger au chapitre 01 |
| Fond 1 | Même objection que Code 6, plus `triggered_for` et le suivi des 413 | Retenue | `include_summary` seul ; 413 journalisé avec l'outil (`porte.trop_gros`, 6.1, 6.2) ; `triggered_for` dans « non vérifié » (de mémoire, pas mis dans le code) ; lecture de l'API Fathom en étape W4-0 bloquante (14) |
| Fond 2 | Même objection que Code 1, plus la portée abonnement | Retenue | Voir Code 1 ; `forSubscription` rend `sans_connexion` sur refus |
| Fond 3 | Les caches refusent 10 minutes après une recréation, et la toute première livraison | Retenue en partie | Adresse neuve à chaque création : retenu. Écrire la ligne avant l'appel : écarté, `ressource` vient de la réponse de l'éditeur et `leon_app` ne peut pas la modifier (il faudrait le `resources` de l'écart E-a). Cache négatif à 60 s : écarté (voir Code 10). La fenêtre de création est décrite en 11.2 |
| Fond 4 | La limite peut refuser des abonnements valides (Microsoft, organisation supprimée, `LEON_IP_HEADER` absent) | Retenue en partie | Au-delà de la limite : `503`, plus le refus uniforme ; fenêtre fixe ; plafonds relevés à 300 et 3 000, « à mesurer » ; /64 ; `LEON_IP_HEADER` préalable de la mise en service (6.1, 14, E-g). Faire distinguer à `porte_secret` un abonnement mort d'un inconnu : écarté, c'est la fonction du chapitre 01, et le `503` ôte le risque sans elle |
| Fond 5 | Les suppressions HubSpot se perdent (`MATCH_MAX`, trois connexions, aucune relève) | Retenue (vérifiée : aucun `removed` sous `hubspot/`) | Suppressions d'abord, 100 au plus (9) ; une lecture nulle retire la copie de chaque connexion qui écoute le portail, sans relire chacune : la correction proposée (lire chez les 20) coûterait une requête par personne, ce que l'architecture 8.3 écarte (E-q) ; la limite dite au client (12.2, 16) |
| Fond 6 | Le premier lot HubSpot repose sur un point d'API non confirmé | Retenue en partie | Étape W3-0 bloquante avant W3, avec les deux issues écrites (12.2, 14). Sortir HubSpot avant W5 : écarté, la porte n'exerce que la vérification v3 (confirmée) et `portalId` ; ses cas `gate` restent justes quoi que dise la documentation |
| Fond 7 | Budget HubSpot : un identifiant par job, propriétaire relu, aucune réserve | Retenue en partie | Libellé corrigé (« un seul identifiant ») ; groupe pg-boss par portail et `groupConcurrency: 1` : 40 requêtes par 10 secondes au plus (8.2, 8.5, 9, 12.2). Plusieurs identifiants par job : écarté, la forme du job est celle de l'architecture 10.1 (proposé en 16 si le journal le demande) ; cache des propriétaires : sans objet, un job lit un objet |
| Fond 8 | `subscribeConnection` avant la lecture : HubSpot n'écoute qu'à la deuxième relève, et un abonnement lent retarde la lecture | Retenue (vérifiée : `sync.ts:166-172`, `:250`) | `rememberAccountKey` rend la clé ; `subscribeConnection` après elle, avant `finishSync` (11.3, E-r) ; test (13.1) |
| Fond 9 | Aucune rotation de `LEON_PORTE_KEY` | Retenue en partie | Marche à suivre écrite, avec la requête SQL (5). `LEON_PORTE_KEY_PREVIOUS` : écarté, une variable de plus pour la porte et pour le service Rust, pour gagner un quart d'heure que le sondage couvre |
| Fond 10 | Une livraison qui mêle deux portails est perdue sans trace | Retenue en partie | Événement à part, `porte.comptes_multiples`, pour une alerte (6.1, 6.2) ; la question en W3-0 ; si la documentation confirme, un dépôt par portail avant W5 (12.2). Pas de découpage maintenant : non confirmé, et il change le contrat Rust |
| Fond 11 | Tout 403 devient « absent », et peut retirer une copie | Écartée | Voulu : un 403 sur l'objet veut dire que cette personne ne le voit plus (droits d'origine). Une portée retirée se voit à la relève suivante (`sync.ts`, `recordFailure` : toute `ConnectorAuthError` donne `auth_error`). Un retrait n'a lieu que sur une suppression signée par l'éditeur. Dit dans le « À savoir » de 10.3 |
| Fond 12 | Même objection que Code 9 | Retenue | Voir Code 9 |
