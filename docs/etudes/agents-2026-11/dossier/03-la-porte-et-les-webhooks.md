# 03. La porte et les webhooks

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Sources : l'architecture (`00-architecture.md`, sections 3, 4, 5.2, 7.2, 7.4, 8.3, 9.4, 9.5, 9.10, 10.1, 11, 14.3), le chapitre 01 (migration `0083-webhooks.sql`, section 11 ; schéma `schema/webhooks.ts`, section 14.2 ; lignes de `.env.example`, section 15.4), le chapitre 05 (`openConnection`, section 6), les cartes 01 et 08, les notes 02, 04 et 05. Code relu le 20/11/2026 (commit `500e246`).

Convention : **existe** (lu dans le dépôt, avec chemin et ligne), **à créer** (le nom vient de l'architecture, sinon de ce chapitre), **à vérifier** (vient d'une note de recherche qui ne l'a pas confirmé, ou de ma mémoire : à lire dans la documentation de l'éditeur avant d'écrire le code).

**Jalon.** Rien de ce chapitre n'est dans le jalon 1 (architecture, 14.3) : le premier agent se contente du sondage de 15 minutes. Tout ce qui suit se construit quand arrive « un agent dont la valeur tient à la fraîcheur : `boite_mail` sur Outlook ». Le service Rust vient encore après (chapitre 15).

Rien n'a été lancé : ni serveur, ni migration, ni test du dépôt. Les signatures, les chiffrés et les sommes de contrôle des exemples des sections 7 et 13 ont été calculés par un script Node à part (`node:crypto`), qui suit l'algorithme de la section 4.

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
| 12 | Les abonnements | `src/server/webhooks/subscriptions.ts`, `connectors/sync.ts` | à créer, existe | abonner au début de chaque relève, renouveler, désabonner |
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
  // Ne lève jamais : un corps illisible rend [] (inbox.ts le journalise). 50 refs au plus sont gardées.
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
| 1 | Corps de 262 144 octets au plus (`bodyLimit`, avant tout) | trop gros | `413 {"error":"Request too large"}` |
| 2 | L'adresse : outil connu, qui a un `webhook` ; forme de l'adresse conforme à `scope` ; abonnement en UUID minuscule ; `/cycle` seulement si la spec a `lifecycle` | adresse inconnue | **refus uniforme** |
| 3 | `handshake: 'echo-validation-token'` et `?validationToken=` présent : écho, sans rien lire en base. 1 024 caractères au plus, aucun caractère de contrôle | jeton trop long ou avec un caractère de contrôle | `200 text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff`, le jeton ; sinon `400 {"error":"Invalid request"}` |
| 4 | Le corps est de l'UTF-8 valide, sans octet nul (Postgres refuse l'octet nul dans un `text`, chapitre 01 section 11) | illisible | `400 {"error":"Invalid request"}` |
| 5 | La porte a sa base (`DATABASE_URL_PORTE`) ; et `LEON_PORTE_URL` si la signature couvre l'adresse | non réglée | `503 {"error":"Unavailable"}` |
| 6 | Le secret. `abonnement` : cache positif (60 s), cache négatif (600 s), limite des lectures vides par adresse IP, puis `porte_secret`, puis déchiffrement. `app` : la variable nommée | inconnu, résilié, illisible : **refus uniforme** ; clé ou variable absente : 503 | |
| 7 | `verifyWebhook` (section 4) | `entete`, `signature`, `horodatage`, `secret`, `format` | **refus uniforme** |
| 8 | `handshake: 'slack-challenge'` : un `url_verification` signé reçoit son `challenge` en écho | | `200 text/plain` |
| 9 | `scope: 'app'` : le compte, lu par `accountPointer` ; une seule valeur, 200 caractères au plus | absent ou plusieurs comptes : journalisé, rien déposé | `202`, corps vide |
| 10 | Identifiant de livraison : l'en-tête `deliveryHeader` s'il fait 1 à 200 caractères ASCII visibles, sinon le SHA-256 hexadécimal du corps | | |
| 11 | En-têtes gardés : ceux de `PORTE_KEPT_HEADERS` et `deliveryHeader`, jamais celui d'une signature ou d'un jeton, 1 024 caractères par valeur ; plus de 8 Kio en tout : aucun | | |
| 12 | `porte_deposer` (rend 0 pour une livraison déjà reçue : même réponse) | erreur de base | `503` ; sinon `202`, corps vide |

Le **refus uniforme** : `401 {"error":"Invalid signature"}`, rendu au plus tôt 200 ms après l'arrivée de la requête. Une adresse inconnue, un abonnement résilié et une signature fausse reçoivent la même réponse, au même délai (architecture, section 3 : « ne pas dire si un abonnement existe »). Une erreur de base n'est pas un refus : `503`, pour que l'éditeur réessaie.

La **limite de débit** ne compte que les lectures de `porte_secret` restées vides : 30 par adresse IP en 10 minutes, 300 pour les requêtes dont l'adresse IP est inconnue (`LEON_IP_HEADER` absent ou illisible). Au-delà, l'adresse IP ne lit plus la base : ses requêtes vers une adresse que les caches ne connaissent pas reçoivent le refus uniforme. Pourquoi pas tous les refus : un abonnement Graph résilié continue d'envoyer jusqu'à son échéance (architecture 9.10), depuis les adresses IP de Microsoft. Le cache négatif réduit chacun à une lecture toutes les 10 minutes ; compter chaque refus bloquerait Microsoft pour tous nos clients (écart E-g).

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
import { porteBase } from './subscriptions';
import { parseBodyJson, readPointer, secretHeaders, verifyWebhook } from './verify';

// La porte des webhooks, première mise en œuvre de son contrat (dossier agents, section 3). Elle reçoit une
// livraison, la vérifie sur le corps brut, la dépose par porte_deposer et répond. Rien d'autre : ni pg-boss, ni jeton
// OAuth, ni LEON_CONNECTORS_KEY, ni lecture de la mémoire. Le service Rust (chapitre 15) fait exactement la même chose :
// mêmes adresses, mêmes étapes, mêmes réponses, mêmes limites (services/porte/fournisseurs.json), mêmes cas
// (services/porte/vecteurs.json, section « gate »). Une route publique : elle est dans PUBLIC (route-guards.db.test.ts).

// Les limites de la porte. providers-json.ts les recopie dans fournisseurs.json : le service Rust les lit là.
export const PORTE_LIMITS = {
  bodyMaxBytes: 262_144, // boite_entree_webhooks.corps
  headersMaxBytes: 8_192, // boite_entree_webhooks.entetes
  headerValueMaxChars: 1_024,
  echoMaxChars: 1_024,
  deliveryIdMaxChars: 200, // boite_entree_webhooks.livraison
  accountMaxChars: 200, // boite_entree_webhooks.compte
  refusalMinDelayMs: 200,
  lookupMissesPerIp: 30,
  lookupMissesUnknownIp: 300,
  lookupMissesWindowSeconds: 600,
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

// L'adresse IP du client, lue dans le seul en-tête que pose le proxy de confiance (comme auth/rate-limit.ts:43-47).
function clientIp(headers: Headers): string | null {
  const value = env.LEON_IP_HEADER ? headers.get(env.LEON_IP_HEADER)?.trim() : undefined;
  return value && isIP(value) !== 0 ? value : null;
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

type GateState = {
  secrets: Memo<{ tenantId: string; secret: string | null }>;
  unknown: Memo<true>;
  misses: Memo<number>; // par adresse IP : lectures de porte_secret restées vides
};

const createGateState = (): GateState => ({
  secrets: new Memo(PORTE_LIMITS.secretCacheSeconds),
  unknown: new Memo(PORTE_LIMITS.negativeCacheSeconds),
  misses: new Memo(PORTE_LIMITS.lookupMissesWindowSeconds),
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
      const ipKey = ip ?? 'inconnue';
      const cap = ip ? PORTE_LIMITS.lookupMissesPerIp : PORTE_LIMITS.lookupMissesUnknownIp;
      const misses = state.misses.get(ipKey, now) ?? 0;
      if (misses >= cap) return REFUS;
      const found = await deps.store.secret(outil, abonnement);
      if (!found) {
        state.unknown.set(key, true, now);
        state.misses.set(ipKey, misses + 1, now);
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

// Le compte d'un webhook d'application : une seule valeur, sinon null.
function accountOf(spec: Spec, corps: string): string | null {
  if (!spec.accountPointer) return null;
  const values = readPointer(parseBodyJson(spec.bodyFormat, corps), spec.accountPointer);
  if (!values || new Set(values).size !== 1) return null;
  const [compte] = values;
  return compte && compte.length <= PORTE_LIMITS.accountMaxChars ? compte : null;
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
      compte = accountOf(spec, corps);
      if (compte === null) {
        // Signée par l'éditeur, mais impossible à ranger : rien n'est déposé, l'éditeur ne doit pas réessayer.
        logError('porte.compte_illisible', new Error('Account not found'), { outil });
        return c.body(null, 202);
      }
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
  // Avant toute lecture : un corps de plus de 256 Kio ne tient pas dans boite_entree_webhooks.corps.
  const limit = bodyLimit({
    maxSize: PORTE_LIMITS.bodyMaxBytes,
    onError: (c) => c.json({ error: 'Request too large' }, 413),
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

**`.env.example`** (existe). Les trois lignes du chapitre 01 (section 15.4), recopiées. Pas de `LEON_PORTE_SECRET_<OUTIL>` : aucun outil du premier lot ne signe avec un secret propre à la porte (HubSpot signe avec `LEON_OAUTH_HUBSPOT_SECRET`, déjà documentée). Une ligne `LEON_PORTE_SECRET_<OUTIL>=` ferait échouer `env-contract.test.ts` (variable documentée mais jamais lue). La première viendra avec Linear ou GitHub (chapitre 10).

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
    "lookupMissesPerIp": 30,
    "lookupMissesUnknownIp": 300,
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

Fichier : `src/server/webhooks/providers-json.ts` (à créer). Code complet. Il a été rejoué hors du dépôt (Node 22, `--experimental-strip-types`, modules du dépôt remplacés par des bouchons) : il produit le `fournisseurs.json` de la section 7.1 à l'octet près, et un `vecteurs.json` dont la section 7.2 est un extrait exact. Les longues lignes de la liste des cas seront repliées par `pnpm format`.

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
